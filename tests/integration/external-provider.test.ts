import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { parseCliArgs } from "../../src/cli/parse.js";
import {
  doctorProject,
  type DoctorDependencies,
} from "../../src/installer/doctor.js";
import { parseIntegrationManifest } from "../../src/installer/manifest.js";
import { initializeProject } from "../../src/installer/plan.js";
import { detectTauriProject } from "../../src/installer/project.js";
import {
  PROVIDER_KIND,
  PROVIDER_STAGED_ROOT,
  readProviderBundle,
} from "../../src/installer/provider-source.js";
import { removeIntegration } from "../../src/installer/remove.js";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "projects",
  "pnpm-json",
);
const PROVIDER_RELATIVE = "tools/pumarejo/vendor/tauri-plugin-wdio-webdriver";
const CARGO_PATH = `../../../${PROVIDER_RELATIVE}`;
const READY: DoctorDependencies = {
  platform: "win32",
  environment: {},
  executableAvailable: async () => true,
  webviewAvailable: async () => true,
  portAvailable: async () => true,
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

/**
 * A repository shaped like a consumer that holds pumarejo as a git submodule:
 * a Cargo workspace root, the app under apps/desktop, and the provider crate
 * under tools/pumarejo.
 */
async function submoduleRepository(): Promise<{
  readonly root: string;
  readonly project: string;
  readonly provider: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-submodule-"));
  temporaryDirectories.push(root);
  const project = join(root, "apps", "desktop");
  await mkdir(dirname(project), { recursive: true });
  await cp(FIXTURE, project, { recursive: true });
  await writeFile(
    join(root, "Cargo.toml"),
    `[workspace]
resolver = "2"
members = ["apps/desktop/src-tauri"]

[workspace.dependencies]
tauri = { version = "2.8.5", features = ["devtools"] }
tauri-build = "2.4.0"
`,
  );
  await writeFile(
    join(project, "src-tauri", "Cargo.toml"),
    `[package]
name = "pnpm_json"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build.workspace = true

[dependencies]
tauri = { workspace = true, features = [] }
`,
  );
  const provider = join(root, PROVIDER_RELATIVE);
  for (const entry of await readProviderBundle()) {
    const path = join(provider, entry.sourceRelativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, entry.content);
  }
  return { root, project, provider };
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

describe("external provider", () => {
  it("references a submodule provider in place and records it in the manifest", async () => {
    const { project, provider } = await submoduleRepository();
    const cargoBefore = await readFile(
      join(project, "src-tauri", "Cargo.toml"),
      "utf8",
    );

    const result = await initializeProject(project, { providerPath: provider });

    expect(result).toMatchObject({
      status: "applied",
      provider: { source: "external", cargoPath: CARGO_PATH },
    });
    expect(
      result.changes.filter((change) => change.kind === PROVIDER_KIND),
    ).toEqual([]);
    expect(await exists(join(project, PROVIDER_STAGED_ROOT))).toBe(false);
    const cargo = await readFile(
      join(project, "src-tauri", "Cargo.toml"),
      "utf8",
    );
    expect(cargo).toContain(
      `tauri-plugin-wdio-webdriver = { path = "${CARGO_PATH}", version = "1", optional = true }`,
    );
    const manifest = parseIntegrationManifest(
      await readFile(
        join(project, ".pumarejo", "integration-manifest.json"),
        "utf8",
      ),
    );
    expect(manifest).toMatchObject({
      version: 2,
      state: "applied",
      provider: { source: "external", cargoPath: CARGO_PATH },
    });
    expect(manifest.changes.some((entry) => entry.kind === PROVIDER_KIND)).toBe(
      false,
    );

    await expect(initializeProject(project)).resolves.toMatchObject({
      status: "already-integrated",
      provider: { cargoPath: CARGO_PATH },
    });
    await expect(
      initializeProject(project, { providerPath: provider }),
    ).resolves.toMatchObject({ status: "already-integrated" });

    await expect(removeIntegration(project)).resolves.toMatchObject({
      status: "removed",
    });
    expect(
      await readFile(join(project, "src-tauri", "Cargo.toml"), "utf8"),
    ).toBe(cargoBefore);
    expect(await exists(join(project, ".pumarejo"))).toBe(false);
    expect(await exists(join(provider, "Cargo.toml"))).toBe(true);
  });

  it("resolves a relative provider path from the working directory through the CLI", async () => {
    const { root, project } = await submoduleRepository();
    const previous = process.cwd();
    const stdout: string[] = [];
    try {
      process.chdir(root);
      await expect(
        runCli(
          [
            "init",
            "--project",
            "apps/desktop",
            "--provider-path",
            PROVIDER_RELATIVE,
          ],
          undefined,
          { stdout: (text) => stdout.push(text), stderr: () => undefined },
        ),
      ).resolves.toBe(0);
    } finally {
      process.chdir(previous);
    }
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      status: "applied",
      provider: { cargoPath: CARGO_PATH },
    });
    expect(
      await readFile(join(project, "src-tauri", "Cargo.toml"), "utf8"),
    ).toContain(`path = "${CARGO_PATH}"`);
  });

  it("reports the external provider ready in doctor without copy errors", async () => {
    const { project, provider } = await submoduleRepository();
    await initializeProject(project, { providerPath: provider });

    const report = await doctorProject(project, READY);
    const byId = new Map(report.diagnostics.map((item) => [item.id, item]));

    for (const id of [
      "project.detected",
      "config.valid",
      "integration.manifest",
      "integration.debug-registration",
      "integration.provider",
      "integration.capability-permission",
      "integration.version-alignment",
    ] as const) {
      expect(byId.get(id), id).toMatchObject({ status: "ready" });
    }
    expect(byId.get("integration.provider")?.summary).toContain(CARGO_PATH);
  });

  it("warns when the external provider differs from the CLI's provider", async () => {
    const { project, provider } = await submoduleRepository();
    await initializeProject(project, { providerPath: provider });
    await writeFile(
      join(provider, "src", "lib.rs"),
      `${await readFile(join(provider, "src", "lib.rs"), "utf8")}\n// local patch\n`,
    );

    const report = await doctorProject(project, READY);

    expect(
      report.diagnostics.find((item) => item.id === "integration.provider"),
    ).toMatchObject({
      status: "warn",
      summary: expect.stringContaining("src/lib.rs"),
    });
  });

  it("fails doctor when the submodule is not checked out", async () => {
    const { project, provider } = await submoduleRepository();
    await initializeProject(project, { providerPath: provider });
    await rm(provider, { recursive: true });

    const report = await doctorProject(project, READY);
    const byId = new Map(report.diagnostics.map((item) => [item.id, item]));

    expect(byId.get("integration.provider")).toMatchObject({
      status: "error",
      summary: expect.stringContaining("missing"),
    });
    expect(byId.get("integration.version-alignment")?.status).toBe("error");
  });

  it("rejects a directory that is not the provider crate without writing", async () => {
    const { root, project } = await submoduleRepository();
    const elsewhere = join(root, "tools", "other");
    await mkdir(elsewhere, { recursive: true });
    await writeFile(
      join(elsewhere, "Cargo.toml"),
      '[package]\nname = "other"\nversion = "1.0.0"\n',
    );

    await expect(
      initializeProject(project, { providerPath: elsewhere }),
    ).rejects.toMatchObject({ reason: "PROVIDER_PATH_INVALID" });
    await expect(
      initializeProject(project, { providerPath: join(root, "missing") }),
    ).rejects.toMatchObject({ reason: "PROVIDER_PATH_INVALID" });
    expect(await exists(join(project, ".pumarejo"))).toBe(false);
  });

  it("refuses to switch an integrated project between provider sources", async () => {
    const { project, provider } = await submoduleRepository();
    await initializeProject(project);

    await expect(
      initializeProject(project, { providerPath: provider }),
    ).rejects.toMatchObject({ reason: "PROVIDER_SOURCE_CHANGED" });
  });

  it("only accepts --provider-path for init", () => {
    expect(parseCliArgs(["init", "--provider-path", "vendor/x"])).toMatchObject(
      { providerPath: "vendor/x" },
    );
    expect(() => parseCliArgs(["doctor", "--provider-path", "x"])).toThrow(
      /Unknown option/u,
    );
    expect(() => parseCliArgs(["init", "--provider-path"])).toThrow(
      /requires a valid path/u,
    );
  });

  it("rejects a manifest provider that is not a safe external Cargo path", () => {
    const manifest = (provider: unknown) =>
      JSON.stringify({
        version: 2,
        pumarejoVersion: "0.1.0",
        pluginVersion: "1",
        provider,
        state: "applied",
        changes: [],
      });
    for (const provider of [
      { source: "external", cargoPath: "/abs/path" },
      { source: "external", cargoPath: "../.pumarejo/provider/x" },
      { source: "external", cargoPath: 'a"b' },
      { source: "copy", cargoPath: "../x" },
      { source: "external", cargoPath: "../x", extra: true },
    ]) {
      expect(() => parseIntegrationManifest(manifest(provider))).toThrow();
    }
  });
});

