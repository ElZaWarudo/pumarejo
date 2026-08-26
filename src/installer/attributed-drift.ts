import { parse as parseToml } from "smol-toml";

import { AGENT_PERMISSIONS } from "./capabilities.js";
import {
  CARGO_DEPENDENCY_ATTRIBUTION,
  CARGO_DEPENDENCY_PATH_ATTRIBUTION,
  CARGO_EOL_CRLF_ATTRIBUTION,
  CARGO_EOL_LF_ATTRIBUTION,
  CARGO_FEATURE_CREATED_ATTRIBUTION,
  CARGO_FEATURE_VALUE_ATTRIBUTION,
  assertCargoEolBinding,
  isSupportedProviderVersion,
} from "./cargo.js";
import { contentHash, type IntegrationManifestChange } from "./manifest.js";
import { planRustRemoval, rustWrappedBuilderOccurrences } from "./rust.js";
import { TAURI_WEBDRIVER_PLUGIN_VERSION } from "../version.js";
import {
  PROVIDER_CARGO_PATH,
  PROVIDER_KIND,
  PROVIDER_STAGED_ROOT,
  providerSourcePathFromAttribution,
} from "./provider-source.js";

const DEPENDENCY_NAME = "tauri-plugin-wdio-webdriver";
const FEATURE_VALUE = `dep:${DEPENDENCY_NAME}`;
const RUST_MARKER_BEGIN = "// <pumarejo:begin>";
const RUST_MARKER_END = "// <pumarejo:end>";
const IGNORE_ENTRY = "/.pumarejo/";
const IGNORE_MARKER_BEGIN = "# <pumarejo:begin>";
const IGNORE_MARKER_END = "# <pumarejo:end>";
const CONFIG_CREATED_ATTRIBUTION = "created:.pumarejo.json";
const CONFIG_ATTRIBUTION = [
  "field:version",
  "field:window",
  "field:artifactsDirectory",
  "field:retainArtifacts",
  "launch:feature:pumarejo",
  "launch:config-placeholder",
] as const;

type UnknownRecord = Record<string, unknown>;

export type AttributedDriftReason =
  | "intact"
  | "hash-mismatch-unrelated"
  | "missing-source"
  | "unsafe-path"
  | "malformed-source"
  | "invalid-attribution"
  | "owned-marker-drift"
  | "owned-field-drift"
  | "owned-value-drift"
  | "unsupported-entry";

export interface AttributedDriftResult {
  readonly owned: "intact" | "drifted";
  readonly hashMatched: boolean;
  readonly reason: AttributedDriftReason;
}

export interface AttributedDriftOptions {
  /** The project-detected label, never a value derived from the full-file hash. */
  readonly expectedWindow?: string;
}

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function parseJsonWithoutDuplicateKeys(source: string): unknown {
  let index = 0;
  const whitespace = () => {
    while (/\s/u.test(source[index] ?? "")) index += 1;
  };
  const parseString = (): string => {
    if (source[index] !== '"') throw new Error("expected JSON string");
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index)) as string;
      } else {
        index += 1;
      }
    }
    throw new Error("unterminated JSON string");
  };
  const parseValue = (depth: number): void => {
    if (depth > 128) throw new Error("JSON nesting limit exceeded");
    whitespace();
    if (source[index] === "{") {
      index += 1;
      whitespace();
      const keys = new Set<string>();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error("duplicate JSON key");
        keys.add(key);
        whitespace();
        if (source[index] !== ":") throw new Error("expected JSON colon");
        index += 1;
        parseValue(depth + 1);
        whitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("expected JSON comma");
        index += 1;
      }
      throw new Error("unterminated JSON object");
    }
    if (source[index] === "[") {
      index += 1;
      whitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue(depth + 1);
        whitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("expected JSON comma");
        index += 1;
      }
      throw new Error("unterminated JSON array");
    }
    if (source[index] === '"') {
      parseString();
      return;
    }
    const scalar =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
        source.slice(index),
      )?.[0];
    if (scalar === undefined) throw new Error("invalid JSON value");
    index += scalar.length;
  };
  parseValue(0);
  whitespace();
  if (index !== source.length) throw new Error("trailing JSON content");
  return JSON.parse(source) as unknown;
}

function result(
  entry: IntegrationManifestChange,
  source: string | null,
  owned: boolean,
  reason: AttributedDriftReason,
): AttributedDriftResult {
  const hashMatched =
    source !== null && contentHash(source) === entry.afterHash;
  return {
    owned: owned ? "intact" : "drifted",
    hashMatched,
    reason: owned
      ? hashMatched
        ? "intact"
        : "hash-mismatch-unrelated"
      : reason,
  };
}

