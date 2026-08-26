import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { InteractionEngine } from "../../src/interaction/engine.js";
import { webdriverKey } from "../../src/interaction/keys.js";
import { SUPPORTED_KEYS } from "../../src/mcp/schemas.js";
import { ReferenceTable } from "../../src/observation/refs.js";
import type {
  RawSnapshot,
  SemanticSnapshot,
} from "../../src/observation/schema.js";
import { PumarejoError } from "../../src/shared/errors.js";
import { W3C_ELEMENT_KEY } from "../../src/webdriver/protocol.js";

const OWNERSHIP = "root/button:button:Save";

function referenceTable(
  overrides: Partial<RawSnapshot["nodes"][number]["descriptor"]> = {},
): ReferenceTable {
  const table = new ReferenceTable();
  table.replace({
    scriptVersion: 1,
    viewport: { width: 800, height: 600 },
    handles: [{ [W3C_ELEMENT_KEY]: "exact-element-id" }],
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
          bounds: { x: 1, y: 2, width: 80, height: 30 },
          relationships: {
            labelledBy: [],
            describedBy: [],
            controls: [],
            owns: [],
          },
          identity: { name: "Save", ownershipContext: OWNERSHIP },
          ...overrides,
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
  return table;
}

function currentIdentity(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    attached: true,
    visible: true,
    enabled: true,
    editable: false,
    tag: "button",
    kind: "control",
    role: "button",
    name: "Save",
    ownershipContext: OWNERSHIP,
    ...overrides,
  };
}

function snapshotPort(
  snapshot: (signal?: AbortSignal) => Promise<SemanticSnapshot>,
  references: ReferenceTable,
  initial?: SemanticSnapshot,
  initialComparable = true,
) {
  let tail: Promise<void> = Promise.resolve();
  let currentSnapshot = initial;
  let currentSnapshotComparable = initialComparable;
  return {
    references,
    get currentSnapshot(): SemanticSnapshot | undefined {
      return currentSnapshot;
    },
    get currentSnapshotComparable(): boolean {
      return currentSnapshotComparable;
    },
    interaction<T>(
      operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      const queued = tail.then(async () => {
        signal?.throwIfAborted();
        return await operation(async () => {
          currentSnapshot = await snapshot(signal);
          currentSnapshotComparable = true;
          return currentSnapshot;
        });
      });
      tail = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    publishComparison(
      comparison: SemanticSnapshot,
      reservation: ReturnType<ReferenceTable["reserve"]>,
    ): SemanticSnapshot {
      references.abandon(reservation);
      currentSnapshot = {
        ...comparison,
        generation: reservation.generation,
        ...(comparison.partial === true ? { nodes: [], partial: true } : {}),
      };
      currentSnapshotComparable = comparison.partial !== true;
      return currentSnapshot;
    },
    preserveComparison(comparison: SemanticSnapshot): SemanticSnapshot {
      if (currentSnapshot === undefined) throw new Error("missing snapshot");
      currentSnapshot = {
        ...comparison,
        generation: references.generation,
        nodes: currentSnapshot.nodes,
      };
      currentSnapshotComparable = true;
      return currentSnapshot;
    },
    interactionComparison<T>(
      operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      const queued = tail.then(async () => {
        signal?.throwIfAborted();
        return await operation(async () => await snapshot(signal));
      });
      tail = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
  };
}

function observedSnapshot(options: {
  readonly generation: number;
  readonly focused?: boolean;
  readonly text?: string;
  readonly width?: number;
  readonly partial?: true;
}): SemanticSnapshot {
  const ref = `e${options.generation}-1`;
  return {
    generation: options.generation,
    observedAt: `2026-07-27T12:00:0${options.generation}.000Z`,
    window: {
      label: "main",
      title: "Fixture",
      width: options.width ?? 800,
      height: 600,
    },
    nodes: [
      {
        ref,
        kind: "control",
        tag: "button",
        role: "button",
        name: "Save",
        text: options.text ?? "Save",
        redacted: false,
        enabled: true,
        visible: true,
        focused: options.focused ?? false,
        bounds: { x: 1, y: 2, width: 80, height: 30 },
        relationships: {
          labelledBy: [],
          describedBy: [],
          controls: [],
          owns: [],
        },
      },
    ],
    truncation: {
      truncated: options.partial === true,
      reasons: options.partial === true ? ["semanticExtraction"] : [],
      counts: {
        visited: options.partial === true ? 0 : 1,
        candidates: options.partial === true ? 0 : 1,
        matched: options.partial === true ? 0 : 1,
        returned: options.partial === true ? 0 : 1,
        filtered: 0,
      },
      refineWith: options.partial === true ? ["filters"] : [],
    },
    ...(options.partial === true ? { partial: true } : {}),
  };
}

function harness(identity = currentIdentity()) {
  const references = referenceTable();
  const execute = vi.fn(async () => identity);
  const click = vi.fn(async () => undefined);
  const clear = vi.fn(async () => undefined);
  const type = vi.fn(async () => undefined);
  const pressKey = vi.fn(async () => undefined);
  const snapshot = vi.fn(async () => ({
    generation: 2,
    observedAt: "2026-07-27T12:00:00.000Z",
    window: { label: "main", title: "Fixture", width: 800, height: 600 },
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
  }));
  const engine = new InteractionEngine({
    webdriver: { execute, click, clear, type, pressKey },
    snapshot: snapshotPort(snapshot, references),
    identityScript: async () => "return exactIdentity(arguments[0])",
    settle: async () => undefined,
  });
  return {
    engine,
    references,
    execute,
    click,
    clear,
    type,
    pressKey,
    snapshot,
  };
}

describe("semantic interactions", () => {
  it.each([
    [
      "focus_only",
      observedSnapshot({ generation: 1 }),
      observedSnapshot({ generation: 2, focused: true }),
    ],
    [
      "semantic_change",
      observedSnapshot({ generation: 1 }),
      observedSnapshot({ generation: 2, text: "Saved" }),
    ],
    [
      "window_change",
      observedSnapshot({ generation: 1 }),
      observedSnapshot({ generation: 2, width: 1024 }),
    ],
    [
      "surface_change",
      {
        ...observedSnapshot({ generation: 1 }),
        surface: {
          surfaceRef: "surface-1",
          identity: "surface-a",
          kind: "webview",
        },
      },
      {
        ...observedSnapshot({ generation: 2 }),
        surface: {
          surfaceRef: "surface-2",
          identity: "surface-b",
          kind: "webview",
        },
      },
    ],
    [
      "no_observable_change",
      observedSnapshot({ generation: 1 }),
      observedSnapshot({ generation: 2 }),
    ],
    [
      "unknown",
      observedSnapshot({ generation: 1 }),
      observedSnapshot({ generation: 2, partial: true }),
    ],
  ] as const)(
    "separates WebDriver dispatch from bounded %s evidence",
    async (kind, before, after) => {
      const references = referenceTable();
      const execute = vi.fn(async () => currentIdentity());
      const click = vi.fn(async () => undefined);
      const snapshot = vi.fn(async () => after);
      const engine = new InteractionEngine({
        webdriver: {
          execute,
          click,
          clear: vi.fn(),
          type: vi.fn(),
          pressKey: vi.fn(),
        },
        snapshot: snapshotPort(snapshot, references, before),
        identityScript: async () => "identity",
        settle: async () => undefined,
      });

      await expect(
        engine.click({
          ref: "e1-1",
          snapshotAfter: true,
          settleMs: 0,
        } as never),
      ).resolves.toMatchObject({
        generation: kind === "no_observable_change" ? 1 : 2,
        action: "click",
        target: { ref: "e1-1", generation: 1 },
        dispatch: { method: "webdriver", dispatched: true },
        focus: {
          before: { generation: 1, ref: null, actionable: false },
          after:
            kind === "focus_only"
              ? { generation: 2, ref: "e2-1", actionable: true }
              : {
                  generation: kind === "no_observable_change" ? 1 : 2,
                  ref: null,
                  actionable: false,
                },
        },
        effect: { kind, settleMs: 0 },
        snapshotAfter:
          kind === "no_observable_change"
            ? expect.objectContaining({ generation: 1 })
            : kind === "unknown"
              ? expect.objectContaining({
                  generation: 2,
                  nodes: [],
                  partial: true,
                })
              : after,
      });
    },
  );

  it("captures the post-action observation but omits it when requested", async () => {
    const before = observedSnapshot({ generation: 1 });
    const after = observedSnapshot({ generation: 2 });
    const references = referenceTable();
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(async () => currentIdentity()),
        click: vi.fn(async () => undefined),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
      },
      snapshot: snapshotPort(
        vi.fn(async () => after),
        references,
        before,
      ),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    const result = await engine.click({
      ref: "e1-1",
      snapshotAfter: false,
      settleMs: 0,
    } as never);

    expect(result).not.toHaveProperty("snapshotAfter");
    expect(result).toMatchObject({
      generation: 1,
      effect: { kind: "no_observable_change", settleMs: 0 },
    });
  });

  it("performs one comparison-only final stabilization without advancing on no-change", async () => {
    const before = observedSnapshot({ generation: 1 });
    const comparison = observedSnapshot({ generation: 2 });
    const references = referenceTable();
    const settle = vi.fn(async () => undefined);
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(),
        click: vi.fn(),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
      },
      snapshot: snapshotPort(
        vi.fn(async () => comparison),
        references,
        before,
      ),
      settle,
    });

    await expect(engine.stabilize()).resolves.toMatchObject({
      generation: 1,
      effect: "no_observable_change",
      snapshot: { generation: 1 },
    });
    expect(references.generation).toBe(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(250, undefined);
  });

  it("advances once without publishing a stale snapshot when settle fails", async () => {
    const before = observedSnapshot({ generation: 1 });
    const references = referenceTable();
    const settle = vi.fn(async () => {
      throw new PumarejoError("WEBDRIVER_NOT_READY");
    });
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(),
        click: vi.fn(),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
      },
      snapshot: snapshotPort(
        vi.fn(async () => observedSnapshot({ generation: 2 })),
        references,
        before,
      ),
      settle,
    });

    await expect(engine.stabilize()).resolves.toEqual({
      generation: 2,
      effect: "uncertain",
    });
    await expect(engine.stabilize()).resolves.toEqual({
      generation: 2,
      effect: "uncertain",
    });
    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenNthCalledWith(1, 250, undefined);
    expect(settle).toHaveBeenNthCalledWith(2, 250, undefined);
    expect(references.generation).toBe(2);
    expect(() => references.resolve("e1-1")).toThrowError(PumarejoError);
  });

  it("advances once without publishing a stale snapshot when refresh fails", async () => {
    const before = observedSnapshot({ generation: 1 });
    const references = referenceTable();
    const settle = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => {
      throw new PumarejoError("WEBDRIVER_NOT_READY");
    });
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(),
        click: vi.fn(),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
      },
      snapshot: snapshotPort(refresh, references, before),
      settle,
    });

    await expect(engine.stabilize()).resolves.toEqual({
      generation: 2,
      effect: "uncertain",
    });
    await expect(engine.stabilize()).resolves.toEqual({
      generation: 2,
      effect: "uncertain",
    });
    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenNthCalledWith(1, 250, undefined);
    expect(settle).toHaveBeenNthCalledWith(2, 250, undefined);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(references.generation).toBe(2);
    expect(() => references.resolve("e1-1")).toThrowError(PumarejoError);
  });

  it("publishes a final stabilization change at exactly the reserved next generation", async () => {
    const before = observedSnapshot({ generation: 1 });
    const comparison = observedSnapshot({ generation: 2, width: 900 });
    const references = referenceTable();
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(),
        click: vi.fn(),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
      },
      snapshot: snapshotPort(
        vi.fn(async () => comparison),
        references,
        before,
      ),
    });

    await expect(engine.stabilize()).resolves.toMatchObject({
      generation: 2,
      effect: "state_changed",
      snapshot: { generation: 2 },
    });
    expect(references.generation).toBe(2);
  });

  it("preserves the complete current ref table when a comparable dispatch proves no change", async () => {
    const before = observedSnapshot({ generation: 1 });
    const comparison = observedSnapshot({ generation: 2 });
    const references = referenceTable();
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(async () => currentIdentity()),
        click: vi.fn(async () => undefined),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
      },
      snapshot: snapshotPort(
        vi.fn(async () => comparison),
        references,
        before,
      ),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await expect(
      engine.click({ ref: "e1-1", snapshotAfter: true, settleMs: 0 } as never),
    ).resolves.toMatchObject({
      generation: 1,
      focus: { before: { generation: 1 } },
      effect: { kind: "no_observable_change" },
      snapshotAfter: {
        generation: 1,
        observedAt: "2026-07-27T12:00:02.000Z",
        nodes: [expect.objectContaining({ ref: "e1-1" })],
      },
    });
    expect(references.generation).toBe(1);
    expect(references.resolve("e1-1").elementId).toBe("exact-element-id");
  });

  it("advances exactly once and invalidates refs when provider dispatch is uncertain", async () => {
    const test = harness();
    test.click.mockRejectedValueOnce(new PumarejoError("WEBDRIVER_NOT_READY"));

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "WEBDRIVER_NOT_READY",
    });
    expect(test.references.generation).toBe(2);
    expect(() => test.references.resolve("e1-1")).toThrow();
  });

  it("preserves refs for invalid pre-dispatch settle configuration", async () => {
    const test = harness();

    await expect(
      test.engine.click({ ref: "e1-1", settleMs: 2_001 } as never),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.click).not.toHaveBeenCalled();
    expect(test.references.generation).toBe(1);
    expect(test.references.resolve("e1-1").elementId).toBe("exact-element-id");
  });

  it.each(["filters", "rootRef"] as const)(
    "reports unknown when a %s snapshot is compared with the full post-action snapshot",
    async () => {
      const before = observedSnapshot({ generation: 1 });
      const after = observedSnapshot({ generation: 2 });
      const references = referenceTable();
      const engine = new InteractionEngine({
        webdriver: {
          execute: vi.fn(async () => currentIdentity()),
          click: vi.fn(async () => undefined),
          clear: vi.fn(),
          type: vi.fn(),
          pressKey: vi.fn(),
        },
        snapshot: snapshotPort(
          vi.fn(async () => after),
          references,
          before,
          false,
        ),
        identityScript: async () => "identity",
        settle: async () => undefined,
      });

      await expect(
        engine.click({
          ref: "e1-1",
          snapshotAfter: true,
          settleMs: 0,
        } as never),
      ).resolves.toMatchObject({
        generation: 2,
        effect: { kind: "unknown", settleMs: 0 },
        snapshotAfter: after,
      });
    },
  );

  it("dispatches a canonical modifier chord and reports its bounded effect", async () => {
    const before = observedSnapshot({ generation: 1 });
    const after = observedSnapshot({ generation: 2 });
    const references = referenceTable();
    const pressKey = vi.fn(async () => undefined);
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(async () => currentIdentity()),
        click: vi.fn(),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey,
      },
      snapshot: snapshotPort(
        vi.fn(async () => after),
        references,
        before,
      ),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await expect(
      engine.pressKey({
        key: "D" as never,
        modifiers: ["SHIFT", "CONTROL"],
        settleMs: 0,
      } as never),
    ).resolves.toMatchObject({
      action: "pressKey",
      key: "D",
      modifiers: ["CONTROL", "SHIFT"],
      dispatch: { method: "webdriver", dispatched: true },
    });
    expect(pressKey).toHaveBeenCalledWith("d", ["\uE009", "\uE008"], undefined);
  });

  it.each([
    [
      "pointer",
      { action: "double_click", ref: "e1-1", settleMs: 0 },
      "pointer",
      ["double_click", "exact-element-id", undefined],
    ],
    [
      "scroll",
      { ref: "e1-1", deltaX: 0, deltaY: 480, settleMs: 0 },
      "scroll",
      ["exact-element-id", 0, 480, undefined],
    ],
    [
      "selectOption",
      { ref: "e1-1", settleMs: 0 },
      "selectOption",
      ["exact-element-id", undefined],
    ],
  ] as const)(
    "dispatches the exact-ref %s action through WebDriver",
    async (method, input, webdriverMethod, expected) => {
      const before = observedSnapshot({ generation: 1 });
      const after = observedSnapshot({ generation: 2, text: "Changed" });
      const references = referenceTable(
        method === "selectOption"
          ? {
              tag: "option",
              role: "option",
              identity: {
                name: "Save",
                ownershipContext: OWNERSHIP,
              },
            }
          : {},
      );
      const action = vi.fn(async () => undefined);
      const engine = new InteractionEngine({
        webdriver: {
          execute: vi.fn(async () =>
            currentIdentity(
              method === "selectOption"
                ? { tag: "option", role: "option", visible: false }
                : {},
            ),
          ),
          click: vi.fn(),
          clear: vi.fn(),
          type: vi.fn(),
          pressKey: vi.fn(),
          [webdriverMethod]: action,
        } as never,
        snapshot: snapshotPort(
          vi.fn(async () => after),
          references,
          before,
        ),
        identityScript: async () => "identity",
        settle: async () => undefined,
      });

      await expect(
        (engine[method as keyof InteractionEngine] as CallableFunction)(input),
      ).resolves.toMatchObject({
        generation: 2,
        dispatch: { method: "webdriver", dispatched: true },
        effect: { kind: "semantic_change" },
      });
      expect(action).toHaveBeenCalledWith(...expected);
    },
  );

  it("confirms effective window state after resize", async () => {
    const before = observedSnapshot({ generation: 1 });
    const after = observedSnapshot({ generation: 2, width: 640 });
    const references = referenceTable();
    const windowAction = vi.fn(async () => ({
      state: "restored" as const,
      rect: { x: 0, y: 0, width: 640, height: 480 },
    }));
    const engine = new InteractionEngine({
      webdriver: {
        execute: vi.fn(async () => currentIdentity()),
        click: vi.fn(),
        clear: vi.fn(),
        type: vi.fn(),
        pressKey: vi.fn(),
        windowAction,
      } as never,
      snapshot: snapshotPort(
        vi.fn(async () => after),
        references,
        before,
      ),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await expect(
      (engine as never as { window(input: unknown): Promise<unknown> }).window({
        action: "resize",
        width: 640,
        height: 480,
        settleMs: 0,
      }),
    ).resolves.toMatchObject({
      action: "window",
      window: {
        state: "restored",
        rect: { width: 640, height: 480 },
      },
      effect: { kind: "window_change" },
    });
  });

  it("clicks only the exact stored handle and replaces the generation", async () => {
    const test = harness();

    await expect(test.engine.click({ ref: "e1-1" })).resolves.toMatchObject({
      generation: 2,
      action: "click",
      ref: "e1-1",
    });

    expect(test.execute).toHaveBeenCalledWith(
      "return exactIdentity(arguments[0])",
      [{ [W3C_ELEMENT_KEY]: "exact-element-id" }],
      undefined,
    );
    expect(test.click).toHaveBeenCalledWith("exact-element-id", undefined);
    expect(test.snapshot).toHaveBeenCalledOnce();
    expect(() => test.references.resolve("e1-1")).toThrowError(PumarejoError);
  });

  it.each([
    ["attached", { attached: false }],
    ["kind", { kind: "content" }],
    ["role", { role: "link" }],
    ["name", { name: "Delete" }],
    ["input type", { inputType: "text" }],
    ["ownership", { ownershipContext: "root/dialog/button:button:Save" }],
  ])("rejects a changed %s as stale before mutation", async (_name, change) => {
    const test = harness(currentIdentity(change));

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "STALE_ELEMENT_REF",
    });
    expect(test.click).not.toHaveBeenCalled();
    expect(test.snapshot).not.toHaveBeenCalled();
    expect(test.references.generation).toBe(2);
    expect(() => test.references.resolve("e1-1")).toThrowError(PumarejoError);
  });

  it.each([
    ["hidden", currentIdentity({ visible: false }), "ELEMENT_HIDDEN"],
    ["disabled", currentIdentity({ enabled: false }), "ELEMENT_DISABLED"],
    ["non-control", currentIdentity({ kind: "content" }), "STALE_ELEMENT_REF"],
  ])("returns the stable %s target error", async (_name, identity, code) => {
    const test = harness(identity);

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code,
    });
    expect(test.click).not.toHaveBeenCalled();
  });

  it("clears and types into an exact editable reference", async () => {
    const test = harness(
      currentIdentity({
        role: "textbox",
        name: "Account",
        inputType: "text",
        editable: true,
        tag: "input",
        ownershipContext: "root/input:textbox:Account",
      }),
    );
    test.references.clear();
    const table = referenceTable({
      role: "textbox",
      name: "Account",
      tag: "input",
      identity: {
        name: "Account",
        inputType: "text",
        ownershipContext: "root/input:textbox:Account",
      },
    });
    const engine = new InteractionEngine({
      webdriver: {
        execute: test.execute,
        click: test.click,
        clear: test.clear,
        type: test.type,
        pressKey: test.pressKey,
      },
      snapshot: snapshotPort(test.snapshot, table),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await expect(
      engine.type({ ref: "e1-1", text: "Ada", clear: true }),
    ).resolves.toMatchObject({
      generation: 2,
      action: "type",
      cleared: true,
    });
    expect(test.clear).toHaveBeenCalledWith("exact-element-id", undefined);
    expect(test.type).toHaveBeenCalledWith(
      "exact-element-id",
      "Ada",
      undefined,
    );
    expect(test.clear.mock.invocationCallOrder[0]).toBeLessThan(
      test.type.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects read-only and non-editable controls before typing", async () => {
    const test = harness(currentIdentity({ editable: false }));

    await expect(
      test.engine.type({ ref: "e1-1", text: "x", clear: false }),
    ).rejects.toMatchObject({ code: "ELEMENT_NOT_INTERACTABLE" });
    expect(test.clear).not.toHaveBeenCalled();
    expect(test.type).not.toHaveBeenCalled();
    expect(test.references.generation).toBe(1);
    expect(test.references.resolve("e1-1").elementId).toBe("exact-element-id");
  });

  it("rejects an exact non-control reference as incompatible", async () => {
    const test = harness(
      currentIdentity({
        kind: "content",
        role: undefined,
        editable: false,
        tag: "p",
        ownershipContext: "root/p::Save",
      }),
    );
    const table = referenceTable({
      kind: "content",
      tag: "p",
      role: undefined,
      identity: { name: "Save", ownershipContext: "root/p::Save" },
    });
    const engine = new InteractionEngine({
      webdriver: {
        execute: test.execute,
        click: test.click,
        clear: test.clear,
        type: test.type,
        pressKey: test.pressKey,
      },
      snapshot: snapshotPort(test.snapshot, table),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await expect(engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "ELEMENT_NOT_INTERACTABLE",
    });
    expect(test.click).not.toHaveBeenCalled();
  });

  it("types without clearing when clear is false", async () => {
    const test = harness(
      currentIdentity({
        role: "textbox",
        inputType: "text",
        editable: true,
      }),
    );
    const table = referenceTable({
      role: "textbox",
      identity: {
        name: "Save",
        inputType: "text",
        ownershipContext: OWNERSHIP,
      },
    });
    const engine = new InteractionEngine({
      webdriver: {
        execute: test.execute,
        click: test.click,
        clear: test.clear,
        type: test.type,
        pressKey: test.pressKey,
      },
      snapshot: snapshotPort(test.snapshot, table),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await engine.type({ ref: "e1-1", text: "Ada", clear: false });
    expect(test.clear).not.toHaveBeenCalled();
    expect(test.type).toHaveBeenCalledOnce();
  });

  it("invalidates references after a partial clear/type failure", async () => {
    const test = harness(
      currentIdentity({
        role: "textbox",
        inputType: "text",
        editable: true,
      }),
    );
    test.type.mockRejectedValueOnce(
      new PumarejoError("ELEMENT_NOT_INTERACTABLE"),
    );
    const table = referenceTable({
      role: "textbox",
      identity: {
        name: "Save",
        inputType: "text",
        ownershipContext: OWNERSHIP,
      },
    });
    const engine = new InteractionEngine({
      webdriver: {
        execute: test.execute,
        click: test.click,
        clear: test.clear,
        type: test.type,
        pressKey: test.pressKey,
      },
      snapshot: snapshotPort(test.snapshot, table),
      identityScript: async () => "identity",
      settle: async () => undefined,
    });

    await expect(
      engine.type({ ref: "e1-1", text: "x", clear: true }),
    ).rejects.toMatchObject({ code: "ELEMENT_NOT_INTERACTABLE" });
    expect(() => table.resolve("e1-1")).toThrowError(PumarejoError);
    expect(test.snapshot).not.toHaveBeenCalled();
  });

  it("rejects oversized text before identity capture or mutation", async () => {
    const test = harness();

    await expect(
      test.engine.type({
        ref: "e1-1",
        text: "x".repeat(65_537),
        clear: true,
      }),
    ).rejects.toMatchObject({ code: "ELEMENT_NOT_INTERACTABLE" });
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.clear).not.toHaveBeenCalled();
    expect(test.type).not.toHaveBeenCalled();
  });

  it("invalidates references when the click provider fails", async () => {
    const test = harness();
    test.click.mockRejectedValueOnce(new PumarejoError("WEBDRIVER_NOT_READY"));

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "WEBDRIVER_NOT_READY",
    });
    expect(() => test.references.resolve("e1-1")).toThrowError(PumarejoError);
    expect(test.snapshot).not.toHaveBeenCalled();
  });

  it("keeps references invalid when post-action snapshot refresh fails", async () => {
    const test = harness();
    test.snapshot.mockRejectedValueOnce(
      new PumarejoError("WEBDRIVER_NOT_READY"),
    );

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "WEBDRIVER_NOT_READY",
    });
    expect(test.click).toHaveBeenCalledOnce();
    expect(test.references.generation).toBe(2);
    expect(() => test.references.resolve("e1-1")).toThrowError(PumarejoError);
  });

  it("preserves refs when cancelled before dispatch and advances once after dispatch", async () => {
    const before = harness();
    const beforeController = new AbortController();
    beforeController.abort(new DOMException("cancelled", "AbortError"));

    await expect(
      before.engine.click({ ref: "e1-1" }, beforeController.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(before.references.generation).toBe(1);
    expect(before.references.resolve("e1-1").elementId).toBe(
      "exact-element-id",
    );

    const between = harness();
    const betweenController = new AbortController();
    between.execute.mockImplementationOnce(async () => {
      betweenController.abort(new DOMException("cancelled", "AbortError"));
      return currentIdentity();
    });
    await expect(
      between.engine.click({ ref: "e1-1" }, betweenController.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(between.click).not.toHaveBeenCalled();
    expect(between.references.generation).toBe(1);
    expect(between.references.resolve("e1-1").elementId).toBe(
      "exact-element-id",
    );

    const after = harness();
    const afterController = new AbortController();
    after.click.mockImplementationOnce(async () => {
      afterController.abort(new DOMException("cancelled", "AbortError"));
      afterController.signal.throwIfAborted();
    });

    await expect(
      after.engine.click({ ref: "e1-1" }, afterController.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(after.click).toHaveBeenCalledOnce();
    expect(after.references.generation).toBe(2);
    expect(() => after.references.resolve("e1-1")).toThrow();
  });

  it.each(SUPPORTED_KEYS)(
    "maps and dispatches %s through WebDriver",
    async (key) => {
      const test = harness();

      await expect(test.engine.pressKey({ key })).resolves.toMatchObject({
        generation: 2,
        action: "pressKey",
        key,
      });
      expect(test.pressKey).toHaveBeenCalledWith(
        webdriverKey(key),
        [],
        undefined,
      );
    },
  );

  it("rejects an unsupported runtime key before WebDriver dispatch", async () => {
    const test = harness();

    await expect(
      test.engine.pressKey({
        key: "ALT_F4" as (typeof SUPPORTED_KEYS)[number],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_KEY" });
    expect(test.pressKey).not.toHaveBeenCalled();
  });

  it("serializes concurrent actions so a replaced ref cannot act twice", async () => {
    const test = harness();
    const first = test.engine.click({ ref: "e1-1" });
    const second = test.engine.click({ ref: "e1-1" });

    await expect(first).resolves.toMatchObject({ generation: 2 });
    await expect(second).rejects.toMatchObject({ code: "STALE_ELEMENT_REF" });
    expect(test.click).toHaveBeenCalledOnce();
  });

  it("maps malformed or failed identity capture to stale without mutation", async () => {
    const test = harness({ controlledBy: "application" });

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "STALE_ELEMENT_REF",
    });
    expect(test.click).not.toHaveBeenCalled();
    expect(test.references.generation).toBe(1);
    expect(test.references.resolve("e1-1").elementId).toBe("exact-element-id");
  });

  it("maps a generic identity-query failure to stale while preserving current refs", async () => {
    const test = harness();
    test.execute.mockRejectedValueOnce(new Error("private provider detail"));

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "STALE_ELEMENT_REF",
    });
    expect(test.click).not.toHaveBeenCalled();
    expect(test.references.generation).toBe(1);
    expect(test.references.resolve("e1-1").elementId).toBe("exact-element-id");
  });

  it("preserves a provider stale-element error from identity capture", async () => {
    const test = harness();
    test.execute.mockRejectedValueOnce(new PumarejoError("STALE_ELEMENT_REF"));

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "STALE_ELEMENT_REF",
    });
    expect(test.click).not.toHaveBeenCalled();
    expect(() => test.references.resolve("e1-1")).toThrowError(PumarejoError);
  });

  it("does not invoke WebDriver when already aborted", async () => {
    const test = harness();
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));

    await expect(
      test.engine.click({ ref: "e1-1" }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.click).not.toHaveBeenCalled();
  });

  it("contains no OS-input or heuristic target fallback", async () => {
    const sources = await Promise.all(
      ["engine.ts", "index.ts", "keys.ts", "schema.ts"].map((file) =>
        readFile(resolve("src/interaction", file), "utf8"),
      ),
    );
    const combined = sources.join("\n");

    expect(combined).not.toMatch(
      /child_process|robotjs|nut-js|xdotool|SendInput|user32|ffi-napi/i,
    );
    expect(combined).not.toMatch(
      /querySelector|getElementById|elementFromPoint|findElement/i,
    );
  });
});
