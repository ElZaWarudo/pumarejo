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
});
