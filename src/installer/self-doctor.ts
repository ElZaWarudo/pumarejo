import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  defaultSelfDoctorFileSystem,
  inspectSelfDoctorPath,
  MAX_SELF_DOCTOR_DEPTH,
  MAX_SELF_DOCTOR_ENTRIES,
  MAX_SELF_DOCTOR_FILE_BYTES,
  MAX_SELF_DOCTOR_TOTAL_BYTES,
  type SelfDoctorFileSystem,
  type SelfDoctorPathBudget,
  type SelfDoctorPathInspection,
} from "./self-doctor-paths.js";
import {
  inspectSelfDoctorHealth,
  type SelfDoctorFinding,
} from "./self-doctor-health.js";
import type {
  ToolchainKind,
  ToolchainResolution,
} from "../platform/toolchain-resolver.js";

export const SELF_DOCTOR_REPORT_VERSION = 1 as const;
export const SELF_DOCTOR_DIAGNOSTIC_IDS = [
  "self.package.metadata",
  "self.installation.paths",
  "self.installation.links",
  "self.dependencies.resolution",
  "self.installation.lockfile",
  "self.installation.binaries",
  "self.toolchain.node",
  "self.toolchain.package-manager",
  "self.toolchain.host-child",
  "self.report.bounds",
] as const;

export type SelfDoctorDiagnosticId =
  (typeof SELF_DOCTOR_DIAGNOSTIC_IDS)[number];
export type SelfDoctorDiagnosticStatus = "ready" | "warn" | "error";

export interface SelfDoctorDiagnostic {
  readonly id: SelfDoctorDiagnosticId;
  readonly status: SelfDoctorDiagnosticStatus;
  readonly code: string;
  readonly summary: string;
  readonly action?: string;
  readonly evidence?: Readonly<Record<string, string | number | boolean>>;
}

export interface SelfDoctorReport {
  readonly version: typeof SELF_DOCTOR_REPORT_VERSION;
  readonly mode: "self";
  readonly status: SelfDoctorDiagnosticStatus;
  readonly diagnostics: readonly SelfDoctorDiagnostic[];
}

export interface SelfDoctorDependencies {
  /** Test-only seam. Production derives this from the loaded package module. */
  readonly installationRoot?: string;
  readonly platform?: NodeJS.Platform;
  readonly fileSystem?: SelfDoctorFileSystem;
  readonly toolchainResolutions?: Partial<
    Readonly<Record<ToolchainKind, ToolchainResolution>>
  >;
}

export const SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST = [
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/config/index.js",
  "dist/config/index.d.ts",
  "dist/shared/errors.js",
  "dist/shared/errors.d.ts",
  "dist/shared/result.js",
  "dist/shared/result.d.ts",
  "dist/cli/index.js",
] as const;

const MAX_SUMMARY_OR_ACTION = 512;
const MAX_CODE = 64;
const MAX_EVIDENCE_FIELDS = 16;
const MAX_SAFE_VERSION = 128;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const MAX_METADATA_TARGETS = 256;

type PackageMetadata = Record<string, unknown>;

function deriveInstallationRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum ? value : "bounded-output";
}

function boundedVersion(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length <= MAX_SAFE_VERSION &&
    SAFE_VERSION.test(value)
    ? value
    : undefined;
}

function diagnostic(
  id: SelfDoctorDiagnosticId,
  status: SelfDoctorDiagnosticStatus,
  code: string,
  summary: string,
  action?: string,
  evidence?: Readonly<Record<string, string | number | boolean>>,
): SelfDoctorDiagnostic {
  const entries =
    evidence === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(evidence).slice(0, MAX_EVIDENCE_FIELDS),
        );
  return {
    id,
    status,
    code: boundedText(code, MAX_CODE),
    summary: boundedText(summary, MAX_SUMMARY_OR_ACTION),
    ...(action === undefined
      ? {}
      : { action: boundedText(action, MAX_SUMMARY_OR_ACTION) }),
    ...(entries === undefined || Object.keys(entries).length === 0
      ? {}
      : { evidence: entries }),
  };
}

function findingDiagnostic(finding: SelfDoctorFinding): SelfDoctorDiagnostic {
  return diagnostic(
    finding.id,
    finding.status,
    finding.code,
    finding.summary,
    finding.action,
    finding.evidence,
  );
}

function statusForInspection(
  inspection: SelfDoctorPathInspection,
): SelfDoctorDiagnosticStatus {
  if (inspection.reason === "identity-unproven") return "warn";
  return inspection.status === "safe" ? "ready" : "error";
}

