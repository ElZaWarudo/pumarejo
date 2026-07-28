import { build } from "esbuild";

await build({
  entryPoints: ["src/observation/browser-entry.ts"],
  outfile: "dist/observation/snapshot-browser.js",
  bundle: true,
  format: "iife",
  globalName: "TauriAgentSnapshot",
  platform: "browser",
  target: ["es2022"],
  legalComments: "none",
  minify: true,
});
