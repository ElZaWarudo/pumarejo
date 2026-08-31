export const DIAGNOSTIC_SOURCES = [
  "console",
  "process_stdout",
  "process_stderr",
  "invocation",
  "phase",
  "last_error",
] as const;

export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

export const DIAGNOSTIC_CAPABILITY_STATES = [
  "supported",
  "unsupported",
  "unavailable",
  "denied",
  "failed",
] as const;

export type DiagnosticCapabilityState =
  (typeof DIAGNOSTIC_CAPABILITY_STATES)[number];

export const DIAGNOSTIC_PHASES = [
  "resolving_command",
  "preparing_runtime",
  "starting_process",
  "waiting_provider",
  "starting_proxy",
  "creating_session",
  "selecting_window",
  "capturing_first_snapshot",
] as const;

export type DiagnosticPhase = (typeof DIAGNOSTIC_PHASES)[number];

export const DIAGNOSTIC_LEVELS = ["debug", "info", "warn", "error"] as const;
export type DiagnosticLevel = (typeof DIAGNOSTIC_LEVELS)[number];

export type DiagnosticLoopbackFamily = "ipv4" | "ipv6";

export const DEFAULT_DIAGNOSTIC_LIMITS = {
  maxRecords: 256,
  maxBytes: 128 * 1024,
  maxFieldBytes: 2 * 1024,
  maxQueryRecords: 128,
  maxQueryBytes: 48 * 1024,
} as const;

const SAFE_SOURCE = new Set<string>(DIAGNOSTIC_SOURCES);
const SAFE_PHASE = new Set<string>(DIAGNOSTIC_PHASES);
const SAFE_LEVEL = new Set<string>(DIAGNOSTIC_LEVELS);
const SAFE_STATE = new Set<string>(DIAGNOSTIC_CAPABILITY_STATES);

const SECRET_PATTERNS = [
  /((?:authorization|cookie|password|passwd|secret|token|api[-_ ]?key)\s*[:=]\s*)([^\s,;]+)/giu,
  /\b(?:bearer|basic)\s+[a-z0-9+/=._~-]+/giu,
  /\b(?:secret|token|password|passwd|api[-_]?key)[-_:=][a-z0-9+/=._~-]+/giu,
];

const PATH_PATTERN =
  /(?:[a-zA-Z]:[\\/][^\s"'<>]+|\\\\[^\s"'<>]+|\/(?:home|Users|user|tmp|var|private|workspace|workspaces|opt|etc)\/(?:[^\s"'<>]+))/gu;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/gu;
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const SURFACE_REF_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/u;

export interface DiagnosticScope {
  readonly sessionId: string;
  readonly surfaceRef?: string;
  readonly owner: "session" | "process" | "surface";
}

export interface DiagnosticCapability {
  readonly state: DiagnosticCapabilityState;
  readonly code: string;
  readonly evidence?: string;
}

export interface DiagnosticInput {
  readonly source: DiagnosticSource;
  readonly sessionId: string;
  readonly surfaceRef?: string;
  readonly owner?: "session" | "process" | "surface";
  readonly observedAt?: string | Date;
  readonly level?: DiagnosticLevel;
  readonly message?: unknown;
  readonly code?: unknown;
  readonly phase?: unknown;
  readonly durationMs?: unknown;
  readonly retryable?: unknown;
  readonly suggestion?: unknown;
  readonly family?: unknown;
  readonly port?: unknown;
  readonly count?: unknown;
  readonly sensitive?: boolean;
  readonly truncated?: boolean;
  readonly capability?: {
    readonly state: unknown;
    readonly code: unknown;
    readonly evidence?: unknown;
  };
}

export interface DiagnosticRecord {
  readonly id: string;
  readonly sequence: number;
  readonly observedAt: string;
  readonly source: DiagnosticSource;
  readonly scope: DiagnosticScope;
  readonly level?: DiagnosticLevel;
  readonly message?: string;
  readonly code?: string;
  readonly phase?: DiagnosticPhase;
  readonly durationMs?: number;
  readonly retryable?: boolean;
  readonly suggestion?: string;
  readonly family?: DiagnosticLoopbackFamily;
  readonly port?: number;
  readonly count?: number;
  readonly sensitive?: boolean;
  readonly truncated?: boolean;
  readonly capability?: DiagnosticCapability;
}

