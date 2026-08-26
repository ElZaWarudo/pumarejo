import { describe, expect, it, vi } from "vitest";

import { diagnoseCoverage } from "../../src/observation/screenshot.js";
import { SurfaceGraphManager } from "../../src/observation/surfaces.js";
import type { SurfaceManagerOptions } from "../../src/observation/surfaces.js";
import { PumarejoError } from "../../src/shared/errors.js";

const SESSION_ID = "0123456789abcdef0123456789abcdef";

function webdriver(): SurfaceManagerOptions["webdriver"] {
  return {
    windowHandles: vi.fn(async () => ["main", "secondary"]),
    selectWindow: vi.fn(async () => undefined),
    title: vi.fn(async () => "Fixture title"),
    windowRect: vi.fn(async () => ({ x: 0, y: 0, width: 800, height: 600 })),
    execute: vi.fn(async () => [
      {
        key: "panel-0",
        kind: "panel",
        label: "Composer",
        reachable: true,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      },
      {
        key: "iframe-1",
        kind: "iframe",
        reachable: false,
        reason: "cross_origin",
        bounds: { x: 20, y: 20, width: 200, height: 100 },
      },
    ]) as unknown as SurfaceManagerOptions["webdriver"]["execute"],
  };
}

describe("surface graph", () => {
  it("enumerates bounded windows and provider contexts without exposing provider handles", async () => {
    const provider = webdriver();
    const manager = new SurfaceGraphManager({
      webdriver: provider,
      sessionId: SESSION_ID,
      configuredWindow: "main",
      platform: "linux",
    });

    const graph = await manager.discover();
    expect(graph.generation).toBe(1);
    expect(
      graph.surfaces.find((surface) => surface.kind === "window"),
    ).toMatchObject({
      label: "main",
      active: true,
      capabilities: { selection: { state: "supported" } },
    });
    expect(
      graph.surfaces.find((surface) => surface.kind === "iframe"),
    ).toMatchObject({
      lifecycle: "unsupported",
      capabilities: {
        selection: { state: "unsupported", code: "nested_cross_origin" },
      },
    });
    expect(JSON.stringify(graph)).not.toContain("secondary");
    expect(JSON.stringify(graph)).not.toContain("TAURI_WEBDRIVER");
  });

  it("requires the current graph generation and fails closed for unsupported contexts", async () => {
    const provider = webdriver();
    const manager = new SurfaceGraphManager({
      webdriver: provider,
      sessionId: SESSION_ID,
      configuredWindow: "main",
    });
    const graph = await manager.discover();
    const unsupported = graph.surfaces.find(
      (surface) => surface.kind === "iframe",
    )!;

    await expect(
      manager.select(unsupported.surfaceRef, graph.generation),
    ).rejects.toMatchObject({ code: "SURFACE_UNSUPPORTED" });
    await expect(
      manager.select(graph.activeSurfaceRef, graph.generation - 1),
    ).rejects.toMatchObject({ code: "STALE_SURFACE_REF" });
    await manager.select(graph.activeSurfaceRef, graph.generation);
    expect(provider.selectWindow).toHaveBeenCalledWith("main", undefined);
  });

  it("returns conservative non-actionable coverage evidence", () => {
    expect(
      diagnoseCoverage({
        screenshot: { width: 800, height: 600 },
        regions: [
          {
            surfaceRef: "s1",
            bounds: { x: 20, y: 20, width: 100, height: 80 },
            supported: false,
            code: "closed_root",
          },
        ],
      }),
    ).toEqual({
      status: "gap",
      screenshot: { width: 800, height: 600 },
      gaps: [
        {
          surfaceRef: "s1",
          bounds: { x: 20, y: 20, width: 100, height: 80 },
          code: "closed_root",
          actionable: false,
        },
      ],
    });
    expect(
      diagnoseCoverage({
        screenshot: { width: 800, height: 600 },
        regions: [
          {
            surfaceRef: "s1",
            bounds: { x: -1, y: 20, width: 100, height: 80 },
            supported: false,
            code: "provider_gap",
          },
        ],
      }).status,
    ).toBe("coverage_unknown");
    expect(
      diagnoseCoverage({
        screenshot: { width: 800, height: 600 },
        regions: [],
      }).status,
    ).toBe("coverage_unknown");
  });

  it("rejects malformed session ownership before provider access", () => {
    expect(
      () =>
        new SurfaceGraphManager({
          webdriver: webdriver(),
          sessionId: "not-a-session",
          configuredWindow: "main",
        }),
    ).toThrowError(new PumarejoError("CONFIG_INVALID"));
  });
});
