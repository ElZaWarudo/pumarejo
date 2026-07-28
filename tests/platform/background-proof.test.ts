import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authoritativeHostRequested,
  authoritativeHostValid,
  hostFacts,
  providerRunEnabled,
} from "./host.js";

describe("background mode proof", () => {
  it("keeps the consumer window visibility override external to source", () => {
    const config = readFileSync(
      resolve("tests/fixtures/tauri-app/src-tauri/tauri.conf.json"),
      "utf8",
    );
    expect(config).toContain('"visible": true');
    expect(config).not.toContain("PUMAREJO_BACKGROUND");
  });

  it.runIf(providerRunEnabled())(
    "proves hidden creation preserves rendering and actions",
    async () => {
      const { runOwnedProviderSequence } = await import(
        "./provider-sequence.js"
      );
      await expect(
        runOwnedProviderSequence("background"),
      ).resolves.toMatchObject({
        mode: "background",
        windowPresented: false,
        screenshot: true,
        actions: true,
      });
    },
    720_000,
  );

  it.skipIf(!authoritativeHostRequested())(
    "requires active-desktop/focus evidence on the exact host",
    () => {
      expect(process.env.PUMAREJO_NO_TRANSIENT_WINDOW).toBe("1");
      expect(process.env.PUMAREJO_NO_FOCUS_CHANGE).toBe("1");
      const expected = process.platform === "win32" ? "windows" : "ubuntu";
      expect(authoritativeHostValid(expected)).toBe(true);
      expect(hostFacts().platform).toMatch(/^(win32|linux)$/);
    },
  );
});
