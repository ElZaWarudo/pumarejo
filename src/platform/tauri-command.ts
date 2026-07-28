import { lstat, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, parse, sep } from "node:path";

import { PumarejoError } from "../shared/errors.js";

function isDependencyPath(candidate: string): boolean {
  return candidate
    .slice(parse(candidate).root.length)
    .split(sep)
    .some((segment) => segment === "node_modules");
}

export function tauriCliArgs(
  command: string,
  args: readonly string[],
): readonly string[] | undefined {
  const normalized = command.toLowerCase().replace(/\.(?:cmd|exe)$/u, "");
  if (["pnpm", "yarn", "bun"].includes(normalized) && args[0] === "tauri") {
    return args.slice(1);
  }
  if (
    normalized === "npm" &&
    args[0] === "run" &&
    args[1] === "tauri" &&
    args[2] === "--"
  ) {
    return args.slice(3);
  }
  if (normalized === "deno" && args[0] === "task" && args[1] === "tauri") {
    return args.slice(2);
  }
  return undefined;
}

export async function resolveProjectTauriCommand(
  command: string,
  args: readonly string[],
  projectRoot: string,
): Promise<{ command: string; args: readonly string[] } | undefined> {
  const tauriArgs = tauriCliArgs(command, args);
  if (tauriArgs === undefined) return undefined;
  try {
    const requireFromProject = createRequire(join(projectRoot, "package.json"));
    const cli = await realpath(
      requireFromProject.resolve("@tauri-apps/cli/tauri.js"),
    );
    const metadata = await lstat(cli);
    if (!metadata.isFile() || !isDependencyPath(cli)) {
      throw new PumarejoError("APP_START_FAILED");
    }
    return {
      command: process.execPath,
      args: [cli, ...tauriArgs],
    };
  } catch (error) {
    if (error instanceof PumarejoError) throw error;
    throw new PumarejoError("APP_START_FAILED", { cause: error });
  }
}