function exactAttribution(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function capabilityAttributionIntact(attribution: readonly string[]): boolean {
  return (
    attribution.length === AGENT_PERMISSIONS.length + 1 &&
    /^derived-from:src-tauri\/capabilities\/[^/]+\.(?:json|toml)$/u.test(
      attribution[0] ?? "",
    ) &&
    AGENT_PERMISSIONS.every(
      (permission, index) =>
        attribution[index + 1] === `permission:${permission}`,
    )
  );
}

function rustProjectionIntact(source: string): boolean {
  if (
    source.split(RUST_MARKER_BEGIN).length - 1 !== 1 ||
    source.split(RUST_MARKER_END).length - 1 !== 1 ||
    rustWrappedBuilderOccurrences(source) !== 1
  ) {
    return false;
  }
  try {
    // planRustRemoval contains the canonical generated helper and wrapper shape.
    // The executable occurrence check above prevents a comment/string from
    // satisfying the wrapper occurrence check.
    planRustRemoval(source);
    return true;
  } catch {
    return false;
  }
}

function cargoProjectionIntact(
  source: string,
  attribution: readonly string[],
): boolean {
  const known = new Set([
    CARGO_DEPENDENCY_ATTRIBUTION,
    CARGO_DEPENDENCY_PATH_ATTRIBUTION,
    CARGO_EOL_LF_ATTRIBUTION,
    CARGO_EOL_CRLF_ATTRIBUTION,
    CARGO_FEATURE_CREATED_ATTRIBUTION,
    CARGO_FEATURE_VALUE_ATTRIBUTION,
  ]);
  if (
    attribution.length === 0 ||
    new Set(attribution).size !== attribution.length ||
    attribution.some((value) => !known.has(value)) ||
    (attribution.includes(CARGO_FEATURE_CREATED_ATTRIBUTION) &&
      attribution.includes(CARGO_FEATURE_VALUE_ATTRIBUTION))
  ) {
    return false;
  }
  const eolAttribution = attribution.filter((value) =>
    value.startsWith("eol:cargo:"),
  );
  if (eolAttribution.length > 1) return false;

  try {
    const cargo = record(parseToml(source));
    const dependencies = record(cargo?.dependencies);
    const dependency = record(dependencies?.[DEPENDENCY_NAME]);
    const features = record(cargo?.features);
    const feature = features?.pumarejo;
    const hasCreatedDependency = attribution.includes(
      CARGO_DEPENDENCY_ATTRIBUTION,
    );
    const hasAddedPath = attribution.includes(
      CARGO_DEPENDENCY_PATH_ATTRIBUTION,
    );
    if (hasCreatedDependency === hasAddedPath) {
      return false;
    }
    if (hasCreatedDependency) {
      if (
        dependency?.optional !== true ||
        !isSupportedProviderVersion(dependency.version) ||
        dependency.path !== PROVIDER_CARGO_PATH ||
        Object.keys(dependency).sort().join(",") !== "optional,path,version"
      ) {
        return false;
      }
      const marker = "# <pumarejo:cargo-dependency>";
      const canonicalLine = `tauri-plugin-wdio-webdriver = { path = "${PROVIDER_CARGO_PATH}", version = "${TAURI_WEBDRIVER_PLUGIN_VERSION}", optional = true }`;
      const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const escapedLine = canonicalLine.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const generatedDependency = new RegExp(
        `^${escapedMarker}\\r?\\n${escapedLine}(?:\\r?\\n|$)`,
        "gmu",
      );
      if (
        source.split(marker).length - 1 !== 1 ||
        [...source.matchAll(generatedDependency)].length !== 1
      ) {
        return false;
      }
    }
    if (hasAddedPath) {
      if (
        dependency?.optional !== true ||
        !isSupportedProviderVersion(dependency.version) ||
        dependency.path !== PROVIDER_CARGO_PATH ||
        Object.keys(dependency).sort().join(",") !== "optional,path,version"
      ) {
        return false;
      }
      const marker = "# <pumarejo:cargo-dependency-path>";
      const markerCount = source.split(marker).length - 1;
      const escapedPath = PROVIDER_CARGO_PATH.replace(
        /[.*+?^${}()|[\]\\]/gu,
        "\\$&",
      );
      const pathLine = new RegExp(
        `^([ \\t]*${DEPENDENCY_NAME}[ \\t]*=[ \\t]*\\{) path = "${escapedPath}", ([^{}\\r\\n]*\\})([ \\t]*(?:#.*)?)$`,
        "gmu",
      );
      if (markerCount !== 1 || [...source.matchAll(pathLine)].length !== 1) {
        return false;
      }
    }
    try {
      assertCargoEolBinding(source, attribution);
    } catch {
      return false;
    }
    if (attribution.includes(CARGO_FEATURE_CREATED_ATTRIBUTION)) {
      if (
        !Array.isArray(feature) ||
        feature.length !== 1 ||
        feature[0] !== FEATURE_VALUE
      ) {
        return false;
      }
      const sectionMarker = "# <pumarejo:cargo-feature-section-created>";
      const sectionMarkerCount = source.split(sectionMarker).length - 1;
      if (sectionMarkerCount > 1) return false;
    }
    if (attribution.includes(CARGO_FEATURE_VALUE_ATTRIBUTION)) {
      if (!Array.isArray(feature) || !feature.includes(FEATURE_VALUE)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function ignoreProjectionIntact(source: string): boolean {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const begins = lines.filter((line) => line === IGNORE_MARKER_BEGIN).length;
  const ends = lines.filter((line) => line === IGNORE_MARKER_END).length;
  if (begins !== 1 || ends !== 1) {
    return false;
  }
  const begin = lines.indexOf(IGNORE_MARKER_BEGIN);
  return (
    lines[begin + 1] === IGNORE_ENTRY && lines[begin + 2] === IGNORE_MARKER_END
  );
}

function capabilityProjectionIntact(
  source: string,
  expectedWindow: string | undefined,
): boolean {
  if (expectedWindow === undefined) {
    return false;
  }
  try {
    const capability = record(parseJsonWithoutDuplicateKeys(source));
    if (capability === undefined) {
      return false;
    }
    const keys = Object.keys(capability);
    if (
      keys.length !== 3 ||
      !keys.every((key) =>
        ["identifier", "windows", "permissions"].includes(key),
      ) ||
      capability.identifier !== "pumarejo-agent"
    ) {
      return false;
    }
    const windows = capability.windows;
    const permissions = capability.permissions;
    return (
      Array.isArray(windows) &&
      windows.length === 1 &&
      windows[0] === expectedWindow &&
      Array.isArray(permissions) &&
      permissions.length === AGENT_PERMISSIONS.length &&
      permissions.every(
        (permission, index) => permission === AGENT_PERMISSIONS[index],
      )
    );
  } catch {
    return false;
  }
}

function hasPair(
  args: readonly unknown[],
  first: string,
  second: string,
): boolean {
  return (
    args.filter((value) => value === first).length === 1 &&
    args.filter((value) => value === second).length === 1 &&
    args.some((value, index) => value === first && args[index + 1] === second)
  );
}

function configProjectionIntact(
  source: string,
  attribution: readonly string[],
  expectedWindow: string | undefined,
): boolean {
  const isLegacy =
    attribution.length === 1 && attribution[0] === CONFIG_CREATED_ATTRIBUTION;
  const isCanonical =
    attribution.length === CONFIG_ATTRIBUTION.length &&
    attribution.every((value, index) => value === CONFIG_ATTRIBUTION[index]);
  if (!isLegacy && !isCanonical) {
    return false;
  }
  try {
    const config = record(parseJsonWithoutDuplicateKeys(source));
    const launch = record(config?.launch);
    const args = launch?.args;
    if (config === undefined || launch === undefined || !Array.isArray(args)) {
      return false;
    }
    const fields = new Set(isLegacy ? CONFIG_ATTRIBUTION : attribution);
    if (fields.has("field:version") && config.version !== 1) return false;
    if (
      fields.has("field:window") &&
      (expectedWindow === undefined || config.window !== expectedWindow)
    ) {
      return false;
    }
    if (
      fields.has("field:artifactsDirectory") &&
      config.artifactsDirectory !== ".pumarejo/artifacts"
    ) {
      return false;
    }
    if (
      fields.has("field:retainArtifacts") &&
      config.retainArtifacts !== false
    ) {
      return false;
    }
    if (
      fields.has("launch:feature:pumarejo") &&
      !hasPair(args, "--features", "pumarejo")
    ) {
      return false;
    }
    if (
      fields.has("launch:config-placeholder") &&
      !hasPair(args, "--config", "{tauriConfig}")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function evaluateAttributedEntry(
  entry: IntegrationManifestChange,
  source: string | null,
  options: AttributedDriftOptions = {},
): AttributedDriftResult {
  if (source === null) {
    return result(entry, source, false, "missing-source");
  }

  let intact = false;
  switch (entry.kind) {
    case "rust":
      intact =
        /^src-tauri\/src\/(?:lib|main)\.rs$/u.test(entry.relativePath) &&
        exactAttribution(entry.attribution, [
          "marker:<pumarejo:begin>",
          "wrapper:pumarejo_builder",
        ]) &&
        rustProjectionIntact(source);
      break;
    case "cargo":
      intact =
        entry.relativePath === "src-tauri/Cargo.toml" &&
        cargoProjectionIntact(source, entry.attribution);
      break;
    case "ignore":
      intact =
        entry.relativePath === ".gitignore" &&
        exactAttribution(entry.attribution, [
          "marker:<pumarejo:begin>",
          "ignore:/.pumarejo/",
        ]) &&
        ignoreProjectionIntact(source);
      break;
    case "capability":
      intact =
        entry.relativePath === ".pumarejo/agent-capability.json" &&
        capabilityAttributionIntact(entry.attribution) &&
        capabilityProjectionIntact(source, options.expectedWindow);
      break;
    case "config":
      intact =
        entry.relativePath === ".pumarejo.json" &&
        configProjectionIntact(
          source,
          entry.attribution,
          options.expectedWindow,
        );
      break;
    case PROVIDER_KIND:
      intact =
        entry.relativePath.startsWith(`${PROVIDER_STAGED_ROOT}/`) &&
        providerSourcePathFromAttribution(entry.attribution) !== undefined;
      break;
    default:
      return result(entry, source, false, "unsupported-entry");
  }
  return result(entry, source, intact, intact ? "intact" : "owned-value-drift");
}
