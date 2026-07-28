import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { LaunchProfile } from "../config/schema.js";

const MAX_MANIFEST_BYTES = 256 * 1024;
const TAURI_ARGS = [
  "dev",
  "--features",
  "tauri-agent",
  "--config",
  "{tauriConfig}",
] as const;

const MANAGERS = [
  { name: "pnpm", lockfiles: ["pnpm-lock.yaml"] },
  {
    name: "npm",
    lockfiles: ["package-lock.json", "npm-shrinkwrap.json"],
  },
  { name: "yarn", lockfiles: ["yarn.lock"] },
  { name: "bun", lockfiles: ["bun.lock", "bun.lockb"] },
  { name: "deno", lockfiles: ["deno.lock"] },
] as const;

export type PackageManager = (typeof MANAGERS)[number]["name"] | "cargo";

export type PackageManagerDetectionIssue =
  | "PACKAGE_MANAGER_AMBIGUOUS"
  | "PACKAGE_MANAGER_UNSUPPORTED"
  | "SCRIPT_AMBIGUOUS"
  | "CLI_VERSION_UNSUPPORTED";

export class PackageManagerDetectionError extends Error {
  readonly reason: PackageManagerDetectionIssue;

  constructor(reason: PackageManagerDetectionIssue) {
    super(reason);
    this.name = "PackageManagerDetectionError";
    this.reason = reason;
  }
}

export interface DetectedPackageManager {
  readonly packageManager: PackageManager;
  readonly launch: LaunchProfile;
  readonly cliSource: "package" | "deno-import" | "system-cargo";
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

async function isSafeFile(
  root: string,
  relativePath: string,
): Promise<boolean> {
  const path = resolve(root, relativePath);
  if (!isInside(root, path)) {
    throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
  }

  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
    }
    if ((await realpath(path)) !== path) {
      throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readJsonObject(
  root: string,
  relativePath: string,
): Promise<Record<string, unknown> | undefined> {
  if (!(await isSafeFile(root, relativePath))) {
    return undefined;
  }

  const path = resolve(root, relativePath);
  const metadata = await lstat(path);
  if (metadata.size > MAX_MANIFEST_BYTES) {
    throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
  }

  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PackageManagerDetectionError) {
      throw error;
    }
    throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasMajorTwo(specifier: unknown): boolean {
  if (typeof specifier !== "string") {
    return false;
  }
  const match = /(?:^|@|[<>=~^\s])v?(\d+)(?:[.\s]|$)/u.exec(specifier);
  return match?.[1] === "2";
}

function packageCliVersion(manifest: Record<string, unknown>): unknown {
  return (
    record(manifest.devDependencies)?.["@tauri-apps/cli"] ??
    record(manifest.dependencies)?.["@tauri-apps/cli"]
  );
}

function packageScript(manifest: Record<string, unknown>): unknown {
  return record(manifest.scripts)?.tauri;
}

function launchFor(packageManager: PackageManager): LaunchProfile {
  switch (packageManager) {
    case "npm":
      return {
        command: "npm",
        args: ["run", "tauri", "--", ...TAURI_ARGS],
      };
    case "deno":
      return {
        command: "deno",
        args: ["task", "tauri", ...TAURI_ARGS],
      };
    case "cargo":
      return {
        command: "cargo",
        args: ["tauri", ...TAURI_ARGS],
      };
    default:
      return {
        command: packageManager,
        args: ["tauri", ...TAURI_ARGS],
      };
  }
}

export async function detectPackageManager(
  projectRoot: string,
): Promise<DetectedPackageManager> {
  const presentManagers: PackageManager[] = [];
  for (const manager of MANAGERS) {
    const present = await Promise.all(
      manager.lockfiles.map((lockfile) => isSafeFile(projectRoot, lockfile)),
    );
    if (present.some(Boolean)) {
      presentManagers.push(manager.name);
    }
  }

  if (presentManagers.length > 1) {
    throw new PackageManagerDetectionError("PACKAGE_MANAGER_AMBIGUOUS");
  }

  if (presentManagers.length === 0) {
    const packageManifest = await readJsonObject(projectRoot, "package.json");
    const denoManifest = await readJsonObject(projectRoot, "deno.json");
    if (packageManifest !== undefined || denoManifest !== undefined) {
      throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
    }
    return {
      packageManager: "cargo",
      launch: launchFor("cargo"),
      cliSource: "system-cargo",
    };
  }

  const packageManager = presentManagers[0];
  if (packageManager === "deno") {
    const manifest = await readJsonObject(projectRoot, "deno.json");
    const task = record(manifest?.tasks)?.tauri;
    const cliImport = record(manifest?.imports)?.["@tauri-apps/cli"];
    if (task !== "tauri") {
      throw new PackageManagerDetectionError("SCRIPT_AMBIGUOUS");
    }
    if (!hasMajorTwo(cliImport)) {
      throw new PackageManagerDetectionError("CLI_VERSION_UNSUPPORTED");
    }
    return {
      packageManager,
      launch: launchFor(packageManager),
      cliSource: "deno-import",
    };
  }

  const manifest = await readJsonObject(projectRoot, "package.json");
  if (manifest === undefined) {
    throw new PackageManagerDetectionError("PACKAGE_MANAGER_UNSUPPORTED");
  }
  if (packageScript(manifest) !== "tauri") {
    throw new PackageManagerDetectionError("SCRIPT_AMBIGUOUS");
  }
  if (!hasMajorTwo(packageCliVersion(manifest))) {
    throw new PackageManagerDetectionError("CLI_VERSION_UNSUPPORTED");
  }

  return {
    packageManager,
    launch: launchFor(packageManager),
    cliSource: "package",
  };
}
