import { delimiter } from "node:path";

import type { LaunchProfile } from "../config/schema.js";
import {
  expandWindowsPortableEnvironment,
  expandWindowsPortableValue,
  isWindowsEnvironmentKeyDenied,
  mergeWindowsEnvironment,
  normalizedWindowsKey,
  reconstructWindowsMinimumEnvironment,
  isSafeWindowsEnvironmentPath,
  WINDOWS_MINIMUM_ENVIRONMENT_KEYS,
  type WindowsEnvironmentRejection,
  type WindowsExpansionLimits,
} from "./windows/environment.js";

const COMMON_KEYS = new Set([
  "AR",
  "CARGO_HOME",
  "CARGO_TARGET_DIR",
  "CC",
  "CFLAGS",
  "CXX",
  "CXXFLAGS",
  "HOME",
  "LANG",
  "LC_ALL",
  "LDFLAGS",
  "LOGNAME",
  "PATH",
  "PKG_CONFIG_PATH",
  "RANLIB",
  "RUSTC_WRAPPER",
  "RUSTFLAGS",
  "RUSTUP_HOME",
  "RUSTUP_TOOLCHAIN",
  "SCCACHE_DIR",
  "SHELL",
  "PUMAREJO_PROVIDER_READY_TIMEOUT_MS",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
  "USERNAME",
]);

const WINDOWS_KEYS = new Set(
  [
    "ALLUSERSPROFILE",
    "APPDATA",
    "CommandPromptType",
    "CommonProgramFiles",
    "CommonProgramFiles(x86)",
    "CommonProgramW6432",
    "COMPUTERNAME",
    "ComSpec",
    "DevEnvDir",
    "ExtensionSdkDir",
    "Framework40Version",
    "FrameworkDir",
    "FrameworkDir32",
    "FrameworkVersion",
    "FrameworkVersion32",
    "FSHARPINSTALLDIR",
    "HOMEDRIVE",
    "HOMEPATH",
    "HTMLHelpDir",
    "INCLUDE",
    "LIB",
    "LIBPATH",
    "LOCALAPPDATA",
    "NETFXSDKDir",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_IDENTIFIER",
    "PROCESSOR_LEVEL",
    "PROCESSOR_REVISION",
    "ProgramData",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "PUBLIC",
    "SystemDrive",
    "SystemRoot",
    "UniversalCRTSdkDir",
    "UCRTVersion",
    "USERDOMAIN",
    "USERDOMAIN_ROAMINGPROFILE",
    "USERPROFILE",
    "VCIDEInstallDir",
    "VCINSTALLDIR",
    "VCToolsInstallDir",
    "VCToolsVersion",
    "VisualStudioVersion",
    "VS170COMNTOOLS",
    "VSCMD_ARG_app_plat",
    "VSCMD_ARG_HOST_ARCH",
    "VSCMD_ARG_TGT_ARCH",
    "VSCMD_VER",
    "VSINSTALLDIR",
    "windir",
    "WindowsLibPath",
    "WindowsSdkBinPath",
    "WindowsSdkDir",
    "WindowsSDKLibVersion",
    "WindowsSDKVersion",
    "__VSCMD_PREINIT_PATH",
  ].map((key) => key.toUpperCase()),
);

const LINUX_KEYS = new Set([
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "GDK_BACKEND",
  "GTK_PATH",
  "LD_LIBRARY_PATH",
  "LIBRARY_PATH",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_DIRS",
  "XDG_CONFIG_HOME",
  "XDG_CURRENT_DESKTOP",
  "XDG_DATA_DIRS",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "XDG_SESSION_DESKTOP",
  "XDG_SESSION_TYPE",
  "PUMAREJO_BACKGROUND_DISPLAY",
]);

export type LaunchPlatform = "windows" | "linux";

export type LaunchEnvironmentDifferenceCategory =
  | "missing-in-child"
  | "added-to-child"
  | "changed"
  | "path-order-changed"
  | "portable-expanded"
  | "source-reconstructed";

export interface LaunchEnvironmentDifference {
  readonly category: LaunchEnvironmentDifferenceCategory;
  readonly count: number;
}

