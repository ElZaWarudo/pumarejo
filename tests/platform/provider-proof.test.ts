import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authoritativeHostRequested,
  authoritativeHostValid,
  hostFacts,
  providerRunEnabled,
} from "./host.js";
import {
  PROVIDER_SOURCE_ALLOWLIST,
  PROVIDER_STAGED_ROOT,
} from "../../src/installer/provider-source.js";

const fixture = resolve("tests/fixtures/tauri-app");
const cargo = readFileSync(resolve(fixture, "src-tauri/Cargo.toml"), "utf8");
const lib = readFileSync(resolve(fixture, "src-tauri/src/lib.rs"), "utf8");
const fixtureHtml = readFileSync(resolve(fixture, "src/index.html"), "utf8");
const fixtureCapability = readFileSync(
  resolve(fixture, "src-tauri/capabilities/default.json"),
  "utf8",
);
const modeOverlay = readFileSync(
  resolve("tests/platform/mode-overlay.ts"),
  "utf8",
);
const providerBuild = readFileSync(
  resolve("vendor/tauri-plugin-wdio-webdriver/build.rs"),
  "utf8",
);
const providerRouter = readFileSync(
  resolve("vendor/tauri-plugin-wdio-webdriver/src/server/router.rs"),
  "utf8",
);
const providerDefaultPermission = readFileSync(
  resolve("vendor/tauri-plugin-wdio-webdriver/permissions/default.toml"),
  "utf8",
);

describe("embedded provider proof", () => {
  it("has a complete accessible fixture and debug/feature-gated provider", () => {
    expect(existsSync(resolve(fixture, "src/index.html"))).toBe(true);
    expect(cargo).toContain('pumarejo = ["dep:tauri-plugin-wdio-webdriver"]');
    expect(cargo).toContain("optional = true");
    expect(lib).toContain('cfg(all(debug_assertions, feature = "pumarejo"))');
    expect(PROVIDER_SOURCE_ALLOWLIST).toHaveLength(46);
    expect(PROVIDER_STAGED_ROOT).toBe(
      ".pumarejo/provider/tauri-plugin-wdio-webdriver",
    );
  });

  it("opts only the fixture into the bounded request_dialog command", () => {
    expect(providerBuild).toContain('"request_dialog"');
    expect(providerBuild).toContain("wdio-webdriver:allow-request-dialog");
    expect(providerDefaultPermission).toContain("permissions = []");
    expect(fixtureCapability).not.toContain(
      "wdio-webdriver:allow-request-dialog",
    );
    expect(modeOverlay).toContain("wdio-webdriver:allow-request-dialog");
    expect(providerRouter).toContain("/pumarejo/tauri-dialog");
    expect(providerRouter).toContain("/pumarejo/tauri-dialog/decision");
    expect(fixtureHtml).toContain("request: {");
    expect(providerRouter).not.toContain("/pumarejo/command");
    expect(providerRouter).not.toContain("/pumarejo/script");
  });

  it("records host facts without treating them as authoritative provider evidence", () => {
    const facts = hostFacts();
    expect(facts.platform).toMatch(/^(win32|linux)$/);
    expect(facts.arch).toBeTruthy();
    expect(facts.release).toBeTruthy();
  });

  it.runIf(providerRunEnabled())(
    "runs the live W3C provider sequence when enabled",
    async () => {
      const { runOwnedProviderSequence } = await import(
        "./provider-sequence.js"
      );
      await expect(runOwnedProviderSequence("visible")).resolves.toMatchObject({
        mode: "visible",
        commands: expect.arrayContaining([
          "status",
          "session",
          "window",
          "script",
          "screenshot",
          "click",
          "type",
          "key",
          "delete-session",
        ]),
      });
    },
    720_000,
  );

  it.skipIf(!authoritativeHostRequested())(
    "requires exact release-shaped host evidence",
    () => {
      const facts = hostFacts();
      const expected = process.platform === "win32" ? "windows" : "ubuntu";
      expect(authoritativeHostValid(expected)).toBe(true);
      expect(process.env.PUMAREJO_OS_BUILD).toBeTruthy();
      expect(process.env.PUMAREJO_DISPLAY_SESSION).toBeTruthy();
      expect(process.env.PUMAREJO_WEBVIEW_RUNTIME).toBeTruthy();
      expect(facts.release).toBeTruthy();
    },
  );
});