function pathCode(inspection: SelfDoctorPathInspection): string {
  switch (inspection.status) {
    case "missing":
      return "entry-missing";
    case "broken-link":
      return "broken-link";
    case "budget":
      return inspection.reason;
    case "unsafe":
      return inspection.reason;
    case "unknown":
      return inspection.reason;
    default:
      return "verified";
  }
}

function safeRepairAction(): string {
  return "Inspect the installed package manually; no repair was performed. Then rerun pumarejo doctor --self.";
}

function metadataTargets(manifest: PackageMetadata): {
  readonly targets: readonly string[];
  readonly bounded: boolean;
} {
  const targets: string[] = [];
  let bounded = false;
  let visited = 0;
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value: manifest.exports, depth: 0 },
    { value: manifest.bin, depth: 0 },
  ];
  while (pending.length > 0 && !bounded) {
    const { value, depth } = pending.pop()!;
    visited += 1;
    if (visited > MAX_METADATA_TARGETS || depth > MAX_SELF_DOCTOR_DEPTH) {
      bounded = true;
      break;
    }
    if (typeof value === "string") {
      if (targets.length >= MAX_METADATA_TARGETS) {
        bounded = true;
      } else {
        targets.push(value);
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (visited + pending.length >= MAX_METADATA_TARGETS) {
          bounded = true;
          break;
        }
        pending.push({ value: item, depth: depth + 1 });
      }
      continue;
    }
    const object = record(value);
    if (object !== undefined) {
      for (const item of Object.values(object)) {
        if (visited + pending.length >= MAX_METADATA_TARGETS) {
          bounded = true;
          break;
        }
        pending.push({ value: item, depth: depth + 1 });
      }
    }
  }
  return { targets, bounded };
}

