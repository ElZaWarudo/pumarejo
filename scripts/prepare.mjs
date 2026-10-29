import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// npm runs prepare when it installs pumarejo as a git dependency, where dist/
// is never present. Package managers also run it on install and pack, so leave
// an existing build alone: rebuilding there would replace dist/ under anything
// reading it. `pnpm build` is the way to rebuild on purpose.
const workspaceRoot = resolve(import.meta.dirname, "..");
const builtOutputs = [
  "dist/cli/index.js",
  "dist/observation/snapshot-browser.js",
  "dist/provider/tauri-plugin-wdio-webdriver/Cargo.toml",
];

if (builtOutputs.every((path) => existsSync(resolve(workspaceRoot, path)))) {
  process.exit(0);
}

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const steps = [
  ["scripts/clean.mjs"],
  [tsc, "-p", "tsconfig.build.json"],
  ["scripts/build-browser-bundle.mjs"],
  ["scripts/build-provider-bundle.mjs"],
];

for (const args of steps) {
  execFileSync(process.execPath, args, { cwd: workspaceRoot, stdio: "inherit" });
}
