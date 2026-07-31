import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import JSON5 from "json5";
import { parse as parseToml } from "smol-toml";

import { agentCapability } from "../installer/capabilities.js";
import { PumarejoError } from "../shared/errors.js";
import type { RuntimeMode } from "../session/state.js";

const MAX_TAURI_CONFIG_BYTES = 1024 * 1024;
const AGENT_CAPABILITY_FILE = "agent-capability.json";
const TAURI_CONFIG_FILES = [
  "tauri.conf.json",
  "tauri.conf.json5",
  "Tauri.toml",
] as const;

export interface RuntimeOverlay {
  readonly directory: string;
  readonly path: string;
  readonly windowLabel: string;
  cleanup(): Promise<void>;
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

export function modeOverlay(
  mode: RuntimeMode,
  windowLabel: string,
  configuredWindows: readonly Record<string, unknown>[] = [],
  agentCapability?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (windowLabel.trim().length === 0 || windowLabel.length > 128) {
    throw new PumarejoError("CONFIG_INVALID");
  }
  if (configuredWindows.length === 0) {
    return {
      app: {
        windows: [{ label: windowLabel, visible: mode === "visible" }],
        ...(agentCapability === undefined
          ? {}
          : { security: { capabilities: [agentCapability] } }),
      },
    };
  }

  let selected = false;
  const windows = configuredWindows.map((window, index) => {
    const effectiveLabel =
      typeof window.label === "string"
        ? window.label
        : configuredWindows.length === 1 && index === 0
          ? "main"
          : undefined;
    const isSelected = effectiveLabel === windowLabel;
    selected ||= isSelected;
    if (mode === "background") {
      return { ...window, visible: false };
    }
    return isSelected ? { ...window, visible: true } : { ...window };
  });
  if (!selected) {
    throw new PumarejoError("CONFIG_INVALID");
  }
  return {
    app: {
      windows,
      ...(agentCapability === undefined
        ? {}
        : { security: { capabilities: [agentCapability] } }),
    },
  };
}

function effectiveWindowLabel(
  configuredWindows: readonly Record<string, unknown>[],
  requestedLabel: string,
): string {
  if (configuredWindows.length === 0) return requestedLabel;
  const labels = configuredWindows.map((window, index) =>
    typeof window.label === "string" && window.label.trim().length > 0
      ? window.label
      : configuredWindows.length === 1 && index === 0
        ? "main"
        : undefined,
  );
  if (labels.includes(requestedLabel)) return requestedLabel;
  if (configuredWindows.length === 1) return labels[0] ?? "main";
  if (labels.filter((label) => label === "main").length === 1) return "main";
  throw new PumarejoError("CONFIG_INVALID");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

async function readAgentCapability(
  projectRoot: string,
  agentDirectory: string,
  windowLabel: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const path = join(agentDirectory, AGENT_CAPABILITY_FILE);
  const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (metadata === undefined) return undefined;
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size > MAX_TAURI_CONFIG_BYTES ||
    (await realpath(path)) !== path ||
    !isInside(projectRoot, path)
  ) {
    throw new PumarejoError("INTEGRATION_INCOMPLETE");
  }

  try {
    const capability = record(JSON.parse(await readFile(path, "utf8")));
    const expected = agentCapability(windowLabel);
    if (
      capability === undefined ||
      !exactStringArray(
        Object.keys(capability).sort(),
        Object.keys(expected).sort(),
      ) ||
      capability.identifier !== expected.identifier ||
      !exactStringArray(capability.windows, expected.windows) ||
      !exactStringArray(capability.permissions, expected.permissions)
    ) {
      throw new PumarejoError("CAPABILITY_INCOMPATIBLE");
    }
    return capability;
  } catch (error) {
    if (error instanceof PumarejoError) throw error;
    throw new PumarejoError("CAPABILITY_INCOMPATIBLE", { cause: error });
  }
}

async function configuredWindows(
  projectRoot: string,
  platform: "windows" | "linux",
): Promise<readonly Record<string, unknown>[]> {
  const tauriDirectory = join(projectRoot, "src-tauri");
  const candidates: string[] = [];
  for (const name of TAURI_CONFIG_FILES) {
    const candidate = join(tauriDirectory, name);
    const metadata = await lstat(candidate).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      },
    );
    if (metadata === undefined) continue;
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.size > MAX_TAURI_CONFIG_BYTES ||
      (await realpath(candidate)) !== candidate
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    candidates.push(candidate);
  }
  if (candidates.length > 1) {
    throw new PumarejoError("CONFIG_INVALID");
  }
  if (candidates.length === 0) return [];

  const basePath = candidates[0]!;
  const platformPath = join(
    tauriDirectory,
    basePath.endsWith("Tauri.toml")
      ? `Tauri.${platform}.toml`
      : `tauri.${platform}.conf.json`,
  );

  const parseConfig = async (
    path: string,
    required: boolean,
  ): Promise<Record<string, unknown> | undefined> => {
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (!required && error.code === "ENOENT") return undefined;
      throw error;
    });
    if (metadata === undefined) return undefined;
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.size > MAX_TAURI_CONFIG_BYTES ||
      (await realpath(path)) !== path
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    try {
      const source = await readFile(path, "utf8");
      return (
        record(
          path.toLowerCase().endsWith(".toml")
            ? parseToml(source)
            : JSON5.parse(source),
        ) ?? {}
      );
    } catch (error) {
      throw new PumarejoError("CONFIG_INVALID", { cause: error });
    }
  };

  const mergePatch = (base: unknown, patch: unknown): unknown => {
    const patchRecord = record(patch);
    if (patchRecord === undefined) return patch;
    const result: Record<string, unknown> = { ...(record(base) ?? {}) };
    for (const [key, value] of Object.entries(patchRecord)) {
      if (value === null) {
        delete result[key];
      } else {
        result[key] = mergePatch(result[key], value);
      }
    }
    return result;
  };

  const base = await parseConfig(basePath, true);
  const platformConfig = await parseConfig(platformPath, false);
  const parsed =
    platformConfig === undefined ? base : mergePatch(base, platformConfig);
  if (parsed === undefined) {
    throw new PumarejoError("CONFIG_INVALID");
  }
  const windows = record(record(parsed)?.app)?.windows;
  if (windows === undefined) return [];
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new PumarejoError("CONFIG_INVALID");
  }
  return windows.map((window) => {
    const parsedWindow = record(window);
    if (parsedWindow === undefined) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    return parsedWindow;
  });
}

