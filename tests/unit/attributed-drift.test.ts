import {
  agentCapability,
  AGENT_PERMISSIONS,
} from "../../src/installer/capabilities.js";
import {
  CARGO_DEPENDENCY_ATTRIBUTION,
  CARGO_EOL_CRLF_ATTRIBUTION,
  CARGO_EOL_LF_ATTRIBUTION,
  CARGO_DEPENDENCY_PATH_ATTRIBUTION,
  cargoIntegrationAttribution,
  normalizeCargoEol,
  planCargoEdit,
  planCargoRemoval,
} from "../../src/installer/cargo.js";
import {
  evaluateAttributedEntry,
  type AttributedDriftResult,
} from "../../src/installer/attributed-drift.js";
import {
  contentHash,
  type IntegrationManifestChange,
} from "../../src/installer/manifest.js";
import { IGNORE_BLOCK } from "../../src/installer/ignore.js";
import { planRustEdit, planRustRemoval } from "../../src/installer/rust.js";
import { describe, expect, it } from "vitest";

function entry(
  kind: IntegrationManifestChange["kind"],
  relativePath: string,
  source: string,
  attribution: readonly string[],
): IntegrationManifestChange {
  return {
    kind,
    relativePath,
    beforeHash: null,
    afterHash: contentHash(source),
    attribution,
  };
}

function expectIntact(result: AttributedDriftResult, hashMatched: boolean) {
  expect(result).toEqual({
    owned: "intact",
    hashMatched,
    reason: hashMatched ? "intact" : "hash-mismatch-unrelated",
  });
}

