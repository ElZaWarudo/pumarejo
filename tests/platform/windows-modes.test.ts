import { describe, expect, it } from "vitest";

const enabled =
  process.platform === "win32" &&
  process.env.TAURI_AGENT_RUN_RUNTIME_MODES === "1";

describe("Windows runtime modes", () => {
  it.runIf(enabled)(
    "keeps visible and hidden creation controllable through the reusable adapters",
    async () => {
      const { runRuntimeMode } = await import("./runtime-mode-sequence.js");
      // Prove background isolation before any visible fixture window can alter
      // or asynchronously restore the developer's foreground window.
      const background = await runRuntimeMode("background");
      expect(background).toEqual({
        mode: "background",
        screenshot: true,
        actions: true,
        focusUnchanged: true,
      });
      const visible = await runRuntimeMode("visible");
      expect(visible).toMatchObject({
        mode: "visible",
        screenshot: true,
        actions: true,
      });
    },
    720_000,
  );
});
