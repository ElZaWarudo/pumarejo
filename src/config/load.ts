import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

import { PumarejoError } from "../shared/errors.js";
import {
  launchProfileSchema,
  MODE_CONFIG_PLACEHOLDER,
  projectConfigSchema,
  type LaunchProfile,
  type ProjectConfig,
} from "./schema.js";

export const CONFIG_FILE_NAME = ".pumarejo.json";
const MAX_CONFIG_BYTES = 64 * 1024;

export interface LoadedProjectConfig {
  readonly projectRoot: string;
  readonly configPath: string;
  readonly artifactsPath: string;
  readonly config: ProjectConfig;
}

export interface MaterializedLaunchProfile {
  readonly command: string;
  readonly args: readonly string[];
}

function configurationError(cause?: unknown): PumarejoError {
  return new PumarejoError("CONFIG_INVALID", { cause });
}

function isStrictlyInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference !== "" &&
    !difference.startsWith(`..${sep}`) &&
    difference !== ".." &&
    !isAbsolute(difference)
  );
}

async function rejectExistingLinks(
  root: string,
  candidate: string,
): Promise<void> {
  const segments = relative(root, candidate).split(sep).filter(Boolean);
  let current = root;

  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw configurationError();
      }
    } catch (error) {
      if (
        error instanceof PumarejoError ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw error;
      }
      break;
    }
  }
}

export async function resolveProjectRoot(projectPath: string): Promise<string> {
  const absolutePath = resolve(projectPath);
  try {
    await rejectExistingLinks(parse(absolutePath).root, absolutePath);
    const linkMetadata = await lstat(absolutePath);
    if (linkMetadata.isSymbolicLink()) {
      throw configurationError();
    }
    if (!linkMetadata.isDirectory()) {
      throw configurationError();
    }
    return await realpath(absolutePath);
  } catch (error) {
    if (error instanceof PumarejoError) {
      throw error;
    }
    throw new PumarejoError("PROJECT_NOT_FOUND", { cause: error });
  }
}

export async function loadProjectConfig(
  projectPath: string,
): Promise<LoadedProjectConfig> {
  const projectRoot = await resolveProjectRoot(projectPath);
  const configPath = resolve(projectRoot, CONFIG_FILE_NAME);

  try {
    const configMetadata = await lstat(configPath);
    if (configMetadata.isSymbolicLink() || !configMetadata.isFile()) {
      throw configurationError();
    }
    const configSize = await stat(configPath);
    if (configSize.size > MAX_CONFIG_BYTES) {
      throw configurationError();
    }

    const source = await readFile(configPath, "utf8");
    const config = projectConfigSchema.parse(JSON.parse(source));
    if (isAbsolute(config.artifactsDirectory)) {
      throw configurationError();
    }

    const artifactsPath = resolve(projectRoot, config.artifactsDirectory);
    if (!isStrictlyInside(projectRoot, artifactsPath)) {
      throw configurationError();
    }
    await rejectExistingLinks(projectRoot, artifactsPath);

    return { projectRoot, configPath, artifactsPath, config };
  } catch (error) {
    if (error instanceof PumarejoError) {
      throw error;
    }
    throw configurationError(error);
  }
}

export function materializeLaunchProfile(
  profile: LaunchProfile,
  tauriConfigPath: string,
  projectRoot: string,
): MaterializedLaunchProfile {
  const parsedProfile = launchProfileSchema.parse(profile);
  const canonicalProjectRoot = resolve(projectRoot);
  const canonicalConfigPath = resolve(tauriConfigPath);
  if (
    tauriConfigPath.includes(MODE_CONFIG_PLACEHOLDER) ||
    !isStrictlyInside(canonicalProjectRoot, canonicalConfigPath)
  ) {
    throw configurationError();
  }

  return {
    command: parsedProfile.command,
    args: parsedProfile.args.map((argument) =>
      argument.replace(MODE_CONFIG_PLACEHOLDER, canonicalConfigPath),
    ),
  };
}

export function projectDirectoryForConfig(configPath: string): string {
  return dirname(configPath);
}
