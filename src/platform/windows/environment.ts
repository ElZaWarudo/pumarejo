import { delimiter as pathDelimiter } from "node:path";

export const WINDOWS_MINIMUM_ENVIRONMENT_KEYS = [
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "Path",
  "TEMP",
  "TMP",
  "USERPROFILE",
] as const;

/** The smallest fixed extension set needed for Windows executable lookup. */
export const WINDOWS_SAFE_DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

export type WindowsEnvironmentRejectionCode =
  | "environment-key-denied"
  | "environment-key-conflict"
  | "environment-value-invalid"
  | "environment-path-unsafe"
  | "environment-value-secret"
  | "portable-expansion-unresolved"
  | "portable-expansion-cycle"
  | "portable-expansion-too-large"
  | "portable-expansion-nul";

export interface WindowsEnvironmentRejection {
  readonly key: string;
  readonly code: WindowsEnvironmentRejectionCode;
}

export interface WindowsExpansionLimits {
  readonly maxPasses?: number;
  readonly maxValueLength?: number;
}

export interface WindowsExpansionResult {
  readonly environment: NodeJS.ProcessEnv;
  readonly expandedKeys: readonly string[];
  readonly rejected: readonly WindowsEnvironmentRejection[];
}

export interface WindowsMinimumReconstructionResult {
  readonly environment: NodeJS.ProcessEnv;
  readonly reconstructedKeys: readonly string[];
  readonly rejected: readonly WindowsEnvironmentRejection[];
}

const VARIABLE_PATTERN = /%([A-Za-z_][A-Za-z0-9_]*)%/gu;
const VARIABLE_CHECK_PATTERN = /%([A-Za-z_][A-Za-z0-9_]*)%/u;
const SECRET_KEY_PATTERN =
  /(?:^|[_-])(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)(?:$|[_-])/iu;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+|(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*|sk-[A-Za-z0-9]{12,})/iu;

export function normalizedWindowsKey(key: string): string {
  return key.toUpperCase();
}

export function isWindowsEnvironmentKeyDenied(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function isWindowsEnvironmentValueSecret(value: string): boolean {
  return SECRET_VALUE_PATTERN.test(value);
}

function setWindowsEnvironmentValue(
  target: NodeJS.ProcessEnv,
  key: string,
  value: string,
): void {
  const normalized = normalizedWindowsKey(key);
  for (const existing of Object.keys(target)) {
    if (normalizedWindowsKey(existing) === normalized && existing !== key) {
      delete target[existing];
    }
  }
  target[key] = value;
}

function windowsEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const normalized = normalizedWindowsKey(key);
  const actual = Object.keys(environment).find(
    (candidate) => normalizedWindowsKey(candidate) === normalized,
  );
  return actual === undefined ? undefined : environment[actual];
}

function hasWindowsEnvironmentKey(
  environment: NodeJS.ProcessEnv,
  key: string,
): boolean {
  return Object.keys(environment).some(
    (candidate) =>
      normalizedWindowsKey(candidate) === normalizedWindowsKey(key),
  );
}

function isSafeWindowsPath(value: string): boolean {
  if (
    value.trim() !== value ||
    value.length === 0 ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f"<>|]/u.test(value) ||
    VARIABLE_CHECK_PATTERN.test(value)
  ) {
    return false;
  }
  const normalized = value.replaceAll("/", "\\");
  if (!/^[A-Za-z]:\\/u.test(normalized)) {
    return false;
  }
  return !normalized
    .split("\\")
    .some((segment) => segment === ".." || segment === ".");
}

/**
 * Reconstruct only the fixed Windows launch minimum that can be proven from
 * already supplied values. This deliberately does not invent a user root or
 * copy an unrestricted parent environment.
 */
