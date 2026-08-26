import type { LaunchEnvironmentComparison } from "./launch-environment.js";
import {
  TOOLCHAIN_KINDS,
  type ToolchainCandidate,
  type ToolchainComparison,
  type ToolchainKind,
  type ToolchainResolution,
} from "./toolchain-resolver.js";

export const TOOLCHAIN_EVIDENCE_VERSION = 1 as const;
const SAFE_SOURCES = new Set([
  "explicit",
  "child-path",
  "platform-root",
  "host-path",
]);
const SAFE_REJECTIONS = new Set([
  "not-found",
  "not-regular-file",
  "not-executable",
  "broken-link",
  "reparse-uncertain",
  "outside-root",
  "unsafe-shim",
  "wrong-tool",
  "duplicate",
  "probe-timeout",
  "probe-failed",
  "probe-invalid-output",
  "probe-unavailable",
]);
const SAFE_DISPOSITIONS = new Set([
  "consistent",
  "host_only",
  "child_only",
  "version_mismatch",
  "environment_mismatch",
  "unknown",
]);
const SAFE_BASENAME = /^[A-Za-z0-9._-]{1,96}$/u;
const SAFE_IDENTITY = /^[a-f0-9]{8,64}$/u;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const SAFE_SURFACE = /^[A-Za-z0-9:_-]{1,128}$/u;
const SAFE_SESSION = /^[A-Za-z0-9._:-]{1,128}$/u;
const SAFE_CODE = "toolchain_resolution" as const;

export interface SanitizedToolchainCandidate {
  readonly kind: ToolchainKind;
  readonly source: "explicit" | "child-path" | "platform-root" | "host-path";
  readonly basename: string;
  readonly identityToken: string;
  readonly accepted: boolean;
  readonly fileKind: string;
  readonly version?: string;
  readonly rejection?: string;
  readonly probe?: "success" | "failed" | "timeout" | "invalid" | "unavailable";
}

export interface SanitizedToolchainEvidenceEvent {
  readonly version: typeof TOOLCHAIN_EVIDENCE_VERSION;
  readonly sessionId: string;
  readonly surfaceRef?: string;
  readonly kind: ToolchainKind;
  readonly candidates: readonly SanitizedToolchainCandidate[];
  readonly outcome: "resolved" | "unavailable";
  readonly comparison?: {
    readonly disposition: string;
    readonly identityToken?: string;
    readonly version?: string;
  };
  readonly environment?: LaunchEnvironmentComparison;
}

export interface ToolchainEvidenceContext {
  readonly sessionId: string;
  readonly surfaceRef?: string;
  readonly ownership?: {
    readonly sessionId: string;
    readonly surfaceRef?: string;
    readonly active?: boolean;
  };
  readonly environment?: LaunchEnvironmentComparison;
}

export interface ToolchainEvidenceSink {
  append(
    event: SanitizedToolchainEvidenceEvent,
  ):
    | Promise<{ readonly accepted: boolean } | void>
    | { readonly accepted: boolean }
    | void;
}

export interface DiagnosticStoreEvidenceSink {
  record(
    source: "phase",
    fields: {
      readonly sessionId?: string;
      readonly owner?: "session" | "process" | "surface";
      readonly phase?: "resolving_command";
      readonly level?: "debug" | "info" | "warn" | "error";
      readonly code?: string;
      readonly message?: unknown;
      readonly sensitive?: boolean;
      readonly truncated?: boolean;
    },
  ): unknown;
}

export type AcceptedToolchainEvidenceSink =
  | ToolchainEvidenceSink
  | DiagnosticStoreEvidenceSink;

function safeCandidate(
  kind: ToolchainKind,
  candidate: ToolchainCandidate,
): SanitizedToolchainCandidate {
  const basename = SAFE_BASENAME.test(candidate.basename)
    ? candidate.basename
    : "unknown";
  const identityToken = SAFE_IDENTITY.test(candidate.identity)
    ? candidate.identity
    : "unknown";
  const source = SAFE_SOURCES.has(candidate.source)
    ? (candidate.source as SanitizedToolchainCandidate["source"])
    : "child-path";
  const rejection =
    candidate.rejection !== undefined &&
    SAFE_REJECTIONS.has(candidate.rejection)
      ? candidate.rejection
      : undefined;
  const version =
    candidate.version !== undefined && SAFE_VERSION.test(candidate.version)
      ? candidate.version
      : undefined;
  return {
    kind,
    source,
    basename,
    identityToken,
    accepted: candidate.accepted === true,
    fileKind: SAFE_BASENAME.test(candidate.fileKind)
      ? candidate.fileKind
      : "unknown",
    ...(version === undefined ? {} : { version }),
    ...(rejection === undefined ? {} : { rejection }),
    ...(candidate.probe === undefined ? {} : { probe: candidate.probe }),
  };
}

