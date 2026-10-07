import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import {
  CORE_TOOL_NAMES,
  createMcpServer,
  createStubDomainPorts,
  SERVER_INSTRUCTIONS,
  type PumarejoDomainPorts,
} from "../../src/mcp/index.js";
import type {
  SemanticNode,
  SemanticSnapshot,
} from "../../src/observation/schema.js";

function node(
  ref: string,
  overrides: Partial<SemanticNode> = {},
): SemanticNode {
  return {
    ref,
    kind: "control",
    tag: "button",
    role: "button",
    name: "Send",
    redacted: false,
    enabled: true,
    visible: true,
    focused: false,
    bounds: { x: 1.5, y: 2.25, width: 80, height: 30 },
    relationships: { labelledBy: [], describedBy: [], controls: [], owns: [] },
    ...overrides,
  };
}

function snapshot(
  nodes: readonly SemanticNode[],
  generation = 1,
): SemanticSnapshot {
  return {
    generation,
    observedAt: "2026-10-07T00:00:00.000Z",
    window: { label: "main", title: "Chat", width: 1280, height: 800 },
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

async function connect(ports: PumarejoDomainPorts) {
  const server = createMcpServer(ports);
  const client = new Client({ name: "presentation-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content.map((item) => item.text ?? "").join("\n");
}

describe("context-lean MCP presentation", () => {
  it("exposes the core tools with instructions and read-only hints", async () => {
    const { client, server } = await connect(createStubDomainPorts());
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([...CORE_TOOL_NAMES]);
      expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
      const annotations = Object.fromEntries(
        tools.map((tool) => [tool.name, tool.annotations]),
      );
      expect(annotations.tauri_snapshot).toMatchObject({ readOnlyHint: true });
      expect(annotations.tauri_click).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns snapshots as an outline with a node-free summary", async () => {
    const ports = createStubDomainPorts();
    const observed = snapshot([
      node("e1-1", {
        kind: "content",
        tag: "form",
        role: "form",
        name: "Reply",
      }),
      node("e1-2", {
        parentRef: "e1-1",
        tag: "textarea",
        role: "textbox",
        name: "Message",
        value: "Hello",
        focused: true,
      }),
      node("e1-3", { parentRef: "e1-1" }),
    ]);
    ports.snapshot = vi.fn(async () => ({ ...observed }));
    const { client, server } = await connect(ports);
    try {
      const result = await client.callTool({
        name: "tauri_snapshot",
        arguments: { maxChars: 2000 },
      });
      expect(text(result)).toBe(
        [
          'window "Chat" 1280x800 · generation 1',
          '- form "Reply" [e1-1]',
          '  - textbox "Message" [e1-2] (focused): "Hello"',
          '  - button "Send" [e1-3]',
        ].join("\n"),
      );
      expect(result.structuredContent).toMatchObject({
        generation: 1,
        nodeCount: 3,
      });
      expect(result.structuredContent).not.toHaveProperty("nodes");
      expect(ports.snapshot).toHaveBeenCalledWith(
        expect.not.objectContaining({ format: expect.anything() }),
        expect.anything(),
      );

      const json = await client.callTool({
        name: "tauri_snapshot",
        arguments: { format: "json" },
      });
      expect(json.structuredContent).toMatchObject({
        nodes: expect.any(Array),
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reports what changed after an action instead of a new snapshot", async () => {
    const ports = createStubDomainPorts();
    ports.click = vi.fn(async () => ({
      generation: 2,
      action: "click",
      ref: "e1-3",
      target: { ref: "e1-3", generation: 1 },
      dispatch: { method: "webdriver", dispatched: true },
      focus: {
        before: { generation: 1, ref: "e1-2", actionable: false },
        after: { generation: 2, ref: "e1-3", actionable: true },
      },
      effect: { kind: "semantic_change", settleMs: 250 },
      changes: {
        added: ['status [e2-4]: "Sent"'],
        removed: [],
        changed: [
          {
            ref: "e1-2",
            line: 'textbox "Message" [e1-2]: ""',
            fields: { value: ["Hello", ""] },
          },
        ],
        counts: { added: 1, removed: 0, changed: 1 },
        truncated: false,
      },
    }));
    const { client, server } = await connect(ports);
    try {
      const result = await client.callTool({
        name: "tauri_click",
        arguments: { ref: "e1-3" },
      });
      expect(text(result)).toBe(
        [
          "click e1-3 · effect semantic_change · generation 2 · focus e1-2 → e1-3",
          '+ status [e2-4]: "Sent"',
          '~ textbox "Message" [e1-2]: "": value "Hello" → ""',
        ].join("\n"),
      );
      expect(result.structuredContent).toMatchObject({
        changeCounts: { added: 1, removed: 0, changed: 1 },
      });
      expect(result.structuredContent).not.toHaveProperty("changes");
      expect(ports.click).toHaveBeenCalledWith(
        expect.objectContaining({ snapshotAfter: false }),
        expect.anything(),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("waits on status while the app is still launching", async () => {
    const ports = createStubDomainPorts();
    const states = ["launching", "launching", "ready"];
    ports.status = vi.fn(async () => ({ state: states.shift() ?? "ready" }));
    const { client, server } = await connect(ports);
    try {
      const result = await client.callTool({
        name: "tauri_status",
        arguments: { waitMs: 5000 },
      });
      expect(result.structuredContent).toMatchObject({ state: "ready" });
      expect(ports.status).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
