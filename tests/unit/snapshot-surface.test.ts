import { describe, expect, it, vi } from "vitest";

import { SnapshotEngine } from "../../src/observation/snapshot.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";

function snapshotValue() {
  return {
    scriptVersion: 1,
    viewport: { width: 640, height: 480 },
    handles: [],
    nodes: [],
    truncation: {
      truncated: false,
      reasons: [],
      counts: {
        visited: 0,
        candidates: 0,
        matched: 0,
        returned: 0,
        filtered: 0,
      },
      refineWith: [],
    },
  };
}

describe("surface-bound snapshots", () => {
  it("publishes bounded surface context and invalidates refs on selection", async () => {
    const webdriver = {
      execute: vi.fn(async () => snapshotValue()),
      title: vi.fn(async () => "Fixture"),
      windowRect: vi.fn(async () => ({ x: 0, y: 0, width: 640, height: 480 })),
    };
    const engine = new SnapshotEngine({
      webdriver: webdriver as unknown as WebDriverClient,
      windowLabel: "main",
      script: async () => "fixture",
      surface: {
        surfaceRef: "s1-main",
        identity: "identity-main",
        kind: "window",
      },
    });
    const before = await engine.snapshot();
    const nextGeneration = engine.setSurface({
      surfaceRef: "s2-panel",
      identity: "identity-panel",
      kind: "panel",
    });
    const after = await engine.snapshot();

    expect(before.surface).toEqual({
      surfaceRef: "s1-main",
      identity: "identity-main",
      kind: "window",
    });
    expect(nextGeneration).toBe(before.generation + 1);
    expect(after.generation).toBe(nextGeneration);
    expect(after.surface).toEqual({
      surfaceRef: "s2-panel",
      identity: "identity-panel",
      kind: "panel",
    });
  });
});
