import { describe, expect, it } from "vitest";

import {
  PROVIDER_ATTRIBUTION_PREFIX,
  PROVIDER_SOURCE_ALLOWLIST,
  PROVIDER_STAGED_ROOT,
  providerAttribution,
  providerSourcePathFromAttribution,
  readProviderBundle,
} from "../../src/installer/provider-source.js";

describe("curated provider source", () => {
  it("reads exactly the attributable 46-file provider bundle", async () => {
    const bundle = await readProviderBundle();
    expect(PROVIDER_SOURCE_ALLOWLIST).toHaveLength(46);
    expect(bundle.map((entry) => entry.sourceRelativePath)).toEqual(
      PROVIDER_SOURCE_ALLOWLIST,
    );
    expect(bundle.every((entry) => entry.content.length > 0)).toBe(true);
    expect(
      bundle.every((entry) => /^[a-f0-9]{64}$/u.test(entry.afterHash)),
    ).toBe(true);
    expect(
      bundle.map((entry) => entry.sourceRelativePath).join("\n"),
    ).not.toMatch(/(?:^|\/)(?:target|\.git|node_modules|Cargo\.lock)(?:\/|$)/u);
  });

  it("uses bounded source-relative provider attribution", () => {
    const source = "src/server/router.rs";
    const attribution = providerAttribution(source);
    expect(attribution).toBe(`${PROVIDER_ATTRIBUTION_PREFIX}${source}`);
    expect(providerSourcePathFromAttribution([attribution])).toBe(source);
    expect(providerSourcePathFromAttribution([`${attribution}-forged`])).toBe(
      undefined,
    );
    expect(PROVIDER_STAGED_ROOT).toBe(
      ".pumarejo/provider/tauri-plugin-wdio-webdriver",
    );
  });

  it("implements cancellable forward and reverse Tab focus traversal", async () => {
    const bundle = await readProviderBundle();
    const executor = bundle.find(
      (entry) => entry.sourceRelativePath === "src/platform/executor.rs",
    )?.content;

    expect(executor).toContain('is_down && js_key == "Tab"');
    expect(executor).toContain("keydownEvent.defaultPrevented");
    expect(executor).toContain("modifiers.shift");
    expect(executor).toContain("shadowRoot.activeElement");
    expect(executor).toContain("next.focus()");
  });

  it("advertises truthful desktop window capabilities from the provider", async () => {
    const bundle = await readProviderBundle();
    const router = bundle.find(
      (entry) => entry.sourceRelativePath === "src/server/router.rs",
    )?.content;
    const windowHandler = bundle.find(
      (entry) => entry.sourceRelativePath === "src/server/handlers/window.rs",
    )?.content;

    expect(router).toContain(
      '"/session/{session_id}/pumarejo/window-capabilities"',
    );
    expect(windowHandler).toContain("pub async fn capabilities");
    expect(windowHandler).toContain("window.is_resizable()");
    expect(windowHandler).toContain("window.is_maximizable()");
    expect(windowHandler).toContain('Ok(false) => ("unsupported"');
    expect(windowHandler).toContain('Err(_) => ("failed"');
    expect(windowHandler).toContain('"unsupported_on_mobile"');
  });
});
