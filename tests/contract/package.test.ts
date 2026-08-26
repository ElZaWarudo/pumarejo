import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
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

function resolveWindowsPnpmScript(cli: string): string | undefined {
  if (process.platform !== "win32" || /[\\/]/u.test(cli)) return undefined;
  const commandName = cli.replace(/\.(?:cmd|bat|exe)$/iu, "");
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";");
  for (const directory of (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)) {
    for (const extension of extensions) {
      const commandPath = join(directory, `${commandName}${extension}`);
      if (!existsSync(commandPath)) continue;
      try {
        const shim = readFileSync(commandPath, "utf8");
        const match = /%~dp0([^"'\r\n]+pnpm\.(?:c|m)?js)/iu.exec(shim);
        if (match !== null) {
          const script = join(directory, ...match[1]!.split(/[\\/]/u));
          if (existsSync(script)) return script;
        }
      } catch {
        // Continue through the remaining PATH entries.
      }
      const packageName = commandName;
      const candidates = [
        join(directory, "node_modules", packageName, "bin", "pnpm.cjs"),
        join(
          dirname(directory),
          "node_modules",
          packageName,
          "bin",
          "pnpm.cjs",
        ),
      ];
      const candidate = candidates.find((path) => existsSync(path));
      if (candidate !== undefined) return candidate;
    }
  }
  return undefined;
}

function pnpmInvocation(args: readonly string[]): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const cli =
    process.env.PUMAREJO_PNPM_CLI ?? process.env.npm_execpath ?? "pnpm";
  const script = /\.(?:c|m)?js$/iu.test(cli)
    ? cli
    : resolveWindowsPnpmScript(cli);
  return script === undefined
    ? { command: cli, args }
    : { command: process.execPath, args: [script, ...args] };
}

function runPnpm(args: readonly string[], cwd: string) {
  const invocation = pnpmInvocation(args);
  return spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
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
    expect(errors.PumarejoError).toBeTypeOf("function");
  });

  it("contains only package metadata and built runtime files", () => {
    const invocation = pnpmInvocation(["pack", "--dry-run", "--json"]);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: resolve("."),
      encoding: "utf8",
      shell: false,
    });

    expect(result.status, result.stderr).toBe(0);
    const packed = parsePackResult(result.stdout);
    expect(packed).toMatchObject({
      name: "pumarejo",
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
    const temporaryRoot = await mkdtemp(join(tmpdir(), "pumarejo-pack-"));
    const packageDirectory = join(temporaryRoot, "package");
    const consumerDirectory = join(temporaryRoot, "consumer");
    const projectDirectory = join(temporaryRoot, "project");

    try {
      await mkdir(packageDirectory);
      await mkdir(consumerDirectory);
      await writeFile(
        join(consumerDirectory, "package.json"),
        JSON.stringify({ name: "pumarejo-pack-consumer", private: true }),
        "utf8",
      );
      await cp(resolve("tests/fixtures/projects/pnpm-json"), projectDirectory, {
        recursive: true,
      });

      const pack = runPnpm(
        ["pack", "--pack-destination", packageDirectory, "--json"],
        resolve("."),
      );
      expect(pack.status, pack.stderr).toBe(0);
      const packed = parsePackResult(pack.stdout);
      const tarball = isAbsolute(packed.filename)
        ? packed.filename
        : join(packageDirectory, packed.filename);

      const install = runPnpm(
        ["add", tarball, "--prefer-offline"],
        consumerDirectory,
      );
      if (install.status !== 0) {
        throw new Error(
          `Packed consumer install failed: ${install.stderr || install.stdout}`,
        );
      }

      const help = runPnpm(["exec", "pumarejo", "--help"], consumerDirectory);
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain("pumarejo mcp --project <path>");

      const version = runPnpm(
        ["exec", "pumarejo", "--version"],
        consumerDirectory,
      );
      expect(version.status, version.stderr).toBe(0);
      expect(version.stdout.trim()).toBe("0.1.0");

      const imported = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          [
            "const root = await import('pumarejo');",
            "const config = await import('pumarejo/config');",
            "const errors = await import('pumarejo/errors');",
            "const result = await import('pumarejo/result');",
            "const metadata = await import('pumarejo/package.json', { with: { type: 'json' } });",
            "if (!root.projectConfigSchema || !config.loadProjectConfig || !errors.PumarejoError || !result.ok || metadata.default.name !== 'pumarejo') process.exit(1);",
          ].join("\n"),
        ],
        { cwd: consumerDirectory, encoding: "utf8", shell: false },
      );
      expect(imported.status, imported.stderr).toBe(0);

      const init = runPnpm(
        ["exec", "pumarejo", "init", "--project", projectDirectory],
        consumerDirectory,
      );
      expect(init.status, init.stderr).toBe(0);
      expect(init.stdout).toMatch(/"status":"applied"/u);

      const cargo = await readFile(
        join(projectDirectory, "src-tauri", "Cargo.toml"),
        "utf8",
      );
      expect(cargo).toContain(
        'path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver"',
      );
      expect(cargo).not.toMatch(/path\s*=\s*["'][A-Za-z]:\\/u);

      const manifest = JSON.parse(
        await readFile(
          join(projectDirectory, ".pumarejo", "integration-manifest.json"),
          "utf8",
        ),
      ) as {
        readonly changes: readonly {
          readonly attribution: readonly string[];
          readonly kind: string;
          readonly relativePath: string;
        }[];
      };
      const providerEntries = manifest.changes.filter(
        (entry) => entry.kind === "provider",
      );
      expect(providerEntries).toHaveLength(46);
      expect(
        providerEntries.every(
          (entry) =>
            entry.relativePath.startsWith(
              ".pumarejo/provider/tauri-plugin-wdio-webdriver/",
            ) &&
            entry.attribution.length === 1 &&
            entry.attribution[0]?.startsWith(
              "provider:tauri-plugin-wdio-webdriver:",
            ),
        ),
      ).toBe(true);

      const stagedRoot = join(
        projectDirectory,
        ".pumarejo",
        "provider",
        "tauri-plugin-wdio-webdriver",
      );
      const route = await readFile(
        join(stagedRoot, "src", "server", "router.rs"),
        "utf8",
      );
      expect(route).toContain("/pumarejo/tauri-dialog");
      const permission = await readFile(
        join(
          stagedRoot,
          "permissions",
          "autogenerated",
          "commands",
          "request_dialog.toml",
        ),
        "utf8",
      );
      expect(permission).toContain('commands.allow = ["request_dialog"]');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
