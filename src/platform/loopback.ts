const MIN_LOOPBACK_PORT = 1_024;
const MAX_LOOPBACK_PORT = 65_535;
const MAX_DEV_URL_BYTES = 2_048;
const MAX_PROBE_TIMEOUT_MS = 30_000;

export type LoopbackFamily = "ipv4" | "ipv6";

export type LoopbackRejection =
  | "malformed"
  | "localhost"
  | "wildcard"
  | "external"
  | "invalid-port"
  | "family-mismatch";

export interface LoopbackEndpoint {
  readonly family: LoopbackFamily;
  readonly host: "127.0.0.1" | "::1";
  readonly port: number;
  readonly url: string;
}

export type LoopbackEndpointResult =
  | { readonly ok: true; readonly endpoint: LoopbackEndpoint }
  | { readonly ok: false; readonly reason: LoopbackRejection };

export type LoopbackEndpointInput = {
  readonly host: string;
  readonly port: number;
  readonly family?: LoopbackFamily;
};

function isPort(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_LOOPBACK_PORT &&
    value <= MAX_LOOPBACK_PORT
  );
}

function normalizedHost(value: string): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hostFamily(host: string): LoopbackFamily | undefined {
  const normalized = normalizedHost(host);
  if (normalized === "127.0.0.1") return "ipv4";
  if (normalized === "::1" || normalized === "[::1]") return "ipv6";
  return undefined;
}

function rejectionForHost(
  host: string,
): Exclude<LoopbackRejection, "family-mismatch"> {
  const normalized = normalizedHost(host);
  if (normalized === "localhost") return "localhost";
  if (
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "[::]"
  ) {
    return "wildcard";
  }
  return "external";
}

export function createLoopbackEndpoint(
  input: LoopbackEndpointInput,
): LoopbackEndpointResult {
  if (!isPort(input.port)) return { ok: false, reason: "invalid-port" };

  const family = hostFamily(input.host);
  if (family === undefined) {
    return { ok: false, reason: rejectionForHost(input.host) };
  }
  if (input.family !== undefined && input.family !== family) {
    return { ok: false, reason: "family-mismatch" };
  }

  const host = family === "ipv4" ? "127.0.0.1" : "::1";
  return {
    ok: true,
    endpoint: {
      family,
      host,
      port: input.port,
      url:
        family === "ipv6"
          ? `http://[${host}]:${input.port}`
          : `http://${host}:${input.port}`,
    },
  };
}

export function parseLoopbackEndpoint(
  host: string,
  port: number,
  family?: LoopbackFamily,
): LoopbackEndpointResult {
  return createLoopbackEndpoint({
    host,
    port,
    ...(family === undefined ? {} : { family }),
  });
}

export interface ParsedBuildDevUrl {
  readonly scheme: "http" | "https";
  readonly family: LoopbackFamily;
  readonly port: number;
}

export type BuildDevUrlRejection =
  | "malformed"
  | "invalid-scheme"
  | "invalid-port"
  | "localhost"
  | "wildcard"
  | "external"
  | "credentials"
  | "path-not-allowed";

export type BuildDevUrlResult =
  | { readonly ok: true; readonly value: ParsedBuildDevUrl }
  | { readonly ok: false; readonly reason: BuildDevUrlRejection };

function validDevUrlPort(port: string): number | undefined {
  if (port.length === 0 || !/^\d+$/u.test(port)) return undefined;
  const parsed = Number(port);
  return isPort(parsed) ? parsed : undefined;
}

export function parseBuildDevUrl(value: string): BuildDevUrlResult {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_DEV_URL_BYTES
  ) {
    return { ok: false, reason: "malformed" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid-scheme" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, reason: "credentials" };
  }
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    return { ok: false, reason: "path-not-allowed" };
  }

  const host = parsed.hostname;
  const family = hostFamily(host);
  if (family === undefined) {
    return { ok: false, reason: rejectionForHost(host) };
  }
  const port = validDevUrlPort(parsed.port);
  if (port === undefined) return { ok: false, reason: "invalid-port" };
  return {
    ok: true,
    value: {
      scheme: parsed.protocol === "https:" ? "https" : "http",
      family,
      port,
    },
  };
}

export const parseDevUrl = parseBuildDevUrl;

