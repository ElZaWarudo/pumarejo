import { describe, expect, it, vi } from "vitest";

import { ReferenceTable } from "../../src/observation/refs.js";
import { rawSnapshotSchema } from "../../src/observation/schema.js";
import { SnapshotEngine } from "../../src/observation/snapshot.js";
import { TauriAgentError } from "../../src/shared/errors.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";

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
      relationships: { labelledBy: [], describedBy: [], owns: [] },
      identity: { ownershipContext: "root/button:button:Save" },
      ...overrides,
    },
  };
}

function rawSnapshot(nodes: readonly unknown[]): Record<string, unknown> {
  return { scriptVersion: 1, viewport: { width: 800, height: 600 }, nodes };
}

function webdriver(values: readonly unknown[], elementIds = ["element-0"]) {
  let index = 0;
  const execute = vi.fn(async () => values[index++]);
  const title = vi.fn(async () => "Fixture");
  return {
    client: {
      execute,
      title,
      async snapshotElementHandles() {
        return elementIds;
      },
    } as unknown as WebDriverClient,
    execute,
  };
}

describe("semantic snapshots", () => {
  it("validates, assigns deterministic preorder refs and replaces generations atomically", async () => {
    const first = rawSnapshot([
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
          owns: [],
        },
      }),
    ]);
    const second = rawSnapshot([
      rawNode(0, { name: "Replacement", text: "Replacement" }),
    ]);
    const fake = webdriver([first, second], ["root", "save"]);
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

  it("serializes concurrent observations into distinct generations", async () => {
    const fake = webdriver(
      [rawSnapshot([rawNode(0)]), rawSnapshot([rawNode(0)])],
      ["one"],
    );
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
    const fake = webdriver(
      [
        rawSnapshot([rawNode(0, { name: "After action" })]),
        rawSnapshot([rawNode(0, { name: "After observation" })]),
      ],
      ["one"],
    );
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
    const fake = webdriver(
      [rawSnapshot([rawNode(0)]), rawSnapshot([rawNode(0)])],
      ["one"],
    );
    const engine = new SnapshotEngine({
      webdriver: fake.client,
      windowLabel: "main",
      script: async () => "return fixtureSnapshot()",
    });
    const first = new AbortController();
    const second = new AbortController();

    const [snapshot1, snapshot2] = await Promise.all([
      engine.snapshot(first.signal),
      engine.snapshot(second.signal),
    ]);

    expect(snapshot1.generation).toBe(1);
    expect(snapshot2.generation).toBe(2);
    expect(fake.execute).toHaveBeenCalledTimes(2);
  });

  it("retries one provider-constrained incoherent capture before replacing refs", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new TauriAgentError("INTERNAL_ERROR"))
      .mockResolvedValueOnce(rawSnapshot([rawNode(0)]));
    const client = {
      execute,
      title: vi.fn(async () => "Fixture"),
      snapshotElementHandles: vi.fn(async () => ["element-0"]),
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
  });

  it("fingerprints semantic identity while retaining only opaque handles", () => {
    const table = new ReferenceTable();
    const parsed = rawSnapshotSchema.parse(
      rawSnapshot([
        rawNode(0, {
          identity: {
            inputType: "text",
            ownershipContext: "root/form:/input:text:Account",
          },
        }),
      ]),
    );
    const nodes = table.replace(parsed, ["opaque-provider-id"]);
    const reference = table.resolve(nodes[0]!.ref);
    expect(reference.elementId).toBe("opaque-provider-id");
    expect(reference.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(nodes)).not.toContain("opaque-provider-id");
    expect(nodes[0]).not.toHaveProperty("identity");
    expect(nodes[0]).not.toHaveProperty("nameSafe");
  });
});