async function assertOwnedRuntimeDirectory(
  projectRoot: string,
  agentDirectory: string,
  directory: string,
): Promise<void> {
  const agentMetadata = await lstat(agentDirectory);
  const directoryMetadata = await lstat(directory);
  if (
    agentMetadata.isSymbolicLink() ||
    !agentMetadata.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    !directoryMetadata.isDirectory()
  ) {
    throw new PumarejoError("INTEGRATION_INCOMPLETE");
  }

  const canonicalAgent = await realpath(agentDirectory);
  const canonicalDirectory = await realpath(directory);
  if (
    !isInside(projectRoot, canonicalAgent) ||
    dirname(canonicalDirectory) !== canonicalAgent ||
    !isInside(canonicalAgent, canonicalDirectory)
  ) {
    throw new PumarejoError("INTEGRATION_INCOMPLETE");
  }
}

export async function createRuntimeOverlay(options: {
  readonly projectRoot: string;
  readonly platform: "windows" | "linux";
  readonly mode: RuntimeMode;
  readonly windowLabel: string;
}): Promise<RuntimeOverlay> {
  const projectRoot = resolve(options.projectRoot);
  const agentDirectory = resolve(projectRoot, ".pumarejo");
  try {
    if ((await realpath(projectRoot)) !== projectRoot) {
      throw new PumarejoError("INTEGRATION_INCOMPLETE");
    }
    const agentMetadata = await lstat(agentDirectory);
    if (agentMetadata.isSymbolicLink() || !agentMetadata.isDirectory()) {
      throw new PumarejoError("INTEGRATION_INCOMPLETE");
    }
    const canonicalAgent = await realpath(agentDirectory);
    if (!isInside(projectRoot, canonicalAgent)) {
      throw new PumarejoError("INTEGRATION_INCOMPLETE");
    }
  } catch (error) {
    if (error instanceof PumarejoError) throw error;
    throw new PumarejoError("INTEGRATION_INCOMPLETE", { cause: error });
  }

  const windows = await configuredWindows(projectRoot, options.platform);
  const windowLabel = effectiveWindowLabel(windows, options.windowLabel);
  const agentCapability = await readAgentCapability(
    projectRoot,
    agentDirectory,
    windowLabel,
  );
  const directory = await mkdtemp(join(agentDirectory, "runtime-"));
  const path = join(directory, "mode-overlay.json");
  try {
    // Revalidate after creation so a concurrent junction/symlink replacement
    // cannot redirect the subsequent write outside the project.
    await assertOwnedRuntimeDirectory(projectRoot, agentDirectory, directory);
    await writeFile(
      path,
      `${JSON.stringify(
        // Tauri applies --config with RFC 7396, so app.windows must contain
        // the complete base array rather than a partial replacement entry.
        modeOverlay(options.mode, windowLabel, windows, agentCapability),
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    await assertOwnedRuntimeDirectory(projectRoot, agentDirectory, directory)
      .then(() => rm(directory, { recursive: true, force: true }))
      .catch(() => undefined);
    throw new PumarejoError("APP_START_FAILED", { cause: error });
  }
  let cleaned = false;
  return {
    directory,
    path,
    windowLabel,
    async cleanup() {
      if (cleaned) return;
      await assertOwnedRuntimeDirectory(projectRoot, agentDirectory, directory);
      const metadata = await lstat(directory).catch(() => undefined);
      if (metadata?.isSymbolicLink()) {
        await unlink(directory);
      } else {
        await rm(directory, { recursive: true, force: true });
      }
      cleaned = true;
    },
  };
}

export async function readRuntimeOverlay(
  path: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}
