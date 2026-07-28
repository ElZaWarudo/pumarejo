import { describe, expect, it } from "vitest";

import { parsePng } from "../../src/observation/screenshot.js";
import { WebDriverClient } from "../../src/webdriver/client.js";
import { providerRunEnabled } from "../platform/host.js";
import {
  findFreeLoopbackPort,
  nativeLaunchDependencies,
} from "../platform/native-runtime.js";
import { launchOwnedProvider } from "../platform/owned-launch.js";

describe("real embedded WebDriver adapter", () => {
  it.runIf(providerRunEnabled())(
    "runs required commands against the owned Tauri provider",
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
        expect(await client.windowHandles()).toContain("main");
        await client.selectWindow("main");
        expect(await client.title()).toBe("Isolated control fixture");
        expect(await client.windowRect()).toMatchObject({
          width: expect.any(Number),
          height: expect.any(Number),
        });
        expect(await client.execute<string>("return document.readyState")).toBe(
          "complete",
        );
        const button = await client.findElement("#focus-probe");
        await client.click(button);
        expect(
          await client.execute<string>(
            "return document.activeElement?.id ?? ''",
          ),
        ).toBe("focus-probe");
        const input = await client.findElement("#name");
        await client.click(input);
        await client.clear(input);
        await client.type(input, "adapter-live");
        expect(
          await client.execute<string>(
            "return document.querySelector('#name')?.value ?? ''",
          ),
        ).toBe("adapter-live");
        expect(parsePng(await client.screenshot())).toMatchObject({
          width: expect.any(Number),
          height: expect.any(Number),
        });
      } finally {
        await launch.cleanup(() => client.deleteSession());
      }
    },
    180_000,
  );
});
