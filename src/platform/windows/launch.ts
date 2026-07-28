import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  materializeLaunchProfile,
  type LoadedProjectConfig,
} from "../../config/load.js";
import type { PreparedLaunch } from "../../session/manager.js";
import type { RuntimeMode } from "../../session/state.js";
import { TauriAgentError } from "../../shared/errors.js";
import { createRuntimeOverlay } from "../mode-config.js";
import { sanitizedLaunchEnvironment } from "../launch-environment.js";
import { resolveProjectTauriCommand } from "../tauri-command.js";

const execFileAsync = promisify(execFile);

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference))
  );
}

async function located(command: string): Promise<readonly string[]> {
  try {
    const { stdout } = await execFileAsync("where.exe", [command]);
    return stdout
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch (error) {
    throw new TauriAgentError("APP_START_FAILED", { cause: error });
  }
}

async function safeExecutable(
  candidate: string,
  projectRoot: string,
): Promise<string> {
  const canonical = await realpath(candidate);
  const metadata = await lstat(canonical);
  if (
    !metadata.isFile() ||
    isInside(resolve(projectRoot), resolve(canonical))
  ) {
    throw new TauriAgentError("APP_START_FAILED");
  }
  return canonical;
}

function expandShimPath(value: string, shimPath: string): string {
  const shimDirectory = dirname(shimPath);
  return resolve(value.replace(/^%~dp0/iu, `${shimDirectory}${sep}`));
}

export async function resolveWindowsLaunch(
  command: string,
  args: readonly string[],
  projectRoot: string,
): Promise<{ command: string; args: readonly string[] }> {
  const normalized = command.toLowerCase().replace(/\.cmd$/u, "");
  if (["cargo", "bun", "deno"].includes(normalized)) {
    for (const candidate of await located(`${normalized}.exe`)) {
      try {
        return {
          command: await safeExecutable(candidate, projectRoot),
          args,
        };
      } catch {
        continue;
      }
    }
    throw new TauriAgentError("APP_START_FAILED");
  }
  if (!["pnpm", "npm", "yarn"].includes(normalized)) {
    throw new TauriAgentError("APP_START_FAILED");
  }

  for (const shimCandidate of await located(`${normalized}.cmd`)) {
    try {
      const shimPath = await safeExecutable(shimCandidate, projectRoot);
      const source = await readFile(shimPath, "utf8");
      if (
        source.length > 64 * 1024 ||
        /[&|<>]/u.test(source.replaceAll("%ERRORLEVEL%", ""))
      ) {
        continue;
      }
      const quoted = [...source.matchAll(/"([^"\r\n]+)"/gu)].map(
        (match) => match[1]!,
      );
      const cliToken = quoted.find((token) =>
        /\.(?:cjs|mjs|js)$/iu.test(token),
      );
      if (cliToken === undefined) continue;
      const cliPath = await safeExecutable(
        expandShimPath(cliToken, shimPath),
        projectRoot,
      );
      const cliIdentity = cliPath.toLowerCase();
      if (
        !cliIdentity.includes(normalized) &&
        !cliIdentity.includes("corepack")
      ) {
        continue;
      }
      const nodeToken = quoted.find((token) => /node\.exe$/iu.test(token));
      const nodePath =
        nodeToken === undefined
          ? await safeExecutable(process.execPath, projectRoot)
          : await safeExecutable(
              expandShimPath(nodeToken, shimPath),
              projectRoot,
            );
      return { command: nodePath, args: [cliPath, ...args] };
    } catch {
      continue;
    }
  }
  throw new TauriAgentError("APP_START_FAILED");
}

export async function prepareWindowsLaunch(
  loaded: LoadedProjectConfig,
  mode: RuntimeMode,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PreparedLaunch> {
  if (process.platform !== "win32") {
    throw new TauriAgentError("PLATFORM_UNSUPPORTED");
  }
  const overlay = await createRuntimeOverlay({
    projectRoot: loaded.projectRoot,
    platform: "windows",
    mode,
    windowLabel: loaded.config.window,
  });
  try {
    const profile = materializeLaunchProfile(
      loaded.config.launch,
      overlay.path,
      loaded.projectRoot,
    );
    const launch =
      (await resolveProjectTauriCommand(
        profile.command,
        profile.args,
        loaded.projectRoot,
      )) ??
      (await resolveWindowsLaunch(
        profile.command,
        profile.args,
        loaded.projectRoot,
      ));
    return {
      request: {
        ...launch,
        cwd: loaded.projectRoot,
        env: sanitizedLaunchEnvironment("windows", environment),
      },
      window: overlay.windowLabel,
      cleanup: overlay.cleanup,
    };
  } catch (error) {
    await overlay.cleanup();
    throw error;
  }
}
