import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

interface PackFile {
  readonly path: string;
}

interface PackResult {
  readonly name: string;
  readonly version: string;
  readonly filename: string;
  readonly files: readonly PackFile[];
}

function parsePackResult(output: string): PackResult {
  const parsed: unknown = JSON.parse(output);
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) {
      throw new Error("Expected one packed package result.");
    }
    return parsed[0] as PackResult;
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Expected one packed package result.");
  }
  return parsed as PackResult;
}

describe("packed package", () => {
  it("imports every declared ESM entry point from built output", async () => {
    const root = await import(pathToFileURL(resolve("dist/index.js")).href);
    const config = await import(
      pathToFileURL(resolve("dist/config/index.js")).href
    );
    const errors = await import(
      pathToFileURL(resolve("dist/shared/errors.js")).href
    );

    expect(root.projectConfigSchema).toBeDefined();
    expect(config.loadProjectConfig).toBeTypeOf("function");
    expect(errors.TauriAgentError).toBeTypeOf("function");
  });

  it("contains only package metadata and built runtime files", () => {
    const pnpmCli =
      process.env.TAURI_AGENT_PNPM_CLI ?? process.env.npm_execpath;
    expect(pnpmCli).toBeTruthy();
    const result = spawnSync(
      process.execPath,
      [pnpmCli as string, "pack", "--dry-run", "--json"],
      { cwd: resolve("."), encoding: "utf8", shell: false },
    );

    expect(result.status, result.stderr).toBe(0);
    const packed = parsePackResult(result.stdout);
    expect(packed).toMatchObject({
      name: "@cie/tauri-agent",
      version: "0.1.0",
    });

    const paths = packed.files.map((file) => file.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("README.md");
    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/cli/index.js");
    expect(
      paths.every(
        (path) =>
          path === "package.json" ||
          path === "README.md" ||
          path.startsWith("dist/"),
      ),
    ).toBe(true);
    expect(paths.join("\n")).not.toMatch(
      /(?:^|\/)(?:tests?|docs?|vendor|node_modules)(?:\/|$)/,
    );
    expect(paths.join("\n")).not.toContain(resolve("."));
  });

  it("installs the tarball and runs its real bin and ESM export", async () => {
    const pnpmCli =
      process.env.TAURI_AGENT_PNPM_CLI ?? process.env.npm_execpath;
    expect(pnpmCli).toBeTruthy();
    const temporaryRoot = await mkdtemp(join(tmpdir(), "tauri-agent-pack-"));
    const packageDirectory = join(temporaryRoot, "package");
    const consumerDirectory = join(temporaryRoot, "consumer");

    try {
      await mkdir(packageDirectory);
      await mkdir(consumerDirectory);
      await writeFile(
        join(consumerDirectory, "package.json"),
        JSON.stringify({ name: "tauri-agent-pack-consumer", private: true }),
        "utf8",
      );

      const pack = spawnSync(
        process.execPath,
        [
          pnpmCli as string,
          "pack",
          "--pack-destination",
          packageDirectory,
          "--json",
        ],
        { cwd: resolve("."), encoding: "utf8", shell: false },
      );
      expect(pack.status, pack.stderr).toBe(0);
      const packed = parsePackResult(pack.stdout);
      const tarball = isAbsolute(packed.filename)
        ? packed.filename
        : join(packageDirectory, packed.filename);

      const install = spawnSync(
        process.execPath,
        [pnpmCli as string, "add", tarball, "--prefer-offline"],
        { cwd: consumerDirectory, encoding: "utf8", shell: false },
      );
      if (install.status !== 0) {
        throw new Error(
          `Packed consumer install failed: ${install.stderr || install.stdout}`,
        );
      }

      const help = spawnSync(
        process.execPath,
        [pnpmCli as string, "exec", "tauri-agent", "--help"],
        { cwd: consumerDirectory, encoding: "utf8", shell: false },
      );
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain("tauri-agent mcp --project <path>");

      const version = spawnSync(
        process.execPath,
        [pnpmCli as string, "exec", "tauri-agent", "--version"],
        { cwd: consumerDirectory, encoding: "utf8", shell: false },
      );
      expect(version.status, version.stderr).toBe(0);
      expect(version.stdout.trim()).toBe("0.1.0");

      const imported = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          [
            "const root = await import('@cie/tauri-agent');",
            "const config = await import('@cie/tauri-agent/config');",
            "const errors = await import('@cie/tauri-agent/errors');",
            "const result = await import('@cie/tauri-agent/result');",
            "const metadata = await import('@cie/tauri-agent/package.json', { with: { type: 'json' } });",
            "if (!root.projectConfigSchema || !config.loadProjectConfig || !errors.TauriAgentError || !result.ok || metadata.default.name !== '@cie/tauri-agent') process.exit(1);",
          ].join("\n"),
        ],
        { cwd: consumerDirectory, encoding: "utf8", shell: false },
      );
      expect(imported.status, imported.stderr).toBe(0);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
