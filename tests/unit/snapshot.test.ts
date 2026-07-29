import { describe, expect, it, vi } from "vitest";

import { ReferenceTable } from "../../src/observation/refs.js";
import { rawSnapshotSchema } from "../../src/observation/schema.js";
import { SnapshotEngine } from "../../src/observation/snapshot.js";
import { PumarejoError } from "../../src/shared/errors.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";
import { W3C_ELEMENT_KEY } from "../../src/webdriver/protocol.js";

function rawNode(
  handleIndex: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    handleIndex,
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
      bounds: { x: 10, y: 20, width: 80, height: 30 },
      relationships: {
        labelledBy: [],
        describedBy: [],
        controls: [],
        owns: [],
      },
      identity: { ownershipContext: "root/button:button:Save" },
      ...overrides,
    },
  };
}

function rawSnapshot(
  nodes: readonly unknown[],
  elementIds: readonly string[] = ["element-0"],
): Record<string, unknown> {
  return {
    scriptVersion: 1,
    viewport: { width: 800, height: 600 },
    handles: elementIds.map((elementId) => ({
      [W3C_ELEMENT_KEY]: elementId,
    })),
    nodes,
    truncation: {
      truncated: false,
      reasons: [],
      counts: {
        visited: nodes.length,
        candidates: nodes.length,
        matched: nodes.length,
        returned: nodes.length,
        filtered: 0,
      },
      refineWith: [],
    },
  };
}

function webdriver(values: readonly unknown[]) {
  let index = 0;
  const execute = vi.fn(
    async (_script: string, _args?: readonly unknown[]) => values[index++],
  );
  const title = vi.fn(async () => "Fixture");
  const windowRect = vi.fn(async () => ({
    x: 0,
    y: 0,
    width: 1024,
    height: 768,
  }));
  const snapshotElementHandles = vi.fn(async () => ["recovered-element"]);
  return {
    client: {
      execute,
      title,
      windowRect,
      snapshotElementHandles,
    } as unknown as WebDriverClient,
    execute,
  };
}