export interface LaunchEnvironmentComparison {
  readonly categories: readonly LaunchEnvironmentDifference[];
  readonly comparedKeys: number;
}

export type LaunchEnvironmentValueSource =
  | "os-machine"
  | "os-user"
  | "host"
  | "profile"
  | "path-prepend"
  | "internal-overlay"
  | "safe-default"
  | "portable-expanded";

export interface LaunchEnvironmentProvenance {
  readonly source: LaunchEnvironmentValueSource;
  readonly expandedFrom?: LaunchEnvironmentValueSource;
}

export interface OperatingSystemEnvironmentSource {
  readonly machine?: NodeJS.ProcessEnv;
  readonly user?: NodeJS.ProcessEnv;
  readonly values?: NodeJS.ProcessEnv;
  readonly available?: boolean;
}

export interface BuildChildEnvironmentOptions {
  readonly platform: LaunchPlatform;
  readonly host: NodeJS.ProcessEnv;
  readonly osSource?:
    | OperatingSystemEnvironmentSource
    | NodeJS.ProcessEnv
    | undefined;
  readonly profile?:
    | Pick<LaunchProfile, "environment" | "pathPrepend">
    | undefined;
  readonly internalOverlay?: NodeJS.ProcessEnv | undefined;
  readonly expansion?: WindowsExpansionLimits | undefined;
}

export interface BuildChildEnvironmentResult {
  readonly environment: NodeJS.ProcessEnv;
  readonly provenance: Readonly<Record<string, LaunchEnvironmentProvenance>>;
  readonly comparison: LaunchEnvironmentComparison;
  readonly status: "complete" | "incomplete";
  readonly missingRequiredKeys: readonly string[];
  readonly rejected: readonly WindowsEnvironmentRejection[];
}

function environmentKey(platform: LaunchPlatform, key: string): string {
  return platform === "windows" ? normalizedWindowsKey(key) : key;
}

export function isAllowedLaunchEnvironmentKey(
  platform: LaunchPlatform,
  key: string,
): boolean {
  const normalized = environmentKey(platform, key);
  return (
    COMMON_KEYS.has(normalized) ||
    (platform === "windows"
      ? WINDOWS_KEYS.has(normalized)
      : LINUX_KEYS.has(normalized) || normalized.startsWith("LC_"))
  );
}

export function sanitizedLaunchEnvironment(
  platform: LaunchPlatform,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    if (
      isAllowedLaunchEnvironmentKey(platform, key) &&
      !(platform === "windows" && isWindowsEnvironmentKeyDenied(key))
    ) {
      if (platform === "windows") {
        const existing = Object.keys(result).find(
          (candidate) =>
            normalizedWindowsKey(candidate) === normalizedWindowsKey(key),
        );
        if (existing !== undefined && existing !== key) delete result[existing];
      }
      result[key] = value;
    }
  }
  return result;
}

function sourceValues(
  source: BuildChildEnvironmentOptions["osSource"],
): readonly (NodeJS.ProcessEnv | undefined)[] {
  if (source === undefined) return [];
  const structured = source as OperatingSystemEnvironmentSource;
  if (
    structured.machine !== undefined ||
    structured.user !== undefined ||
    structured.values !== undefined ||
    structured.available !== undefined
  ) {
    return [structured.machine, structured.user, structured.values];
  }
  return [source as NodeJS.ProcessEnv];
}

function provenanceFor(
  target: Record<string, LaunchEnvironmentProvenance>,
  source: NodeJS.ProcessEnv | undefined,
  kind: LaunchEnvironmentValueSource,
  platform: LaunchPlatform,
): void {
  if (source === undefined) return;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || !isAllowedLaunchEnvironmentKey(platform, key)) {
      continue;
    }
    const normalized = environmentKey(platform, key);
    for (const existing of Object.keys(target)) {
      if (
        environmentKey(platform, existing) === normalized &&
        existing !== key
      ) {
        delete target[existing];
      }
    }
    target[key] = { source: kind };
  }
}

