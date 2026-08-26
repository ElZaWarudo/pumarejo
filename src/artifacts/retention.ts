export type RetentionManifestState =
  | "valid"
  | "malformed"
  | "foreign"
  | "unmanifested";

export interface RetentionPolicy {
  readonly maxAgeMs?: number;
  readonly maxCount?: number;
  readonly maxBytes?: number;
}

export interface RetentionSessionMetadata {
  readonly sessionId: string;
  readonly createdAt: string | number | Date;
  readonly bytes: number;
  readonly closed?: boolean;
  readonly state?: "active" | "closed";
  readonly active?: boolean;
  readonly retainArtifacts?: boolean;
  readonly manifestState?: RetentionManifestState;
  /** Alias accepted for adapters that call the state a status. */
  readonly status?: RetentionManifestState;
  readonly owned?: boolean;
  readonly foreign?: boolean;
  readonly malformed?: boolean;
  readonly unmanifested?: boolean;
}

export type RetentionPreservationReason =
  | "policy-absent"
  | "invalid-policy"
  | "active"
  | "malformed"
  | "foreign"
  | "unmanifested"
  | "not-closed"
  | "not-retained"
  | "invalid-metadata"
  | "in-policy";

export type RetentionDeletionReason = "age" | "count" | "bytes";

export interface RetentionDeletion {
  readonly sessionId: string;
  readonly createdAt: string | number | Date;
  readonly bytes: number;
  readonly reasons: readonly RetentionDeletionReason[];
}

export interface RetentionPreservation {
  readonly sessionId: string;
  readonly reason: RetentionPreservationReason;
}

export interface RetentionPlan {
  readonly policyApplied: boolean;
  readonly deletions: readonly RetentionDeletion[];
  readonly preserved: readonly RetentionPreservation[];
  readonly bytesScheduled: number;
  /** Alias for consumers that use plan terminology rather than deletion. */
  readonly delete: readonly RetentionDeletion[];
}

const REASON_ORDER: readonly RetentionDeletionReason[] = [
  "age",
  "count",
  "bytes",
];