export type BuildDevUrlComparisonCode =
  | "dev-url-match"
  | "dev-url-invalid"
  | "dev-url-scheme-mismatch"
  | "dev-url-family-mismatch"
  | "dev-url-port-mismatch";

export interface BuildDevUrlComparison {
  readonly matches: boolean;
  readonly code: BuildDevUrlComparisonCode;
  readonly family: LoopbackFamily;
  readonly port: number;
  readonly devUrl:
    | {
        readonly state: "match";
        readonly family: LoopbackFamily;
        readonly port: number;
        readonly scheme: "http" | "https";
      }
    | { readonly state: "invalid"; readonly reason: BuildDevUrlRejection }
    | {
        readonly state: "mismatch";
        readonly family: LoopbackFamily;
        readonly port: number;
        readonly scheme: "http" | "https";
      };
  readonly suggestion: string;
}

function correctionFor(
  endpoint: LoopbackEndpoint,
  scheme: "http" | "https" = "http",
): string {
  return `Use ${scheme}://${endpoint.family === "ipv6" ? `[${endpoint.host}]` : endpoint.host}:${endpoint.port}.`;
}

export function compareBuildDevUrl(
  endpoint: LoopbackEndpoint,
  devUrl: string,
): BuildDevUrlComparison {
  const parsed = parseBuildDevUrl(devUrl);
  return compareParsedBuildDevUrl(endpoint, parsed);
}

/** Compare an already-sanitized parser result without retaining the raw URL. */
export function compareParsedBuildDevUrl(
  endpoint: LoopbackEndpoint,
  parsed: BuildDevUrlResult,
): BuildDevUrlComparison {
  if (!parsed.ok) {
    return {
      matches: false,
      code: "dev-url-invalid",
      family: endpoint.family,
      port: endpoint.port,
      devUrl: { state: "invalid", reason: parsed.reason },
      suggestion: correctionFor(endpoint),
    };
  }
  if (parsed.value.scheme !== "http") {
    return {
      matches: false,
      code: "dev-url-scheme-mismatch",
      family: endpoint.family,
      port: endpoint.port,
      devUrl: { state: "mismatch", ...parsed.value },
      suggestion: correctionFor(endpoint),
    };
  }
  if (parsed.value.family !== endpoint.family) {
    return {
      matches: false,
      code: "dev-url-family-mismatch",
      family: endpoint.family,
      port: endpoint.port,
      devUrl: { state: "mismatch", ...parsed.value },
      suggestion: correctionFor(endpoint),
    };
  }
  if (parsed.value.port !== endpoint.port) {
    return {
      matches: false,
      code: "dev-url-port-mismatch",
      family: endpoint.family,
      port: endpoint.port,
      devUrl: { state: "mismatch", ...parsed.value },
      suggestion: correctionFor(endpoint),
    };
  }
  return {
    matches: true,
    code: "dev-url-match",
    family: endpoint.family,
    port: endpoint.port,
    devUrl: { state: "match", ...parsed.value },
    suggestion: "The configured loopback URL matches the observed endpoint.",
  };
}

export const compareDevUrl = compareBuildDevUrl;

export type LoopbackProbeState =
  | "available"
  | "occupied"
  | "refused"
  | "timeout";
export type LoopbackOwnership = "owned" | "foreign" | "unknown";

export interface LoopbackProbeResult {
  readonly state: LoopbackProbeState;
  readonly family?: LoopbackFamily;
}

export interface LoopbackObservation {
  readonly state: LoopbackProbeState | "wrong-family" | "ownership-unproven";
  readonly listener: LoopbackProbeState;
  readonly family: LoopbackFamily;
  readonly port: number;
  readonly ownership: LoopbackOwnership | "not-applicable";
  readonly ready: boolean;
}

export interface LoopbackDiagnosticOutcome {
  readonly code: string;
  readonly family: LoopbackFamily;
  readonly port: number;
  readonly retryable: boolean;
  readonly suggestion: string;
}

