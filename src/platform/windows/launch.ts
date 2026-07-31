import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";

import {
  materializeLaunchProfile,
  type LoadedProjectConfig,
} from "../../config/load.js";
import type { PreparedLaunch } from "../../session/manager.js";
import type { RuntimeMode } from "../../session/state.js";
import { PumarejoError } from "../../shared/errors.js";
import { createRuntimeOverlay } from "../mode-config.js";
import { resolvedLaunchEnvironment } from "../launch-environment.js";
import { resolveProjectTauriCommand } from "../tauri-command.js";

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference))
  );
}

async function* located(
  command: string,
  environment: NodeJS.ProcessEnv,
): AsyncGenerator<string> {
  const pathValue = Object.entries(environment).find(
    ([key]) => key.toUpperCase() === "PATH",
  )?.[1];
  if (pathValue === undefined) return;
  for (const directory of pathValue.split(win32.delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = win32.join(directory, command);
    const metadata = await lstat(candidate).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      },
    );
    if (metadata?.isFile() && !metadata.isSymbolicLink()) {
      yield candidate;
    }
  }
}

async function safeExecutable(
  candidate: string,
  projectRoot: string,
): Promise<string> {
  try {
    const canonical = await realpath(candidate);
    const metadata = await lstat(canonical);
    if (
      !metadata.isFile() ||
      isInside(resolve(projectRoot), resolve(canonical))
    ) {
      throw new Error("launch executable is not an external regular file");
    }
    return canonical;
  } catch (error) {
    if (
      error instanceof PumarejoError &&
      error.code === "LAUNCH_COMMAND_NOT_FOUND"
    ) {
      throw error;
    }
    throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND", { cause: error });
  }
}

function expandShimValue(
  value: string,
  shimPath: string,
  variables: ReadonlyMap<string, string>,
): string {
  const shimDirectory = dirname(shimPath);
  let expanded = value.replaceAll("%~dp0", `${shimDirectory}${sep}`);
  for (let pass = 0; pass < 10; pass += 1) {
    const next = expanded.replace(
      /%([A-Za-z_][A-Za-z0-9_]*)%/gu,
      (match, key) => variables.get(String(key).toLowerCase()) ?? match,
    );
    if (next === expanded) break;
    expanded = next;
  }
  return expanded;
}

function shimVariables(source: string, shimPath: string): Map<string, string> {
  const variables = new Map<string, string>([
    ["dp0", `${dirname(shimPath)}${sep}`],
  ]);
  for (const line of source.split(/\r?\n/u)) {
    const match = /^\s*SET\s+"?([A-Za-z_][A-Za-z0-9_]*)=(.*?)"?\s*$/iu.exec(
      line,
    );
    if (match === null) continue;
    variables.set(
      match[1]!.toLowerCase(),
      expandShimValue(match[2]!, shimPath, variables),
    );
  }
  return variables;
}

function expandShimPath(
  value: string,
  shimPath: string,
  variables: ReadonlyMap<string, string>,
): string | undefined {
  const expanded = expandShimValue(value, shimPath, variables);
  if (/%[^%]+%/u.test(expanded) || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(expanded)) {
    return undefined;
  }
  return resolve(expanded);
}

