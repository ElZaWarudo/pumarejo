import { describe, expect, it } from "vitest";

import { reduceGeneration } from "../../src/interaction/generation.js";
import { ReferenceTable } from "../../src/observation/refs.js";
import { rawSnapshotSchema } from "../../src/observation/schema.js";
import { W3C_ELEMENT_KEY } from "../../src/webdriver/protocol.js";

const raw = rawSnapshotSchema.parse({
  scriptVersion: 1,
  viewport: { width: 800, height: 600 },
  handles: [{ [W3C_ELEMENT_KEY]: "opaque" }],
  nodes: [
    {
      handleIndex: 0,
      descriptor: {
        parentIndex: null,
        kind: "control",
        tag: "button",
        role: "button",
        name: "Save",
        text: "Save",
        redacted: false,
        enabled: true,
        visible: true,
        focused: false,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        relationships: {
          labelledBy: [],
          describedBy: [],
          controls: [],
          owns: [],
        },
        identity: { name: "Save", ownershipContext: "root/button" },
      },
    },
  ],
  truncation: {
    truncated: false,
    reasons: [],
    counts: {
      visited: 1,
      candidates: 1,
      matched: 1,
      returned: 1,
      filtered: 0,
    },
    refineWith: [],
  },
});

describe("deterministic interaction generation", () => {
  it.each([
    ["proven_no_change", 7, true, false],
    ["proven_state_change", 8, false, true],
    ["uncertain", 8, false, true],
  ] as const)(
    "reduces %s through the sole bounded generation authority",
    (effect, generation, preservesReferences, requiresPublication) => {
      expect(
        reduceGeneration(7, {
          effect,
          reason:
            effect === "proven_no_change"
              ? "no_observable_change"
              : effect === "proven_state_change"
                ? "semantic_changed"
                : "uncertain_effect",
        }),
      ).toEqual({
        effect,
        reason: expect.any(String),
        generation,
        preservesReferences,
        requiresPublication,
      });
    },
  );

  it("reserves once, invalidates old refs, and publishes at the reservation without g+2", () => {
    const table = new ReferenceTable();
    table.replace(raw);
    const oldRef = table.resolve("e1-1");

    const reservation = table.reserve();
    expect(reservation.generation).toBe(2);
    expect(() => table.resolve(oldRef.ref)).toThrow();

    const nodes = table.publish(raw, reservation);
    expect(table.generation).toBe(2);
    expect(nodes[0]?.ref).toBe("e2-1");
    expect(table.resolve("e2-1").elementId).toBe("opaque");
    expect(() => table.publish(raw, reservation)).toThrow();
  });

  it("reuses one pending reservation across reserve and advance until publication", () => {
    const table = new ReferenceTable();
    table.replace(raw);

    const first = table.reserve();
    const second = table.reserve();
    const advanced = table.advance();

    expect(second).toBe(first);
    expect(advanced).toBe(first.generation);
    expect(table.generation).toBe(2);
    expect(() => table.resolve("e1-1")).toThrow();
    table.clear();
    expect(table.publish(raw, first)[0]?.ref).toBe("e2-1");
    expect(table.resolve("e2-1").elementId).toBe("opaque");
  });

  it("closes an abandoned reservation before allocating a later generation", () => {
    const table = new ReferenceTable();
    table.replace(raw);

    const abandoned = table.reserve();
    table.abandon(abandoned);
    const next = table.reserve();

    expect(abandoned.generation).toBe(2);
    expect(next.generation).toBe(3);
    expect(next).not.toBe(abandoned);
  });
});
