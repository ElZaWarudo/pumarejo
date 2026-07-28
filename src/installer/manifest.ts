import { createHash } from "node:crypto";

export const INTEGRATION_MANIFEST_RELATIVE_PATH =
  ".tauri-agent/integration-manifest.json";

export type IntegrationChangeKind =
  | "cargo"
  | "rust"
  | "capability"
  | "ignore"
  | "config";

export interface IntegrationManifestChange {
  readonly relativePath: string;
  readonly kind: IntegrationChangeKind;
  readonly beforeHash: string | null;
  readonly afterHash: string;
  readonly attribution: readonly string[];
}

export interface IntegrationManifest {
  readonly version: 1;
  readonly state: "applying" | "applied" | "removing";
  readonly changes: readonly IntegrationManifestChange[];
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function createIntegrationManifest(
  changes: readonly IntegrationManifestChange[],
  state: IntegrationManifest["state"],
): IntegrationManifest {
  return { version: 1, state, changes };
}

export function serializeIntegrationManifest(
  manifest: IntegrationManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseIntegrationManifest(source: string): IntegrationManifest {
  const isHash = (value: unknown): value is string =>
    typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
  const parsed: unknown = JSON.parse(source);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    !["applying", "applied", "removing"].includes(
      String((parsed as { state?: unknown }).state),
    ) ||
    !Array.isArray((parsed as { changes?: unknown }).changes)
  ) {
    throw new Error("Invalid integration manifest.");
  }

  const changes = (parsed as { changes: unknown[] }).changes.map((change) => {
    if (
      typeof change !== "object" ||
      change === null ||
      typeof (change as { relativePath?: unknown }).relativePath !== "string" ||
      !["cargo", "rust", "capability", "ignore", "config"].includes(
        String((change as { kind?: unknown }).kind),
      ) ||
      !(
        (change as { beforeHash?: unknown }).beforeHash === null ||
        isHash((change as { beforeHash?: unknown }).beforeHash)
      ) ||
      !isHash((change as { afterHash?: unknown }).afterHash) ||
      !Array.isArray((change as { attribution?: unknown }).attribution) ||
      !(change as { attribution: unknown[] }).attribution.every(
        (value) => typeof value === "string",
      )
    ) {
      throw new Error("Invalid integration manifest change.");
    }
    const value = change as IntegrationManifestChange;
    return {
      relativePath: value.relativePath,
      kind: value.kind,
      beforeHash: value.beforeHash,
      afterHash: value.afterHash,
      attribution: [...value.attribution],
    };
  });

  return {
    version: 1,
    state: (parsed as { state: IntegrationManifest["state"] }).state,
    changes,
  };
}

export function parseCanonicalIntegrationManifest(
  source: string,
): IntegrationManifest {
  const manifest = parseIntegrationManifest(source);
  if (serializeIntegrationManifest(manifest) !== source) {
    throw new Error("Integration manifest is not canonical.");
  }
  return manifest;
}
