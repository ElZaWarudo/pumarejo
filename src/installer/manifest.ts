import { createHash } from "node:crypto";

import { TAURI_WEBDRIVER_PLUGIN_VERSION, VERSION } from "../version.js";
import {
  isExternalProviderCargoPath,
  PROVIDER_ATTRIBUTION_PREFIX,
  PROVIDER_CARGO_PATH,
  PROVIDER_KIND,
  PROVIDER_SOURCE_ALLOWLIST,
  PROVIDER_STAGED_ROOT,
} from "./provider-source.js";

export const INTEGRATION_MANIFEST_RELATIVE_PATH =
  ".pumarejo/integration-manifest.json";

export type IntegrationChangeKind =
  | "cargo"
  | "rust"
  | "capability"
  | "ignore"
  | "config"
  | typeof PROVIDER_KIND;

export interface IntegrationManifestChange {
  readonly relativePath: string;
  readonly kind: IntegrationChangeKind;
  readonly beforeHash: string | null;
  readonly afterHash: string;
  readonly attribution: readonly string[];
}

export interface IntegrationManifestV1 {
  readonly version: 1;
  readonly state: "applying" | "applied" | "removing";
  readonly changes: readonly IntegrationManifestChange[];
}

/**
 * A provider the project references in place (for example from a git
 * submodule) instead of a copy staged under .pumarejo/provider. `cargoPath` is
 * the Cargo path dependency, relative to src-tauri.
 */
export interface ExternalProviderReference {
  readonly source: "external";
  readonly cargoPath: string;
}

export interface IntegrationManifestV2 {
  readonly version: 2;
  readonly pumarejoVersion: string;
  readonly pluginVersion: string;
  readonly provider?: ExternalProviderReference;
  readonly state: "applying" | "applied" | "removing";
  readonly changes: readonly IntegrationManifestChange[];
}

export type IntegrationManifest = IntegrationManifestV1 | IntegrationManifestV2;

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function createIntegrationManifest(
  changes: readonly IntegrationManifestChange[],
  state: IntegrationManifest["state"],
  provider?: ExternalProviderReference,
): IntegrationManifestV2 {
  return {
    version: 2,
    pumarejoVersion: VERSION,
    pluginVersion: TAURI_WEBDRIVER_PLUGIN_VERSION,
    ...(provider === undefined
      ? {}
      : {
          provider: { source: provider.source, cargoPath: provider.cargoPath },
        }),
    state,
    changes,
  };
}

/** The external provider a manifest references, if any. */
export function externalProvider(
  manifest: IntegrationManifest,
): ExternalProviderReference | undefined {
  return manifest.version === 2 ? manifest.provider : undefined;
}

/** The Cargo path dependency a manifest's integration expects. */
export function providerCargoPath(manifest: IntegrationManifest): string {
  return externalProvider(manifest)?.cargoPath ?? PROVIDER_CARGO_PATH;
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
    ![1, 2].includes(Number((parsed as { version?: unknown }).version)) ||
    !["applying", "applied", "removing"].includes(
      String((parsed as { state?: unknown }).state),
    ) ||
    !Array.isArray((parsed as { changes?: unknown }).changes)
  ) {
    throw new Error("Invalid integration manifest.");
  }
  const version = (parsed as { version: 1 | 2 }).version;
  if (
    version === 2 &&
    (typeof (parsed as { pumarejoVersion?: unknown }).pumarejoVersion !==
      "string" ||
      typeof (parsed as { pluginVersion?: unknown }).pluginVersion !== "string")
  ) {
    throw new Error("Invalid integration manifest.");
  }
  const rawProvider = (parsed as { provider?: unknown }).provider;
  let provider: ExternalProviderReference | undefined;
  if (rawProvider !== undefined) {
    if (
      version !== 2 ||
      typeof rawProvider !== "object" ||
      rawProvider === null ||
      Object.keys(rawProvider).sort().join(",") !== "cargoPath,source" ||
      (rawProvider as { source?: unknown }).source !== "external" ||
      !isExternalProviderCargoPath(
        (rawProvider as { cargoPath?: unknown }).cargoPath,
      )
    ) {
      throw new Error("Invalid integration manifest provider.");
    }
    provider = {
      source: "external",
      cargoPath: (rawProvider as { cargoPath: string }).cargoPath,
    };
  }

  const changes = (parsed as { changes: unknown[] }).changes.map((change) => {
    if (
      typeof change !== "object" ||
      change === null ||
      typeof (change as { relativePath?: unknown }).relativePath !== "string" ||
      ![
        "cargo",
        "rust",
        "capability",
        "ignore",
        "config",
        PROVIDER_KIND,
      ].includes(String((change as { kind?: unknown }).kind)) ||
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

  const state = (parsed as { state: IntegrationManifest["state"] }).state;
  return version === 1
    ? { version, state, changes }
    : {
        version,
        pumarejoVersion: (parsed as { pumarejoVersion: string })
          .pumarejoVersion,
        pluginVersion: (parsed as { pluginVersion: string }).pluginVersion,
        ...(provider === undefined ? {} : { provider }),
        state,
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

export function providerManifestEntries(
  changes: readonly IntegrationManifestChange[],
): readonly IntegrationManifestChange[] {
  return changes.filter((entry) => entry.kind === PROVIDER_KIND);
}

export function validateProviderManifestEntries(
  changes: readonly IntegrationManifestChange[],
): void {
  const entries = providerManifestEntries(changes);
  if (entries.length === 0) return;
  if (entries.length !== PROVIDER_SOURCE_ALLOWLIST.length) {
    throw new Error("Provider manifest is incomplete.");
  }
  const expected = PROVIDER_SOURCE_ALLOWLIST.map(
    (sourceRelativePath: string) =>
      `${PROVIDER_STAGED_ROOT}/${sourceRelativePath}`,
  );
  const actual = entries.map((entry) => entry.relativePath);
  if (
    actual.some((path, index) => path !== expected[index]) ||
    entries.some(
      (entry, index) =>
        entry.beforeHash !== null ||
        entry.attribution.length !== 1 ||
        entry.attribution[0] !==
          `${PROVIDER_ATTRIBUTION_PREFIX}${PROVIDER_SOURCE_ALLOWLIST[index]}`,
    )
  ) {
    throw new Error("Provider manifest is not canonical.");
  }
}
