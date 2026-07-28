import { describe, expect, it } from "vitest";

import { SnapshotEngine } from "../../src/observation/snapshot.js";
import { WebDriverClient } from "../../src/webdriver/client.js";
import { providerRunEnabled } from "../platform/host.js";
import {
  findFreeLoopbackPort,
  nativeLaunchDependencies,
} from "../platform/native-runtime.js";
import { launchOwnedProvider } from "../platform/owned-launch.js";

describe("real semantic snapshot fixture", () => {
  it.runIf(providerRunEnabled())(
    "returns deterministic accessible semantics and opaque exact references",
    async () => {
      const launch = await launchOwnedProvider(
        {
          mode: "visible",
          providerPort: await findFreeLoopbackPort(),
        },
        nativeLaunchDependencies,
      );
      const client = new WebDriverClient({
        port: launch.lease.proxyPort,
        nonce: launch.lease.nonce,
      });

      try {
        await client.waitUntilReady();
        await client.createSession();
        await client.selectWindow("main");
        const engine = new SnapshotEngine({
          webdriver: client,
          windowLabel: "main",
        });
        const first = await engine.snapshot();
        expect(first.window).toMatchObject({
          label: "main",
          title: "Isolated control fixture",
          width: expect.any(Number),
          height: expect.any(Number),
        });
        expect(first.nodes.map((node) => node.kind)).toEqual(
          expect.arrayContaining([
            "content",
            "status",
            "control",
            "list",
            "listitem",
            "table",
            "row",
            "cell",
            "dialog",
          ]),
        );
        expect(first.nodes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              tag: "input",
              role: "textbox",
              name: "Name",
              required: true,
            }),
            expect.objectContaining({
              tag: "input",
              role: "checkbox",
              name: "Shadow choice",
              checked: true,
            }),
            expect.objectContaining({
              role: "button",
              name: "Custom action",
              pressed: false,
            }),
          ]),
        );
        const redacted = first.nodes.filter((node) => node.redacted);
        expect(redacted.length).toBeGreaterThanOrEqual(3);
        expect(JSON.stringify(first)).not.toContain("fixture-sensitive-token");
        expect(JSON.stringify(first)).not.toContain("shadow-sensitive-value");
        expect(JSON.stringify(first)).not.toContain("Excluded hidden content");

        const firstRefs = first.nodes.map((node) => node.ref);
        const second = await engine.snapshot();
        expect(second.generation).toBe(first.generation + 1);
        expect(second.nodes.map((node) => node.tag)).toEqual(
          first.nodes.map((node) => node.tag),
        );
        for (const ref of firstRefs) {
          expect(() => engine.references.resolve(ref)).toThrowError(
            expect.objectContaining({ code: "STALE_ELEMENT_REF" }),
          );
        }
      } finally {
        await launch.cleanup(() => client.deleteSession());
      }
    },
    180_000,
  );
});
