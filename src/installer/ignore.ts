// Runtime state stays ignored; the provider copy, integration manifest, and
// agent capability are committed so teammates and CI can build the project.
export const IGNORE_ENTRIES = [
  "/.pumarejo/*",
  "!/.pumarejo/provider/",
  "!/.pumarejo/integration-manifest.json",
  "!/.pumarejo/agent-capability.json",
] as const;

export const IGNORE_BLOCK = `# <pumarejo:begin>
${IGNORE_ENTRIES.join("\n")}
# <pumarejo:end>
`;

/** Entries written by earlier releases, which ignored the whole directory. */
export const LEGACY_IGNORE_ENTRIES = ["/.pumarejo/"] as const;

export const LEGACY_IGNORE_BLOCK = `# <pumarejo:begin>
${LEGACY_IGNORE_ENTRIES.join("\n")}
# <pumarejo:end>
`;