/** Convert an observation to bounded RDM-015 fields without retaining input URLs or causes. */
export function loopbackDiagnosticOutcome(
  observation: LoopbackObservation,
): LoopbackDiagnosticOutcome {
  const outcomes: Record<
    LoopbackObservation["state"],
    Pick<LoopbackDiagnosticOutcome, "code" | "retryable" | "suggestion">
  > = {
    available: {
      code: "loopback_listener_absent",
      retryable: true,
      suggestion: "Retry after the owned provider starts listening.",
    },
    occupied: {
      code: "loopback_ready",
      retryable: false,
      suggestion: "The owned loopback provider is ready.",
    },
    refused: {
      code: "loopback_probe_refused",
      retryable: true,
      suggestion: "Retry the bounded provider readiness probe.",
    },
    timeout: {
      code: "loopback_probe_timeout",
      retryable: true,
      suggestion: "Retry the bounded provider readiness probe.",
    },
    "wrong-family": {
      code: "loopback_family_mismatch",
      retryable: false,
      suggestion: "Use the configured loopback address family.",
    },
    "ownership-unproven": {
      code: "loopback_ownership_unproven",
      retryable: true,
      suggestion: "Retry after the owned provider listener can be proven.",
    },
  };
  return { ...observation, ...outcomes[observation.state] };
}

export interface LoopbackObservationOptions {
  readonly probe: (
    endpoint: LoopbackEndpoint,
    signal: AbortSignal,
  ) => Promise<LoopbackProbeResult>;
  readonly ownership?: (
    endpoint: LoopbackEndpoint,
    signal: AbortSignal,
  ) => Promise<LoopbackOwnership>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined) return 5_000;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PROBE_TIMEOUT_MS) {
    throw new RangeError("Loopback observation timeout is out of bounds.");
  }
  return value;
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (parentSignal?.aborted) {
    throw (
      parentSignal.reason ??
      new DOMException("The operation was aborted.", "AbortError")
    );
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        const onTimeout = () => {
          reject(
            timedOut
              ? new LoopbackTimeoutError()
              : (parentSignal?.reason ??
                  new DOMException("The operation was aborted.", "AbortError")),
          );
        };
        if (controller.signal.aborted) {
          onTimeout();
          return;
        }
        controller.signal.addEventListener("abort", onTimeout, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

export class LoopbackTimeoutError extends Error {
  constructor() {
    super("Loopback probe timed out.");
    this.name = "LoopbackTimeoutError";
  }
}

export async function observeLoopback(
  endpoint: LoopbackEndpoint,
  options: LoopbackObservationOptions,
): Promise<LoopbackObservation> {
  const timeoutMs = boundedTimeout(options.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let result: LoopbackProbeResult;
  try {
    result = await withDeadline(
      (signal) => options.probe(endpoint, signal),
      timeoutMs,
      options.signal,
    );
  } catch (error) {
    if (options.signal?.aborted) {
      throw (
        options.signal.reason ??
        new DOMException("The operation was aborted.", "AbortError")
      );
    }
    if (error instanceof LoopbackTimeoutError) {
      return {
        state: "timeout",
        listener: "timeout",
        family: endpoint.family,
        port: endpoint.port,
        ownership: "not-applicable",
        ready: false,
      };
    }
    return {
      state: "refused",
      listener: "refused",
      family: endpoint.family,
      port: endpoint.port,
      ownership: "not-applicable",
      ready: false,
    };
  }

  if (result.family !== undefined && result.family !== endpoint.family) {
    return {
      state: "wrong-family",
      listener: result.state,
      family: endpoint.family,
      port: endpoint.port,
      ownership: "unknown",
      ready: false,
    };
  }
  if (result.state !== "occupied") {
    return {
      state: result.state,
      listener: result.state,
      family: endpoint.family,
      port: endpoint.port,
      ownership: "not-applicable",
      ready: false,
    };
  }

  let ownership: LoopbackOwnership = "unknown";
  const remainingMs = Math.max(0, deadline - Date.now());
  if (options.ownership !== undefined && remainingMs > 0) {
    try {
      ownership = await withDeadline(
        (signal) => options.ownership!(endpoint, signal),
        remainingMs,
        options.signal,
      );
    } catch {
      if (options.signal?.aborted) {
        throw (
          options.signal.reason ??
          new DOMException("The operation was aborted.", "AbortError")
        );
      }
      ownership = "unknown";
    }
  }
  if (ownership !== "owned") {
    return {
      state: "ownership-unproven",
      listener: "occupied",
      family: endpoint.family,
      port: endpoint.port,
      ownership,
      ready: false,
    };
  }
  return {
    state: "occupied",
    listener: "occupied",
    family: endpoint.family,
    port: endpoint.port,
    ownership,
    ready: true,
  };
}

export const observeLoopbackEndpoint = observeLoopback;
