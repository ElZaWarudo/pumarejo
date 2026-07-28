import { parse as parseToml } from "smol-toml";

import { IntegrationPlanError } from "./plan-error.js";

const DEPENDENCY_NAME = "tauri-plugin-wdio-webdriver";
const FEATURE_NAME = "pumarejo";
const FEATURE_VALUE = `dep:${DEPENDENCY_NAME}`;
const DEPENDENCY_MARKER = "# <pumarejo:cargo-dependency>";
const FEATURE_CREATED_MARKER = "# <pumarejo:cargo-feature-created>";
const FEATURE_VALUE_MARKER = "# <pumarejo:cargo-feature-value>";
export const CARGO_DEPENDENCY_ATTRIBUTION =
  "dependency:tauri-plugin-wdio-webdriver:optional";
export const CARGO_FEATURE_CREATED_ATTRIBUTION =
  "feature:pumarejo:created:dep:tauri-plugin-wdio-webdriver";
export const CARGO_FEATURE_VALUE_ATTRIBUTION =
  "feature:pumarejo:value:dep:tauri-plugin-wdio-webdriver";

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
  const headerPattern = new RegExp(
    `^\\[${section.replace(".", "\\.")}\\]\\s*$`,
    "mu",
  );
  const match = headerPattern.exec(source);
  if (match === null) {
    const separator = source.endsWith("\n") ? "\n" : "\n\n";
    return `${source}${separator}[${section}]\n${line}\n`;
  }

  const afterHeader = match.index + match[0].length;
  const nextHeaderOffset = /^(\s*)\[[^\]]+\]\s*$/gmu;
  nextHeaderOffset.lastIndex = afterHeader;
  const nextHeader = nextHeaderOffset.exec(source);
  const insertionPoint = nextHeader?.index ?? source.length;
  const before = source.slice(0, insertionPoint).replace(/\s*$/u, "");
  const after = source.slice(insertionPoint);
  return `${before}\n${line}\n\n${after.replace(/^\s*/u, "")}`;
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

export function planCargoEdit(source: string): string {
  const cargo = parseCargo(source);
  const dependencies = record(cargo.dependencies);
  if (dependencies === undefined) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  const existingDependency = dependencies[DEPENDENCY_NAME];
  if (existingDependency !== undefined) {
    const dependency = record(existingDependency);
    if (dependency?.optional !== true) {
      throw new IntegrationPlanError("CARGO_DEPENDENCY_AMBIGUOUS");
    }
  }

  let next = source;
  if (existingDependency === undefined) {
    next = insertSectionValue(
      next,
      "dependencies",
      `${DEPENDENCY_MARKER}\n${DEPENDENCY_NAME} = { version = "1", optional = true }`,
    );
  }

  const features = record(cargo.features);
  const existingFeature = features?.[FEATURE_NAME];
  if (existingFeature === undefined) {
    next = insertSectionValue(
      next,
      "features",
      `${FEATURE_CREATED_MARKER}\n${FEATURE_NAME} = ["${FEATURE_VALUE}"]`,
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
      next = withValue.replace(
        /^(\s*pumarejo\s*=)/mu,
        `${FEATURE_VALUE_MARKER}\n$1`,
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
    !Array.isArray(validatedFeature) ||
    !validatedFeature.includes(FEATURE_VALUE)
  ) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  return next;
}

export function cargoIntegrationAttribution(source: string): readonly string[] {
  const cargo = parseCargo(source);
  const dependencies = record(cargo.dependencies);
  if (dependencies === undefined) {
    throw new IntegrationPlanError("CARGO_MANIFEST_INVALID");
  }
  const feature = record(cargo.features)?.[FEATURE_NAME];
  return [
    ...(dependencies[DEPENDENCY_NAME] === undefined
      ? [CARGO_DEPENDENCY_ATTRIBUTION]
      : []),
    ...(feature === undefined
      ? [CARGO_FEATURE_CREATED_ATTRIBUTION]
      : Array.isArray(feature) && !feature.includes(FEATURE_VALUE)
        ? [CARGO_FEATURE_VALUE_ATTRIBUTION]
        : []),
  ];
}

function removeExactBlock(source: string, block: string): string {
  if (source.split(block).length - 1 !== 1) {
    throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
  }
  return source.replace(block, "");
}

export function planCargoRemoval(
  source: string,
  attribution: readonly string[],
): string {
  const cargo = parseCargo(source);
  const dependency = record(record(cargo.dependencies)?.[DEPENDENCY_NAME]);
  const feature = record(cargo.features)?.[FEATURE_NAME];

  let next = source;
  if (attribution.includes(CARGO_DEPENDENCY_ATTRIBUTION)) {
    if (dependency?.optional !== true || dependency.version !== "1") {
      throw new IntegrationPlanError("ALREADY_INTEGRATED_MODIFIED");
    }
    next = removeExactBlock(
      next,
      `${DEPENDENCY_MARKER}\n${DEPENDENCY_NAME} = { version = "1", optional = true }\n`,
    );
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
      next = removeExactBlock(
        next,
        `${FEATURE_CREATED_MARKER}\n${FEATURE_NAME} = ["${FEATURE_VALUE}"]\n`,
      );
    } else {
      next = removeExactBlock(next, `${FEATURE_VALUE_MARKER}\n`);
      next = replaceFeatureLine(
        next,
        feature.filter((value) => value !== FEATURE_VALUE),
      );
    }
  }

  parseCargo(next);
  return next;
}