function safeComparison(
  comparison: ToolchainComparison | undefined,
): SanitizedToolchainEvidenceEvent["comparison"] {
  if (
    comparison === undefined ||
    !SAFE_DISPOSITIONS.has(comparison.disposition)
  ) {
    return undefined;
  }
  const identityToken =
    comparison.identity !== undefined && SAFE_IDENTITY.test(comparison.identity)
      ? comparison.identity
      : undefined;
  const version =
    comparison.version !== undefined && SAFE_VERSION.test(comparison.version)
      ? comparison.version
      : undefined;
  return {
    disposition: comparison.disposition,
    ...(identityToken === undefined ? {} : { identityToken }),
    ...(version === undefined ? {} : { version }),
  };
}

function safeEnvironmentComparison(
  comparison: LaunchEnvironmentComparison | undefined,
): LaunchEnvironmentComparison | undefined {
  if (comparison === undefined || !Number.isInteger(comparison.comparedKeys)) {
    return undefined;
  }
  const allowed = new Set([
    "missing-in-child",
    "added-to-child",
    "changed",
    "path-order-changed",
    "portable-expanded",
    "source-reconstructed",
  ]);
  const categories = comparison.categories
    .filter(
      (entry) =>
        allowed.has(entry.category) &&
        Number.isInteger(entry.count) &&
        entry.count >= 0,
    )
    .slice(0, 6)
    .map((entry) => ({
      category: entry.category,
      count: Math.min(entry.count, 256),
    }));
  return {
    categories,
    comparedKeys: Math.min(Math.max(comparison.comparedKeys, 0), 4_096),
  };
}

export function sanitizeToolchainEvidence(
  kind: ToolchainKind,
  resolution: ToolchainResolution,
  context: ToolchainEvidenceContext,
): SanitizedToolchainEvidenceEvent | undefined {
  if (!TOOLCHAIN_KINDS.includes(kind)) return undefined;
  if (
    !SAFE_SESSION.test(context.sessionId) ||
    context.ownership?.active === false ||
    (context.ownership?.sessionId !== undefined &&
      context.ownership.sessionId !== context.sessionId) ||
    (context.surfaceRef !== undefined &&
      !SAFE_SURFACE.test(context.surfaceRef)) ||
    (context.surfaceRef !== undefined &&
      context.ownership?.surfaceRef !== undefined &&
      context.surfaceRef !== context.ownership.surfaceRef)
  ) {
    return undefined;
  }
  const candidates = resolution.candidates
    .slice(0, 64)
    .map((candidate) => safeCandidate(kind, candidate));
  const comparison = safeComparison(resolution.comparison);
  return {
    version: TOOLCHAIN_EVIDENCE_VERSION,
    sessionId: context.sessionId,
    ...(context.surfaceRef === undefined
      ? {}
      : { surfaceRef: context.surfaceRef }),
    kind,
    candidates,
    outcome: resolution.outcome === "resolved" ? "resolved" : "unavailable",
    ...(comparison === undefined ? {} : { comparison }),
    ...(safeEnvironmentComparison(context.environment) === undefined
      ? {}
      : { environment: safeEnvironmentComparison(context.environment) }),
  };
}

export function projectToolchainEvidence(
  resolutions: Partial<Readonly<Record<ToolchainKind, ToolchainResolution>>>,
  context: ToolchainEvidenceContext,
): readonly SanitizedToolchainEvidenceEvent[] {
  return TOOLCHAIN_KINDS.flatMap((kind) => {
    const resolution = resolutions[kind];
    const event =
      resolution === undefined
        ? undefined
        : sanitizeToolchainEvidence(kind, resolution, context);
    return event === undefined ? [] : [event];
  });
}

export async function emitToolchainEvidence(
  resolutions: Partial<Readonly<Record<ToolchainKind, ToolchainResolution>>>,
  context: ToolchainEvidenceContext,
  sink: AcceptedToolchainEvidenceSink,
): Promise<{ readonly emitted: number; readonly dropped: number }> {
  const events = projectToolchainEvidence(resolutions, context);
  let emitted = 0;
  let dropped = 0;
  for (const event of events) {
    if ("record" in sink) {
      try {
        const message = JSON.stringify({
          version: event.version,
          kind: event.kind,
          outcome: event.outcome,
          candidates: event.candidates,
          comparison: event.comparison,
          environment: event.environment,
        });
        sink.record("phase", {
          sessionId: event.sessionId,
          owner: event.surfaceRef === undefined ? "session" : "surface",
          phase: "resolving_command",
          level: "debug",
          code: SAFE_CODE,
          message,
          sensitive: false,
          truncated: false,
        });
        emitted += 1;
      } catch {
        dropped += 1;
      }
      continue;
    }
    if ("append" in sink) {
      try {
        const result = await sink.append(event);
        if (result === undefined || result.accepted !== false) emitted += 1;
        else dropped += 1;
      } catch {
        dropped += 1;
      }
      continue;
    }
  }
  return { emitted, dropped };
}