export function reconstructWindowsMinimumEnvironment(
  source: NodeJS.ProcessEnv,
  limits: WindowsExpansionLimits = {},
): WindowsMinimumReconstructionResult {
  const expanded = expandWindowsPortableEnvironment(source, limits);
  const environment = mergeWindowsEnvironment([expanded.environment]);
  const reconstructedKeys: string[] = [];
  const rejected: WindowsEnvironmentRejection[] = [...expanded.rejected];

  const systemRoot = windowsEnvironmentValue(environment, "SystemRoot");
  const sourceSystemRoot = windowsEnvironmentValue(source, "SystemRoot");
  const sourceComSpec = windowsEnvironmentValue(source, "ComSpec");
  if (!hasWindowsEnvironmentKey(environment, "ComSpec")) {
    if (
      sourceComSpec === undefined &&
      systemRoot !== undefined &&
      isSafeWindowsPath(systemRoot)
    ) {
      setWindowsEnvironmentValue(
        environment,
        "ComSpec",
        `${systemRoot.replace(/[\\/]+$/u, "")}\\System32\\cmd.exe`,
      );
      reconstructedKeys.push("ComSpec");
    } else if (
      systemRoot !== undefined ||
      sourceSystemRoot !== undefined ||
      sourceComSpec !== undefined
    ) {
      rejected.push({ key: "ComSpec", code: "environment-path-unsafe" });
    }
  }

  if (!hasWindowsEnvironmentKey(environment, "PATHEXT")) {
    setWindowsEnvironmentValue(
      environment,
      "PATHEXT",
      WINDOWS_SAFE_DEFAULT_PATHEXT,
    );
    reconstructedKeys.push("PATHEXT");
  }

  const temp = windowsEnvironmentValue(environment, "TEMP");
  const sourceTmp = windowsEnvironmentValue(source, "TMP");
  if (!hasWindowsEnvironmentKey(environment, "TMP")) {
    if (
      sourceTmp === undefined &&
      temp !== undefined &&
      isSafeWindowsPath(temp)
    ) {
      setWindowsEnvironmentValue(environment, "TMP", temp);
      reconstructedKeys.push("TMP");
    } else if (temp !== undefined || sourceTmp !== undefined) {
      rejected.push({ key: "TMP", code: "environment-path-unsafe" });
    }
  }

  return { environment, reconstructedKeys, rejected };
}

export function isSafeWindowsEnvironmentPath(value: string): boolean {
  return isSafeWindowsPath(value);
}

export function mergeWindowsEnvironment(
  sources: readonly (NodeJS.ProcessEnv | undefined)[],
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const source of sources) {
    if (source === undefined) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      setWindowsEnvironmentValue(result, key, value);
    }
  }
  return result;
}

function expandValue(
  value: string,
  environment: ReadonlyMap<string, string>,
  limits: Required<WindowsExpansionLimits>,
): {
  readonly value?: string;
  readonly code?: WindowsEnvironmentRejectionCode;
} {
  if (value.includes("\0")) return { code: "portable-expansion-nul" };
  if (value.length > limits.maxValueLength) {
    return { code: "portable-expansion-too-large" };
  }
  let expanded = value;
  const seen = new Set<string>();
  for (let pass = 0; pass < limits.maxPasses; pass += 1) {
    if (expanded.length > limits.maxValueLength) {
      return { code: "portable-expansion-too-large" };
    }
    if (seen.has(expanded)) return { code: "portable-expansion-cycle" };
    seen.add(expanded);
    let unresolved = false;
    const next = expanded.replace(VARIABLE_PATTERN, (match, variable) => {
      const replacement = environment.get(
        normalizedWindowsKey(String(variable)),
      );
      if (replacement === undefined) {
        unresolved = true;
        return match;
      }
      return replacement;
    });
    if (next === expanded) {
      if (unresolved) return { code: "portable-expansion-unresolved" };
      if (VARIABLE_CHECK_PATTERN.test(expanded)) {
        return { code: "portable-expansion-cycle" };
      }
      return { value: expanded };
    }
    expanded = next;
  }
  if (expanded.length > limits.maxValueLength) {
    return { code: "portable-expansion-too-large" };
  }
  return VARIABLE_CHECK_PATTERN.test(expanded)
    ? { code: "portable-expansion-cycle" }
    : { value: expanded };
}