function filteredSource(
  platform: LaunchPlatform,
  source: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  return source === undefined
    ? {}
    : sanitizedLaunchEnvironment(platform, source);
}

function conflictingWindowsKeys(
  sources: readonly (NodeJS.ProcessEnv | undefined)[],
): readonly string[] {
  const conflicts = new Set<string>();
  for (const source of sources) {
    if (source === undefined) continue;
    const values = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(source)) {
      const normalized = normalizedWindowsKey(key);
      if (!values.has(normalized)) {
        values.set(normalized, value);
        continue;
      }
      if (values.get(normalized) !== value) conflicts.add(normalized);
    }
  }
  return [...conflicts].sort((left, right) => left.localeCompare(right));
}

function removeWindowsKeys(
  environment: NodeJS.ProcessEnv,
  keys: readonly string[],
): void {
  const conflicts = new Set(keys);
  for (const key of Object.keys(environment)) {
    if (conflicts.has(normalizedWindowsKey(key))) delete environment[key];
  }
}

function minimumEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const normalized = normalizedWindowsKey(key);
  const actual = Object.keys(environment).find(
    (candidate) => normalizedWindowsKey(candidate) === normalized,
  );
  return actual === undefined ? undefined : environment[actual];
}

function unsafeWindowsMinimumKeys(
  environment: NodeJS.ProcessEnv,
): readonly string[] {
  const pathKeys = new Set([
    "SYSTEMROOT",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
  ]);
  const unsafe: string[] = [];
  for (const key of WINDOWS_MINIMUM_ENVIRONMENT_KEYS) {
    const value = minimumEnvironmentValue(environment, key);
    if (value === undefined || value.trim().length === 0) continue;
    if (pathKeys.has(normalizedWindowsKey(key))) {
      if (!isSafeWindowsEnvironmentPath(value)) unsafe.push(key);
      continue;
    }
  }
  return unsafe;
}

function pathValue(
  environment: NodeJS.ProcessEnv,
  platform: LaunchPlatform,
): string | undefined {
  const key = Object.keys(environment).find(
    (candidate) => environmentKey(platform, candidate) === "PATH",
  );
  return key === undefined ? undefined : environment[key];
}

const COMPARISON_ORDER: readonly LaunchEnvironmentDifferenceCategory[] = [
  "missing-in-child",
  "added-to-child",
  "changed",
  "path-order-changed",
  "portable-expanded",
  "source-reconstructed",
];

export function compareLaunchEnvironments(
  platform: LaunchPlatform,
  host: NodeJS.ProcessEnv,
  child: NodeJS.ProcessEnv,
  options: {
    readonly portableExpandedKeys?: readonly string[];
    readonly sourceReconstructedKeys?: readonly string[];
  } = {},
): LaunchEnvironmentComparison {
  const hostSafe = sanitizedLaunchEnvironment(platform, host);
  const childSafe = sanitizedLaunchEnvironment(platform, child);
  const hostByKey = new Map<string, string>();
  const childByKey = new Map<string, string>();
  for (const [key, value] of Object.entries(hostSafe)) {
    if (value !== undefined)
      hostByKey.set(environmentKey(platform, key), value);
  }
  for (const [key, value] of Object.entries(childSafe)) {
    if (value !== undefined)
      childByKey.set(environmentKey(platform, key), value);
  }
  const counts = new Map<LaunchEnvironmentDifferenceCategory, number>();
  const increment = (category: LaunchEnvironmentDifferenceCategory): void => {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  };
  for (const key of hostByKey.keys()) {
    if (!childByKey.has(key)) increment("missing-in-child");
    else if (hostByKey.get(key) !== childByKey.get(key)) increment("changed");
  }
  for (const key of childByKey.keys()) {
    if (!hostByKey.has(key)) increment("added-to-child");
  }
  const hostPath = pathValue(hostSafe, platform);
  const childPath = pathValue(childSafe, platform);
  if (
    hostPath !== undefined &&
    childPath !== undefined &&
    hostPath !== childPath &&
    new Set(hostPath.split(platform === "windows" ? ";" : delimiter)).size ===
      new Set(childPath.split(platform === "windows" ? ";" : delimiter)).size
  ) {
    const hostEntries = hostPath.split(
      platform === "windows" ? ";" : delimiter,
    );
    const childEntries = childPath.split(
      platform === "windows" ? ";" : delimiter,
    );
    if (
      hostEntries.length === childEntries.length &&
      [...hostEntries].sort().join("\0") === [...childEntries].sort().join("\0")
    ) {
      increment("path-order-changed");
    }
  }
  if (options.portableExpandedKeys !== undefined) {
    for (const key of options.portableExpandedKeys) {
      if (hostByKey.has(environmentKey(platform, key)))
        increment("portable-expanded");
    }
  }
  if (options.sourceReconstructedKeys !== undefined) {
    for (const key of options.sourceReconstructedKeys) {
      if (childByKey.has(environmentKey(platform, key)))
        increment("source-reconstructed");
    }
  }
  const categories = COMPARISON_ORDER.flatMap((category) => {
    const count = counts.get(category) ?? 0;
    return count === 0 ? [] : [{ category, count }];
  });
  return {
    categories,
    comparedKeys: new Set([...hostByKey.keys(), ...childByKey.keys()]).size,
  };
}