describe("attributed integration drift", () => {
  it("tolerates unrelated Rust edits but rejects forged owned changes", () => {
    const original =
      "fn main() { tauri::Builder::default().run(tauri::generate_context!()).unwrap(); }\n";
    const generated = planRustEdit(original);
    const manifestEntry = entry("rust", "src-tauri/src/main.rs", generated, [
      "marker:<pumarejo:begin>",
      "wrapper:pumarejo_builder",
    ]);

    expectIntact(
      evaluateAttributedEntry(manifestEntry, `${generated}// user code\n`),
      false,
    );
    const changed = generated.replace("debug_assertions", "test");
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(changed) },
        changed,
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });

    const wrapper = "pumarejo_builder(tauri::Builder::default())";
    expect(planRustRemoval(`// ${wrapper}\n${generated}`)).toBe(
      `// ${wrapper}\n${original}`,
    );
    const generatedCrlf = generated.replaceAll("\n", "\r\n");
    expectIntact(
      evaluateAttributedEntry(
        {
          ...manifestEntry,
          afterHash: contentHash(generatedCrlf),
        },
        generatedCrlf,
      ),
      true,
    );
    expect(planRustRemoval(generatedCrlf)).toBe(
      original.replaceAll("\n", "\r\n"),
    );
    const commentForgery = generated
      .replace(wrapper, "tauri::Builder::default()")
      .concat(`// ${wrapper}\n`);
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(commentForgery) },
        commentForgery,
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });

  it("checks attributed Cargo semantics independently from formatting", () => {
    const generated = planCargoEdit(
      '[package]\nname = "fixture"\n\n[dependencies]\n',
    );
    const attribution = cargoIntegrationAttribution(
      '[package]\nname = "fixture"\n\n[dependencies]\n',
    );
    const manifestEntry = entry(
      "cargo",
      "src-tauri/Cargo.toml",
      generated,
      attribution,
    );
    expectIntact(
      evaluateAttributedEntry(manifestEntry, `${generated}\nserde = \"1\"\n`),
      false,
    );
    const changed = generated.replace('version = "1"', 'version = "2"');
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(changed) },
        changed,
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });

  it("rejects removed uniform EOL provenance before doctor or removal can proceed", () => {
    const original =
      '[package]\nname = "fixture"\n\n[dependencies]\n\n[features]\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);
    const withoutEol = attribution.filter(
      (value) => !value.startsWith("eol:cargo:"),
    );
    const manifestEntry = entry(
      "cargo",
      "src-tauri/Cargo.toml",
      generated,
      withoutEol,
    );

    expect(evaluateAttributedEntry(manifestEntry, generated)).toMatchObject({
      owned: "drifted",
      reason: "owned-value-drift",
    });
    expect(() => normalizeCargoEol(generated, withoutEol)).toThrow();
  });

  it("binds each uniform EOL token to one exact owned marker", () => {
    const original =
      '[package]\nname = "fixture"\n\n[dependencies]\n\n[features]\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);
    const eolMarker = "# <pumarejo:cargo-eol:lf>";
    expect(generated.match(/^# <pumarejo:cargo-eol:[^\r\n]*>$/gmu)).toEqual([
      eolMarker,
    ]);

    const swappedAttribution = attribution.map((value) =>
      value === CARGO_EOL_LF_ATTRIBUTION ? CARGO_EOL_CRLF_ATTRIBUTION : value,
    );
    expect(
      evaluateAttributedEntry(
        {
          ...entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
          attribution: swappedAttribution,
        },
        generated,
      ),
    ).toMatchObject({ owned: "drifted", reason: "owned-value-drift" });
    expect(() => normalizeCargoEol(generated, swappedAttribution)).toThrow();

    const missingMarker = generated.replace(`${eolMarker}\n`, "");
    expect(
      evaluateAttributedEntry(
        entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
        missingMarker,
      ),
    ).toMatchObject({ owned: "drifted", reason: "owned-value-drift" });
    expect(() => normalizeCargoEol(missingMarker, attribution)).toThrow();

    const changedMarker = generated.replace(
      eolMarker,
      "# <pumarejo:cargo-eol:crlf>",
    );
    expect(
      evaluateAttributedEntry(
        entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
        changedMarker,
      ),
    ).toMatchObject({ owned: "drifted", reason: "owned-value-drift" });

    const duplicatedMarker = generated.replace(
      `${eolMarker}\n`,
      `${eolMarker}\n${eolMarker}\n`,
    );
    expect(
      evaluateAttributedEntry(
        entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
        duplicatedMarker,
      ),
    ).toMatchObject({ owned: "drifted", reason: "owned-value-drift" });
  });

  it("requires the exact created dependency marker and inline declaration", () => {
    const original =
      '[package]\nname = "fixture"\n\n[dependencies]\n\n[features]\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);

    const foreignKey = generated.replace(
      "optional = true }",
      'optional = true, registry = "foreign" }',
    );
    expect(
      evaluateAttributedEntry(
        {
          ...entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
          afterHash: contentHash(foreignKey),
        },
        foreignKey,
      ),
    ).toMatchObject({ owned: "drifted", reason: "owned-value-drift" });

    const missingMarker = generated.replace(
      "# <pumarejo:cargo-dependency>\n",
      "",
    );
    expect(
      evaluateAttributedEntry(
        {
          ...entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
          afterHash: contentHash(missingMarker),
        },
        missingMarker,
      ),
    ).toMatchObject({ owned: "drifted", reason: "owned-value-drift" });

    expect(attribution).toContain(CARGO_DEPENDENCY_ATTRIBUTION);
  });

  it("keeps a pre-existing exact registry dependency attributable only to the added path", () => {
    const original = `[package]\nname = "fixture"\n\n[dependencies]\ntauri-plugin-wdio-webdriver = { version = "1.2.0", optional = true }\n\n[features]\ne2e-wdio = ["dep:tauri-plugin-wdio-webdriver"]\n`;
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);
    expect(attribution).toContain(CARGO_DEPENDENCY_PATH_ATTRIBUTION);
    expect(generated).toContain(
      '# <pumarejo:cargo-dependency-path>\ntauri-plugin-wdio-webdriver = { path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", version = "1.2.0", optional = true }',
    );
    expect(generated).toContain(
      'e2e-wdio = ["dep:tauri-plugin-wdio-webdriver"]',
    );
    expect(planCargoRemoval(generated, attribution)).toBe(original);

    const manifestEntry = entry(
      "cargo",
      "src-tauri/Cargo.toml",
      generated,
      attribution,
    );
    expectIntact(evaluateAttributedEntry(manifestEntry, generated), true);
    expect(
      evaluateAttributedEntry(
        {
          ...manifestEntry,
          afterHash: contentHash(
            generated.replace(
              'path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", ',
              'path = "../foreign", ',
            ),
          ),
        },
        generated.replace(
          'path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", ',
          'path = "../foreign", ',
        ),
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });

  it("uses CRLF for both created Cargo marker payloads", () => {
    const original =
      '[package]\r\nname = "fixture"\r\n\r\n[dependencies]\r\n\r\n[features]\r\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);

    expect(generated).toContain(
      '# <pumarejo:cargo-dependency>\r\ntauri-plugin-wdio-webdriver = { path = "../.pumarejo/provider/tauri-plugin-wdio-webdriver", version = "1", optional = true }',
    );
    expect(generated).toContain(
      '# <pumarejo:cargo-feature-created>\r\npumarejo = ["dep:tauri-plugin-wdio-webdriver"]',
    );
    expect(planCargoRemoval(generated, attribution)).toBe(original);
  });

  it("restores attributed CRLF after external whole-file LF normalization", () => {
    const original =
      '[package]\r\nname = "fixture"\r\n\r\n[dependencies]\r\n\r\n[features]\r\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);
    const normalized = generated.replaceAll("\r\n", "\n");

    expect(attribution).toContain(CARGO_EOL_CRLF_ATTRIBUTION);
    expect(planCargoRemoval(normalized, attribution)).toBe(original);
    expectIntact(
      evaluateAttributedEntry(
        entry("cargo", "src-tauri/Cargo.toml", generated, attribution),
        normalized,
      ),
      false,
    );
  });

  it("does not attribute or normalize mixed Cargo EOLs", () => {
    const original =
      '[package]\r\nname = "fixture"\n\r\n[dependencies]\n\r\n[features]\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);

    expect(attribution).not.toEqual(
      expect.arrayContaining([
        CARGO_EOL_LF_ATTRIBUTION,
        CARGO_EOL_CRLF_ATTRIBUTION,
      ]),
    );
    expect(planCargoRemoval(generated, attribution)).toBe(original);
  });

  it("fails closed for malformed EOL attribution and mixed normalized input", () => {
    const original =
      '[package]\r\nname = "fixture"\r\n\r\n[dependencies]\r\n\r\n[features]\r\n';
    const generated = planCargoEdit(original);
    const attribution = cargoIntegrationAttribution(original);
    const mixed = generated.replace("\r\nname", "\nname");

    expect(() => planCargoRemoval(mixed, attribution)).toThrow();
    expect(
      evaluateAttributedEntry(
        entry("cargo", "src-tauri/Cargo.toml", generated, [
          ...attribution,
          CARGO_EOL_LF_ATTRIBUTION,
        ]),
        generated,
      ),
    ).toMatchObject({ owned: "drifted" });
    expect(
      evaluateAttributedEntry(
        entry("cargo", "src-tauri/Cargo.toml", generated, [
          ...attribution,
          "eol:cargo:unsupported",
        ]),
        generated,
      ),
    ).toMatchObject({ owned: "drifted" });
  });

  it("requires one exact ignore block while preserving surrounding rules", () => {
    const generated =
      "dist/\n# <pumarejo:begin>\n/.pumarejo/\n# <pumarejo:end>\n";
    const manifestEntry = entry("ignore", ".gitignore", generated, [
      "marker:<pumarejo:begin>",
      "ignore:/.pumarejo/",
    ]);
    expectIntact(
      evaluateAttributedEntry(manifestEntry, `${generated}coverage/\n`),
      false,
    );
    const duplicated = `${generated}# <pumarejo:begin>\n/.pumarejo/\n# <pumarejo:end>\n`;
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(duplicated) },
        duplicated,
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });

  it("requires the exact isolated capability shape and permission order", () => {
    const generated = `${JSON.stringify(agentCapability("main"), null, 2)}\n`;
    const manifestEntry = entry(
      "capability",
      ".pumarejo/agent-capability.json",
      generated,
      [
        "derived-from:src-tauri/capabilities/default.json",
        ...AGENT_PERMISSIONS.map((permission) => `permission:${permission}`),
      ],
    );
    expectIntact(
      evaluateAttributedEntry(manifestEntry, generated, {
        expectedWindow: "main",
      }),
      true,
    );
    const expanded = `${JSON.stringify(
      { ...agentCapability("main"), remote: true },
      null,
      2,
    )}\n`;
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(expanded) },
        expanded,
        { expectedWindow: "main" },
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });

    const duplicateKey = generated.replace(
      '"identifier": "pumarejo-agent",',
      '"identifier": "forged",\n  "identifier": "pumarejo-agent",',
    );
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(duplicateKey) },
        duplicateKey,
        { expectedWindow: "main" },
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });

  it("checks only integration-owned config coupling", () => {
    const config = {
      version: 1,
      launch: {
        command: "pnpm",
        args: [
          "tauri",
          "dev",
          "--features",
          "pumarejo",
          "--config",
          "{tauriConfig}",
        ],
      },
      window: "main",
      artifactsDirectory: ".pumarejo/artifacts",
      retainArtifacts: false,
    };
    const generated = `${JSON.stringify(config, null, 2)}\n`;
    const manifestEntry = entry("config", ".pumarejo.json", generated, [
      "created:.pumarejo.json",
    ]);
    const userEdited = `${JSON.stringify(
      {
        ...config,
        launch: { ...config.launch, command: "npm" },
        webdriverPort: 4444,
      },
      null,
      2,
    )}\n`;
    expectIntact(
      evaluateAttributedEntry(manifestEntry, userEdited, {
        expectedWindow: "main",
      }),
      false,
    );
    const changed = `${JSON.stringify(
      { ...config, artifactsDirectory: "other" },
      null,
      2,
    )}\n`;
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(changed) },
        changed,
        { expectedWindow: "main" },
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });

    const duplicateOwnedField = generated.replace(
      '"version": 1,',
      '"version": 2,\n  "version": 1,',
    );
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(duplicateOwnedField) },
        duplicateOwnedField,
        { expectedWindow: "main" },
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });

  it("accepts the current block that commits the provider copy", () => {
    const generated = `dist/\n${IGNORE_BLOCK}`;
    const manifestEntry = entry("ignore", ".gitignore", generated, [
      "marker:<pumarejo:begin>",
      "ignore:/.pumarejo/",
    ]);
    expectIntact(
      evaluateAttributedEntry(manifestEntry, `${generated}coverage/\n`),
      false,
    );
    const edited = generated.replace("!/.pumarejo/provider/\n", "");
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, afterHash: contentHash(edited) },
        edited,
      ),
    ).toMatchObject({ owned: "drifted" });
  });

  it("fails closed for missing files, unsafe identities, and forged attribution", () => {
    const source = "# <pumarejo:begin>\n/.pumarejo/\n# <pumarejo:end>\n";
    const manifestEntry = entry("ignore", "../.gitignore", source, [
      "marker:<pumarejo:begin>",
      "ignore:/.pumarejo/",
    ]);
    expect(evaluateAttributedEntry(manifestEntry, source)).toMatchObject({
      owned: "drifted",
      hashMatched: true,
    });
    expect(evaluateAttributedEntry(manifestEntry, null)).toMatchObject({
      owned: "drifted",
      hashMatched: false,
      reason: "missing-source",
    });
    expect(
      evaluateAttributedEntry(
        { ...manifestEntry, relativePath: ".gitignore", attribution: [] },
        source,
      ),
    ).toMatchObject({ owned: "drifted", hashMatched: true });
  });
});
