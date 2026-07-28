import { resolve } from "node:path";

import type { LoadedProjectConfig } from "../../src/config/load.js";
import { MODE_CONFIG_PLACEHOLDER } from "../../src/config/schema.js";
import {
  captureDesktopState,
  startWindowsFocusMonitor,
  validateModeIsolation,
} from "../../src/platform/diagnostics.js";
import { prepareLinuxLaunch } from "../../src/platform/linux/launch.js";
import { createLinuxProcessAdapter } from "../../src/platform/linux/process.js";
import { prepareWindowsLaunch } from "../../src/platform/windows/launch.js";
import { createWindowsProcessAdapter } from "../../src/platform/windows/process.js";
import { SessionManager } from "../../src/session/manager.js";
import type { RuntimeMode } from "../../src/session/state.js";

export interface RuntimeModeEvidence {
  readonly mode: RuntimeMode;
  readonly screenshot: boolean;
  readonly actions: boolean;
  readonly focusUnchanged: boolean;
}

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
          MODE_CONFIG_PLACEHOLDER,
        ],
      },
      window: "main",
      artifactsDirectory: ".pumarejo/artifacts",
      retainArtifacts: false,
    },
  };
}

async function waitForDocument(
  execute: <T>(script: string) => Promise<T>,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await execute<{
      readonly title: string;
      readonly ready: string;
    }>("return { title: document.title, ready: document.readyState }").catch(
      () => undefined,
    );
    if (
      state?.title === "Isolated control fixture" &&
      state.ready === "complete"
    ) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("fixture document did not become ready");
}

export async function runRuntimeMode(
  mode: RuntimeMode,
): Promise<RuntimeModeEvidence> {
  const platform = process.platform === "win32" ? "windows" : "linux";
  const loaded = fixtureConfig();
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CARGO_TARGET_DIR:
      process.env.PUMAREJO_LIVE_TARGET_DIR ??
      resolve(".proof-target", "runtime-modes"),
  };
  const before =
    mode === "background"
      ? await captureDesktopState(platform, environment)
      : undefined;
  const focusMonitor =
    before !== undefined && platform === "windows"
      ? await startWindowsFocusMonitor(before.activeWindow, environment)
      : undefined;
  let focusMonitorStopped = false;
  const stopFocusMonitor = async (): Promise<string | undefined> => {
    if (focusMonitor === undefined || focusMonitorStopped) return undefined;
    focusMonitorStopped = true;
    return await focusMonitor.stop();
  };
  const manager = new SessionManager({
    process:
      platform === "windows"
        ? createWindowsProcessAdapter()
        : createLinuxProcessAdapter(),
    prepareLaunch: async ({ mode: selectedMode }) =>
      platform === "windows"
        ? await prepareWindowsLaunch(loaded, selectedMode, environment)
        : await prepareLinuxLaunch(loaded, selectedMode, environment),
  });

  try {
    const ready = await manager.launch({
      mode,
      platform,
      window: loaded.config.window,
    });
    const webdriver = ready.webdriver;
    await waitForDocument(
      async <T>(script: string) => await webdriver.execute<T>(script),
    );
    const focusProbe = await webdriver.findElement("#focus-probe");
    await webdriver.click(focusProbe);
    const input = await webdriver.findElement("#name");
    await webdriver.clear(input);
    await webdriver.type(input, "runtime-mode");
    const value = await webdriver.execute<string>(
      "return document.querySelector('#name')?.value ?? ''",
    );
    const screenshot = await webdriver.screenshot();

    let focusUnchanged = true;
    if (before !== undefined) {
      const transientFocusChanged = await stopFocusMonitor();
      const after = await captureDesktopState(platform, environment);
      validateModeIsolation({
        mode,
        before,
        after,
        controlledDisplay:
          platform === "linux"
            ? environment.PUMAREJO_BACKGROUND_DISPLAY
            : undefined,
        transientFocusChanged,
      });
      focusUnchanged = before.activeWindow === after.activeWindow;
    }
    return {
      mode,
      screenshot: screenshot.length > 8,
      actions: value === "runtime-mode",
      focusUnchanged,
    };
  } finally {
    await stopFocusMonitor();
    await manager.close();
  }
}