/**
 * Expand PATH one entry at a time. Installers such as nvm-windows leave
 * entries like `%NVM_HOME%` that only resolve in an interactive profile;
 * dropping just those entries keeps the rest of PATH usable.
 */
function expandPathValue(
  value: string,
  environment: ReadonlyMap<string, string>,
  limits: Required<WindowsExpansionLimits>,
): {
  readonly value?: string;
  readonly code?: WindowsEnvironmentRejectionCode;
} {
  if (value.includes("\0")) return { code: "portable-expansion-nul" };
  if (value.length > limits.maxValueLength) {
    return { code: "portable-expansion-too-large" };
  }
  const entries = splitWindowsPath(value);
  const kept: string[] = [];
  let firstFailure: WindowsEnvironmentRejectionCode | undefined;
  for (const entry of entries) {
    const result = expandValue(entry, environment, limits);
    if (result.value === undefined) {
      if (result.code !== "portable-expansion-unresolved") return result;
      firstFailure ??= result.code;
      continue;
    }
    kept.push(result.value);
  }
  if (kept.length === 0 && entries.length > 0) {
    return { code: firstFailure ?? "portable-expansion-unresolved" };
  }
  const joined = kept.join(";");
  return joined.length > limits.maxValueLength
    ? { code: "portable-expansion-too-large" }
    : { value: joined };
}

export function expandWindowsPortableEnvironment(
  source: NodeJS.ProcessEnv,
  limits: WindowsExpansionLimits = {},
): WindowsExpansionResult {
  const bounded: Required<WindowsExpansionLimits> = {
    maxPasses: Math.min(Math.max(Math.trunc(limits.maxPasses ?? 8), 1), 16),
    maxValueLength: Math.min(
      Math.max(Math.trunc(limits.maxValueLength ?? 32_768), 1),
      131_072,
    ),
  };
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      !isWindowsEnvironmentKeyDenied(key) &&
      !isWindowsEnvironmentValueSecret(value) &&
      !value.includes("\0")
    ) {
      normalized.set(normalizedWindowsKey(key), value);
    }
  }
  const environment: NodeJS.ProcessEnv = {};
  const expandedKeys: string[] = [];
  const rejected: WindowsEnvironmentRejection[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isWindowsEnvironmentKeyDenied(key)) {
      rejected.push({ key, code: "environment-key-denied" });
      continue;
    }
    if (isWindowsEnvironmentValueSecret(value)) {
      rejected.push({ key, code: "environment-value-secret" });
      continue;
    }
    const result =
      normalizedWindowsKey(key) === "PATH"
        ? expandPathValue(value, normalized, bounded)
        : expandValue(value, normalized, bounded);
    if (result.value === undefined) {
      rejected.push({
        key,
        code: result.code ?? "environment-value-invalid",
      });
      continue;
    }
    if (
      isWindowsEnvironmentValueSecret(result.value) ||
      result.value.includes("\0")
    ) {
      rejected.push({ key, code: "environment-value-secret" });
      continue;
    }
    if (result.value !== value) expandedKeys.push(key);
    setWindowsEnvironmentValue(environment, key, result.value);
  }
  return {
    environment,
    expandedKeys: [...new Set(expandedKeys)].sort((left, right) =>
      left.localeCompare(right),
    ),
    rejected: rejected.sort((left, right) =>
      `${left.key}:${left.code}`.localeCompare(`${right.key}:${right.code}`),
    ),
  };
}

export function expandWindowsPortableValue(
  value: string,
  environment: NodeJS.ProcessEnv,
  limits: WindowsExpansionLimits = {},
): string | undefined {
  const result = expandWindowsPortableEnvironment(
    { __PUMAREJO_VALUE__: value, ...environment },
    limits,
  );
  return result.environment.__PUMAREJO_VALUE__;
}

export function splitWindowsPath(value: string | undefined): readonly string[] {
  return value === undefined
    ? []
    : value.split(pathDelimiter === ";" ? ";" : ";").filter(Boolean);
}
