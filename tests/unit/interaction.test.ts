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
import { TauriAgentError } from "../../src/shared/errors.js";
import { W3C_ELEMENT_KEY } from "../../src/webdriver/protocol.js";

const OWNERSHIP = "root/button:button:Save";

function referenceTable(
  overrides: Partial<RawSnapshot["nodes"][number]["descriptor"]> = {},
): ReferenceTable {
  const table = new ReferenceTable();
  table.replace(
    {
      scriptVersion: 1,
      viewport: { width: 800, height: 600 },
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
            relationships: { labelledBy: [], describedBy: [], owns: [] },
            identity: { name: "Save", ownershipContext: OWNERSHIP },
            ...overrides,
          },
        },
      ],
    },
    ["exact-element-id"],
  );
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
) {
  let tail: Promise<void> = Promise.resolve();
  return {
    references,
    interaction<T>(
      operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      const queued = tail.then(async () => {
        signal?.throwIfAborted();
        return await operation(() => snapshot(signal));
      });
      tail = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
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
  }));
  const engine = new InteractionEngine({
    webdriver: { execute, click, clear, type, pressKey },
    snapshot: snapshotPort(snapshot, references),
    identityScript: async () => "return exactIdentity(arguments[0])",
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
  it("clicks only the exact stored handle and replaces the generation", async () => {
    const test = harness();

    await expect(test.engine.click({ ref: "e1-1" })).resolves.toEqual({
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
    expect(() => test.references.resolve("e1-1")).toThrowError(TauriAgentError);
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
    expect(() => test.references.resolve("e1-1")).toThrowError(TauriAgentError);
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
  });

  it("rejects an exact non-control reference as incompatible", async () => {
    const test = harness(
      currentIdentity({
        kind: "content",
        role: undefined,
        editable: false,
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
      new TauriAgentError("ELEMENT_NOT_INTERACTABLE"),
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
    });

    await expect(
      engine.type({ ref: "e1-1", text: "x", clear: true }),
    ).rejects.toMatchObject({ code: "ELEMENT_NOT_INTERACTABLE" });
    expect(() => table.resolve("e1-1")).toThrowError(TauriAgentError);
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
    test.click.mockRejectedValueOnce(
      new TauriAgentError("WEBDRIVER_NOT_READY"),
    );

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "WEBDRIVER_NOT_READY",
    });
    expect(() => test.references.resolve("e1-1")).toThrowError(TauriAgentError);
    expect(test.snapshot).not.toHaveBeenCalled();
  });

  it("keeps references invalid when post-action snapshot refresh fails", async () => {
    const test = harness();
    test.snapshot.mockRejectedValueOnce(
      new TauriAgentError("WEBDRIVER_NOT_READY"),
    );

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "WEBDRIVER_NOT_READY",
    });
    expect(test.click).toHaveBeenCalledOnce();
    expect(() => test.references.resolve("e1-1")).toThrowError(TauriAgentError);
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
      expect(test.pressKey).toHaveBeenCalledWith(webdriverKey(key), undefined);
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
    expect(() => test.references.resolve("e1-1")).toThrowError(TauriAgentError);
  });

  it("preserves a provider stale-element error from identity capture", async () => {
    const test = harness();
    test.execute.mockRejectedValueOnce(
      new TauriAgentError("STALE_ELEMENT_REF"),
    );

    await expect(test.engine.click({ ref: "e1-1" })).rejects.toMatchObject({
      code: "STALE_ELEMENT_REF",
    });
    expect(test.click).not.toHaveBeenCalled();
    expect(() => test.references.resolve("e1-1")).toThrowError(TauriAgentError);
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
