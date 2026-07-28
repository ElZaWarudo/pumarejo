import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const releaseSurfaces = [
  "package.json",
  "README.md",
  "docs/security.md",
  "docs/compatibility.md",
  "docs/evidence/release/README.md",
  "tests/agent/certification-report.json",
] as const;

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(resolve(directory), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

describe("release safety", () => {
  it("keeps the WebDriver provider optional and debug-only", async () => {
    const cargo = await readFile(
      resolve("tests/fixtures/tauri-app/src-tauri/Cargo.toml"),
      "utf8",
    );
    const rust = await readFile(
      resolve("tests/fixtures/tauri-app/src-tauri/src/lib.rs"),
      "utf8",
    );

    expect(cargo).toMatch(
      /pumarejo\s*=\s*\["dep:tauri-plugin-wdio-webdriver"\]/,
    );
    expect(cargo).toMatch(
      /tauri-plugin-wdio-webdriver\s*=\s*\{[^}]*optional\s*=\s*true[^}]*\}/,
    );
    expect(rust).toContain(
      '#[cfg(all(debug_assertions, feature = "pumarejo"))]',
    );
    expect(rust).toContain(
      '#[cfg(not(all(debug_assertions, feature = "pumarejo")))]',
    );
    expect(rust.match(/tauri_plugin_wdio_webdriver::init\(\)/g)).toHaveLength(
      1,
    );
  });

  it("does not ship a JavaScript provider dependency", async () => {
    const packageText = await readFile(resolve("package.json"), "utf8");
    const packageJson = JSON.parse(packageText) as {
      readonly private?: boolean;
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly optionalDependencies?: Readonly<Record<string, string>>;
      readonly files?: readonly string[];
    };
    const runtimeDependencies = {
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
    };

    expect(Object.keys(runtimeDependencies)).not.toContain(
      "tauri-plugin-wdio-webdriver",
    );
    expect(Object.keys(runtimeDependencies)).not.toContain("@tauri-apps/api");
    expect(packageJson.private).toBe(true);
    expect(packageJson.files).toEqual(["dist"]);
  });

  it("keeps published docs and evidence free of secrets and user paths", async () => {
    const builtRuntime = await listFiles("dist");
    expect(builtRuntime).toContain("dist/index.js");

    for (const path of [...releaseSurfaces, ...builtRuntime]) {
      const content = await readFile(resolve(path), "utf8");
      expect(content, path).not.toContain("fixture-sensitive-token");
      expect(content, path).not.toContain("shadow-sensitive-value");
      expect(content, path).not.toMatch(/[A-Za-z]:\\Users\\[^\\\s"']+/i);
      expect(content, path).not.toMatch(/\/(?:home|Users)\/[^/\s"'`]+/);
      expect(content, path).not.toMatch(
        /(?:password|token|secret)\s*[:=]\s*["'][^"'[\]\s][^"']*["']/i,
      );
    }
  });
});