describe("semantic snapshots", () => {
  it("recovers provider-null nested handles from the exact browser capture cache", async () => {
    const raw = rawSnapshot([rawNode(0)]);
    raw.handles = [null];
    (raw.nodes as Array<Record<string, unknown>>)[0]!.providerHandleIndex = 0;
    const fake = webdriver([raw]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });

    await expect(engine.snapshot()).resolves.toMatchObject({
      nodes: [{ ref: "e1-1" }],
    });
    expect(engine.references.resolve("e1-1").elementId).toBe(
      "recovered-element",
    );
  });

  it.each([
    ["malformed", "not-an-index"],
    ["out-of-range", 4],
  ])(
    "fails closed for a %s recovered provider handle index",
    async (_, providerIndex) => {
      const raw = rawSnapshot([rawNode(0)]);
      raw.handles = [null];
      (raw.nodes as Array<Record<string, unknown>>)[0]!.providerHandleIndex =
        providerIndex;
      const fake = webdriver([raw]);
      const engine = new SnapshotEngine({
        webdriver: fake.client,
        windowLabel: "main",
        script: async () => "return fixtureSnapshot()",
      });

      await expect(engine.snapshot()).resolves.toMatchObject({
        partial: true,
        nodes: [],
        issues: [
          expect.objectContaining({
            code: "SEMANTIC_EXTRACTION_FAILED",
            phase: "observation",
          }),
        ],
      });
    },
  );

  it("validates, assigns deterministic preorder refs and replaces generations atomically", async () => {
    const first = rawSnapshot(
      [
        rawNode(0, {
          kind: "dialog",
          tag: "dialog",
          role: "dialog",
          name: "Settings",
        }),
        rawNode(1, {
          parentIndex: 0,
          relationships: {
            labelledBy: [0],
            describedBy: [],
            controls: [],
            owns: [],
          },
        }),
      ],
      ["root", "save"],
    );
    const second = rawSnapshot([
      rawNode(0, { name: "Replacement", text: "Replacement" }),
    ]);
    const fake = webdriver([first, second]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
      now: () => new Date("2026-07-27T12:00:00.000Z"),
    });

    const snapshot1 = await engine.snapshot();
    expect(snapshot1).toMatchObject({
      generation: 1,
      observedAt: "2026-07-27T12:00:00.000Z",
      window: {
        label: "main",
        title: "Fixture",
        width: 800,
        height: 600,
      },
    });
    expect(snapshot1.nodes.map((node) => node.ref)).toEqual(["e1-1", "e1-2"]);
    expect(snapshot1.nodes[1]).toMatchObject({
      parentRef: "e1-1",
      relationships: { labelledBy: ["e1-1"] },
    });
    expect(engine.references.resolve("e1-2")).toMatchObject({
      elementId: "save",
      generation: 1,
    });

    const snapshot2 = await engine.snapshot();
    expect(snapshot2.generation).toBe(2);
    expect(snapshot2.nodes[0]?.ref).toBe("e2-1");
    expect(() => engine.references.resolve("e1-2")).toThrowError(
      expect.objectContaining({ code: "STALE_ELEMENT_REF" }),
    );
  });

  it("consumes a current rootRef into a fresh generation with only fresh actionable refs", async () => {
    const fake = webdriver([
      rawSnapshot(
        [
          rawNode(0, { name: "Root", text: "Root" }),
          rawNode(1, { parentIndex: 0, name: "Child", text: "Child" }),
        ],
        ["root-handle", "child-handle"],
      ),
      rawSnapshot(
        [rawNode(0, { name: "Child", text: "Child" })],
        ["child-handle"],
      ),
    ]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });
    const request = {
      maxNodes: 500,
      maxDepth: 32,
      maxTextLength: 4096,
      visibleOnly: true,
    };

    const first = await engine.snapshot(request);
    expect(engine.currentSnapshotComparable).toBe(true);
    const second = await engine.snapshot({
      ...request,
      rootRef: first.nodes[1]!.ref,
    });

    expect(engine.currentSnapshotComparable).toBe(false);
    expect(second.generation).toBe(2);
    expect(second.nodes.map((node) => node.ref)).toEqual(["e2-1"]);
    expect(engine.references.resolve("e2-1").elementId).toBe("child-handle");
    expect(() => engine.references.resolve(first.nodes[1]!.ref)).toThrowError(
      expect.objectContaining({ code: "STALE_ELEMENT_REF" }),
    );
    expect(fake.execute.mock.calls[1]?.[1]).toEqual([
      {
        ...request,
        includeNames: true,
        includeText: true,
        includeValues: true,
      },
      { [W3C_ELEMENT_KEY]: "child-handle" },
    ]);
  });

  it("tracks filtered snapshots as non-comparable with the default full scope", async () => {
    const fake = webdriver([
      rawSnapshot([rawNode(0)]),
      rawSnapshot([rawNode(0)]),
    ]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });

    await engine.snapshot({
      maxNodes: 500,
      maxDepth: 32,
      maxTextLength: 4096,
      visibleOnly: true,
      roles: ["button"],
    });
    expect(engine.currentSnapshotComparable).toBe(false);

    await engine.snapshot();
    expect(engine.currentSnapshotComparable).toBe(true);
  });

  it("bounds oversized window titles inside successful snapshots", async () => {
    const fake = webdriver([rawSnapshot([rawNode(0)])]);
    fake.client.title = vi.fn(async () => "😀".repeat(4_096));
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });

    const snapshot = await engine.snapshot();

    expect(snapshot.window.title.length).toBe(4_096);
    expect(snapshot.truncation).toMatchObject({
      truncated: true,
      reasons: expect.arrayContaining(["fieldBudget"]),
    });
  });

  it("serializes concurrent observations into distinct generations", async () => {
    const fake = webdriver([
      rawSnapshot([rawNode(0)]),
      rawSnapshot([rawNode(0)]),
    ]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });
    const [first, second] = await Promise.all([
      engine.snapshot(),
      engine.snapshot(),
    ]);
    expect(first.generation).toBe(1);
    expect(second.generation).toBe(2);
    expect(fake.execute).toHaveBeenCalledTimes(2);
  });

  it("serializes observations behind an interaction and its refresh", async () => {
    const fake = webdriver([
      rawSnapshot([rawNode(0, { name: "After action" })]),
      rawSnapshot([rawNode(0, { name: "After observation" })]),
    ]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });
    let releaseMutation!: () => void;
    let mutationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      mutationStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseMutation = resolve;
    });
    const action = engine.interaction(async (refresh) => {
      mutationStarted();
      await released;
      return await refresh();
    });
    await started;

    const observation = engine.snapshot();
    expect(fake.execute).not.toHaveBeenCalled();
    releaseMutation();

    await expect(action).resolves.toMatchObject({ generation: 1 });
    await expect(observation).resolves.toMatchObject({ generation: 2 });
    expect(fake.execute).toHaveBeenCalledTimes(2);
  });

  it("does not coalesce observations owned by different abort signals", async () => {
    const fake = webdriver([
      rawSnapshot([rawNode(0)]),
      rawSnapshot([rawNode(0)]),
    ]);
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });
    const first = new AbortController();
    const second = new AbortController();

    const [snapshot1, snapshot2] = await Promise.all([
      engine.snapshot(undefined, first.signal),
      engine.snapshot(undefined, second.signal),
    ]);

    expect(snapshot1.generation).toBe(1);
    expect(snapshot2.generation).toBe(2);
    expect(fake.execute).toHaveBeenCalledTimes(2);
  });

  it("retries one provider-constrained incoherent capture before replacing refs", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new PumarejoError("INTERNAL_ERROR"))
      .mockResolvedValueOnce(rawSnapshot([rawNode(0)]));
    const client = {
      execute,
      title: vi.fn(async () => "Fixture"),
    } as unknown as WebDriverClient;
    const engine = new SnapshotEngine({
      webdriver: client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });

    await expect(engine.snapshot()).resolves.toMatchObject({ generation: 1 });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(engine.references.generation).toBe(1);
  });

  it("returns a structured partial snapshot after two semantic extraction failures", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(rawSnapshot([rawNode(0)]))
      .mockRejectedValueOnce(new PumarejoError("INTERNAL_ERROR"))
      .mockRejectedValueOnce(new PumarejoError("INTERNAL_ERROR"));
    const client = {
      execute,
      title: vi.fn(async () => "Fixture"),
      windowRect: vi.fn(async () => ({
        x: 0,
        y: 0,
        width: 1024,
        height: 768,
      })),
    } as unknown as WebDriverClient;
    const engine = new SnapshotEngine({
      webdriver: client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });

    const first = await engine.snapshot();
    const partial = await engine.snapshot();

    expect(partial).toMatchObject({
      generation: 2,
      observedAt: "2026-07-28T12:00:00.000Z",
      partial: true,
      window: {
        label: "main",
        title: "Fixture",
        width: 1024,
        height: 768,
      },
      nodes: [],
      issues: [
        {
          code: "SEMANTIC_EXTRACTION_FAILED",
          phase: "observation",
          retryable: true,
        },
      ],
    });
    expect(partial.truncation).toMatchObject({
      truncated: true,
      reasons: expect.arrayContaining(["semanticExtraction"]),
    });
    expect(() => engine.references.resolve(first.nodes[0]!.ref)).toThrowError(
      expect.objectContaining({ code: "STALE_ELEMENT_REF" }),
    );
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("propagates session failures instead of converting them to partial snapshots", async () => {
    const client = {
      execute: vi.fn(async () => {
        throw new PumarejoError("SESSION_NOT_ACTIVE");
      }),
      title: vi.fn(async () => "Fixture"),
      windowRect: vi.fn(async () => ({
        x: 0,
        y: 0,
        width: 1024,
        height: 768,
      })),
    } as unknown as WebDriverClient;
    const engine = new SnapshotEngine({
      webdriver: client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });

    await expect(engine.snapshot()).rejects.toMatchObject({
      code: "SESSION_NOT_ACTIVE",
    });
    expect(engine.references.generation).toBe(0);
  });

  it("rejects malformed containment and sensitive leakage before replacing refs", () => {
    expect(() =>
      rawSnapshotSchema.parse(rawSnapshot([rawNode(0, { parentIndex: 0 })])),
    ).toThrow();
    expect(() =>
      rawSnapshotSchema.parse(
        rawSnapshot([
          rawNode(0, {
            redacted: true,
            name: "secret",
            nameSafe: false,
            text: "secret",
            value: "secret",
          }),
        ]),
      ),
    ).toThrow();
    expect(() =>
      rawSnapshotSchema.parse({
        ...rawSnapshot([rawNode(0)]),
        truncation: {
          truncated: true,
          reasons: ["semanticExtraction"],
          counts: {
            visited: 1,
            candidates: 1,
            matched: 1,
            returned: 1,
            filtered: 0,
          },
          refineWith: [],
        },
      }),
    ).toThrow();
  });

  it("fingerprints semantic identity while retaining only opaque handles", () => {
    const table = new ReferenceTable();
    const parsed = rawSnapshotSchema.parse(
      rawSnapshot(
        [
          rawNode(0, {
            identity: {
              inputType: "text",
              ownershipContext: "root/form:/input:text:Account",
            },
          }),
        ],
        ["opaque-provider-id"],
      ),
    );
    const nodes = table.replace(parsed);
    const reference = table.resolve(nodes[0]!.ref);
    expect(reference.elementId).toBe("opaque-provider-id");
    expect(reference.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(nodes)).not.toContain("opaque-provider-id");
    expect(nodes[0]).not.toHaveProperty("identity");
    expect(nodes[0]).not.toHaveProperty("nameSafe");
  });
});
