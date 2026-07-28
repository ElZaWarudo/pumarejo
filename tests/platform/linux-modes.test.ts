import { describe, expect, it } from "vitest";

const enabled =
  process.platform === "linux" &&
  process.env.PUMAREJO_RUN_RUNTIME_MODES === "1";

describe("Linux runtime modes", () => {
  it.runIf(enabled)(
    "keeps visible and isolated-X11 creation controllable through the reusable adapters",
    async () => {
      const { runRuntimeMode } = await import("./runtime-mode-sequence.js");
      const visible = await runRuntimeMode("visible");
      expect(visible).toMatchObject({
        mode: "visible",
        screenshot: true,
        actions: true,
      });
      const background = await runRuntimeMode("background");
      expect(background).toEqual({
        mode: "background",
        screenshot: true,
        actions: true,
        focusUnchanged: true,
      });
    },
    720_000,
  );
});