describe("Cargo workspace inheritance", () => {
  it("detects Tauri 2 declared through workspace = true", async () => {
    const { project } = await submoduleRepository();
    await expect(detectTauriProject(project)).resolves.toMatchObject({
      primaryWindowLabel: "main",
    });
  });

  it("keeps rejecting an inherited Tauri the workspace does not declare", async () => {
    const { root, project } = await submoduleRepository();
    await writeFile(
      join(root, "Cargo.toml"),
      '[workspace]\nmembers = ["apps/desktop/src-tauri"]\n',
    );
    await expect(detectTauriProject(project)).rejects.toMatchObject({
      reason: "TAURI_VERSION_UNSUPPORTED",
    });
  });

  it("rejects an inherited Tauri 1 workspace dependency", async () => {
    const { root, project } = await submoduleRepository();
    await writeFile(
      join(root, "Cargo.toml"),
      '[workspace]\nmembers = ["apps/desktop/src-tauri"]\n\n[workspace.dependencies]\ntauri = "1.8"\ntauri-build = "1.5"\n',
    );
    await expect(detectTauriProject(project)).rejects.toMatchObject({
      reason: "TAURI_VERSION_UNSUPPORTED",
    });
  });
});

describe("doctor host probes", () => {
  it.runIf(process.platform !== "win32")(
    "finds cargo installed as a symlink on PATH, as rustup and distributions do",
    async () => {
      const { project, provider } = await submoduleRepository();
      await initializeProject(project, { providerPath: provider });
      const bin = await mkdtemp(join(tmpdir(), "pumarejo-path-"));
      temporaryDirectories.push(bin);
      const target = join(bin, "rustup");
      await writeFile(target, "#!/bin/sh\n", { mode: 0o755 });
      await symlink(target, join(bin, "cargo"));
      await writeFile(join(bin, "not-executable"), "", { mode: 0o644 });
      await symlink(join(bin, "not-executable"), join(bin, "pnpm"));

      const report = await doctorProject(project, {
        platform: "linux",
        environment: { PATH: bin, DISPLAY: ":0" },
        webviewAvailable: async () => true,
        portAvailable: async () => true,
      });
      const byId = new Map(report.diagnostics.map((item) => [item.id, item]));

      expect(byId.get("toolchain.rust")?.status).toBe("ready");
      expect(byId.get("toolchain.launch")?.status).toBe("error");
    },
  );
});
