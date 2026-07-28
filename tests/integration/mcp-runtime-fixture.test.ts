import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createMcpServer } from "../../src/mcp/index.js";
import { createTauriAgentRuntime } from "../../src/mcp/runtime.js";
import { providerRunEnabled } from "../platform/host.js";

function structured<T>(value: unknown): T {
  return value as T;
}

describe("real public MCP runtime fixture", () => {
  it.runIf(providerRunEnabled()).each(["visible", "background"] as const)(
    "completes the seven-tool %s workflow and cleans owned resources",
    async (mode) => {
      const project = resolve(
        process.env.TAURI_AGENT_FIXTURE_PROJECT ?? "tests/fixtures/tauri-app",
      );
      const runtime = await createTauriAgentRuntime(project);
      const server = createMcpServer(runtime);
      const client = new Client({
        name: "runtime-fixture-client",
        version: "1.0.0",
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        const launch = await client.callTool(
          {
            name: "tauri_launch",
            arguments: { mode },
          },
          undefined,
          { timeout: 240_000 },
        );
        expect(
          launch.isError,
          JSON.stringify(launch.structuredContent),
        ).not.toBe(true);
        const launchData = structured<{
          snapshot: {
            generation: number;
            nodes: { ref: string; tag: string; name?: string }[];
          };
        }>(launch.structuredContent);
        const name = launchData.snapshot.nodes.find(
          (node) => node.tag === "input" && node.name === "Name",
        )!;

        const typed = await client.callTool({
          name: "tauri_type",
          arguments: {
            ref: name.ref,
            text: `mcp-${mode}`,
            clear: true,
          },
        });
        expect(typed.isError).not.toBe(true);

        const entered = await client.callTool({
          name: "tauri_press_key",
          arguments: { key: "ENTER" },
        });
        expect(entered.isError).not.toBe(true);

        const afterEnter = await client.callTool({
          name: "tauri_snapshot",
          arguments: {},
        });
        expect(
          structured<{
            nodes: { role?: string; text?: string }[];
          }>(afterEnter.structuredContent).nodes.find(
            (node) => node.role === "status",
          )?.text,
        ).toBe(`Applied for mcp-${mode}`);

        const focus = structured<{
          nodes: { ref: string; name?: string }[];
        }>(afterEnter.structuredContent).nodes.find(
          (node) => node.name === "Focus probe",
        )!;
        const clicked = await client.callTool({
          name: "tauri_click",
          arguments: { ref: focus.ref },
        });
        expect(clicked.isError).not.toBe(true);

        const screenshot = await client.callTool({
          name: "tauri_screenshot",
          arguments: { save: true },
        });
        expect(screenshot).toMatchObject({
          content: [{ type: "image", mimeType: "image/png" }, { type: "text" }],
          structuredContent: {
            mimeType: "image/png",
            width: expect.any(Number),
            height: expect.any(Number),
            path: expect.stringContaining(".tauri-agent/artifacts/"),
          },
        });

        const closed = await client.callTool({
          name: "tauri_close",
          arguments: {},
        });
        expect(closed).toMatchObject({
          structuredContent: { alreadyClosed: false, state: "idle" },
        });
        const artifacts = await readdir(
          resolve(project, ".tauri-agent/artifacts"),
        );
        expect(
          artifacts.filter((entry) => entry.startsWith("session-")),
        ).toEqual([]);
      } finally {
        await client.close();
        await server.close();
        await runtime.shutdown().catch(() => undefined);
      }
    },
    300_000,
  );
});
