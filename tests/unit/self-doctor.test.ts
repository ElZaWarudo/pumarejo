import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorSelf,
  SELF_DOCTOR_DIAGNOSTIC_IDS,
  SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST,
} from "../../src/installer/self-doctor.js";
import { defaultSelfDoctorFileSystem } from "../../src/installer/self-doctor-paths.js";
import type {
  ToolchainComparisonDisposition,
  ToolchainKind,
  ToolchainResolution,
} from "../../src/platform/toolchain-resolver.js";

const temporaryDirectories: string[] = [];
const authoritativeTestFileSystem = {
  ...defaultSelfDoctorFileSystem,
  async readVerifiedFile(path: string, _root: string, maxBytes: number) {
    const before = await defaultSelfDoctorFileSystem.lstat(path);
    const content = await readFile(path, "utf8");
    if (Buffer.byteLength(content, "utf8") > maxBytes) {
      throw new Error("file-too-large");
    }
    return {
      content,
      canonicalPath: await defaultSelfDoctorFileSystem.realpath(path),
      before,
      after: await defaultSelfDoctorFileSystem.lstat(path),
    };
  },
};

async function healthyInstallation(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pumarejo-self-doctor-"));
  temporaryDirectories.push(root);
  for (const entry of SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST) {
    const path = join(root, entry);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      entry === "package.json"
        ? JSON.stringify({
            name: "pumarejo",
            version: "0.1.0",
            packageManager: "pnpm@11.9.0",
            engines: { node: ">=22 <25" },
            bin: "./dist/cli/index.js",
            exports: {
              ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
              "./config": {
                types: "./dist/config/index.d.ts",
                import: "./dist/config/index.js",
              },
              "./errors": {
                types: "./dist/shared/errors.d.ts",
                import: "./dist/shared/errors.js",
              },
              "./result": {
                types: "./dist/shared/result.d.ts",
                import: "./dist/shared/result.js",
              },
            },
          })
        : "export {};\n",
      "utf8",
    );
  }
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\nimporters:\n  .: {}\n",
  );
  return root;
}

function resolvedToolchain(
  kind: ToolchainKind,
  version: string,
  compared = true,
): ToolchainResolution {
  const accepted = {
    kind,
    source: "child-path" as const,
    path: `/private/${kind}`,
    basename: kind,
    identity: "0123456789abcdef",
    fileKind: "regular-file" as const,
    accepted: true,
    version,
    probe: "success" as const,
  };
  return {
    kind,
    accepted,
    candidates: [accepted],
    outcome: "resolved",
    ...(compared
      ? {
          comparison: {
            disposition: "consistent" as const,
            identity: accepted.identity,
            version,
          },
        }
      : {}),
  };
}

function comparedToolchain(
  kind: ToolchainKind,
  version: string,
  disposition: ToolchainComparisonDisposition,
): ToolchainResolution {
  const resolution = resolvedToolchain(kind, version);
  return {
    ...resolution,
    comparison: { ...resolution.comparison, disposition },
  };
}

const healthyToolchains = {
  node: resolvedToolchain("node", "22.4.1"),
  pnpm: resolvedToolchain("pnpm", "11.9.0"),
};

