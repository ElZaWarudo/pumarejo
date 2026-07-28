import { describe, expect, it, vi } from "vitest";

import {
  captureDesktopState,
  validatedFocusMonitorResult,
  validateModeIsolation,
} from "../../src/platform/diagnostics.js";

describe("platform diagnostics", () => {
  it("fails closed when the continuous foreground monitor exits", () => {
    expect(() => validatedFocusMonitorResult(undefined, true)).toThrowError(
      expect.objectContaining({ code: "BACKGROUND_UNAVAILABLE" }),
    );
    expect(validatedFocusMonitorResult("42:1002", true)).toBe("42:1002");
  });

  it("captures Windows focus without sending input", async () => {
    const execute = vi.fn(async () => "42:1001\n");
    await expect(
      captureDesktopState(
        "windows",
        {
          Path: "C:\\tools",
          SystemRoot: "C:\\Windows",
          OPENAI_API_KEY: "must-not-leak",
        },
        execute,
      ),
    ).resolves.toEqual({
      platform: "windows",
      activeWindow: "42:1001",
      display: "interactive-desktop",
    });
    expect(execute).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      expect.arrayContaining(["-NonInteractive", "-Command"]),
      { Path: "C:\\tools", SystemRoot: "C:\\Windows" },
    );
  });

  it("captures Linux active-window state on the explicit display", async () => {
    const execute = vi.fn(async () => "_NET_ACTIVE_WINDOW:  window id # 0x2a");
    await expect(
      captureDesktopState("linux", { DISPLAY: ":0" }, execute),
    ).resolves.toEqual({
      platform: "linux",
      activeWindow: "0x2a",
      display: ":0",
    });
    expect(execute).toHaveBeenCalledWith(
      "/usr/bin/xprop",
      ["-display", ":0", "-root", "_NET_ACTIVE_WINDOW"],
      { DISPLAY: ":0" },
    );
  });

  it("keeps Linux display-isolation diagnostics usable when xprop is absent", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    await expect(
      captureDesktopState("linux", { DISPLAY: ":0" }, async () => {
        throw missing;
      }),
    ).resolves.toEqual({
      platform: "linux",
      activeWindow: "not-observed",
      display: ":0",
    });
  });

  it("fails background isolation on focus change or a reused Linux display", () => {
    const before = {
      platform: "linux" as const,
      activeWindow: "0x1",
      display: ":0",
    };
    expect(() =>
      validateModeIsolation({
        mode: "background",
        before,
        after: { ...before, activeWindow: "0x2" },
        controlledDisplay: ":99",
      }),
    ).toThrowError(expect.objectContaining({ code: "BACKGROUND_UNAVAILABLE" }));
    expect(() =>
      validateModeIsolation({
        mode: "background",
        before,
        after: before,
        controlledDisplay: ":0",
      }),
    ).toThrowError(expect.objectContaining({ code: "BACKGROUND_UNAVAILABLE" }));
    expect(() =>
      validateModeIsolation({
        mode: "background",
        before,
        after: before,
        controlledDisplay: ":99",
        transientFocusChanged: "0x3",
      }),
    ).toThrowError(expect.objectContaining({ code: "BACKGROUND_UNAVAILABLE" }));
    expect(() =>
      validateModeIsolation({
        mode: "background",
        before,
        after: before,
        controlledDisplay: ":99",
      }),
    ).not.toThrow();
  });
});
