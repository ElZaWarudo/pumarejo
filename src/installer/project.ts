import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import JSON5 from "json5";
import { parse as parseToml } from "smol-toml";

import { launchProfileSchema, type LaunchProfile } from "../config/schema.js";
import { resolveProjectRoot } from "../config/load.js";
import {
  detectPackageManager,
  PackageManagerDetectionError,
  type PackageManager,
} from "./package-manager.js";

const MAX_PROJECT_FILE_BYTES = 1024 * 1024;
const CONFIG_FILES = [
  { name: "tauri.conf.json", format: "json" },
  { name: "tauri.conf.json5", format: "json5" },
  { name: "Tauri.toml", format: "toml" },
] as const;

export type TauriConfigFormat = "json" | "json5" | "toml";

export type ProjectDetectionReason =
  | "PROJECT_STRUCTURE_MISSING"
  | "TAURI_VERSION_UNSUPPORTED"
  | "CONFIG_MISSING"
  | "CONFIG_AMBIGUOUS"
  | "CONFIG_INVALID"
  | "PACKAGE_MANAGER_AMBIGUOUS"
  | "PACKAGE_MANAGER_UNSUPPORTED"
  | "SCRIPT_AMBIGUOUS"
  | "CLI_VERSION_UNSUPPORTED"
  | "UNSAFE_PROJECT_PATH";

const DETECTION_GUIDANCE: Record<ProjectDetectionReason, string> = {
  PROJECT_STRUCTURE_MISSING:
    "Use a project root containing src-tauri/Cargo.toml.",
  TAURI_VERSION_UNSUPPORTED:
    "Use Tauri 2 for both the Rust runtime and its build dependency.",
  CONFIG_MISSING: "Add one base Tauri configuration under src-tauri.",
  CONFIG_AMBIGUOUS:
    "Keep exactly one of tauri.conf.json, tauri.conf.json5, or Tauri.toml.",
  CONFIG_INVALID:
    "Fix the selected Tauri configuration and its Cargo feature flags.",
  PACKAGE_MANAGER_AMBIGUOUS:
    "Keep one package-manager lockfile family or select the launch profile manually.",
  PACKAGE_MANAGER_UNSUPPORTED:
    "Use pnpm, npm, yarn, bun, deno, or a Rust-only Cargo project.",
  SCRIPT_AMBIGUOUS:
    'Set the project task named "tauri" to the exact command "tauri".',
  CLI_VERSION_UNSUPPORTED:
    "Declare @tauri-apps/cli 2 in the selected project manifest.",
  UNSAFE_PROJECT_PATH:
    "Replace linked project metadata with regular files inside the project.",
};

export class ProjectDetectionError extends Error {
  readonly reason: ProjectDetectionReason;
  readonly suggestion: string;

  constructor(reason: ProjectDetectionReason, options?: ErrorOptions) {
    super(`Project detection failed: ${reason}.`, options);
    this.name = "ProjectDetectionError";
    this.reason = reason;
    this.suggestion = DETECTION_GUIDANCE[reason];
  }
}

export interface DetectedTauriConfig {
  readonly path: string;
  readonly format: TauriConfigFormat;
}

export interface DetectedTauriProject {
  readonly projectRoot: string;
  readonly tauriDirectory: string;
  readonly cargoManifestPath: string;
  readonly tauriConfig: DetectedTauriConfig;
  readonly packageManager: PackageManager;
  readonly primaryWindowLabel: string;
  readonly launch: LaunchProfile;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

async function safeFile(
  projectRoot: string,
  path: string,
  required: boolean,
): Promise<boolean> {
  if (!isInside(projectRoot, path)) {
    throw new ProjectDetectionError("UNSAFE_PROJECT_PATH");
  }

  try {
    const metadata = await lstat(path);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.size > MAX_PROJECT_FILE_BYTES ||
      (await realpath(path)) !== path
    ) {
      throw new ProjectDetectionError("UNSAFE_PROJECT_PATH");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) {
      return false;
    }
    if (error instanceof ProjectDetectionError) {
      throw error;
    }
    throw new ProjectDetectionError("PROJECT_STRUCTURE_MISSING", {
      cause: error,
    });
  }
}

function dependencyVersion(value: unknown): unknown {
  return typeof value === "string" ? value : record(value)?.version;
}

function dependencyFeatures(value: unknown): readonly unknown[] {
  const features = record(value)?.features;
  return Array.isArray(features) ? features : [];
}

function hasMajorTwo(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const match = /(?:^|[<>=~^\s])v?(\d+)(?:[.\s]|$)/u.exec(value);
  return match?.[1] === "2";
}

function hasFeature(value: unknown, feature: string): boolean {
  return dependencyFeatures(value).includes(feature);
}

async function parseCargoManifest(path: string): Promise<{
  readonly runtime: unknown;
  readonly build: unknown;
}> {
  try {
    const cargo = record(parseToml(await readFile(path, "utf8")));
    return {
      runtime: record(cargo?.dependencies)?.tauri,
      build: record(cargo?.["build-dependencies"])?.["tauri-build"],
    };
  } catch (error) {
    throw new ProjectDetectionError("CONFIG_INVALID", { cause: error });
  }
}

