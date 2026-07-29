import { resolve } from "node:path";

import type { LoadedProjectConfig } from "../config/load.js";
import { executableBasename } from "../shared/executable.js";
import { TAURI_WEBDRIVER_PLUGIN_VERSION, VERSION } from "../version.js";
import { contentHash } from "./manifest.js";
import { readSafeFile } from "./plan.js";
import { applyWrites } from "./write.js";

export const LAUNCH_VERIFICATION_RELATIVE_PATH =
  ".pumarejo/launch-verification.json";

export interface LaunchVerification {
  readonly version: 1;
  readonly pumarejoVersion: string;
  readonly pluginVersion: string;
  readonly executable: string;
  readonly platform: "win32" | "linux";
  readonly verified: true;
}

function executableIdentity(command: string): string {
  return executableBasename(command).toLowerCase();
}

function serialize(value: LaunchVerification): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parse(source: string): LaunchVerification {
  const parsed: unknown = JSON.parse(source);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    typeof (parsed as { pumarejoVersion?: unknown }).pumarejoVersion !==
      "string" ||
    typeof (parsed as { pluginVersion?: unknown }).pluginVersion !== "string" ||
    typeof (parsed as { executable?: unknown }).executable !== "string" ||
    !["win32", "linux"].includes(
      String((parsed as { platform?: unknown }).platform),
    ) ||
    (parsed as { verified?: unknown }).verified !== true
  ) {
    throw new Error("Invalid launch verification.");
  }
  return parsed as LaunchVerification;
}

export async function readLaunchVerification(
  loaded: LoadedProjectConfig,
): Promise<LaunchVerification | undefined> {
  try {
    const source = await readSafeFile(
      loaded.projectRoot,
      resolve(loaded.projectRoot, LAUNCH_VERIFICATION_RELATIVE_PATH),
      false,
    );
    if (source === null) return undefined;
    const verification = parse(source);
    const expectedExecutable = executableIdentity(
      loaded.config.launch.executablePath ?? loaded.config.launch.command,
    );
    return verification.pumarejoVersion === VERSION &&
      verification.pluginVersion === TAURI_WEBDRIVER_PLUGIN_VERSION &&
      verification.executable === expectedExecutable
      ? verification
      : undefined;
  } catch {
    return undefined;
  }
}

export async function recordLaunchVerification(
  loaded: LoadedProjectConfig,
  platform: "win32" | "linux",
): Promise<void> {
  const absolutePath = resolve(
    loaded.projectRoot,
    LAUNCH_VERIFICATION_RELATIVE_PATH,
  );
  const beforeContent = await readSafeFile(
    loaded.projectRoot,
    absolutePath,
    false,
  );
  const afterContent = serialize({
    version: 1,
    pumarejoVersion: VERSION,
    pluginVersion: TAURI_WEBDRIVER_PLUGIN_VERSION,
    executable: executableIdentity(
      loaded.config.launch.executablePath ?? loaded.config.launch.command,
    ),
    platform,
    verified: true,
  });
  if (beforeContent === afterContent) return;
  await applyWrites(loaded.projectRoot, [
    {
      absolutePath,
      relativePath: LAUNCH_VERIFICATION_RELATIVE_PATH,
      beforeContent,
      beforeHash: beforeContent === null ? null : contentHash(beforeContent),
      afterContent,
      afterHash: contentHash(afterContent),
    },
  ]);
}
