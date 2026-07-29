import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import {
  createMcpServer,
  type PumarejoDomainPorts,
} from "../../src/mcp/index.js";
import { PumarejoError } from "../../src/shared/errors.js";

async function connect(ports: PumarejoDomainPorts) {
  const server = createMcpServer(ports);
  const client = new Client({
    name: "real-usage-certifier",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

function certificationPorts(): PumarejoDomainPorts {
  let generation = 1;
  let closed = false;
  return {
    launch: vi.fn(async () => ({
      state: "launching",
      phase: "waiting_provider",
      pollAfterMs: 500,
      recommendedClientTimeoutMs: 10_000,
    })),
    status: vi.fn(async () => ({
      state: "ready",
      generation,
      lastAction: "launch",
    })),
    snapshot: vi.fn(async () => ({
      generation,
      nodes: [
        {
          ref: `e${generation}-1`,
          role: "button",
          name: "Toggle relationship",
          pressed: false,
          current: "page",
          relationships: {
            labelledBy: [`e${generation}-2`],
            describedBy: [`e${generation}-3`],
            controls: [`e${generation}-4`],
            owns: [],
          },
        },
        {
          ref: `e${generation}-5`,
          role: "textbox",
          redacted: true,
        },
      ],
      truncation: {
        truncated: true,
        reasons: ["maxTextLength"],
        counts: {
          visited: 10_000,
          candidates: 2,
          matched: 2,
          returned: 2,
          filtered: 0,
        },
        refineWith: ["rootRef", "maxTextLength", "filters"],
      },
    })),
    screenshot: vi.fn(async () => ({
      metadata: {
        generation,
        mimeType: "image/png" as const,
        width: 800,
        height: 600,
      },
      image: { data: "iVBORw0KGgo=", mimeType: "image/png" as const },
    })),
    click: vi.fn(async (input) => {
      const before = generation;
      generation += 1;
      return {
        action: "click",
        generation,
        target: { ref: input.ref, generation: before },
        dispatch: { method: "webdriver", dispatched: true },
        focus: {
          before: { generation: before, ref: null, actionable: false },
          after: {
            generation,
            ref: `e${generation}-1`,
            actionable: true,
          },
        },
        effect: { kind: "focus_only", settleMs: input.settleMs },
        snapshotAfter: {
          generation,
          nodes: [{ ref: `e${generation}-1`, focused: true }],
        },
      };
    }),
    type: vi.fn(async (input) => ({ generation: ++generation, ...input })),
    pressKey: vi.fn(async (input) => ({
      generation: ++generation,
      dispatch: { method: "webdriver", dispatched: true },
      focus: {
        before: { generation: generation - 1, ref: "historical" },
        after: { generation, ref: `e${generation}-1` },
      },
      ...input,
    })),
    window: vi.fn(async (input) => ({
      generation: ++generation,
      action: "window",
      window: {
        state: input.action === "resize" ? "restored" : input.action,
        rect: {
          x: 0,
          y: 0,
          width: input.width ?? 1920,
          height: input.height ?? 1032,
        },
      },
    })),
    pointer: vi.fn(async (input) => ({ generation: ++generation, ...input })),
    scroll: vi.fn(async (input) => ({ generation: ++generation, ...input })),
    selectOption: vi.fn(async (input) => ({
      generation: ++generation,
      selected: true,
      ...input,
    })),
    close: vi.fn(async () => {
      const alreadyClosed = closed;
      closed = true;
      return {
        alreadyClosed,
        state: "idle",
        cleanupPending: [],
        ownedResources: 0,
      };
    }),
  };
}

describe("public real-usage certification journey", () => {
  it("exposes bounded observation, truthful effects, chords, viewports, ARIA, and idempotent cleanup", async () => {
    const ports = certificationPorts();
    const { client, server } = await connect(ports);
    try {
      const launch = await client.callTool({
        name: "tauri_launch",
        arguments: { waitMs: 30_000 },
      });
      expect(launch.structuredContent).toMatchObject({
        state: "launching",
        phase: "waiting_provider",
      });
      const status = await client.callTool({
        name: "tauri_status",
        arguments: {},
      });
      expect(status.structuredContent).toMatchObject({ state: "ready" });

      const snapshot = await client.callTool({
        name: "tauri_snapshot",
        arguments: { maxTextLength: 4096 },
      });
      expect(snapshot.structuredContent).toMatchObject({
        nodes: [
          expect.objectContaining({
            pressed: false,
            current: "page",
            relationships: expect.objectContaining({
              labelledBy: expect.any(Array),
              describedBy: expect.any(Array),
              controls: expect.any(Array),
            }),
          }),
          expect.objectContaining({ redacted: true }),
        ],
        truncation: {
          truncated: true,
          reasons: ["maxTextLength"],
        },
      });
      expect(JSON.stringify(snapshot.structuredContent)).not.toContain(
        "transcript-derived-private-name",
      );

      const click = await client.callTool({
        name: "tauri_click",
        arguments: { ref: "e1-1", snapshotAfter: true },
      });
      expect(click.structuredContent).toMatchObject({
        target: { ref: "e1-1", generation: 1 },
        effect: { kind: "focus_only" },
        snapshotAfter: {
          generation: 2,
          nodes: [{ ref: "e2-1", focused: true }],
        },
      });

      const chord = await client.callTool({
        name: "tauri_press_key",
        arguments: {
          key: "D",
          modifiers: ["CONTROL", "SHIFT"],
          snapshotAfter: true,
        },
      });
      expect(chord.structuredContent).toMatchObject({
        key: "D",
        modifiers: ["CONTROL", "SHIFT"],
        focus: {
          before: expect.any(Object),
          after: expect.any(Object),
        },
      });

      for (const [width, height] of [
        [640, 480],
        [800, 600],
        [1920, 1032],
      ]) {
        const viewport = await client.callTool({
          name: "tauri_window",
          arguments: { action: "resize", width, height },
        });
        expect(viewport.structuredContent).toMatchObject({
          window: { rect: { width, height } },
        });
      }

      const firstClose = await client.callTool({
        name: "tauri_close",
        arguments: {},
      });
      const secondClose = await client.callTool({
        name: "tauri_close",
        arguments: {},
      });
      expect(firstClose.structuredContent).toMatchObject({
        alreadyClosed: false,
        state: "idle",
        cleanupPending: [],
        ownedResources: 0,
      });
      expect(secondClose.structuredContent).toMatchObject({
        alreadyClosed: true,
        state: "idle",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    ["tauri_snapshot", "INTERNAL_ERROR"],
    ["tauri_launch", "APP_START_FAILED"],
    ["tauri_status", "WINDOW_NOT_FOUND"],
    ["tauri_click", "STALE_ELEMENT_REF"],
    ["tauri_close", "CLOSE_FAILED"],
  ] as const)(
    "preserves the structured %s failure envelope",
    async (tool, code) => {
      const ports = certificationPorts();
      ports[
        tool === "tauri_status"
          ? "status"
          : tool === "tauri_snapshot"
            ? "snapshot"
            : tool === "tauri_launch"
              ? "launch"
              : tool === "tauri_click"
                ? "click"
                : "close"
      ] = vi.fn(async () => {
        throw new PumarejoError(code);
      }) as never;
      const { client, server } = await connect(ports);
      try {
        const result = await client.callTool({
          name: tool,
          arguments:
            tool === "tauri_click"
              ? { ref: "e1-1" }
              : tool === "tauri_launch"
                ? {}
                : {},
        });
        expect(result).toMatchObject({
          isError: true,
          structuredContent: { code },
        });
      } finally {
        await client.close();
        await server.close();
      }
    },
  );
});