async function resolveWindowsShim(
  shimCandidate: string,
  normalized: string,
  args: readonly string[],
  projectRoot: string,
): Promise<{ command: string; args: readonly string[] }> {
  const shimPath = await safeExecutable(shimCandidate, projectRoot);
  const handle = await open(shimPath, "r");
  let source: string;
  try {
    const buffer = Buffer.alloc(64 * 1024 + 1);
    let totalRead = 0;
    while (totalRead < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        totalRead,
        buffer.length - totalRead,
        totalRead,
      );
      if (bytesRead === 0) break;
      totalRead += bytesRead;
    }
    if (totalRead > 64 * 1024) {
      throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND");
    }
    source = buffer.subarray(0, totalRead).toString("utf8");
  } finally {
    await handle.close();
  }
  if (source.includes("\0")) {
    throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND");
  }
  const variables = shimVariables(source, shimPath);
  const quoted = [...source.matchAll(/"([^"\r\n]+)"/gu)].map(
    (match) => match[1]!,
  );
  const candidates = [...quoted, ...variables.values()].flatMap((token) => {
    const expanded = expandShimPath(token, shimPath, variables);
    return expanded === undefined ? [] : [expanded];
  });
  const cliCandidate = candidates.find((token) =>
    /\.(?:cjs|mjs|js)$/iu.test(token),
  );
  if (cliCandidate === undefined) {
    throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND");
  }
  const cliPath = await safeExecutable(cliCandidate, projectRoot);
  const cliIdentity = cliPath.toLowerCase();
  if (!cliIdentity.includes(normalized) && !cliIdentity.includes("corepack")) {
    throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND");
  }
  const nodeCandidate = candidates.find((token) => /node\.exe$/iu.test(token));
  const nodePath =
    nodeCandidate === undefined
      ? await safeExecutable(process.execPath, projectRoot)
      : await safeExecutable(nodeCandidate, projectRoot).catch(
          async () => await safeExecutable(process.execPath, projectRoot),
        );
  return { command: nodePath, args: [cliPath, ...args] };
}

export async function resolveWindowsLaunch(
  command: string,
  args: readonly string[],
  projectRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ command: string; args: readonly string[] }> {
  const normalized = command.toLowerCase().replace(/\.(?:cmd|exe)$/u, "");
  if (["cargo", "bun", "deno"].includes(normalized)) {
    for await (const candidate of located(`${normalized}.exe`, environment)) {
      try {
        return {
          command: await safeExecutable(candidate, projectRoot),
          args,
        };
      } catch {
        continue;
      }
    }
    throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND");
  }
  if (!["pnpm", "npm", "yarn"].includes(normalized)) {
    throw new PumarejoError("APP_START_FAILED");
  }

  for await (const shimCandidate of located(`${normalized}.cmd`, environment)) {
    try {
      return await resolveWindowsShim(
        shimCandidate,
        normalized,
        args,
        projectRoot,
      );
    } catch {
      continue;
    }
  }
  throw new PumarejoError("LAUNCH_COMMAND_NOT_FOUND");
}

export async function prepareWindowsLaunch(
  loaded: LoadedProjectConfig,
  mode: RuntimeMode,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PreparedLaunch> {
  if (process.platform !== "win32") {
    throw new PumarejoError("PLATFORM_UNSUPPORTED");
  }
  const overlay = await createRuntimeOverlay({
    projectRoot: loaded.projectRoot,
    platform: "windows",
    mode,
    windowLabel: loaded.config.window,
  });
  try {
    const launchEnvironment = resolvedLaunchEnvironment(
      "windows",
      environment,
      loaded.config.launch,
    );
    const profile = materializeLaunchProfile(
      loaded.config.launch,
      overlay.path,
      loaded.projectRoot,
    );
    const explicit =
      loaded.config.launch.executablePath === undefined
        ? undefined
        : await safeExecutable(profile.command, loaded.projectRoot);
    const launch =
      explicit !== undefined
        ? explicit.toLowerCase().endsWith(".cmd")
          ? await resolveWindowsShim(
              explicit,
              loaded.config.launch.command.toLowerCase().replace(/\.cmd$/u, ""),
              profile.args,
              loaded.projectRoot,
            )
          : { command: explicit, args: profile.args }
        : ((await resolveProjectTauriCommand(
            profile.command,
            profile.args,
            loaded.projectRoot,
          )) ??
          (await resolveWindowsLaunch(
            profile.command,
            profile.args,
            loaded.projectRoot,
            launchEnvironment,
          )));
    return {
      request: {
        ...launch,
        cwd: loaded.projectRoot,
        env: launchEnvironment,
      },
      window: overlay.windowLabel,
      cleanup: overlay.cleanup,
    };
  } catch (error) {
    await overlay.cleanup();
    throw error;
  }
}