function validateTauriVersion(runtime: unknown, build: unknown): void {
  if (
    !hasMajorTwo(dependencyVersion(runtime)) ||
    (build !== undefined && !hasMajorTwo(dependencyVersion(build)))
  ) {
    throw new ProjectDetectionError("TAURI_VERSION_UNSUPPORTED");
  }
}

async function selectConfig(
  projectRoot: string,
  tauriDirectory: string,
): Promise<(typeof CONFIG_FILES)[number] & { readonly path: string }> {
  const matches: Array<(typeof CONFIG_FILES)[number] & { path: string }> = [];
  for (const candidate of CONFIG_FILES) {
    const path = join(tauriDirectory, candidate.name);
    if (await safeFile(projectRoot, path, false)) {
      matches.push({ ...candidate, path });
    }
  }
  if (matches.length === 0) {
    throw new ProjectDetectionError("CONFIG_MISSING");
  }
  if (matches.length > 1) {
    throw new ProjectDetectionError("CONFIG_AMBIGUOUS");
  }
  return matches[0];
}

function parsedConfigFormat(
  selectedFormat: TauriConfigFormat,
  runtime: unknown,
  build: unknown,
): TauriConfigFormat {
  if (selectedFormat === "json") {
    return "json";
  }
  const feature = selectedFormat === "json5" ? "config-json5" : "config-toml";
  if (!hasFeature(runtime, feature) || !hasFeature(build, feature)) {
    throw new ProjectDetectionError("CONFIG_INVALID");
  }
  return selectedFormat;
}

async function parseTauriConfig(
  path: string,
  format: TauriConfigFormat,
  runtime: unknown,
  build: unknown,
): Promise<{
  readonly config: UnknownRecord;
  readonly effectiveFormat: TauriConfigFormat;
}> {
  const source = await readFile(path, "utf8");
  try {
    if (format === "toml") {
      return {
        config: record(parseToml(source)) ?? {},
        effectiveFormat: "toml",
      };
    }
    if (format === "json5") {
      return {
        config: record(JSON5.parse(source)) ?? {},
        effectiveFormat: "json5",
      };
    }
    try {
      return {
        config: record(JSON.parse(source)) ?? {},
        effectiveFormat: "json",
      };
    } catch (jsonError) {
      if (
        hasFeature(runtime, "config-json5") &&
        hasFeature(build, "config-json5")
      ) {
        return {
          config: record(JSON5.parse(source)) ?? {},
          effectiveFormat: "json5",
        };
      }
      throw jsonError;
    }
  } catch (error) {
    throw new ProjectDetectionError("CONFIG_INVALID", { cause: error });
  }
}

function primaryWindowLabel(config: UnknownRecord): string {
  const windows = record(config.app)?.windows;
  if (windows === undefined) {
    return "main";
  }
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new ProjectDetectionError("CONFIG_INVALID");
  }
  const candidates = windows
    .map((window) => record(window)?.label)
    .filter(
      (label): label is string =>
        typeof label === "string" && label.trim().length > 0,
    );
  if (windows.length === 1) {
    return candidates[0] ?? "main";
  }
  if (candidates.filter((label) => label === "main").length === 1) {
    return "main";
  }
  throw new ProjectDetectionError("CONFIG_AMBIGUOUS");
}

export async function detectTauriProject(
  projectPath: string,
): Promise<DetectedTauriProject> {
  let projectRoot: string;
  try {
    projectRoot = await resolveProjectRoot(projectPath);
  } catch (error) {
    throw new ProjectDetectionError("PROJECT_STRUCTURE_MISSING", {
      cause: error,
    });
  }

  const tauriDirectory = join(projectRoot, "src-tauri");
  const cargoManifestPath = join(tauriDirectory, "Cargo.toml");
  await safeFile(projectRoot, cargoManifestPath, true);
  const cargo = await parseCargoManifest(cargoManifestPath);
  validateTauriVersion(cargo.runtime, cargo.build);

  const selectedConfig = await selectConfig(projectRoot, tauriDirectory);
  const declaredFormat = parsedConfigFormat(
    selectedConfig.format,
    cargo.runtime,
    cargo.build,
  );
  const parsedConfig = await parseTauriConfig(
    selectedConfig.path,
    declaredFormat,
    cargo.runtime,
    cargo.build,
  );

  try {
    const packageManager = await detectPackageManager(projectRoot);
    return {
      projectRoot,
      tauriDirectory,
      cargoManifestPath,
      tauriConfig: {
        path: selectedConfig.path,
        format: parsedConfig.effectiveFormat,
      },
      packageManager: packageManager.packageManager,
      primaryWindowLabel: primaryWindowLabel(parsedConfig.config),
      launch: launchProfileSchema.parse(packageManager.launch),
    };
  } catch (error) {
    if (error instanceof PackageManagerDetectionError) {
      throw new ProjectDetectionError(error.reason, { cause: error });
    }
    throw error;
  }
}
