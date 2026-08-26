import type {
  SelfDoctorDiagnosticId,
  SelfDoctorDiagnosticStatus,
} from "./self-doctor.js";
import {
  inspectSelfDoctorPath,
  type SelfDoctorFileSystem,
  type SelfDoctorPathBudget,
  type SelfDoctorPathInspection,
} from "./self-doctor-paths.js";
import type {
  ToolchainComparisonDisposition,
  ToolchainKind,
  ToolchainResolution,
} from "../platform/toolchain-resolver.js";

const MAX_DEPENDENCIES = 64;
const MAX_RESOLVER_CANDIDATES = 32;
const SAFE_PACKAGE_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const SAFE_TOOLCHAIN_SOURCES = new Set([
  "explicit",
  "child-path",
  "platform-root",
  "host-path",
]);
const SAFE_ENGINE = /^(?:(>=|>|<=|<|=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*)+$/u;
const LOCKFILES = {
  pnpm: "pnpm-lock.yaml",
  npm: "package-lock.json",
  yarn: "yarn.lock",
  bun: "bun.lock",
} as const;

type PackageMetadata = Record<string, unknown>;
type Manager = keyof typeof LOCKFILES;
interface DeclaredDependency {
  readonly name: string;
  readonly version: string;
  readonly optional: boolean;
}

export interface SelfDoctorFinding {
  readonly id: SelfDoctorDiagnosticId;
  readonly status: SelfDoctorDiagnosticStatus;
  readonly code: string;
  readonly summary: string;
  readonly action?: string;
  readonly evidence?: Readonly<Record<string, string | number | boolean>>;
}

export interface SelfDoctorHealthOptions {
  readonly root: string;
  readonly manifest?: PackageMetadata;
  readonly platform: NodeJS.Platform;
  readonly fileSystem: SelfDoctorFileSystem;
  readonly budget: SelfDoctorPathBudget;
  readonly toolchainResolutions?: Partial<
    Readonly<Record<ToolchainKind, ToolchainResolution>>
  >;
}

export interface SelfDoctorHealthResult {
  readonly findings: readonly SelfDoctorFinding[];
  readonly inspections: readonly SelfDoctorPathInspection[];
  readonly bounded: boolean;
}

function object(value: unknown): PackageMetadata | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PackageMetadata)
    : undefined;
}

