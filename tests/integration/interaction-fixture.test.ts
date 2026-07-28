import { describe, expect, it } from "vitest";

import { InteractionEngine } from "../../src/interaction/engine.js";
import { SnapshotEngine } from "../../src/observation/snapshot.js";
import { WebDriverClient } from "../../src/webdriver/client.js";
import { W3C_ELEMENT_KEY } from "../../src/webdriver/protocol.js";
import { providerRunEnabled } from "../platform/host.js";
import {
  findFreeLoopbackPort,
  nativeLaunchDependencies,
} from "../platform/native-runtime.js";
import { launchOwnedProvider } from "../platform/owned-launch.js";

describe("real semantic interaction fixture", () => {
  it.runIf(providerRunEnabled())(
    "types, presses, clicks, focuses and rejects changed exact handles",
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
        const snapshots = new SnapshotEngine({
          webdriver: client,
          windowLabel: "main",
        });
        const interactions = new InteractionEngine({
          webdriver: client,
          snapshot: snapshots,
        });

        const initial = await snapshots.snapshot();
        const name = initial.nodes.find(
          (node) => node.tag === "input" && node.name === "Name",
        )!;
        await expect(
          interactions.type({
            ref: name.ref,
            text: "semantic-live",
            clear: true,
          }),
        ).resolves.toMatchObject({
          action: "type",
          generation: initial.generation + 1,
        });

        const afterType = await snapshots.snapshot();
        expect(
          afterType.nodes.find(
            (node) => node.tag === "input" && node.name === "Name",
          ),
        ).toMatchObject({ value: "semantic-live", focused: true });

        await interactions.pressKey({ key: "ENTER" });
        const afterEnter = await snapshots.snapshot();
        expect(
          afterEnter.nodes.find((node) => node.role === "status")?.text,
        ).toBe("Applied for semantic-live");

        const focusProbe = afterEnter.nodes.find(
          (node) => node.name === "Focus probe",
        )!;
        await interactions.click({ ref: focusProbe.ref });
        const afterClick = await snapshots.snapshot();
        expect(
          afterClick.nodes.find((node) => node.name === "Focus probe"),
        ).toMatchObject({ focused: true });
        expect(
          afterClick.nodes.find((node) => node.role === "status")?.text,
        ).toBe("Focused: focus-probe");

        const custom = afterClick.nodes.find(
          (node) => node.name === "Custom action",
        )!;
        const exact = snapshots.references.resolve(custom.ref);
        await client.execute(
          "arguments[0].setAttribute('aria-label','Reused action')",
          [{ [W3C_ELEMENT_KEY]: exact.elementId }],
        );
        await expect(
          interactions.click({ ref: custom.ref }),
        ).rejects.toMatchObject({ code: "STALE_ELEMENT_REF" });

        await client.execute(
          `
            document.activeElement?.blur();
            window.addEventListener("keydown", (event) => {
              if (event.key === "Escape") {
                document.querySelector("#status").textContent = "Body key: Escape";
              }
            }, { once: true });
          `,
        );
        await interactions.pressKey({ key: "ESCAPE" });
        expect(
          (await snapshots.snapshot()).nodes.find(
            (node) => node.role === "status",
          )?.text,
        ).toBe("Body key: Escape");

        const beforeDisabled = await snapshots.snapshot();
        const disabledTarget = beforeDisabled.nodes.find(
          (node) => node.name === "Focus probe",
        )!;
        const disabledExact = snapshots.references.resolve(disabledTarget.ref);
        await client.execute("arguments[0].disabled = true", [
          { [W3C_ELEMENT_KEY]: disabledExact.elementId },
        ]);
        await expect(
          interactions.click({ ref: disabledTarget.ref }),
        ).rejects.toMatchObject({ code: "ELEMENT_DISABLED" });

        await client.execute("arguments[0].disabled = false", [
          { [W3C_ELEMENT_KEY]: disabledExact.elementId },
        ]);
        const beforeHidden = await snapshots.snapshot();
        const hiddenTarget = beforeHidden.nodes.find(
          (node) => node.name === "Focus probe",
        )!;
        const hiddenExact = snapshots.references.resolve(hiddenTarget.ref);
        await client.execute("arguments[0].hidden = true", [
          { [W3C_ELEMENT_KEY]: hiddenExact.elementId },
        ]);
        await expect(
          interactions.click({ ref: hiddenTarget.ref }),
        ).rejects.toMatchObject({ code: "ELEMENT_HIDDEN" });
      } finally {
        await launch.cleanup(() => client.deleteSession());
      }
    },
    180_000,
  );
});
