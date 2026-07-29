import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";

import { createMcpServer } from "../../src/mcp/index.js";
import { createPumarejoRuntime } from "../../src/mcp/runtime.js";
import { providerRunEnabled } from "./host.js";

type PublicNode = {
  readonly ref?: string;
  readonly name?: string;
  readonly role?: string;
  readonly redacted?: boolean;
  readonly pressed?: boolean;
  readonly selected?: boolean;
  readonly current?: boolean | string;
  readonly relationships?: Record<string, readonly string[]>;
};

type PublicSnapshot = {
  readonly generation: number;
  readonly nodes: readonly PublicNode[];
  readonly truncation: {
    readonly truncated: boolean;
    readonly reasons: readonly string[];
  };
};

function structured(result: unknown): Record<string, unknown> {
  const value = result as {
    readonly isError?: boolean;
    readonly structuredContent?: unknown;
  };
  expect(value.structuredContent).toBeDefined();
  if (value.isError === true) {
    throw new Error(
      `Public tool failed: ${JSON.stringify(value.structuredContent)}`,
    );
  }
  return value.structuredContent as Record<string, unknown>;
}

function snapshotFrom(result: unknown): PublicSnapshot {
  return structured(result) as unknown as PublicSnapshot;
}

function requiredRef(snapshot: PublicSnapshot, name: string): string {
  const ref = snapshot.nodes.find((node) => node.name === name)?.ref;
  if (ref === undefined) throw new Error(`Missing public ref for ${name}.`);
  return ref;
}

describe("live public real-usage journey", () => {
  it.runIf(providerRunEnabled())(
    "certifies all desktop-QA surfaces through an independent MCP client",
    async () => {
      const runtime = await createPumarejoRuntime("tests/fixtures/tauri-app");
      const server = createMcpServer(runtime);
      const client = new Client({
        name: "live-public-certifier",
        version: "1.0.0",
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        const launch = await client.callTool({
          name: "tauri_launch",
          arguments: { mode: "visible", waitMs: 30_000 },
        });
        let launchState = structured(launch);
        const deadline = Date.now() + 600_000;
        while (launchState.state === "launching" && Date.now() < deadline) {
          await delay(500);
          launchState = structured(
            await client.callTool({ name: "tauri_status", arguments: {} }),
          );
        }
        if (launchState.lastFailure !== undefined) {
          throw new Error(
            `Live launch failed: ${JSON.stringify(launchState.lastFailure)}`,
          );
        }
        expect(launchState.state ?? "ready", JSON.stringify(launchState)).toBe(
          "ready",
        );

        const bounded = snapshotFrom(
          await client.callTool({
            name: "tauri_snapshot",
            arguments: {
              maxTextLength: 256,
            },
          }),
        );
        expect(bounded.truncation, JSON.stringify(bounded)).toMatchObject({
          truncated: true,
          reasons: expect.arrayContaining(["maxTextLength"]),
        });

        const cleanupSnapshot = snapshotFrom(
          await client.callTool({
            name: "tauri_snapshot",
            arguments: { roles: ["button"] },
          }),
        );
        const cleared = structured(
          await client.callTool({
            name: "tauri_click",
            arguments: {
              ref: requiredRef(cleanupSnapshot, "Clear large content"),
              snapshotAfter: true,
            },
          }),
        );
        let current = cleared.snapshotAfter as PublicSnapshot;
        const serialized = JSON.stringify(current);
        expect(serialized).not.toContain("fixture-sensitive-token");
        expect(serialized).not.toContain("shadow-sensitive-value");
        expect(serialized).not.toContain("transcript-derived-private-name");
        expect(current.nodes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ redacted: true }),
            expect.objectContaining({
              name: "Toggle relationship",
              pressed: false,
              relationships: expect.objectContaining({
                controls: expect.any(Array),
              }),
            }),
            expect.objectContaining({ name: "Current", current: "page" }),
          ]),
        );

        const focus = structured(
          await client.callTool({
            name: "tauri_click",
            arguments: {
              ref: requiredRef(current, "Focus probe"),
              snapshotAfter: true,
            },
          }),
        );
        expect(focus.effect).toMatchObject({ kind: "focus_only" });
        expect(focus.focus).toMatchObject({
          before: expect.any(Object),
          after: expect.any(Object),
        });
        current = focus.snapshotAfter as PublicSnapshot;

        const chord = structured(
          await client.callTool({
            name: "tauri_press_key",
            arguments: {
              key: "D",
              modifiers: ["CONTROL", "SHIFT"],
              snapshotAfter: true,
            },
          }),
        );
        expect(chord).toMatchObject({
          key: "D",
          modifiers: ["CONTROL", "SHIFT"],
          focus: {
            before: expect.any(Object),
            after: expect.any(Object),
          },
        });
        current = chord.snapshotAfter as PublicSnapshot;

        for (const [width, height] of [
          [640, 480],
          [800, 600],
          [1920, 1032],
        ]) {
          const windowResult = structured(
            await client.callTool({
              name: "tauri_window",
              arguments: {
                action: "resize",
                width,
                height,
                snapshotAfter: true,
              },
            }),
          );
          expect(windowResult.window).toMatchObject({
            rect: { width, height },
          });
          current = windowResult.snapshotAfter as PublicSnapshot;
        }

        const toggle = structured(
          await client.callTool({
            name: "tauri_click",
            arguments: {
              ref: requiredRef(current, "Toggle relationship"),
              snapshotAfter: true,
            },
          }),
        );
        current = toggle.snapshotAfter as PublicSnapshot;
        expect(
          current.nodes.find((node) => node.name === "Toggle relationship"),
        ).toMatchObject({ pressed: true });

        const optionSnapshot = snapshotFrom(
          await client.callTool({
            name: "tauri_snapshot",
            arguments: { visibleOnly: false, roles: ["option"] },
          }),
        );
        const selected = structured(
          await client.callTool({
            name: "tauri_select_option",
            arguments: {
              ref: requiredRef(optionSnapshot, "Beta choice"),
              snapshotAfter: true,
            },
          }),
        );
        current = selected.snapshotAfter as PublicSnapshot;
        // The action starts from a role-filtered, non-visible snapshot, so its
        // before/after states are intentionally not comparable.
        expect(selected.effect).toMatchObject({ kind: "unknown" });
        const selectedOptions = snapshotFrom(
          await client.callTool({
            name: "tauri_snapshot",
            arguments: { visibleOnly: false, roles: ["option"] },
          }),
        );
        expect(
          selectedOptions.nodes.find((node) => node.name === "Beta choice"),
        ).toMatchObject({ selected: true });

        const firstClose = structured(
          await client.callTool({ name: "tauri_close", arguments: {} }),
        );
        const secondClose = structured(
          await client.callTool({ name: "tauri_close", arguments: {} }),
        );
        expect(firstClose).toMatchObject({ state: "idle" });
        expect(secondClose).toMatchObject({
          state: "idle",
          alreadyClosed: true,
        });
      } finally {
        await client.close();
        await runtime.shutdown();
        await server.close();
      }
    },
    720_000,
  );
});