export interface DiagnosticAppendResult {
  readonly accepted: boolean;
  readonly evicted: number;
  readonly bytes: number;
  readonly reason?: "invalid" | "oversized" | "closed";
}

export interface DiagnosticQueryOptions {
  readonly sources?: readonly DiagnosticSource[];
  readonly surfaceRef?: string;
  readonly maxRecords?: number;
  readonly maxBytes?: number;
}

export interface DiagnosticQueryResult {
  readonly sessionId: string;
  readonly surfaceRef?: string;
  readonly capabilities: Readonly<
    Record<DiagnosticSource, DiagnosticCapability>
  >;
  readonly records: readonly DiagnosticRecord[];
  readonly lastErrors: readonly DiagnosticRecord[];
  readonly truncation: {
    readonly truncated: boolean;
    readonly evicted: number;
    readonly returned: number;
    readonly maxRecords: number;
    readonly maxBytes: number;
  };
}

export interface DiagnosticRetentionSink {
  retain(records: readonly DiagnosticRecord[]): Promise<void> | void;
}

export interface ArtifactCleanupDiagnosticInput {
  readonly retained: unknown;
  readonly removed: unknown;
  readonly retryable: unknown;
  /** Accepted for callers that have a local cause; it is never stored. */
  readonly cause?: unknown;
  /** Accepted for callers that have a local path; it is never stored. */
  readonly path?: unknown;
}

export interface DiagnosticStoreOptions {
  readonly sessionId: string;
  readonly now?: () => Date;
  readonly maxRecords?: number;
  readonly maxBytes?: number;
  readonly maxFieldBytes?: number;
}

function boundedLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return Number.isInteger(value) && value !== undefined && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function sanitizeText(value: unknown, maxBytes: number): string | undefined {
  if (typeof value !== "string") return undefined;
  let sanitized = value.replace(CONTROL_PATTERN, " ");
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, prefix?: string) =>
      prefix === undefined ? "[REDACTED]" : `${prefix}[REDACTED]`,
    );
  }
  sanitized = sanitized.replace(PATH_PATTERN, "[REDACTED_PATH]");
  sanitized = sanitized.replace(/\s+/gu, " ").trim();
  if (sanitized.length === 0) return undefined;
  const maxChars = Math.max(1, Math.floor(maxBytes / 2));
  return sanitized.length > maxChars
    ? `${sanitized.slice(0, Math.max(0, maxChars - 1))}…`
    : sanitized;
}

function sanitizeCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.toLowerCase();
  return CODE_PATTERN.test(code) ? code : undefined;
}

function sanitizePhase(value: unknown): DiagnosticPhase | undefined {
  return typeof value === "string" && SAFE_PHASE.has(value)
    ? (value as DiagnosticPhase)
    : undefined;
}

function sanitizeFamily(value: unknown): DiagnosticLoopbackFamily | undefined {
  return value === "ipv4" || value === "ipv6" ? value : undefined;
}

function sanitizeBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function sanitizeObservedAt(
  value: string | Date | undefined,
  now: () => Date,
): string {
  const candidate =
    value instanceof Date
      ? value
      : value === undefined
        ? now()
        : new Date(value);
  return Number.isNaN(candidate.getTime())
    ? now().toISOString()
    : candidate.toISOString();
}

