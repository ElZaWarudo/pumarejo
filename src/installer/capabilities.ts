import { parse as parseToml } from "smol-toml";

import { IntegrationPlanError } from "./plan-error.js";

const PERMISSION = "wdio-webdriver:default";
type UnknownRecord = Record<string, unknown>;

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
): string {
  const capability = parseCapability(source, format);
  delete capability.$schema;
  const permissions = capability.permissions;
  if (
    !Array.isArray(permissions) ||
    !permissions.every((permission) => typeof permission === "string")
  ) {
    throw new IntegrationPlanError("CAPABILITY_INVALID");
  }
  if (!permissions.includes(PERMISSION)) {
    permissions.push(PERMISSION);
  }

  return `${JSON.stringify(capability, null, 2)}\n`;
}