function finding(
  id: SelfDoctorDiagnosticId,
  status: SelfDoctorDiagnosticStatus,
  code: string,
  summary: string,
  action?: string,
  evidence?: Readonly<Record<string, string | number | boolean>>,
): SelfDoctorFinding {
  return {
    id,
    status,
    code,
    summary,
    ...(action ? { action } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

function manualAction(subject: string): string {
  return `Inspect ${subject} manually; no repair or lifecycle script was run.`;
}

function declaredManager(
  manifest: PackageMetadata | undefined,
): { readonly name: Manager; readonly version: string } | undefined {
  if (typeof manifest?.packageManager !== "string") return undefined;
  const match =
    /^(pnpm|npm|yarn|bun)@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/u.exec(
      manifest.packageManager,
    );
  return match === null
    ? undefined
    : { name: match[1] as Manager, version: match[2]! };
}

function declaredDependencies(
  manifest: PackageMetadata | undefined,
): readonly DeclaredDependency[] | undefined {
  const dependencies = object(manifest?.dependencies) ?? {};
  const optional = object(manifest?.optionalDependencies) ?? {};
  const names = [
    ...new Set([...Object.keys(dependencies), ...Object.keys(optional)]),
  ];
  if (
    names.length > MAX_DEPENDENCIES ||
    names.some((name) => {
      const version = optional[name] ?? dependencies[name];
      return (
        !SAFE_PACKAGE_NAME.test(name) ||
        typeof version !== "string" ||
        version.length > 128
      );
    })
  ) {
    return undefined;
  }
  return names.map((name) => ({
    name,
    version: (optional[name] ?? dependencies[name]) as string,
    optional: name in optional,
  }));
}

function validLockfile(manager: Manager, content: string): boolean {
  try {
    switch (manager) {
      case "npm":
        return typeof object(JSON.parse(content))?.lockfileVersion === "number";
      case "pnpm":
        return (
          /^lockfileVersion:\s*['"]?[0-9.]+['"]?\s*$/mu.test(content) &&
          /^importers:\s*$/mu.test(content)
        );
      case "yarn":
        return (
          /^(?:# yarn lockfile v\d+|__metadata:)$/mu.test(content) &&
          !content.includes("\0")
        );
      case "bun":
        return false;
    }
  } catch {
    return false;
  }
}

async function inspect(
  options: SelfDoctorHealthOptions,
  entry: string,
  inspections: SelfDoctorPathInspection[],
): Promise<SelfDoctorPathInspection> {
  const result = await inspectSelfDoctorPath(options.root, entry, {
    platform: options.platform,
    fileSystem: options.fileSystem,
    budget: options.budget,
  });
  inspections.push(result);
  return result;
}

async function installationFindings(options: SelfDoctorHealthOptions): Promise<{
  findings: SelfDoctorFinding[];
  inspections: SelfDoctorPathInspection[];
  bounded: boolean;
}> {
  if (options.manifest === undefined) {
    return {
      findings: [
        "self.dependencies.resolution",
        "self.installation.lockfile",
        "self.installation.binaries",
      ].map((id) =>
        finding(
          id as SelfDoctorDiagnosticId,
          "warn",
          "metadata-unavailable",
          "Installation health could not be proven without verified package metadata.",
          manualAction("the installed package metadata"),
        ),
      ),
      inspections: [],
      bounded: false,
    };
  }
  const findings: SelfDoctorFinding[] = [];
  const inspections: SelfDoctorPathInspection[] = [];
  const dependencies = declaredDependencies(options.manifest);
  let bounded = dependencies === undefined;
  let resolved = 0;
  let unavailable = 0;
  let failed = 0;
  let dependencyFailure:
    | "dependency-missing"
    | "dependency-stale"
    | "dependency-unsafe"
    | undefined;
  const dependencyManifests: Array<{
    name: string;
    manifest: PackageMetadata;
  }> = [];
  for (const dependency of dependencies ?? []) {
    const result = await inspect(
      options,
      `node_modules/${dependency.name}/package.json`,
      inspections,
    );
    if (result.status !== "safe" || result.content === undefined) {
      bounded ||= result.status === "budget";
      if (result.status === "unknown" || dependency.optional) unavailable += 1;
      else {
        failed += 1;
        dependencyFailure =
          result.status === "missing"
            ? "dependency-missing"
            : "dependency-unsafe";
      }
      continue;
    }
    try {
      const parsed = object(JSON.parse(result.content));
      if (
        parsed?.name === dependency.name &&
        typeof parsed.version === "string" &&
        SAFE_VERSION.test(dependency.version) &&
        parsed.version === dependency.version
      ) {
        resolved += 1;
        dependencyManifests.push({ name: dependency.name, manifest: parsed });
      } else if (
        parsed?.name === dependency.name &&
        !SAFE_VERSION.test(dependency.version)
      ) {
        unavailable += 1;
        dependencyManifests.push({ name: dependency.name, manifest: parsed });
      } else {
        failed += 1;
        dependencyFailure =
          parsed?.name === dependency.name
            ? "dependency-stale"
            : "dependency-unsafe";
      }
    } catch {
      failed += 1;
      dependencyFailure = "dependency-unsafe";
    }
  }
  findings.push(
    finding(
      "self.dependencies.resolution",
      bounded || failed > 0 ? "error" : unavailable > 0 ? "warn" : "ready",
      bounded
        ? "dependency-bounds"
        : failed > 0
          ? (dependencyFailure ?? "dependency-missing")
          : unavailable > 0
            ? "dependency-unverified"
            : "verified",
      bounded
        ? "Declared dependency inspection exceeded its reviewed bounds."
        : failed > 0
          ? "One or more declared dependencies are missing or unsafe."
          : unavailable > 0
            ? "One or more declared dependencies could not be verified without following links."
            : "Declared dependency manifests were resolved within the package boundary.",
      bounded || failed > 0 || unavailable > 0
        ? manualAction("the installed dependencies")
        : undefined,
      { declared: dependencies?.length ?? 0, resolved, failed, unavailable },
    ),
  );

  const manager = declaredManager(options.manifest);
  const lockResults = await Promise.all(
    Object.entries(LOCKFILES).map(async ([name, entry]) => ({
      name: name as Manager,
      result: await inspect(options, entry, inspections),
    })),
  );
  const present = lockResults.filter(({ result }) => result.status === "safe");
  const expected =
    manager === undefined
      ? undefined
      : lockResults.find(({ name }) => name === manager.name);
  bounded ||= lockResults.some(({ result }) => result.status === "budget");
  const lockValid =
    expected?.result.status === "safe" &&
    expected.result.content !== undefined &&
    validLockfile(expected.name, expected.result.content);
  const lockReady = lockValid && present.length === 1;
  findings.push(
    finding(
      "self.installation.lockfile",
      bounded || present.length > 1 || !lockReady ? "error" : "ready",
      bounded
        ? "lockfile-bounds"
        : present.length > 1
          ? "lockfile-ambiguous"
          : manager === undefined
            ? "manager-unsupported"
            : expected?.result.status === "safe" && !lockValid
              ? "lockfile-invalid"
              : lockReady
                ? "verified"
                : "lockfile-absent",
      lockReady
        ? "The declared package manager and lockfile family are coherent."
        : "The declared package manager and lockfile family could not be proven coherent.",
      lockReady
        ? undefined
        : manualAction("the selected manager and frozen lockfile"),
      { lockfiles: present.length, managerDeclared: manager !== undefined },
    ),
  );

  const binTargets: string[] = [];
  const collectBins = (manifest: PackageMetadata, prefix = "") => {
    const value = manifest.bin;
    const targets =
      typeof value === "string"
        ? [value]
        : Object.values(object(value) ?? {}).filter(
            (item): item is string => typeof item === "string",
          );
    for (const target of targets)
      binTargets.push(`${prefix}${target.replace(/^\.\//u, "")}`);
  };
  if (options.manifest !== undefined) collectBins(options.manifest);
  for (const dependency of dependencyManifests) {
    collectBins(dependency.manifest, `node_modules/${dependency.name}/`);
  }
  let verifiedBins = 0;
  let executableBins = 0;
  let failedBins = 0;
  let unavailableBins = 0;
  let binaryFailure: "binary-missing" | "binary-unsafe" | undefined;
  for (const target of binTargets.slice(0, MAX_DEPENDENCIES)) {
    const result = await inspect(options, target, inspections);
    if (result.status === "safe") {
      verifiedBins += 1;
      if (result.executable === true) executableBins += 1;
    } else if (result.status === "unknown") unavailableBins += 1;
    else {
      failedBins += 1;
      binaryFailure =
        result.status === "missing" ? "binary-missing" : "binary-unsafe";
    }
    bounded ||= result.status === "budget";
  }
  bounded ||= binTargets.length > MAX_DEPENDENCIES;
  const scripts = object(options.manifest?.scripts);
  const binariesReady =
    !bounded &&
    failedBins === 0 &&
    unavailableBins === 0 &&
    binTargets.length > 0;
  findings.push(
    finding(
      "self.installation.binaries",
      bounded || failedBins > 0 ? "error" : binariesReady ? "ready" : "warn",
      bounded
        ? "binary-bounds"
        : failedBins > 0
          ? (binaryFailure ?? "binary-missing")
          : binariesReady
            ? "verified"
            : "binary-unverified",
      binariesReady
        ? "Declared package binaries exist as verified regular files."
        : "One or more declared package binaries could not be safely verified.",
      binariesReady ? undefined : manualAction("the package binary targets"),
      {
        declared: binTargets.length,
        verified: verifiedBins,
        executable: executableBins,
        failed: failedBins,
        unavailable: unavailableBins,
        postinstallDeclared: typeof scripts?.postinstall === "string",
      },
    ),
  );
  return { findings, inspections, bounded };
}

function versionTuple(
  version: string,
): readonly [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(version);
  return match === null
    ? undefined
    : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTuple(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function satisfiesEngine(version: string, range: unknown): boolean | undefined {
  const actual = versionTuple(version);
  if (
    actual === undefined ||
    typeof range !== "string" ||
    !SAFE_ENGINE.test(range)
  )
    return undefined;
  const expressions = [
    ...range.matchAll(/(>=|>|<=|<|=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/gu),
  ];
  if (expressions.length === 0) return undefined;
  return expressions.every((match) => {
    const expected = [
      Number(match[2]),
      Number(match[3] ?? 0),
      Number(match[4] ?? 0),
    ];
    const compared = compareTuple(actual, expected);
    switch (match[1] ?? "=") {
      case ">=":
        return compared >= 0;
      case ">":
        return compared > 0;
      case "<=":
        return compared <= 0;
      case "<":
        return compared < 0;
      default:
        return compared === 0;
    }
  });
}

function resolverFindings(options: SelfDoctorHealthOptions): {
  findings: SelfDoctorFinding[];
  bounded: boolean;
} {
  const manager = declaredManager(options.manifest);
  const resolutions = options.toolchainResolutions;
  if (resolutions === undefined) {
    return {
      bounded: false,
      findings: ["node", "package-manager", "host-child"].map((subject) =>
        finding(
          `self.toolchain.${subject}` as SelfDoctorDiagnosticId,
          "warn",
          "unknown",
          "Toolchain compatibility could not be proven without accepted resolver evidence.",
          manualAction("the host and child toolchain"),
          { disposition: "unknown", reason: "resolver-evidence-unavailable" },
        ),
      ),
    };
  }
  const bounded = Object.values(resolutions).some(
    (resolution) =>
      (resolution?.candidates.length ?? 0) > MAX_RESOLVER_CANDIDATES,
  );
  const node = resolutions.node;
  const nodeVersion = node?.accepted?.version;
  const engine = object(options.manifest?.engines)?.node;
  const nodeCompatible =
    nodeVersion === undefined
      ? undefined
      : satisfiesEngine(nodeVersion, engine);
  const managerResolution =
    manager === undefined || !(manager.name in resolutions)
      ? undefined
      : resolutions[manager.name as ToolchainKind];
  const managerVersion = managerResolution?.accepted?.version;
  const managerCompatible =
    manager === undefined || managerVersion === undefined
      ? undefined
      : managerVersion === manager.version;
  const safeSource = (value: unknown): string =>
    typeof value === "string" && SAFE_TOOLCHAIN_SOURCES.has(value)
      ? value
      : "unknown";
  const comparisons = [node, managerResolution]
    .map((resolution) => resolution?.comparison)
    .filter((value) => value !== undefined);
  const hostChildDisposition: ToolchainComparisonDisposition = (() => {
    if (options.platform === "win32" || comparisons.length !== 2) {
      return "unknown";
    }
    for (const disposition of [
      "environment_mismatch",
      "version_mismatch",
      "host_only",
      "child_only",
      "unknown",
    ] as const) {
      if (comparisons.some((item) => item!.disposition === disposition)) {
        return disposition;
      }
    }
    return "consistent";
  })();
  return {
    bounded,
    findings: [
      finding(
        "self.toolchain.node",
        nodeCompatible === true
          ? "ready"
          : nodeCompatible === false
            ? "error"
            : "warn",
        nodeCompatible === true
          ? "verified"
          : nodeCompatible === false
            ? "engine-mismatch"
            : "node-unknown",
        nodeCompatible === true
          ? "The resolved Node version satisfies the declared engine range."
          : "Node engine compatibility could not be confirmed.",
        nodeCompatible === true
          ? undefined
          : manualAction("the declared Node engine and resolved version"),
        nodeVersion !== undefined && SAFE_VERSION.test(nodeVersion)
          ? { version: nodeVersion, source: safeSource(node!.accepted!.source) }
          : undefined,
      ),
      finding(
        "self.toolchain.package-manager",
        managerCompatible === true
          ? "ready"
          : managerCompatible === false
            ? "error"
            : "warn",
        managerCompatible === true
          ? "verified"
          : managerCompatible === false
            ? "manager-version-mismatch"
            : "manager-unknown",
        managerCompatible === true
          ? "The resolved package-manager version exactly matches the declaration."
          : "Package-manager compatibility could not be confirmed.",
        managerCompatible === true
          ? undefined
          : manualAction("the packageManager declaration and resolved version"),
        managerVersion !== undefined && SAFE_VERSION.test(managerVersion)
          ? {
              manager: manager?.name ?? "unknown",
              version: managerVersion,
              source: safeSource(managerResolution!.accepted!.source),
            }
          : undefined,
      ),
      finding(
        "self.toolchain.host-child",
        hostChildDisposition === "consistent"
          ? "ready"
          : hostChildDisposition === "unknown"
            ? "warn"
            : "error",
        hostChildDisposition === "consistent"
          ? "verified"
          : hostChildDisposition,
        hostChildDisposition === "consistent"
          ? "Host and effective child toolchains are consistent."
          : "Host and effective child toolchain consistency could not be proven.",
        hostChildDisposition === "consistent"
          ? undefined
          : manualAction("the effective child launch environment"),
        { comparisons: comparisons.length, disposition: hostChildDisposition },
      ),
    ],
  };
}

export async function inspectSelfDoctorHealth(
  options: SelfDoctorHealthOptions,
): Promise<SelfDoctorHealthResult> {
  const installation = await installationFindings(options);
  const resolver = resolverFindings(options);
  return {
    findings: [...installation.findings, ...resolver.findings],
    inspections: installation.inspections,
    bounded: installation.bounded || resolver.bounded,
  };
}
