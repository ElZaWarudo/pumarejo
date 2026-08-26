import { describe, expect, it, vi } from "vitest";

import { SurfaceGraphManager } from "../../src/observation/surfaces.js";
import type { SurfaceManagerOptions } from "../../src/observation/surfaces.js";

describe("surface graph provider integration", () => {
  it("refreshes dynamic provider windows and selects an exact frame context", async () => {
    let handles = ["main"];
    const selectWindow = vi.fn(async () => undefined);
    const switchToFrame = vi.fn(async () => undefined);
    const switchToParentFrame = vi.fn(async () => undefined);
    const provider = {
      windowHandles: vi.fn(async () => handles),
      selectWindow,
      title: vi.fn(async () => "Integration fixture"),
      windowRect: vi.fn(async () => ({ x: 0, y: 0, width: 640, height: 480 })),
      execute: vi.fn(async () => [
        {
          key: "iframe-0",
          kind: "iframe",
          frameIndex: 0,
          reachable: true,
          bounds: { x: 0, y: 0, width: 640, height: 480 },
        },
      ]),
      findElements: vi.fn(async () => ["private-frame-handle"]),
      switchToFrame,
      switchToParentFrame,
    };
    const manager = new SurfaceGraphManager({
      webdriver: provider as unknown as SurfaceManagerOptions["webdriver"],
      sessionId: "0123456789abcdef0123456789abcdef",
      configuredWindow: "main",
      platform: "linux",
    });

    const first = await manager.discover();
    handles = ["main", "child"];
    const second = await manager.discover();
    expect(second.generation).toBe(first.generation + 1);
    expect(
      second.surfaces.some((surface) => surface.label === "window-2"),
    ).toBe(true);
    const frame = second.surfaces.find((surface) => surface.kind === "iframe");
    expect(frame?.capabilities.selection.state).toBe("supported");

    await manager.select(frame!.surfaceRef, second.generation);
    expect(selectWindow).toHaveBeenCalledWith("main", undefined);
    expect(switchToFrame).toHaveBeenCalledWith(
      "private-frame-handle",
      undefined,
    );
    await manager.discover();
    expect(switchToParentFrame).toHaveBeenCalledWith(undefined);
  });
});
