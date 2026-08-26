import { parse as parseToml } from "smol-toml";

import { IntegrationPlanError } from "./plan-error.js";
import { TAURI_WEBDRIVER_PLUGIN_VERSION } from "../version.js";
import { PROVIDER_CARGO_PATH } from "./provider-source.js";

const DEPENDENCY_NAME = "tauri-plugin-wdio-webdriver";
const FEATURE_NAME = "pumarejo";
const FEATURE_VALUE = `dep:${DEPENDENCY_NAME}`;
const DEPENDENCY_MARKER = "# <pumarejo:cargo-dependency>";
const DEPENDENCY_PATH_MARKER = "# <pumarejo:cargo-dependency-path>";
const EOL_MARKER_PREFIX = "# <pumarejo:cargo-eol:";
const EOL_MARKER_LF = `${EOL_MARKER_PREFIX}lf>`;
const EOL_MARKER_CRLF = `${EOL_MARKER_PREFIX}crlf>`;
const FEATURE_CREATED_MARKER = "# <pumarejo:cargo-feature-created>";
const FEATURE_SECTION_CREATED_MARKER =
  "# <pumarejo:cargo-feature-section-created>";
const FEATURE_VALUE_MARKER = "# <pumarejo:cargo-feature-value>";
const DEPENDENCY_VALUE = `{ path = "${PROVIDER_CARGO_PATH}", version = "${TAURI_WEBDRIVER_PLUGIN_VERSION}", optional = true }`;
const DEPENDENCY_PATH_VALUE = `path = "${PROVIDER_CARGO_PATH}"`;
const EXISTING_REGISTRY_VERSION = "1.2.0";
export const CARGO_DEPENDENCY_ATTRIBUTION =
  "dependency:tauri-plugin-wdio-webdriver:optional";
export const CARGO_DEPENDENCY_PATH_ATTRIBUTION =
  "dependency:tauri-plugin-wdio-webdriver:path-added";
export const CARGO_FEATURE_CREATED_ATTRIBUTION =
  "feature:pumarejo:created:dep:tauri-plugin-wdio-webdriver";
export const CARGO_FEATURE_VALUE_ATTRIBUTION =
  "feature:pumarejo:value:dep:tauri-plugin-wdio-webdriver";
export const CARGO_EOL_LF_ATTRIBUTION = "eol:cargo:lf";
export const CARGO_EOL_CRLF_ATTRIBUTION = "eol:cargo:crlf";

type CargoLineEnding = "lf" | "crlf";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function parseCargo(source: string): UnknownRecord {
  try {
    const parsed = parseToml(source);
    return record(parsed) ?? {};
  } catch (error) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID", { cause: error });
  }
}

function insertSectionValue(
  source: string,
  section: string,
  line: string,
): string {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const headerPattern = new RegExp(
    `^\\[${section.replace(".", "\\.")}\\]\\s*$`,
    "mu",
  );
  const match = headerPattern.exec(source);
  if (match === null) {
    const separator = source.endsWith(lineEnding)
      ? lineEnding
      : `${lineEnding}${lineEnding}`;
    return `${source}${separator}[${section}]${lineEnding}${line}${lineEnding}${lineEnding}`;
  }

  const afterHeader = match.index + match[0].length;
  const nextHeaderOffset = /^(\s*)\[[^\]]+\]\s*$/gmu;
  nextHeaderOffset.lastIndex = afterHeader;
  const nextHeader = nextHeaderOffset.exec(source);
  let insertionPoint = nextHeader?.index ?? source.length;
  if (
    insertionPoint > 0 &&
    source[insertionPoint - 1] === "\r" &&
    source[insertionPoint] === "\n"
  ) {
    insertionPoint += 1;
  }
  const before = source.slice(0, insertionPoint);
  const after = source.slice(insertionPoint);
  const prefix = /(?:\r\n|\n)$/u.test(before)
    ? before
    : `${before}${lineEnding}`;
  const result = `${prefix}${line}${lineEnding}${lineEnding}${after}`;
  return result;
}

