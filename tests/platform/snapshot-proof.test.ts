import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { LoadedProjectConfig } from "../../src/config/load.js";
import { SnapshotEngine } from "../../src/observation/snapshot.js";
import { prepareWindowsLaunch } from "../../src/platform/windows/launch.js";
import { createWindowsProcessAdapter } from "../../src/platform/windows/process.js";
import { SessionManager } from "../../src/session/manager.js";
import { providerRunEnabled } from "./host.js";

function fixtureConfig(): LoadedProjectConfig {
  const projectRoot = resolve("tests/fixtures/tauri-app");
  return {
    projectRoot,
    configPath: resolve(projectRoot, ".pumarejo.json"),
    artifactsPath: resolve(projectRoot, ".pumarejo/artifacts"),
    config: {
      version: 1,
      launch: {
        command: "pnpm",
        args: [
          "tauri",
          "dev",
          "--features",
          "pumarejo",
          "--config",
          "{tauriConfig}",
        ],
      },
      window: "main",
      artifactsDirectory: ".pumarejo/artifacts",
      retainArtifacts: false,
    },
  };
}

describe("live semantic extractor proof", () => {
  it.runIf(providerRunEnabled() && process.platform === "win32")(
    "returns a bounded raw snapshot from the real WebView",
    async () => {
      const loaded = fixtureConfig();
      const manager = new SessionManager({
        process: createWindowsProcessAdapter(),
        prepareLaunch: async ({ mode }) =>
          await prepareWindowsLaunch(loaded, mode, process.env),
      });
      try {
        const ready = await manager.launch({
          mode: "visible",
          platform: "windows",
          window: "main",
        });
        const snapshot = await new SnapshotEngine({
          webdriver: ready.webdriver,
          windowLabel: "main",
        }).snapshot({
          maxNodes: 500,
          maxDepth: 32,
          maxTextLength: 256,
          visibleOnly: true,
          includeNames: true,
          includeText: true,
          includeValues: true,
        });
        expect(snapshot).toMatchObject({
          generation: 1,
          nodes: expect.any(Array),
          truncation: {
            truncated: true,
            reasons: expect.arrayContaining(["maxTextLength"]),
          },
        });
        expect(snapshot.nodes.length).toBeGreaterThan(0);
        const tauriApi = await ready.webdriver.execute<{
          readonly root: readonly string[];
          readonly window: readonly string[];
          readonly dpi: readonly string[];
        }>(
          "return {root:Object.keys(globalThis.__TAURI__??{}),window:Object.keys(globalThis.__TAURI__?.window??{}),dpi:Object.keys(globalThis.__TAURI__?.dpi??{})}",
        );
        expect(tauriApi.window, JSON.stringify(tauriApi)).toContain(
          "getCurrentWindow",
        );
        expect(tauriApi.dpi).toContain("LogicalSize");
        const resized = await ready.webdriver.windowAction({
          action: "resize",
          width: 640,
          height: 480,
        });
        expect(resized.rect, JSON.stringify(resized)).toMatchObject({
          width: 640,
          height: 480,
        });
      } finally {
        await manager.close();
      }
    },
    720_000,
  );
});