async function reportFor(root: string) {
  return await doctorSelf({
    installationRoot: root,
    platform: "linux",
    fileSystem: authoritativeTestFileSystem,
    toolchainResolutions: healthyToolchains,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("self-doctor engine", () => {
  it("returns the accepted bounded RU1 report for a healthy installation", async () => {
    const report = await reportFor(await healthyInstallation());
    expect(report).toMatchObject({ version: 1, mode: "self", status: "ready" });
    expect(report.diagnostics.map((item) => item.id)).toEqual(
      SELF_DOCTOR_DIAGNOSTIC_IDS,
    );
    expect(report.diagnostics.length).toBeLessThanOrEqual(32);
    expect(SELF_DOCTOR_DIAGNOSTIC_IDS).toContain("self.installation.links");
  });

  it("fails closed on metadata-derived entries without exposing the value", async () => {
    const root = await healthyInstallation();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "pumarejo",
        version: "0.1.0",
        bin: "/private/secret/pumarejo.js",
        exports: {},
      }),
      "utf8",
    );
    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.package.metadata",
        code: "unsafe-entry",
        status: "error",
      }),
    );
    expect(JSON.stringify(report)).not.toContain("/private/secret");
  });

  it("rejects unsafe targets beneath unknown export keys", async () => {
    const root = await healthyInstallation();
    const path = join(root, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.exports = {
      ...(manifest.exports as Record<string, unknown>),
      "./private": "../../outside/secret.js",
    };
    await writeFile(path, JSON.stringify(manifest), "utf8");
    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.package.metadata",
        code: "unsafe-entry",
        status: "error",
      }),
    );
    expect(JSON.stringify(report)).not.toContain("outside/secret");
  });

  it("reports a wide metadata frontier through self.report.bounds", async () => {
    const root = await healthyInstallation();
    const path = join(root, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.bin = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [
        `bin-${index}`,
        "./dist/cli/index.js",
      ]),
    );
    await writeFile(path, JSON.stringify(manifest), "utf8");
    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.report.bounds",
        code: "inspection-bounded",
        status: "error",
      }),
    );
  });

  it("bounds deeply nested metadata without recursive stack growth", async () => {
    const root = await healthyInstallation();
    const path = join(root, "package.json");
    let nested: unknown = "./dist/index.js";
    for (let index = 0; index < 32; index += 1) nested = { default: nested };
    await writeFile(
      path,
      JSON.stringify({
        name: "pumarejo",
        version: "0.1.0",
        bin: "./dist/cli/index.js",
        exports: { ".": nested },
      }),
      "utf8",
    );
    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ id: "self.report.bounds", status: "error" }),
    );
  });

  it("reports required dependency and lockfile incoherence without repair", async () => {
    const root = await healthyInstallation();
    const path = join(root, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.dependencies = { missing: "1.0.0" };
    await writeFile(path, JSON.stringify(manifest), "utf8");
    await writeFile(join(root, "package-lock.json"), "{}", "utf8");

    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.dependencies.resolution",
        code: "dependency-missing",
        status: "error",
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.installation.lockfile",
        code: "lockfile-ambiguous",
        status: "error",
      }),
    );
  });

  it("rejects stale installed dependency metadata", async () => {
    const root = await healthyInstallation();
    const path = join(root, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.dependencies = { dependency: "1.2.3" };
    await writeFile(path, JSON.stringify(manifest), "utf8");
    await mkdir(join(root, "node_modules", "dependency"), { recursive: true });
    await writeFile(
      join(root, "node_modules", "dependency", "package.json"),
      JSON.stringify({ name: "dependency", version: "1.2.4" }),
      "utf8",
    );

    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.dependencies.resolution",
        code: "dependency-stale",
        status: "error",
      }),
    );
  });

  it("rejects a malformed selected lockfile as metadata evidence", async () => {
    const root = await healthyInstallation();
    await writeFile(join(root, "pnpm-lock.yaml"), "private raw text", "utf8");
    const report = await reportFor(root);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.installation.lockfile",
        code: "lockfile-invalid",
        status: "error",
      }),
    );
  });

  it("checks manifest engine and package-manager versions exactly", async () => {
    const root = await healthyInstallation();
    const report = await doctorSelf({
      installationRoot: root,
      platform: "linux",
      fileSystem: authoritativeTestFileSystem,
      toolchainResolutions: {
        node: resolvedToolchain("node", "25.0.0"),
        pnpm: resolvedToolchain("pnpm", "11.9.1"),
      },
    });

    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.toolchain.node",
        code: "engine-mismatch",
        status: "error",
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.toolchain.package-manager",
        code: "manager-version-mismatch",
        status: "error",
      }),
    );
  });

  it("keeps host-child unknown without real child comparison evidence", async () => {
    const root = await healthyInstallation();
    const report = await doctorSelf({
      installationRoot: root,
      platform: "linux",
      fileSystem: authoritativeTestFileSystem,
      toolchainResolutions: {
        node: resolvedToolchain("node", "22.4.1", false),
        pnpm: resolvedToolchain("pnpm", "11.9.0", false),
      },
    });

    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.toolchain.host-child",
        code: "unknown",
        status: "warn",
      }),
    );
    expect(JSON.stringify(report)).not.toContain("/private/");
  });

  it("does not resolve or probe toolchains without accepted RDM-017 evidence", async () => {
    const report = await doctorSelf({
      installationRoot: await healthyInstallation(),
      platform: "linux",
      fileSystem: authoritativeTestFileSystem,
    });

    expect(
      report.diagnostics.filter(
        (item) =>
          item.code === "unknown" &&
          item.evidence?.reason === "resolver-evidence-unavailable",
      ),
    ).toHaveLength(3);
    expect(report.status).toBe("warn");
  });

  it("sanitizes injected resolver sources at runtime", async () => {
    const node = resolvedToolchain("node", "22.4.1");
    const report = await doctorSelf({
      installationRoot: await healthyInstallation(),
      platform: "linux",
      fileSystem: authoritativeTestFileSystem,
      toolchainResolutions: {
        node: {
          ...node,
          accepted: {
            ...node.accepted!,
            source: "/private/resolver-path" as never,
          },
        },
        pnpm: resolvedToolchain("pnpm", "11.9.0"),
      },
    });

    const output = JSON.stringify(report);
    expect(output).not.toContain("/private/resolver-path");
    expect(output).toContain('"source":"unknown"');
  });

  it("does not upgrade injected Windows comparisons beyond the platform gap", async () => {
    const root = await healthyInstallation();
    const report = await doctorSelf({
      installationRoot: root,
      platform: "win32",
      fileSystem: authoritativeTestFileSystem,
      toolchainResolutions: healthyToolchains,
    });

    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.toolchain.host-child",
        code: "unknown",
        status: "warn",
      }),
    );
  });

  it("projects excessive resolver candidates into the shared bounds result", async () => {
    const root = await healthyInstallation();
    const node = resolvedToolchain("node", "22.4.1");
    const report = await doctorSelf({
      installationRoot: root,
      platform: "linux",
      fileSystem: authoritativeTestFileSystem,
      toolchainResolutions: {
        node: { ...node, candidates: Array(33).fill(node.accepted) },
        pnpm: resolvedToolchain("pnpm", "11.9.0"),
      },
    });

    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "self.report.bounds",
        code: "inspection-bounded",
        status: "error",
      }),
    );
  });

  it.each([
    "host_only",
    "child_only",
    "version_mismatch",
    "environment_mismatch",
  ] as const)(
    "preserves the %s host-child disposition",
    async (disposition) => {
      const report = await doctorSelf({
        installationRoot: await healthyInstallation(),
        platform: "linux",
        fileSystem: authoritativeTestFileSystem,
        toolchainResolutions: {
          node: comparedToolchain("node", "22.4.1", disposition),
          pnpm: resolvedToolchain("pnpm", "11.9.0"),
        },
      });

      expect(report.diagnostics).toContainEqual(
        expect.objectContaining({
          id: "self.toolchain.host-child",
          code: disposition,
          status: "error",
        }),
      );
    },
  );
});