export function buildChildEnvironment(
  options: BuildChildEnvironmentOptions,
): BuildChildEnvironmentResult {
  const osSources = sourceValues(options.osSource);
  const osBaseline = osSources.map((source) =>
    filteredSource(options.platform, source),
  );
  const host = filteredSource(options.platform, options.host);
  const profile = filteredSource(
    options.platform,
    options.profile?.environment,
  );
  const internal = filteredSource(options.platform, options.internalOverlay);
  const provenance: Record<string, LaunchEnvironmentProvenance> = {};
  for (const [index, source] of osBaseline.entries()) {
    provenanceFor(
      provenance,
      source,
      index === 0 && osSources.length > 1 ? "os-machine" : "os-user",
      options.platform,
    );
  }
  provenanceFor(provenance, host, "host", options.platform);
  provenanceFor(provenance, profile, "profile", options.platform);
  provenanceFor(provenance, internal, "internal-overlay", options.platform);

  let environment: NodeJS.ProcessEnv;
  let rejected: readonly WindowsEnvironmentRejection[] = [];
  const conflictKeys =
    options.platform === "windows"
      ? conflictingWindowsKeys([
          ...osSources,
          options.host,
          options.profile?.environment,
          options.internalOverlay,
        ])
      : [];
  const suppliedBase =
    options.platform === "windows"
      ? mergeWindowsEnvironment([...osBaseline, host, profile])
      : Object.assign({}, ...osBaseline, host);
  const expandedSource =
    options.platform === "windows"
      ? expandWindowsPortableEnvironment(suppliedBase, options.expansion)
      : { environment: suppliedBase, expandedKeys: [], rejected: [] };
  const reconstructed =
    options.platform === "windows"
      ? reconstructWindowsMinimumEnvironment(suppliedBase, options.expansion)
      : {
          environment: suppliedBase,
          reconstructedKeys: [],
          rejected: [],
        };
  const base =
    options.platform === "windows"
      ? mergeWindowsEnvironment([reconstructed.environment])
      : Object.assign({}, reconstructed.environment, profile);
  if (options.platform === "windows" && conflictKeys.length > 0) {
    removeWindowsKeys(base, conflictKeys);
    rejected = conflictKeys.map((key) => ({
      key,
      code: "environment-key-conflict" as const,
    }));
  }
  if (options.platform === "windows") {
    rejected = [...rejected, ...reconstructed.rejected];
    for (const key of reconstructed.reconstructedKeys) {
      provenance[key] = { source: "safe-default" };
    }
  }
  const pathPrepend = options.profile?.pathPrepend ?? [];
  if (pathPrepend.length > 0) {
    const pathKey =
      options.platform === "windows"
        ? (Object.keys(base).find(
            (key) => environmentKey(options.platform, key) === "PATH",
          ) ?? "Path")
        : "PATH";
    const prepended =
      options.platform === "windows"
        ? pathPrepend.map((value) =>
            expandWindowsPortableValue(value, base, options.expansion),
          )
        : [...pathPrepend];
    const validPrepend = prepended.filter(
      (value): value is string => value !== undefined,
    );
    const current = base[pathKey];
    const joined = [
      ...validPrepend,
      ...(current === undefined ? [] : [current]),
    ].join(options.platform === "windows" ? ";" : delimiter);
    if (options.platform === "windows") {
      base[pathKey] = joined;
    } else base[pathKey] = joined;
    if (options.platform === "windows")
      provenance[pathKey] = { source: "path-prepend" };
  }
  const expanded =
    options.platform === "windows"
      ? expandWindowsPortableEnvironment(
          mergeWindowsEnvironment([base, internal]),
          options.expansion,
        )
      : { environment: base, expandedKeys: [], rejected: [] };
  environment =
    options.platform === "windows"
      ? mergeWindowsEnvironment([expanded.environment])
      : Object.assign({}, expanded.environment, internal);
  rejected = [...rejected, ...expanded.rejected];
  for (const key of [
    ...expandedSource.expandedKeys,
    ...expanded.expandedKeys,
  ]) {
    provenance[key] = {
      source: "portable-expanded",
      expandedFrom: provenance[key]?.source,
    };
  }
  const presentKeys = new Set(
    Object.keys(environment).map((key) =>
      environmentKey(options.platform, key),
    ),
  );
  const missingRequiredKeys =
    options.platform === "windows"
      ? WINDOWS_MINIMUM_ENVIRONMENT_KEYS.filter((key) => {
          const normalized = environmentKey(options.platform, key);
          if (!presentKeys.has(normalized)) return true;
          const actualKey = Object.keys(environment).find(
            (candidate) =>
              environmentKey(options.platform, candidate) === normalized,
          );
          const value =
            actualKey === undefined ? undefined : environment[actualKey];
          return value === undefined || value.trim().length === 0;
        })
      : [];
  const unsafeRequiredKeys =
    options.platform === "windows" ? unsafeWindowsMinimumKeys(environment) : [];
  if (unsafeRequiredKeys.length > 0) {
    rejected = [
      ...rejected,
      ...unsafeRequiredKeys.map((key) => ({
        key,
        code: "environment-path-unsafe" as const,
      })),
    ];
  }
  const sourceReconstructedKeys = [
    ...new Set([
      ...reconstructed.reconstructedKeys,
      ...osSources.flatMap((source) =>
        Object.keys(source ?? {}).filter((key) =>
          isAllowedLaunchEnvironmentKey(options.platform, key),
        ),
      ),
    ]),
  ];
  return {
    environment,
    provenance,
    comparison: compareLaunchEnvironments(
      options.platform,
      options.host,
      environment,
      {
        portableExpandedKeys: expanded.expandedKeys,
        sourceReconstructedKeys,
      },
    ),
    status:
      missingRequiredKeys.length === 0 &&
      conflictKeys.length === 0 &&
      unsafeRequiredKeys.length === 0
        ? "complete"
        : "incomplete",
    missingRequiredKeys,
    rejected,
  };
}

export function resolvedLaunchEnvironmentResult(
  platform: LaunchPlatform,
  hostEnvironment: NodeJS.ProcessEnv,
  profile: LaunchProfile,
  internalEnvironment: NodeJS.ProcessEnv = {},
  osSource?: OperatingSystemEnvironmentSource,
): BuildChildEnvironmentResult {
  return buildChildEnvironment({
    platform,
    host: hostEnvironment,
    profile,
    internalOverlay: internalEnvironment,
    osSource,
  });
}

export function resolvedLaunchEnvironment(
  platform: LaunchPlatform,
  hostEnvironment: NodeJS.ProcessEnv,
  profile: LaunchProfile,
  internalEnvironment: NodeJS.ProcessEnv = {},
  osSource?: OperatingSystemEnvironmentSource,
): NodeJS.ProcessEnv {
  return resolvedLaunchEnvironmentResult(
    platform,
    hostEnvironment,
    profile,
    internalEnvironment,
    osSource,
  ).environment;
}