function sanitizeCapability(
  value: DiagnosticInput["capability"],
  maxFieldBytes: number,
): DiagnosticCapability | undefined {
  if (value === undefined || typeof value !== "object" || value === null) {
    return undefined;
  }
  const state = typeof value.state === "string" ? value.state : "";
  const code = sanitizeCode(value.code);
  if (!SAFE_STATE.has(state) || code === undefined) return undefined;
  const evidence = sanitizeText(value.evidence, maxFieldBytes);
  return {
    state: state as DiagnosticCapabilityState,
    code,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function sanitizeRecord(
  input: DiagnosticInput,
  sequence: number,
  now: () => Date,
  maxFieldBytes: number,
): DiagnosticRecord | undefined {
  if (
    !SAFE_SOURCE.has(input.source) ||
    typeof input.sessionId !== "string" ||
    input.sessionId.length === 0 ||
    input.sessionId.length > 128
  ) {
    return undefined;
  }
  const surfaceRef =
    typeof input.surfaceRef === "string" &&
    SURFACE_REF_PATTERN.test(input.surfaceRef)
      ? input.surfaceRef
      : undefined;
  const owner = ["session", "process", "surface"].includes(input.owner ?? "")
    ? (input.owner as "session" | "process" | "surface")
    : surfaceRef === undefined
      ? "session"
      : "surface";
  const message =
    input.sensitive === true
      ? undefined
      : sanitizeText(input.message, maxFieldBytes);
  const suggestion = sanitizeText(input.suggestion, maxFieldBytes);
  const phase = sanitizePhase(input.phase);
  const durationMs =
    typeof input.durationMs === "number" &&
    Number.isFinite(input.durationMs) &&
    Number.isInteger(input.durationMs) &&
    input.durationMs >= 0 &&
    input.durationMs <= 600_000
      ? input.durationMs
      : undefined;
  const level =
    typeof input.level === "string" && SAFE_LEVEL.has(input.level)
      ? input.level
      : undefined;
  const capability = sanitizeCapability(input.capability, maxFieldBytes);
  const family = sanitizeFamily(input.family);
  const port = sanitizeBoundedInteger(input.port, 1_024, 65_535);
  const count = sanitizeBoundedInteger(input.count, 0, 4_096);
  const record: DiagnosticRecord = {
    id: `diagnostic-${String(sequence).padStart(6, "0")}`,
    sequence,
    observedAt: sanitizeObservedAt(input.observedAt, now),
    source: input.source,
    scope: {
      sessionId: input.sessionId,
      owner,
      ...(surfaceRef === undefined ? {} : { surfaceRef }),
    },
    ...(level === undefined ? {} : { level }),
    ...(message === undefined ? {} : { message }),
    ...(sanitizeCode(input.code) === undefined
      ? {}
      : { code: sanitizeCode(input.code) }),
    ...(phase === undefined ? {} : { phase }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(typeof input.retryable === "boolean"
      ? { retryable: input.retryable }
      : {}),
    ...(suggestion === undefined ? {} : { suggestion }),
    ...(family === undefined ? {} : { family }),
    ...(port === undefined ? {} : { port }),
    ...(count === undefined ? {} : { count }),
    ...(input.sensitive === true ? { sensitive: true } : {}),
    ...(input.truncated === true ? { truncated: true } : {}),
    ...(capability === undefined ? {} : { capability }),
  };
  return record;
}

function recordBytes(record: DiagnosticRecord): number {
  return Buffer.byteLength(JSON.stringify(record), "utf8");
}

class DiagnosticRingBuffer {
  #records: DiagnosticRecord[] = [];
  #bytes = 0;
  #evicted = 0;

  constructor(
    readonly maxRecords: number,
    readonly maxBytes: number,
  ) {}

  get bytes(): number {
    return this.#bytes;
  }

  get evicted(): number {
    return this.#evicted;
  }

  append(record: DiagnosticRecord): DiagnosticAppendResult {
    const bytes = recordBytes(record);
    if (bytes > this.maxBytes) {
      return { accepted: false, evicted: 0, bytes: 0, reason: "oversized" };
    }
    let evicted = 0;
    while (
      this.#records.length >= this.maxRecords ||
      this.#bytes + bytes > this.maxBytes
    ) {
      const oldest = this.#records.shift();
      if (oldest === undefined) break;
      this.#bytes -= recordBytes(oldest);
      this.#evicted += 1;
      evicted += 1;
    }
    this.#records.push(record);
    this.#bytes += bytes;
    return { accepted: true, evicted, bytes };
  }

  records(): readonly DiagnosticRecord[] {
    return this.#records;
  }

  clear(): void {
    this.#records = [];
    this.#bytes = 0;
    this.#evicted = 0;
  }
}

function capabilityFor(source: DiagnosticSource): DiagnosticCapability {
  if (source === "console") {
    return {
      state: "unsupported",
      code: "provider_console_unsupported",
      evidence: "The configured provider exposes no approved console boundary.",
    };
  }
  const capabilities: Record<
    Exclude<DiagnosticSource, "console">,
    DiagnosticCapability
  > = {
    process_stdout: {
      state: "supported",
      code: "owned_process_stream_available",
    },
    process_stderr: {
      state: "supported",
      code: "owned_process_stream_available",
    },
    invocation: { state: "supported", code: "invocation_trace_available" },
    phase: { state: "supported", code: "launch_phase_history_available" },
    last_error: { state: "supported", code: "last_error_projection_available" },
  };
  return capabilities[source];
}

export class DiagnosticStore {
  readonly #sessionId: string;
  readonly #now: () => Date;
  readonly #maxFieldBytes: number;
  readonly #ring: DiagnosticRingBuffer;
  readonly #lastErrors = new Map<string, DiagnosticRecord>();
  #closed = false;

  constructor(options: DiagnosticStoreOptions) {
    this.#sessionId = options.sessionId;
    this.#now = options.now ?? (() => new Date());
    this.#maxFieldBytes = boundedLimit(
      options.maxFieldBytes,
      DEFAULT_DIAGNOSTIC_LIMITS.maxFieldBytes,
      16 * 1024,
    );
    this.#ring = new DiagnosticRingBuffer(
      boundedLimit(
        options.maxRecords,
        DEFAULT_DIAGNOSTIC_LIMITS.maxRecords,
        4096,
      ),
      boundedLimit(
        options.maxBytes,
        DEFAULT_DIAGNOSTIC_LIMITS.maxBytes,
        4 * 1024 * 1024,
      ),
    );
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  append(input: DiagnosticInput): DiagnosticAppendResult {
    if (this.#closed)
      return { accepted: false, evicted: 0, bytes: 0, reason: "closed" };
    if (input.sessionId !== this.#sessionId) {
      return { accepted: false, evicted: 0, bytes: 0, reason: "invalid" };
    }
    const sequence = (this.#ring.records().at(-1)?.sequence ?? 0) + 1;
    const record = sanitizeRecord(
      input,
      sequence,
      this.#now,
      this.#maxFieldBytes,
    );
    if (record === undefined)
      return { accepted: false, evicted: 0, bytes: 0, reason: "invalid" };
    const result = this.#ring.append(record);
    if (result.accepted && record.source === "last_error") {
      const key = `${record.scope.owner}:${record.scope.surfaceRef ?? "session"}`;
      this.#lastErrors.set(key, record);
      if (this.#lastErrors.size > 64) {
        const oldest = [...this.#lastErrors.entries()].sort(
          (left, right) => left[1].sequence - right[1].sequence,
        )[0];
        if (oldest !== undefined) this.#lastErrors.delete(oldest[0]);
      }
    }
    return result;
  }

  record(
    source: DiagnosticSource,
    fields: Omit<DiagnosticInput, "source" | "sessionId"> = {},
  ): DiagnosticAppendResult {
    return this.append({ source, sessionId: this.#sessionId, ...fields });
  }

  recordPhase(phase: DiagnosticPhase): DiagnosticAppendResult {
    return this.record("phase", { phase, owner: "session" });
  }

  recordInvocation(
    fields: Omit<DiagnosticInput, "source" | "sessionId">,
  ): DiagnosticAppendResult {
    return this.record("invocation", fields);
  }

  recordLastError(
    fields: Omit<DiagnosticInput, "source" | "sessionId">,
  ): DiagnosticAppendResult {
    return this.record("last_error", {
      ...fields,
      owner: fields.owner ?? "session",
    });
  }

  recordArtifactCleanupUnavailable(
    fields: ArtifactCleanupDiagnosticInput,
  ): DiagnosticAppendResult {
    const retained = sanitizeBoundedInteger(fields.retained, 0, 4_096) ?? 0;
    const removed = sanitizeBoundedInteger(fields.removed, 0, 4_096) ?? 0;
    return this.recordLastError({
      owner: "session",
      code: "artifact_cleanup_unavailable",
      retryable: fields.retryable === true,
      count: Math.min(4_096, retained + removed),
      suggestion:
        "Identity-bound artifact cleanup is unavailable; preserved bytes remain for a bounded retry.",
    });
  }

  recordProcess(
    stream: "stdout" | "stderr",
    message: unknown,
  ): DiagnosticAppendResult {
    return this.record(
      stream === "stdout" ? "process_stdout" : "process_stderr",
      {
        message,
        owner: "process",
      },
    );
  }

  recordConsole(
    message: unknown,
    fields: Omit<DiagnosticInput, "source" | "sessionId" | "message"> = {},
  ): DiagnosticAppendResult {
    return this.record("console", { ...fields, message });
  }

  query(options: DiagnosticQueryOptions = {}): DiagnosticQueryResult {
    const sources = new Set(options.sources ?? DIAGNOSTIC_SOURCES);
    const maxRecords = boundedLimit(
      options.maxRecords,
      DEFAULT_DIAGNOSTIC_LIMITS.maxQueryRecords,
      this.#ring.maxRecords,
    );
    const maxBytes = boundedLimit(
      options.maxBytes,
      DEFAULT_DIAGNOSTIC_LIMITS.maxQueryBytes,
      this.#ring.maxBytes,
    );
    const filtered = this.#ring
      .records()
      .filter(
        (record) =>
          sources.has(record.source) &&
          (options.surfaceRef === undefined ||
            record.scope.surfaceRef === undefined ||
            record.scope.surfaceRef === options.surfaceRef),
      );
    const selected: DiagnosticRecord[] = [];
    let bytes = 0;
    for (
      let index = filtered.length - 1;
      index >= 0 && selected.length < maxRecords;
      index -= 1
    ) {
      const record = filtered[index];
      const size = recordBytes(record);
      if (bytes + size > maxBytes) break;
      selected.push(record);
      bytes += size;
    }
    selected.reverse();
    const lastErrors = [...this.#lastErrors.values()]
      .filter(
        (record) =>
          sources.has("last_error") &&
          (options.surfaceRef === undefined ||
            record.scope.surfaceRef === undefined ||
            record.scope.surfaceRef === options.surfaceRef),
      )
      .sort((left, right) => left.sequence - right.sequence);
    const capabilities = Object.fromEntries(
      DIAGNOSTIC_SOURCES.map((source) => [source, capabilityFor(source)]),
    ) as Readonly<Record<DiagnosticSource, DiagnosticCapability>>;
    return {
      sessionId: this.#sessionId,
      ...(options.surfaceRef === undefined
        ? {}
        : { surfaceRef: options.surfaceRef }),
      capabilities,
      records: selected,
      lastErrors,
      truncation: {
        truncated: selected.length < filtered.length,
        evicted: this.#ring.evicted,
        returned: selected.length,
        maxRecords,
        maxBytes,
      },
    };
  }

  async retain(options: {
    readonly enabled: true;
    readonly sink: DiagnosticRetentionSink;
    readonly maxRecords?: number;
    readonly maxBytes?: number;
  }): Promise<{
    readonly retained: true;
    readonly records: number;
    readonly bytes: number;
  }>;
  async retain(options?: { readonly enabled?: false }): Promise<{
    readonly retained: false;
    readonly records: 0;
    readonly bytes: 0;
  }>;
  async retain(options?: {
    readonly enabled?: boolean;
    readonly sink?: DiagnosticRetentionSink;
    readonly maxRecords?: number;
    readonly maxBytes?: number;
  }): Promise<{
    readonly retained: boolean;
    readonly records: number;
    readonly bytes: number;
  }> {
    if (options?.enabled !== true || options.sink === undefined) {
      return { retained: false, records: 0, bytes: 0 };
    }
    const projection = this.query({
      maxRecords: options.maxRecords,
      maxBytes: options.maxBytes,
    });
    await options.sink.retain(projection.records);
    return {
      retained: true,
      records: projection.records.length,
      bytes: Buffer.byteLength(JSON.stringify(projection.records), "utf8"),
    };
  }

  clear(): void {
    this.#ring.clear();
    this.#lastErrors.clear();
  }

  close(): void {
    this.clear();
    this.#closed = true;
  }
}
