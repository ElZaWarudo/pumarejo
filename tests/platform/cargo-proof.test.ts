import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = resolve("tests/fixtures/tauri-app/src-tauri/Cargo.toml");
const cargo = readFileSync(manifest, "utf8");
const runCargo = process.env.PUMAREJO_RUN_CARGO === "1";

function runCargoCommand(args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("cargo", args, { stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `cargo ${args.join(" ")} failed (${signal ?? String(code)})`,
          ),
        );
    });
  });
}

describe("Cargo provider feature proof", () => {
  it("parses the fixture manifest and exposes the optional feature", () => {
    const metadata = execFileSync(
      "cargo",
      [
        "metadata",
        "--manifest-path",
        manifest,
        "--no-deps",
        "--format-version",
        "1",
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(metadata).packages).toHaveLength(1);
    expect(cargo).toMatch(
      /(?:# <pumarejo:cargo-dependency-path>\r?\n)?tauri-plugin-wdio-webdriver = \{ path = "\.\.\/\.pumarejo\/provider\/tauri-plugin-wdio-webdriver", version = "1", optional = true \}/u,
    );
    expect(cargo).toContain('pumarejo = ["dep:tauri-plugin-wdio-webdriver"]');
    expect(cargo).toContain(
      'path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver"',
    );
    expect(cargo).not.toMatch(/(?:[A-Za-z]:[\\/]|\/home\/|\/Users\/)/u);
  });

  it.runIf(runCargo)(
    "builds feature-enabled debug, featureless debug, and release",
    async () => {
      await runCargoCommand([
        "check",
        "--manifest-path",
        manifest,
        "--features",
        "pumarejo",
      ]);
      await runCargoCommand([
        "check",
        "--manifest-path",
        manifest,
        "--no-default-features",
      ]);
      await runCargoCommand([
        "check",
        "--manifest-path",
        manifest,
        "--release",
        "--no-default-features",
      ]);
    },
    600_000,
  );
});
