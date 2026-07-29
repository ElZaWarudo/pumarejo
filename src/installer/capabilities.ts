import { parse as parseToml } from "smol-toml";

import { IntegrationPlanError } from "./plan-error.js";

export const AGENT_PERMISSIONS = [
  "wdio-webdriver:default",
  "core:window:allow-set-size",
  "core:window:allow-maximize",
  "core:window:allow-is-maximized",
  "core:window:allow-unmaximize",
] as const;
type UnknownRecord = Record<string, unknown>;

export function agentCapability(windowLabel: string): {
  readonly identifier: "pumarejo-agent";
  readonly windows: readonly [string];
  readonly permissions: readonly string[];
} {
  return {
    identifier: "pumarejo-agent",
    windows: [windowLabel],
    permissions: [...AGENT_PERMISSIONS],
  };
}

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function parseCapability(
  source: string,
  format: "json" | "toml",
): UnknownRecord {
  try {
    const parsed: unknown =
      format === "json" ? JSON.parse(source) : parseToml(source);
    return record(parsed) ?? {};
  } catch (error) {
    throw new IntegrationPlanError("CAPABILITY_INVALID", { cause: error });
  }
}

export function capabilityMatchesWindow(
  source: string,
  format: "json" | "toml",
  windowLabel: string,
): boolean {
  const capability = parseCapability(source, format);
  const windows = capability.windows;
  return (
    windows === undefined ||
    (Array.isArray(windows) &&
      windows.some((window) => window === "*" || window === windowLabel))
  );
}

export function planCapabilityEdit(
  source: string,
  format: "json" | "toml",
  windowLabel?: string,
): string {
  const capability = parseCapability(source, format);
  const sourceWindows = capability.windows;
  const effectiveWindow =
    windowLabel ??
    (Array.isArray(sourceWindows) &&
    sourceWindows.length === 1 &&
    typeof sourceWindows[0] === "string" &&
    sourceWindows[0] !== "*"
      ? sourceWindows[0]
      : undefined);
  if (effectiveWindow === undefined) {
    throw new IntegrationPlanError("CAPABILITY_INVALID");
  }

  return `${JSON.stringify(agentCapability(effectiveWindow), null, 2)}\n`;
}