function finiteNonNegative(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function normalizePolicy(
  policy: RetentionPolicy | undefined,
): RetentionPolicy | undefined {
  if (policy === undefined) return undefined;
  const limits = [policy.maxAgeMs, policy.maxCount, policy.maxBytes].filter(
    (value) => value !== undefined,
  );
  if (
    limits.length === 0 ||
    limits.some((value) => !finiteNonNegative(value))
  ) {
    return undefined;
  }
  return {
    ...(policy.maxAgeMs === undefined ? {} : { maxAgeMs: policy.maxAgeMs }),
    ...(policy.maxCount === undefined ? {} : { maxCount: policy.maxCount }),
    ...(policy.maxBytes === undefined ? {} : { maxBytes: policy.maxBytes }),
  };
}

function timestamp(value: string | number | Date): number | undefined {
  const result =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : undefined;
}

function stateOf(metadata: RetentionSessionMetadata): RetentionManifestState {
  if (metadata.foreign === true || metadata.owned === false) return "foreign";
  if (metadata.unmanifested === true) return "unmanifested";
  if (metadata.malformed === true) return "malformed";
  if (
    metadata.manifestState !== undefined &&
    metadata.status !== undefined &&
    metadata.manifestState !== metadata.status
  ) {
    return "malformed";
  }
  return metadata.manifestState ?? metadata.status ?? "valid";
}

function isEligible(metadata: RetentionSessionMetadata): boolean {
  return (
    metadata.owned === true &&
    metadata.active === false &&
    metadata.closed === true &&
    metadata.retainArtifacts === true &&
    metadata.manifestState === "valid" &&
    stateOf(metadata) === "valid" &&
    (metadata.state === undefined || metadata.state === "closed") &&
    typeof metadata.sessionId === "string" &&
    metadata.sessionId.length > 0 &&
    finiteNonNegative(metadata.bytes) &&
    timestamp(metadata.createdAt) !== undefined
  );
}

function preserveReason(
  metadata: RetentionSessionMetadata,
  policyState: "absent" | "invalid" | "valid",
): RetentionPreservationReason {
  if (metadata.active === true) return "active";
  const state = stateOf(metadata);
  if (state === "malformed") return "malformed";
  if (state === "foreign") return "foreign";
  if (state === "unmanifested") return "unmanifested";
  if (metadata.owned !== true) return "foreign";
  if (metadata.closed !== true) return "not-closed";
  if (metadata.retainArtifacts !== true) return "not-retained";
  if (metadata.active !== false) return "invalid-metadata";
  if (metadata.state !== undefined && metadata.state !== "closed") {
    return "invalid-metadata";
  }
  if (!isEligible(metadata)) return "invalid-metadata";
  if (policyState === "invalid") return "invalid-policy";
  if (policyState === "absent") return "policy-absent";
  return "in-policy";
}

function compareOldest(
  left: RetentionSessionMetadata,
  right: RetentionSessionMetadata,
): number {
  const leftTime = timestamp(left.createdAt) ?? Number.POSITIVE_INFINITY;
  const rightTime = timestamp(right.createdAt) ?? Number.POSITIVE_INFINITY;
  const byTime = leftTime - rightTime;
  if (byTime !== 0) return byTime;
  return left.sessionId < right.sessionId
    ? -1
    : left.sessionId > right.sessionId
      ? 1
      : 0;
}

/**
 * Build a deterministic deletion plan. This function never reads, deletes,
 * renames, or mutates artifact files. Absent or invalid policy preserves all
 * sessions, which keeps automatic cleanup opt-in and fail-closed.
 */
export function evaluateRetentionPlan(input: {
  readonly now: string | number | Date;
  readonly sessions: readonly RetentionSessionMetadata[];
  readonly policy?: RetentionPolicy;
}): RetentionPlan {
  const normalizedPolicy = normalizePolicy(input.policy);
  const now = timestamp(input.now);
  const policyState =
    input.policy === undefined
      ? "absent"
      : normalizedPolicy === undefined || now === undefined
        ? "invalid"
        : "valid";
  const policyApplied = policyState === "valid";
  const eligible = input.sessions.filter(isEligible).sort(compareOldest);
  const deletionReasons = new Map<string, Set<RetentionDeletionReason>>();
  const mark = (
    metadata: RetentionSessionMetadata,
    reason: RetentionDeletionReason,
  ): void => {
    const reasons = deletionReasons.get(metadata.sessionId) ?? new Set();
    reasons.add(reason);
    deletionReasons.set(metadata.sessionId, reasons);
  };

  if (policyApplied && normalizedPolicy !== undefined && now !== undefined) {
    if (normalizedPolicy.maxAgeMs !== undefined) {
      const cutoff = now - normalizedPolicy.maxAgeMs;
      for (const metadata of eligible) {
        const created = timestamp(metadata.createdAt);
        if (created !== undefined && created < cutoff) mark(metadata, "age");
      }
    }
    if (normalizedPolicy.maxCount !== undefined) {
      for (const metadata of eligible.slice(
        0,
        Math.max(0, eligible.length - normalizedPolicy.maxCount),
      )) {
        mark(metadata, "count");
      }
    }
    if (normalizedPolicy.maxBytes !== undefined) {
      let total = eligible.reduce((sum, metadata) => sum + metadata.bytes, 0);
      for (const metadata of eligible) {
        if (total <= normalizedPolicy.maxBytes) break;
        total -= metadata.bytes;
        mark(metadata, "bytes");
      }
    }
  }

  const deletions = eligible
    .filter((metadata) => deletionReasons.has(metadata.sessionId))
    .map((metadata) => ({
      sessionId: metadata.sessionId,
      createdAt: metadata.createdAt,
      bytes: metadata.bytes,
      reasons: REASON_ORDER.filter((reason) =>
        deletionReasons.get(metadata.sessionId)?.has(reason),
      ),
    }));
  const deleted = new Set(deletions.map((item) => item.sessionId));
  const preserved = input.sessions
    .filter((metadata) => !deleted.has(metadata.sessionId))
    .map((metadata) => ({
      sessionId: metadata.sessionId,
      reason: preserveReason(metadata, policyState),
    }));
  return {
    policyApplied,
    deletions,
    delete: deletions,
    preserved,
    bytesScheduled: deletions.reduce((sum, item) => sum + item.bytes, 0),
  };
}

/** Alias matching the package wording. */
export const planRetention = evaluateRetentionPlan;
