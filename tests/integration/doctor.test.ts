import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import {
  doctorProject,
  formatDoctorReport,
  type DoctorDependencies,
} from "../../src/installer/doctor.js";
import { initializeProject } from "../../src/installer/plan.js";
import {
  readLaunchVerification,
  recordLaunchVerification,
} from "../../src/installer/launch-verification.js";
import { loadProjectConfig } from "../../src/config/load.js";
import { CustodyLeaseStore } from "../../src/session/custody-lease.js";
import { runLeaseRecovery } from "../../src/session/lease-recovery.js";
import type { WindowsBootIdentifier } from "../../src/platform/windows/boot-identifier.js";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "projects",
  "pnpm-json",
);
const temporaryDirectories: string[] = [];

async function projectCopy(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-doctor-"));
  temporaryDirectories.push(root);
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

const READY_DEPENDENCIES: DoctorDependencies = {
  platform: "win32",
  environment: {},
  executableAvailable: async () => true,
  webviewAvailable: async () => true,
  portAvailable: async () => true,
};

const CURRENT_BOOT: WindowsBootIdentifier = {
  scheme: "windows-boot-sequence/v2",
  bootEnvironmentGuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  bootId: 52,
};
const PREVIOUS_BOOT: WindowsBootIdentifier = {
  scheme: "windows-boot-sequence/v2",
  bootEnvironmentGuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  bootId: 51,
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("pumarejo doctor", () => {
  it("reports every required prerequisite independently with stable identities", async () => {
    const project = await projectCopy();
    await initializeProject(project);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.status).toBe("ready");
    expect(report.diagnostics.map((item) => item.id)).toEqual([
      "project.detected",
      "config.valid",
      "integration.manifest",
      "integration.debug-registration",
      "integration.capability-permission",
      "integration.version-alignment",
      "toolchain.node",
      "toolchain.rust",
      "toolchain.launch",
      "platform.supported",
      "platform.display",
      "platform.webview",
      "port.available",
      "residue.owned",
    ]);
    expect(new Set(report.diagnostics.map((item) => item.id))).toHaveLength(14);
  });

  it("requires semantic lease closure before residue becomes ready", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const store = new CustodyLeaseStore({
      root: join(project, ".pumarejo", "sessions"),
      controllerId: "a".repeat(64),
      controllerPid: 101,
      now: () => 10_000,
      bootIdentifier: async () => PREVIOUS_BOOT,
      context: { command: "doctor-test", projectRoot: project },
    });
    await store.create({
      controllerId: "a".repeat(64),
      launchId: "1".repeat(32),
      identity: {
        pid: 202,
        startedAt: 9_000,
        commandHash: "b".repeat(64),
        sessionNonce: "c".repeat(64),
      },
      mechanism: "windows_job_object",
    });

    const before = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      bootIdentifier: async () => CURRENT_BOOT,
    });
    expect(
      before.diagnostics.find((item) => item.id === "residue.owned"),
    ).toMatchObject({
      status: "warn",
      classification: "recoverable_previous_boot",
    });

    await runLeaseRecovery({
      projectRoot: project,
      action: "recover",
      execute: true,
      platform: "win32",
      currentBootIdentifier: async () => CURRENT_BOOT,
      actingIdentity: async () => ({ sid: "S-1-5-21-1001", pid: 303 }),
      now: () => 20_000,
      operationId: "d".repeat(32),
    });

    const after = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      bootIdentifier: async () => CURRENT_BOOT,
    });
    expect(
      after.diagnostics.find((item) => item.id === "residue.owned"),
    ).toMatchObject({
      status: "ready",
      classification: "verified_closed",
    });
    expect(after.status).toBe("ready");
  });

  it("keeps independent failures visible when the project and platform are unavailable", async () => {
    const empty = await mkdtemp(join(tmpdir(), "pumarejo-doctor-empty-"));
    temporaryDirectories.push(empty);
    const report = await doctorProject(empty, {
      platform: "darwin",
      environment: {},
      executableAvailable: async () => false,
      webviewAvailable: async () => false,
      portAvailable: async () => false,
    });

    expect(report.status).toBe("error");
    expect(
      report.diagnostics.filter((item) => item.status === "error").length,
    ).toBeGreaterThanOrEqual(11);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "project.detected", status: "error" }),
        expect.objectContaining({ id: "config.valid", status: "error" }),
        expect.objectContaining({ id: "toolchain.rust", status: "error" }),
        expect.objectContaining({ id: "platform.display", status: "error" }),
        expect.objectContaining({ id: "platform.webview", status: "error" }),
        expect.objectContaining({ id: "port.available", status: "error" }),
      ]),
    );
  });

  it("uses identical diagnostic identities in human and JSON CLI output", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const jsonOutput: string[] = [];
    const humanOutput: string[] = [];
    const io = (output: string[]) => ({
      stdout: (text: string) => output.push(text),
      stderr: () => undefined,
    });

    await expect(
      runCli(
        ["doctor", "--project", project, "--json"],
        undefined,
        io(jsonOutput),
      ),
    ).resolves.toBe(0);
    await expect(
      runCli(["doctor", "--project", project], undefined, io(humanOutput)),
    ).resolves.toBe(0);

    const report = JSON.parse(jsonOutput.join("")) as {
      diagnostics: Array<{ id: string }>;
    };
    for (const { id } of report.diagnostics) {
      expect(humanOutput.join("")).toContain(`] ${id}:`);
    }
  });

  it("reports changed capability separately from valid manifest structure", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const capabilityPath = join(project, ".pumarejo", "agent-capability.json");
    const capability = JSON.parse(await readFile(capabilityPath, "utf8")) as {
      permissions: string[];
    };
    capability.permissions = [];
    await writeFile(capabilityPath, `${JSON.stringify(capability, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "integration.manifest",
          status: "warn",
        }),
        expect.objectContaining({
          id: "integration.capability-permission",
          status: "error",
        }),
      ]),
    );
  });

  it("warns about owned residue without deleting or terminating it", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const residue = join(project, ".pumarejo", "sessions", "owned-session");
    await mkdir(residue, { recursive: true });
    await writeFile(join(residue, "lease.json"), '{"pid":123}\n');

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.status).toBe("warn");
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "residue.owned", status: "warn" }),
      ]),
    );
    expect(await readFile(join(residue, "lease.json"), "utf8")).toContain(
      '"pid":123',
    );
  });

  it("reports an interrupted removal journal as integration error and residue", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      state: string;
    };
    manifest.state = "removing";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "integration.manifest",
          status: "error",
        }),
        expect.objectContaining({ id: "residue.owned", status: "warn" }),
      ]),
    );
  });

  it("refuses to enumerate a linked residue directory", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const outside = await mkdtemp(join(tmpdir(), "pumarejo-residue-outside-"));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "private-name"), "unchanged");
    await symlink(
      outside,
      join(project, ".pumarejo", "sessions"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "residue.owned", status: "warn" }),
      ]),
    );
    expect(await readFile(join(outside, "private-name"), "utf8")).toBe(
      "unchanged",
    );
  });

  it("formats one actionable line per diagnostic", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const report = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      portAvailable: async () => false,
    });
    const human = formatDoctorReport(report);

    expect(human.trim().split("\n")).toHaveLength(report.diagnostics.length);
    expect(human).toContain("[ERROR] port.available:");
    expect(human).toContain("Action:");
  });

  it("classifies a launch command that is absent from the effective PATH", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const report = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      executableAvailable: async (command) => command !== "pnpm",
    });

    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "toolchain.launch",
        status: "error",
        classification: "not_on_path",
        evidence: expect.objectContaining({
          executable: "pnpm",
          provenance: "host-path",
        }),
      }),
    );
  });

  it("reports integration version drift independently", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      pumarejoVersion: string;
    };
    manifest.pumarejoVersion = "0.0.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.version-alignment",
        status: "error",
        classification: "version_drift",
      }),
    );
  });

  it("fails closed when uniform Cargo EOL attribution is removed", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{
        kind: string;
        attribution: string[];
        afterHash: string;
      }>;
    };
    const cargoEntry = manifest.changes.find(
      (change) => change.kind === "cargo",
    );
    expect(cargoEntry).toBeDefined();
    cargoEntry!.attribution = cargoEntry!.attribution.filter(
      (value) => !value.startsWith("eol:cargo:"),
    );
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );
  });

  it("fails closed when the owned Cargo EOL marker is missing", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const cargo = await readFile(cargoPath, "utf8");
    const marker = cargo.match(/^# <pumarejo:cargo-eol:(?:lf|crlf)>\r?\n/mu);
    expect(marker).not.toBeNull();
    await writeFile(cargoPath, cargo.replace(marker![0], ""), "utf8");

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );
  });

  it("fails closed for a foreign key on a created Cargo dependency", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const changedCargo = (await readFile(cargoPath, "utf8")).replace(
      "optional = true }",
      'optional = true, registry = "foreign" }',
    );
    await writeFile(cargoPath, changedCargo, "utf8");
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{
        kind: string;
        attribution: string[];
        afterHash: string;
      }>;
    };
    const cargoEntry = manifest.changes.find(
      (change) => change.kind === "cargo",
    );
    expect(cargoEntry).toBeDefined();
    cargoEntry!.afterHash = createHash("sha256")
      .update(changedCargo, "utf8")
      .digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );
  });

  it("rejects an unproven pre-existing plugin dependency", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    await writeFile(
      cargoPath,
      `${await readFile(cargoPath, "utf8")}
tauri-plugin-wdio-webdriver = { version = "1", optional = true }

[features]
pumarejo = ["dep:tauri-plugin-wdio-webdriver"]
`,
      "utf8",
    );
    await expect(initializeProject(project)).rejects.toMatchObject({
      reason: "CARGO_DEPENDENCY_AMBIGUOUS",
    });
  });

  it("accepts an initialized exact supported registry dependency with an attributable provider path", async () => {
    const project = await projectCopy();
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    await writeFile(
      cargoPath,
      `${await readFile(cargoPath, "utf8")}
tauri-plugin-wdio-webdriver = { version = "1.2.0", optional = true }

[features]
e2e-wdio = ["dep:tauri-plugin-wdio-webdriver"]
`,
      "utf8",
    );

    await expect(initializeProject(project)).resolves.toMatchObject({
      status: "applied",
    });
    const initialized = await readFile(cargoPath, "utf8");
    expect(initialized).toMatch(
      /# <pumarejo:cargo-dependency-path>\r?\ntauri-plugin-wdio-webdriver = \{ path = "\.\.\/\.pumarejo\/provider\/tauri-plugin-wdio-webdriver", version = "1\.2\.0", optional = true \}/u,
    );

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.version-alignment",
        status: "ready",
        classification: "verified",
      }),
    );
  });

  it("detects generated Tauri plugin drift even when recorded hashes are updated", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const changedCargo = (await readFile(cargoPath, "utf8")).replace(
      'tauri-plugin-wdio-webdriver = { path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", version = "1"',
      'tauri-plugin-wdio-webdriver = { path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", version = "2"',
    );
    await writeFile(cargoPath, changedCargo);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{ relativePath: string; afterHash: string }>;
    };
    const cargoEntry = manifest.changes.find(
      (entry) => entry.relativePath === "src-tauri/Cargo.toml",
    );
    expect(cargoEntry).toBeDefined();
    cargoEntry!.afterHash = createHash("sha256")
      .update(changedCargo, "utf8")
      .digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.version-alignment",
        status: "error",
        classification: "version_drift",
      }),
    );
  });

  it("keeps the integration ready when only unowned project content changes", async () => {
    const project = await projectCopy();
    await initializeProject(project);

    await writeFile(
      join(project, ".gitignore"),
      `${await readFile(join(project, ".gitignore"), "utf8")}coverage/\n`,
    );
    await writeFile(
      join(project, "src-tauri", "src", "lib.rs"),
      `${await readFile(join(project, "src-tauri", "src", "lib.rs"), "utf8")}// user-owned Rust note\n`,
    );
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const cargoSource = await readFile(cargoPath, "utf8");
    const cargoEol = cargoSource.includes("\r\n") ? "\r\n" : "\n";
    await writeFile(
      cargoPath,
      `${cargoSource}${cargoEol}[package.metadata.user]${cargoEol}note = "preserve"${cargoEol}`,
    );
    const configPath = join(project, ".pumarejo.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    config.webdriverPort = 4444;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.manifest",
        status: "ready",
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.debug-registration",
        status: "ready",
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.capability-permission",
        status: "ready",
      }),
    );
  });

  it.each([
    {
      name: "a generated Rust marker",
      relativePath: "src-tauri/src/lib.rs",
      mutate: async (project: string) => {
        const path = join(project, "src-tauri", "src", "lib.rs");
        const source = await readFile(path, "utf8");
        await writeFile(
          path,
          source.replace("pumarejo:begin", "pumarejo:owned"),
        );
      },
      diagnostic: "integration.debug-registration",
    },
    {
      name: "the generated Cargo feature",
      relativePath: "src-tauri/Cargo.toml",
      mutate: async (project: string) => {
        const path = join(project, "src-tauri", "Cargo.toml");
        const source = await readFile(path, "utf8");
        await writeFile(path, source.replace('version = "1"', 'version = "2"'));
      },
      diagnostic: "integration.debug-registration",
    },
    {
      name: "the generated ignore entry",
      relativePath: ".gitignore",
      mutate: async (project: string) => {
        const path = join(project, ".gitignore");
        const source = await readFile(path, "utf8");
        await writeFile(path, source.replace("/.pumarejo/", "/not-pumarejo/"));
      },
      diagnostic: "integration.manifest",
    },
    {
      name: "an integration-owned config field",
      relativePath: ".pumarejo.json",
      mutate: async (project: string) => {
        const path = join(project, ".pumarejo.json");
        const config = JSON.parse(await readFile(path, "utf8")) as {
          artifactsDirectory: string;
        };
        config.artifactsDirectory = ".pumarejo/other-artifacts";
        await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
      },
      diagnostic: "integration.manifest",
    },
  ])(
    "fails closed when $name is mutated through doctor",
    async ({ mutate, diagnostic }) => {
      const project = await projectCopy();
      await initializeProject(project);
      await mutate(project);

      const report = await doctorProject(project, READY_DEPENDENCIES);
      expect(report.diagnostics).toContainEqual(
        expect.objectContaining({ id: diagnostic, status: expect.any(String) }),
      );
      expect(report.diagnostics).toContainEqual(
        expect.objectContaining({ id: "integration.manifest", status: "warn" }),
      );
    },
  );

  it.each([
    "src-tauri/src/lib.rs",
    "src-tauri/Cargo.toml",
    ".gitignore",
    ".pumarejo/agent-capability.json",
    ".pumarejo.json",
  ])("fails closed when the owned file %s is deleted", async (relativePath) => {
    const project = await projectCopy();
    await initializeProject(project);
    await rm(join(project, relativePath));

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );
  });

  it("fails closed for duplicated, malformed, and linked owned content", async () => {
    const duplicateProject = await projectCopy();
    await initializeProject(duplicateProject);
    const duplicateIgnorePath = join(duplicateProject, ".gitignore");
    const ignore = await readFile(duplicateIgnorePath, "utf8");
    await writeFile(duplicateIgnorePath, `${ignore}${ignore}`);
    const duplicateReport = await doctorProject(
      duplicateProject,
      READY_DEPENDENCIES,
    );
    expect(duplicateReport.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );

    const malformedProject = await projectCopy();
    await initializeProject(malformedProject);
    const capabilityPath = join(
      malformedProject,
      ".pumarejo",
      "agent-capability.json",
    );
    await writeFile(capabilityPath, "{ malformed\n");
    const malformedReport = await doctorProject(
      malformedProject,
      READY_DEPENDENCIES,
    );
    expect(malformedReport.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.capability-permission",
        status: "error",
      }),
    );

    const linkedProject = await projectCopy();
    await initializeProject(linkedProject);
    const ignorePath = join(linkedProject, ".gitignore");
    const outside = await mkdtemp(join(tmpdir(), "pumarejo-owned-outside-"));
    temporaryDirectories.push(outside);
    const outsideIgnore = join(outside, "ignore");
    await writeFile(outsideIgnore, ignore);
    await rm(ignorePath);
    await symlink(
      outside,
      ignorePath,
      process.platform === "win32" ? "junction" : "dir",
    );
    const linkedReport = await doctorProject(linkedProject, READY_DEPENDENCIES);
    expect(linkedReport.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "error" }),
    );
    expect(await readFile(outsideIgnore, "utf8")).toBe(ignore);
  });

  it.each([
    {
      name: "extra keys",
      change: (capability: Record<string, unknown>) => {
        capability.extra = true;
      },
    },
    {
      name: "wildcard windows",
      change: (capability: Record<string, unknown>) => {
        capability.windows = ["*"];
      },
    },
    {
      name: "reordered permissions",
      change: (capability: Record<string, unknown>) => {
        capability.permissions = [
          ...(capability.permissions as string[]).slice().reverse(),
        ];
      },
    },
    {
      name: "unknown permissions",
      change: (capability: Record<string, unknown>) => {
        capability.permissions = [
          ...(capability.permissions as string[]).slice(0, -1),
          "core:window:allow-close",
        ];
      },
    },
  ])("rejects capability $name", async ({ change }) => {
    const project = await projectCopy();
    await initializeProject(project);
    const capabilityPath = join(project, ".pumarejo", "agent-capability.json");
    const capability = JSON.parse(
      await readFile(capabilityPath, "utf8"),
    ) as Record<string, unknown>;
    change(capability);
    await writeFile(capabilityPath, `${JSON.stringify(capability, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.capability-permission",
        status: "error",
      }),
    );
  });

  it("does not let a forged afterHash rescue owned drift or trigger repair", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const capabilityPath = join(project, ".pumarejo", "agent-capability.json");
    const changed = `${(await readFile(capabilityPath, "utf8")).replace(
      '"identifier": "pumarejo-agent"',
      '"identifier": "forged-agent"',
    )}`;
    await writeFile(capabilityPath, changed);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{ relativePath: string; afterHash: string }>;
    };
    const capabilityEntry = manifest.changes.find(
      (entry) => entry.relativePath === ".pumarejo/agent-capability.json",
    );
    expect(capabilityEntry).toBeDefined();
    capabilityEntry!.afterHash = createHash("sha256")
      .update(changed)
      .digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.capability-permission",
        status: "error",
      }),
    );
    expect(await readFile(capabilityPath, "utf8")).toBe(changed);
  });

  it("does not let a forged provider afterHash rescue staged provider drift", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const providerPath = join(
      project,
      ".pumarejo",
      "provider",
      "tauri-plugin-wdio-webdriver",
      "Cargo.toml",
    );
    const providerSource = await readFile(providerPath, "utf8");
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{ relativePath: string; afterHash: string }>;
    };
    const providerEntry = manifest.changes.find((entry) =>
      entry.relativePath.startsWith(
        ".pumarejo/provider/tauri-plugin-wdio-webdriver/",
      ),
    );
    expect(providerEntry).toBeDefined();
    providerEntry!.afterHash =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "integration.manifest", status: "warn" }),
    );
    expect(await readFile(providerPath, "utf8")).toBe(providerSource);
  });

  it("rejects an installed plugin dependency whose version cannot be verified", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const changedCargo = (await readFile(cargoPath, "utf8")).replace(
      'tauri-plugin-wdio-webdriver = { path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", version = "1"',
      'tauri-plugin-wdio-webdriver = { path = "../wdio-webdriver"',
    );
    await writeFile(cargoPath, changedCargo);
    const manifestPath = join(
      project,
      ".pumarejo",
      "integration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      changes: Array<{ relativePath: string; afterHash: string }>;
    };
    const cargoEntry = manifest.changes.find(
      (entry) => entry.relativePath === "src-tauri/Cargo.toml",
    );
    expect(cargoEntry).toBeDefined();
    cargoEntry!.afterHash = createHash("sha256")
      .update(changedCargo, "utf8")
      .digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = await doctorProject(project, READY_DEPENDENCIES);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "integration.version-alignment",
        status: "error",
        classification: "version_drift",
      }),
    );
  });

  it("lets successful launch evidence qualify earlier executable and WebView heuristics", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    await writeFile(
      join(project, ".pumarejo", "launch-verification.json"),
      `${JSON.stringify(
        {
          version: 1,
          pumarejoVersion: "0.1.0",
          pluginVersion: "1",
          executable: "pnpm",
          platform: "win32",
          verified: true,
        },
        null,
        2,
      )}\n`,
    );

    const report = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      executableAvailable: async (command) => command !== "pnpm",
      webviewAvailable: async () => false,
    });
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "toolchain.launch",
          status: "ready",
          classification: "verified",
        }),
        expect.objectContaining({
          id: "platform.webview",
          status: "ready",
          classification: "verified",
        }),
      ]),
    );
  });

  it("does not use successful launch evidence from another platform", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    await writeFile(
      join(project, ".pumarejo", "launch-verification.json"),
      `${JSON.stringify(
        {
          version: 1,
          pumarejoVersion: "0.1.0",
          pluginVersion: "1",
          executable: "pnpm",
          platform: "linux",
          verified: true,
        },
        null,
        2,
      )}\n`,
    );

    const report = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      executableAvailable: async (command) => command !== "pnpm",
      webviewAvailable: async () => false,
    });
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "toolchain.launch",
          status: "error",
          classification: "not_on_path",
        }),
        expect.objectContaining({
          id: "platform.webview",
          status: "error",
          classification: "not_detected",
        }),
      ]),
    );
  });

  it("records only versioned, sanitized successful-launch evidence", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const loaded = await loadProjectConfig(project);
    await recordLaunchVerification(loaded, "win32");

    await expect(readLaunchVerification(loaded)).resolves.toMatchObject({
      version: 1,
      pumarejoVersion: "0.1.0",
      pluginVersion: "1",
      executable: "pnpm",
      platform: "win32",
      verified: true,
    });
    const source = await readFile(
      join(project, ".pumarejo", "launch-verification.json"),
      "utf8",
    );
    expect(source).not.toContain(project);
    expect(source).not.toContain("tauri");
  });

  it("redacts unapproved launch arguments and full explicit paths in human and JSON output", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const configPath = join(project, ".pumarejo.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      launch: {
        executablePath?: string;
        args: string[];
      };
    };
    config.launch.executablePath = "/opt/private-user/bin/pnpm";
    config.launch.args.splice(1, 0, "fixture-super-secret");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const report = await doctorProject(project, {
      ...READY_DEPENDENCIES,
      executableAvailable: async () => false,
    });
    const output = `${JSON.stringify(report)}\n${formatDoctorReport(report)}`;
    expect(output).not.toContain("fixture-super-secret");
    expect(output).not.toContain("/opt/private-user");
    expect(output).toContain("<redacted>");
    expect(output).toContain("executable=pnpm");
    expect(output).toContain("provenance=project-config");
  });

  it.each(["codex", "claude-code", "cursor"] as const)(
    "prints copyable %s stdio configuration without writing host settings",
    async (host) => {
      const project = await projectCopy();
      await initializeProject(project);
      const stdout: string[] = [];
      await expect(
        runCli(
          ["mcp", "print-config", "--host", host, "--project", project],
          undefined,
          {
            stdout: (text) => stdout.push(text),
            stderr: () => undefined,
          },
        ),
      ).resolves.toBe(0);

      const output = stdout.join("");
      expect(output).toContain("pumarejo");
      expect(output).toContain("mcp");
      expect(output).toContain("--project");
      if (host === "codex") {
        expect(output).toContain("[mcp_servers.pumarejo]");
        expect(output).toContain(JSON.stringify(project));
      } else {
        expect(JSON.parse(output)).toMatchObject({
          mcpServers: {
            pumarejo: {
              command: "pumarejo",
              args: ["mcp", "--project", project],
            },
          },
        });
      }
      await expect(
        readFile(join(project, ".cursor", "mcp.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        readFile(join(project, ".mcp.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});