function validatePackageMetadata(
  manifest: PackageMetadata,
):
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly code: string } {
  if (manifest.name !== "pumarejo") return { ok: false, code: "metadata-name" };
  const version = boundedVersion(manifest.version);
  if (version === undefined) return { ok: false, code: "metadata-version" };
  const declared = metadataTargets(manifest);
  if (declared.bounded) return { ok: false, code: "metadata-bounds" };
  if (declared.targets.length === 0) {
    return { ok: false, code: "metadata-exports" };
  }
  const allowed = new Set<string>(SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST);
  for (const target of declared.targets) {
    if (!allowed.has(target.replace(/^\.\//u, ""))) {
      return { ok: false, code: "unsafe-entry" };
    }
  }
  return { ok: true, version };
}

function overallStatus(
  diagnostics: readonly SelfDoctorDiagnostic[],
): SelfDoctorDiagnosticStatus {
  if (diagnostics.some((item) => item.status === "error")) return "error";
  return diagnostics.some((item) => item.status === "warn") ? "warn" : "ready";
}

function packageDiagnostic(inspection: SelfDoctorPathInspection): {
  readonly diagnostic: SelfDoctorDiagnostic;
  readonly manifest?: PackageMetadata;
  readonly metadataBounded?: boolean;
} {
  if (inspection.status !== "safe" || inspection.content === undefined) {
    const unavailable = inspection.reason === "identity-unproven";
    return {
      diagnostic: diagnostic(
        "self.package.metadata",
        unavailable ? "warn" : "error",
        pathCode(inspection),
        unavailable
          ? "Package metadata verification is unavailable on this platform."
          : "The installed package metadata could not be verified.",
        safeRepairAction(),
      ),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(inspection.content);
  } catch {
    return {
      diagnostic: diagnostic(
        "self.package.metadata",
        "error",
        "metadata-invalid",
        "The installed package metadata is not valid JSON.",
        safeRepairAction(),
      ),
    };
  }
  const manifest = record(parsed);
  if (manifest === undefined) {
    return {
      diagnostic: diagnostic(
        "self.package.metadata",
        "error",
        "metadata-shape",
        "The installed package metadata has an unsupported shape.",
        safeRepairAction(),
      ),
    };
  }
  const validation = validatePackageMetadata(manifest);
  if (!validation.ok) {
    return {
      diagnostic: diagnostic(
        "self.package.metadata",
        "error",
        validation.code,
        "The installed package metadata contains an unsafe or incomplete entry declaration.",
        safeRepairAction(),
      ),
      ...(validation.code === "metadata-bounds"
        ? { metadataBounded: true }
        : {}),
    };
  }
  return {
    diagnostic: diagnostic(
      "self.package.metadata",
      "ready",
      "verified",
      "The installed Pumarejo package metadata is bounded and internally consistent.",
      undefined,
      { package: "pumarejo", version: validation.version },
    ),
    manifest,
  };
}

function pathsDiagnostic(
  inspections: readonly SelfDoctorPathInspection[],
): SelfDoctorDiagnostic {
  const failures = inspections.filter(
    (inspection) => inspection.status !== "safe",
  );
  if (failures.length === 0) {
    return diagnostic(
      "self.installation.paths",
      "ready",
      "verified",
      "The reviewed installation entries stayed within the bounded package root.",
      undefined,
      {
        entries: inspections.length,
        depth: Math.max(
          ...inspections.map((inspection) => inspection.depth),
          0,
        ),
      },
    );
  }
  const first =
    failures.find((inspection) => inspection.reason !== "identity-unproven") ??
    failures[0]!;
  return diagnostic(
    "self.installation.paths",
    statusForInspection(first),
    pathCode(first),
    "One or more reviewed installation entries could not be safely verified.",
    safeRepairAction(),
    { failures: failures.length, entries: inspections.length },
  );
}

function linksDiagnostic(
  inspections: readonly SelfDoctorPathInspection[],
): SelfDoctorDiagnostic {
  const links = inspections.filter(
    (inspection) =>
      inspection.kind === "symbolic-link" ||
      inspection.kind === "junction" ||
      inspection.kind === "reparse-point" ||
      inspection.status === "broken-link",
  );
  if (links.length === 0) {
    return diagnostic(
      "self.installation.links",
      "ready",
      "verified",
      "No unverified link or reparse entry was followed.",
      undefined,
      { links: 0 },
    );
  }
  const first = links[0]!;
  return diagnostic(
    "self.installation.links",
    "error",
    pathCode(first),
    first.status === "broken-link"
      ? "A broken installation link was detected without following it."
      : "An installation link or reparse entry could not be proven safe.",
    safeRepairAction(),
    { links: links.length },
  );
}

function boundsDiagnostic(
  budget: SelfDoctorPathBudget,
  inspections: readonly SelfDoctorPathInspection[],
  healthBounded: boolean,
): SelfDoctorDiagnostic {
  const limited =
    healthBounded ||
    inspections.some((inspection) => inspection.status === "budget");
  return diagnostic(
    "self.report.bounds",
    limited ? "error" : "ready",
    limited ? "inspection-bounded" : "verified",
    limited
      ? "The self-doctor stopped at a reviewed inspection budget."
      : "The self-doctor stayed within its reviewed inspection budgets.",
    limited
      ? "Review the bounded installation manually, then rerun pumarejo doctor --self."
      : undefined,
    {
      entries: budget.entries,
      bytes: budget.bytes,
      maxEntries: MAX_SELF_DOCTOR_ENTRIES,
      maxDepth: MAX_SELF_DOCTOR_DEPTH,
      maxFileBytes: MAX_SELF_DOCTOR_FILE_BYTES,
      maxTotalBytes: MAX_SELF_DOCTOR_TOTAL_BYTES,
    },
  );
}

export async function doctorSelf(
  overrides: SelfDoctorDependencies = {},
): Promise<SelfDoctorReport> {
  const root = resolve(overrides.installationRoot ?? deriveInstallationRoot());
  const fileSystem = overrides.fileSystem ?? defaultSelfDoctorFileSystem;
  const platform = overrides.platform ?? process.platform;
  const budget: SelfDoctorPathBudget = { entries: 0, bytes: 0 };
  const inspections: SelfDoctorPathInspection[] = [];
  for (const entry of SELF_DOCTOR_RELATIVE_ENTRY_MANIFEST) {
    inspections.push(
      await inspectSelfDoctorPath(root, entry, {
        platform,
        fileSystem,
        budget,
      }),
    );
  }
  const packageResult = packageDiagnostic(inspections[0]!);
  const health = await inspectSelfDoctorHealth({
    root,
    manifest: packageResult.manifest,
    platform,
    fileSystem,
    budget,
    toolchainResolutions: overrides.toolchainResolutions,
  });
  const allInspections = [...inspections, ...health.inspections];
  const diagnostics: SelfDoctorDiagnostic[] = [
    packageResult.diagnostic,
    pathsDiagnostic(inspections),
    linksDiagnostic(allInspections),
    ...health.findings.map(findingDiagnostic),
    boundsDiagnostic(
      budget,
      allInspections,
      packageResult.metadataBounded === true || health.bounded,
    ),
  ];
  return {
    version: SELF_DOCTOR_REPORT_VERSION,
    mode: "self",
    status: overallStatus(diagnostics),
    diagnostics: diagnostics.slice(0, 32),
  };
}

export const selfDoctor = doctorSelf;

export function formatSelfDoctorReport(report: SelfDoctorReport): string {
  return `${report.diagnostics
    .map(
      (item) =>
        `[${item.status.toUpperCase()}] ${item.id}: ${item.summary} Code: ${item.code}.${
          item.action === undefined ? "" : ` Action: ${item.action}`
        }`,
    )
    .join("\n")}\n`;
}
