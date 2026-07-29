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

  it("detects generated Tauri plugin drift even when recorded hashes are updated", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const changedCargo = (await readFile(cargoPath, "utf8")).replace(
      'tauri-plugin-wdio-webdriver = { version = "1"',
      'tauri-plugin-wdio-webdriver = { version = "2"',
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

  it("rejects an installed plugin dependency whose version cannot be verified", async () => {
    const project = await projectCopy();
    await initializeProject(project);
    const cargoPath = join(project, "src-tauri", "Cargo.toml");
    const changedCargo = (await readFile(cargoPath, "utf8")).replace(
      'tauri-plugin-wdio-webdriver = { version = "1"',
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