function cargoLineEnding(source: string): CargoLineEnding | undefined {
  const hasCrLf = /\r\n/u.test(source);
  const hasLf = /(?<!\r)\n/u.test(source);
  const hasBareCr = /\r(?!\n)/u.test(source);
  if (hasBareCr || (hasCrLf && hasLf) || (!hasCrLf && !hasLf)) {
    return undefined;
  }
  return hasCrLf ? "crlf" : "lf";
}

function cargoEolAttribution(source: string): readonly string[] {
  const ending = cargoLineEnding(source);
  return ending === "lf"
    ? [CARGO_EOL_LF_ATTRIBUTION]
    : ending === "crlf"
      ? [CARGO_EOL_CRLF_ATTRIBUTION]
      : [];
}

function cargoEolFromAttribution(
  attribution: readonly string[],
): CargoLineEnding | undefined {
  const eolValues = attribution.filter((value) =>
    value.startsWith("eol:cargo:"),
  );
  if (eolValues.length > 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  if (eolValues.length === 0) return undefined;
  if (eolValues[0] === CARGO_EOL_LF_ATTRIBUTION) return "lf";
  if (eolValues[0] === CARGO_EOL_CRLF_ATTRIBUTION) return "crlf";
  throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
}

function cargoEolMarker(ending: CargoLineEnding): string {
  return ending === "lf" ? EOL_MARKER_LF : EOL_MARKER_CRLF;
}

function cargoEolMarkerLines(source: string): readonly string[] {
  return [...source.matchAll(/^# <pumarejo:cargo-eol:[^\r\n]*>$/gmu)].map(
    (match) => match[0],
  );
}

/**
 * Validates the bounded EOL projection before any readiness or removal work.
 * The marker is intentionally separate from the manifest token so swapping or
 * deleting either side cannot silently change the restoration target.
 */
export function assertCargoEolBinding(
  source: string,
  attribution: readonly string[],
): CargoLineEnding | undefined {
  const target = cargoEolFromAttribution(attribution);
  const current = cargoLineEnding(source);
  const markers = cargoEolMarkerLines(source);
  const expectedMarker =
    target === undefined ? undefined : cargoEolMarker(target);

  if (target === undefined) {
    if (current !== undefined || markers.length !== 0) {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
    return undefined;
  }

  if (
    current === undefined ||
    markers.length !== 1 ||
    markers[0] !== expectedMarker
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  return target;
}

export function normalizeCargoEol(
  source: string,
  attribution: readonly string[],
): string {
  const target = assertCargoEolBinding(source, attribution);
  const current = cargoLineEnding(source);
  if (target === undefined) return source;
  if (current === undefined) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  if (current === target) return source;
  const lf = source.replaceAll("\r\n", "\n");
  return target === "crlf" ? lf.replaceAll("\n", "\r\n") : lf;
}

function replaceFeatureLine(source: string, values: readonly string[]): string {
  const pattern = /^\s*pumarejo\s*=\s*\[[^\r\n]*\]\s*(?:#.*)?$/gmu;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new IntegrationPlanError("CARGO_FEATURE_AMBIGUOUS");
  }
  const serialized = values.map((value) => JSON.stringify(value)).join(", ");
  const original = matches[0][0];
  const indentation = /^\s*/u.exec(original)?.[0] ?? "";
  const comment = /\s+(#.*)$/u.exec(original)?.[1];
  return source.replace(
    pattern,
    `${indentation}${FEATURE_NAME} = [${serialized}]${comment === undefined ? "" : ` ${comment}`}`,
  );
}

export interface PlanCargoEditOptions {
  /** Permit the exact legacy registry form only during a proven upgrade. */
  readonly allowLegacyExternalDependency?: boolean;
  /** Permit a previously attributable local provider path during an upgrade. */
  readonly allowExistingProviderPath?: boolean;
}

function dependencyKeys(dependency: UnknownRecord): readonly string[] {
  return Object.keys(dependency).sort();
}

function isSupportedRegistryDependency(dependency: UnknownRecord): boolean {
  return (
    dependencyKeys(dependency).join(",") === "optional,version" &&
    dependency.optional === true &&
    dependency.version === EXISTING_REGISTRY_VERSION
  );
}

export function isSupportedProviderVersion(version: unknown): boolean {
  return (
    version === TAURI_WEBDRIVER_PLUGIN_VERSION ||
    version === EXISTING_REGISTRY_VERSION
  );
}

function isSupportedProviderPathDependency(dependency: UnknownRecord): boolean {
  return (
    dependencyKeys(dependency).join(",") === "optional,path,version" &&
    dependency.optional === true &&
    isSupportedProviderVersion(dependency.version) &&
    dependency.path === PROVIDER_CARGO_PATH
  );
}

function dependencyLineMatches(source: string): RegExpMatchArray | undefined {
  const pattern = new RegExp(
    `^([ \\t]*${DEPENDENCY_NAME}[ \\t]*=[ \\t]*\\{[^{}\\r\\n]*\\})([ \\t]*(?:#.*)?)$`,
    "gmu",
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) return undefined;
  return matches[0];
}

function ensureSingleInlineDependencyLine(source: string): RegExpMatchArray {
  const match = dependencyLineMatches(source);
  if (match === undefined) {
    throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
  }
  return match;
}

export function planCargoEdit(
  source: string,
  options: PlanCargoEditOptions = {},
): string {
  const cargo = parseCargo(source);
  const dependencies = record(cargo.dependencies);
  if (dependencies === undefined) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  const existingDependency = dependencies[DEPENDENCY_NAME];
  if (existingDependency !== undefined) {
    const dependency = record(existingDependency);
    if (dependency === undefined) {
      throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
    }
    if (isSupportedProviderPathDependency(dependency)) {
      if (options.allowExistingProviderPath !== true) {
        throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
      }
      ensureSingleInlineDependencyLine(source);
    } else if (isSupportedRegistryDependency(dependency)) {
      ensureSingleInlineDependencyLine(source);
      if (source.includes(DEPENDENCY_PATH_MARKER)) {
        throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
      }
    } else {
      throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
    }
  }

  let next = source;
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const sourceEol = cargoLineEnding(source);
  const sourceMarkers = cargoEolMarkerLines(source);
  if (
    sourceMarkers.length !== 0 &&
    (options.allowExistingProviderPath !== true ||
      sourceMarkers.length !== 1 ||
      ![EOL_MARKER_LF, EOL_MARKER_CRLF].includes(sourceMarkers[0]!))
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  if (existingDependency === undefined) {
    next = insertSectionValue(
      next,
      "dependencies",
      `${DEPENDENCY_MARKER}${lineEnding}${DEPENDENCY_NAME} = ${DEPENDENCY_VALUE}`,
    );
  } else {
    const dependency = record(existingDependency);
    if (dependency === undefined) {
      throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
    }
    if (isSupportedRegistryDependency(dependency)) {
      const match = ensureSingleInlineDependencyLine(source);
      const originalLine = match[1];
      const openingIndex = originalLine.indexOf("{");
      const addedLine = `${originalLine.slice(0, openingIndex + 1)} ${DEPENDENCY_PATH_VALUE},${originalLine.slice(openingIndex + 1)}${match[2]}`;
      next = source.replace(
        match[0],
        `${DEPENDENCY_PATH_MARKER}${lineEnding}${addedLine}`,
      );
    }
  }

  const features = record(cargo.features);
  const existingFeature = features?.[FEATURE_NAME];
  if (existingFeature === undefined) {
    next = insertSectionValue(
      next,
      "features",
      `${features === undefined ? `${FEATURE_SECTION_CREATED_MARKER}${lineEnding}` : ""}${FEATURE_CREATED_MARKER}${lineEnding}${FEATURE_NAME} = ["${FEATURE_VALUE}"]`,
    );
  } else {
    if (
      !Array.isArray(existingFeature) ||
      !existingFeature.every((value) => typeof value === "string")
    ) {
      throw new IntegrationPlanError("CARGO_FEATURE_AMBIGUOUS");
    }
    if (!existingFeature.includes(FEATURE_VALUE)) {
      const withValue = replaceFeatureLine(next, [
        ...existingFeature,
        FEATURE_VALUE,
      ]);
      const lineEnding = next.includes("\r\n") ? "\r\n" : "\n";
      next = withValue.replace(
        /^(\s*pumarejo\s*=)/mu,
        `${FEATURE_VALUE_MARKER}${lineEnding}$1`,
      );
    }
  }

  const validated = parseCargo(next);
  const validatedDependency = record(
    record(validated.dependencies)?.[DEPENDENCY_NAME],
  );
  const validatedFeature = record(validated.features)?.[FEATURE_NAME];
  if (
    validatedDependency?.optional !== true ||
    validatedDependency.path !== PROVIDER_CARGO_PATH ||
    !isSupportedProviderVersion(validatedDependency.version) ||
    !Array.isArray(validatedFeature) ||
    !validatedFeature.includes(FEATURE_VALUE)
  ) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  if (sourceEol !== undefined && sourceMarkers.length === 0) {
    next = `${cargoEolMarker(sourceEol)}${lineEnding}${next}`;
  }
  return next;
}

export function cargoPluginIntegration(source: string): {
  readonly registered: boolean;
  readonly version?: string;
  readonly path?: string;
} {
  const cargo = parseCargo(source);
  const dependency = record(record(cargo.dependencies)?.[DEPENDENCY_NAME]);
  const feature = record(cargo.features)?.[FEATURE_NAME];
  return {
    registered:
      dependency?.optional === true &&
      Array.isArray(feature) &&
      feature.includes(FEATURE_VALUE),
    ...(typeof dependency?.version === "string"
      ? { version: dependency.version }
      : {}),
    ...(typeof dependency?.path === "string" ? { path: dependency.path } : {}),
  };
}

export function cargoIntegrationAttribution(source: string): readonly string[] {
  const cargo = parseCargo(source);
  const dependencies = record(cargo.dependencies);
  if (dependencies === undefined) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  const dependency = record(dependencies[DEPENDENCY_NAME]);
  let dependencyAttribution: string;
  if (dependencies[DEPENDENCY_NAME] === undefined) {
    dependencyAttribution = CARGO_DEPENDENCY_ATTRIBUTION;
  } else if (
    dependency !== undefined &&
    isSupportedRegistryDependency(dependency)
  ) {
    ensureSingleInlineDependencyLine(source);
    if (source.includes(DEPENDENCY_PATH_MARKER)) {
      throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
    }
    dependencyAttribution = CARGO_DEPENDENCY_PATH_ATTRIBUTION;
  } else {
    throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
  }
  const feature = record(cargo.features)?.[FEATURE_NAME];
  return [
    dependencyAttribution,
    ...(feature === undefined
      ? [CARGO_FEATURE_CREATED_ATTRIBUTION]
      : Array.isArray(feature) && !feature.includes(FEATURE_VALUE)
        ? [CARGO_FEATURE_VALUE_ATTRIBUTION]
        : []),
    ...cargoEolAttribution(source),
  ];
}

function removeExactBlock(source: string, block: string): string {
  if (source.split(block).length - 1 !== 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  return source.replace(block, "");
}

function removeAddedProviderPath(
  source: string,
  dependency: UnknownRecord | undefined,
): string {
  if (
    dependency === undefined ||
    !isSupportedProviderPathDependency(dependency)
  ) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  let match: RegExpMatchArray;
  try {
    match = ensureSingleInlineDependencyLine(source);
  } catch {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const line = match[1];
  const openingIndex = line.indexOf("{");
  const insertedPrefix = ` ${DEPENDENCY_PATH_VALUE},`;
  if (!line.slice(openingIndex + 1).startsWith(insertedPrefix)) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  const restoredLine =
    line.slice(0, openingIndex + 1) +
    line.slice(openingIndex + 1 + insertedPrefix.length);
  const restoredMatch = `${restoredLine}${match[2]}`;
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const block = `${DEPENDENCY_PATH_MARKER}${lineEnding}${match[0]}`;
  if (source.split(block).length - 1 !== 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  return source.replace(block, restoredMatch);
}

export function planCargoRemoval(
  source: string,
  attribution: readonly string[],
): string {
  const eolBinding = assertCargoEolBinding(source, attribution);
  const cargo = parseCargo(source);
  const dependency = record(record(cargo.dependencies)?.[DEPENDENCY_NAME]);
  const feature = record(cargo.features)?.[FEATURE_NAME];

  let next = source;
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const hasCreatedDependency = attribution.includes(
    CARGO_DEPENDENCY_ATTRIBUTION,
  );
  const hasAddedPath = attribution.includes(CARGO_DEPENDENCY_PATH_ATTRIBUTION);
  if (hasCreatedDependency === hasAddedPath) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  if (hasCreatedDependency) {
    if (
      dependency?.optional !== true ||
      dependency.version !== TAURI_WEBDRIVER_PLUGIN_VERSION ||
      dependency.path !== PROVIDER_CARGO_PATH
    ) {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
    next = removeExactBlock(
      next,
      `${DEPENDENCY_MARKER}${lineEnding}${DEPENDENCY_NAME} = ${DEPENDENCY_VALUE}${lineEnding}${lineEnding}`,
    );
  } else {
    next = removeAddedProviderPath(source, dependency);
  }

  if (
    attribution.includes(CARGO_FEATURE_CREATED_ATTRIBUTION) ||
    attribution.includes(CARGO_FEATURE_VALUE_ATTRIBUTION)
  ) {
    if (!Array.isArray(feature) || !feature.includes(FEATURE_VALUE)) {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
    if (attribution.includes(CARGO_FEATURE_CREATED_ATTRIBUTION)) {
      if (feature.length !== 1) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      const sectionMarkerCount =
        next.split(FEATURE_SECTION_CREATED_MARKER).length - 1;
      if (sectionMarkerCount > 1) {
        throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
      }
      next = removeExactBlock(
        next,
        `${FEATURE_CREATED_MARKER}${lineEnding}${FEATURE_NAME} = ["${FEATURE_VALUE}"]${lineEnding}${lineEnding}`,
      );
      const createdSectionBlock = `[features]${lineEnding}${FEATURE_SECTION_CREATED_MARKER}${lineEnding}`;
      const createdSectionIndex = next.indexOf(createdSectionBlock);
      if (createdSectionIndex !== -1) {
        const separatorStart = createdSectionIndex - lineEnding.length;
        if (
          separatorStart >= 0 &&
          next.slice(separatorStart, createdSectionIndex) === lineEnding
        ) {
          next =
            next.slice(0, separatorStart) +
            next.slice(createdSectionIndex + createdSectionBlock.length);
        } else {
          next = removeExactBlock(next, createdSectionBlock);
        }
      }
    } else {
      next = removeExactBlock(next, `${FEATURE_VALUE_MARKER}${lineEnding}`);
      next = replaceFeatureLine(
        next,
        feature.filter((value) => value !== FEATURE_VALUE),
      );
    }
  }

  next = normalizeCargoEol(next, attribution);
  if (eolBinding !== undefined) {
    const marker = cargoEolMarker(eolBinding);
    const targetLineEnding = eolBinding === "crlf" ? "\r\n" : "\n";
    next = removeExactBlock(next, `${marker}${targetLineEnding}`);
  }

  parseCargo(next);
  return next;
}
