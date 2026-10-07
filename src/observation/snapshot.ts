import { PumarejoError } from "../shared/errors.js";
import type { WebDriverClient } from "../webdriver/client.js";
import { W3C_ELEMENT_KEY } from "../webdriver/protocol.js";
import { DEFAULT_SNAPSHOT_MAX_DEPTH } from "./defaults.js";
import { assertRedactionBoundary } from "./redaction.js";
import { ReferenceTable, type ReferenceGenerationReservation } from "./refs.js";
import {
  rawSnapshotSchema,
  type RawSnapshot,
  type SemanticSnapshot,
  type SnapshotFailureStage,
  type SnapshotRequest,
} from "./schema.js";
import { loadSnapshotScript } from "./snapshot-script.js";
import type { SurfaceRecord } from "./surfaces.js";

const MAX_WINDOW_TITLE_LENGTH = 4_096;

export interface SnapshotEngineOptions {
  readonly webdriver: WebDriverClient;
  readonly windowLabel: string;
  readonly references?: ReferenceTable;
  readonly script?: () => Promise<string>;
  readonly now?: () => Date;
  readonly surface?: Pick<SurfaceRecord, "surfaceRef" | "identity" | "kind">;
}

export type SnapshotSurface = Pick<
  SurfaceRecord,
  "surfaceRef" | "identity" | "kind"
>;

function hasDefaultComparableScope(request?: SnapshotRequest): boolean {
  return (
    request?.rootRef === undefined &&
    (request?.maxNodes === undefined || request.maxNodes === 500) &&
    (request?.maxDepth === undefined ||
      request.maxDepth === DEFAULT_SNAPSHOT_MAX_DEPTH) &&
    (request?.maxTextLength === undefined || request.maxTextLength === 4096) &&
    (request?.visibleOnly === undefined || request.visibleOnly) &&
    (request?.includeNames === undefined || request.includeNames) &&
    (request?.includeText === undefined || request.includeText) &&
    (request?.includeValues === undefined || request.includeValues) &&
    request?.roles === undefined &&
    request?.name === undefined &&
    request?.types === undefined
  );
}

function boundedWindowTitle(title: string): {
  readonly title: string;
  readonly truncated: boolean;
} {
  const bounded = title.slice(0, MAX_WINDOW_TITLE_LENGTH);
  return { title: bounded, truncated: bounded.length < title.length };
}

class SnapshotCaptureError extends PumarejoError {
  readonly stage: SnapshotFailureStage;

  constructor(stage: SnapshotFailureStage, cause: unknown) {
    super("INTERNAL_ERROR", { cause });
    this.stage = stage;
  }
}

export class SnapshotEngine {
  readonly references: ReferenceTable;
  readonly #webdriver: WebDriverClient;
  readonly #windowLabel: string;
  readonly #script: () => Promise<string>;
  readonly #now: () => Date;
  #tail: Promise<void> = Promise.resolve();
  #currentSnapshot: SemanticSnapshot | undefined;
  #currentSnapshotComparable = false;
  #surface: SnapshotSurface | undefined;
  readonly #comparisonRaw = new WeakMap<SemanticSnapshot, RawSnapshot>();

  constructor(options: SnapshotEngineOptions) {
    if (
      options.windowLabel.trim().length === 0 ||
      options.windowLabel.length > 128
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    this.#webdriver = options.webdriver;
    this.#windowLabel = options.windowLabel;
    this.references = options.references ?? new ReferenceTable();
    this.#script = options.script ?? loadSnapshotScript;
    this.#now = options.now ?? (() => new Date());
    this.#surface = options.surface;
  }

  get currentSnapshot(): SemanticSnapshot | undefined {
    return this.#currentSnapshot;
  }

  get currentSnapshotComparable(): boolean {
    return this.#currentSnapshotComparable;
  }

  get activeSurface(): SnapshotSurface | undefined {
    return this.#surface;
  }

  /** Select a graph surface and invalidate every reference from its prior context. */
  setSurface(surface: SnapshotSurface): number {
    this.#surface = { ...surface };
    this.#currentSnapshot = undefined;
    this.#currentSnapshotComparable = false;
    return this.references.advance();
  }

  snapshot(
    request?: SnapshotRequest,
    signal?: AbortSignal,
  ): Promise<SemanticSnapshot> {
    return this.enqueue(() => this.captureWithRetry(request, signal), signal);
  }

  interaction<T>(
    operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.enqueue(
      () => operation(() => this.captureWithRetry(undefined, signal)),
      signal,
    );
  }

  interactionComparison<T>(
    operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.enqueue(
      () =>
        operation(() => this.captureWithRetry(undefined, signal, "comparison")),
      signal,
    );
  }

  publishComparison(
    comparison: SemanticSnapshot,
    reservation: ReferenceGenerationReservation,
  ): SemanticSnapshot {
    const raw = this.#comparisonRaw.get(comparison);
    let published: SemanticSnapshot;
    if (raw === undefined || comparison.partial === true) {
      this.references.abandon(reservation);
      published = {
        ...comparison,
        generation: reservation.generation,
        nodes: [],
        partial: true,
      };
      this.#currentSnapshotComparable = false;
    } else {
      published = {
        ...comparison,
        generation: reservation.generation,
        nodes: this.references.publish(raw, reservation),
      };
      this.#currentSnapshotComparable = true;
    }
    this.#currentSnapshot = published;
    this.#comparisonRaw.delete(comparison);
    return published;
  }

  preserveComparison(comparison: SemanticSnapshot): SemanticSnapshot {
    if (
      comparison.partial === true ||
      this.#currentSnapshot === undefined ||
      !this.#comparisonRaw.has(comparison)
    ) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    const preserved = {
      ...comparison,
      generation: this.references.generation,
      nodes: this.#currentSnapshot.nodes,
    };
    this.#currentSnapshot = preserved;
    this.#currentSnapshotComparable = true;
    this.#comparisonRaw.delete(comparison);
    return preserved;
  }

  private enqueue<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const queued = this.#tail.then(async () => {
      signal?.throwIfAborted();
      return await operation();
    });
    this.#tail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private async captureWithRetry(
    request?: SnapshotRequest,
    signal?: AbortSignal,
    mode: "publish" | "comparison" = "publish",
  ): Promise<SemanticSnapshot> {
    const failedStages: SnapshotFailureStage[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.capture(request, signal, mode);
      } catch (error) {
        if (
          signal?.aborted ||
          !(error instanceof PumarejoError) ||
          error.code !== "INTERNAL_ERROR"
        ) {
          throw error;
        }
        if (!(error instanceof SnapshotCaptureError)) throw error;
        failedStages.push(error.stage);
      }
    }
    return await this.partialSnapshot(failedStages, signal, mode);
  }

  private async partialSnapshot(
    failedStages: readonly SnapshotFailureStage[],
    signal?: AbortSignal,
    mode: "publish" | "comparison" = "publish",
  ): Promise<SemanticSnapshot> {
    signal?.throwIfAborted();
    const [rawTitle, rect] = await Promise.all([
      this.#webdriver.title(signal),
      this.#webdriver.windowRect(signal),
    ]);
    const { title } = boundedWindowTitle(rawTitle);
    signal?.throwIfAborted();
    const generation =
      mode === "publish"
        ? this.references.advance()
        : this.references.generation + 1;
    const snapshot: SemanticSnapshot = {
      generation,
      observedAt: this.#now().toISOString(),
      window: {
        label: this.#windowLabel,
        title,
        width: rect.width,
        height: rect.height,
      },
      ...(this.#surface === undefined ? {} : { surface: this.#surface }),
      nodes: [],
      truncation: {
        truncated: true,
        reasons: ["semanticExtraction"],
        counts: {
          visited: 0,
          candidates: 0,
          matched: 0,
          returned: 0,
          filtered: 0,
        },
        refineWith: [
          "rootRef",
          "maxNodes",
          "maxDepth",
          "maxTextLength",
          "filters",
        ],
      },
      partial: true,
      issues: [
        {
          code: "SEMANTIC_EXTRACTION_FAILED",
          message:
            "The window is available, but semantic extraction failed twice.",
          phase: "observation",
          retryable: true,
          suggestion: "Retry with tighter snapshot limits or filters.",
          attempts: failedStages,
        },
      ],
    };
    if (mode === "publish") {
      this.#currentSnapshot = snapshot;
      this.#currentSnapshotComparable = false;
    }
    return snapshot;
  }

  private async capture(
    request?: SnapshotRequest,
    signal?: AbortSignal,
    mode: "publish" | "comparison" = "publish",
  ): Promise<SemanticSnapshot> {
    signal?.throwIfAborted();
    let stage: SnapshotFailureStage = "load_script";
    try {
      const script = await this.#script();
      stage = "resolve_root";
      const root =
        request?.rootRef === undefined
          ? undefined
          : this.references.resolve(request.rootRef);
      const browserOptions = {
        maxNodes: request?.maxNodes ?? 500,
        maxDepth: request?.maxDepth ?? DEFAULT_SNAPSHOT_MAX_DEPTH,
        maxTextLength: request?.maxTextLength ?? 4096,
        visibleOnly: request?.visibleOnly ?? true,
        includeNames: request?.includeNames ?? true,
        includeText: request?.includeText ?? true,
        includeValues: request?.includeValues ?? true,
        ...(request?.roles === undefined ? {} : { roles: request.roles }),
        ...(request?.name === undefined ? {} : { name: request.name }),
        ...(request?.types === undefined ? {} : { types: request.types }),
      };
      stage = "execute_script";
      const candidates = this.references.survivalCandidates();
      const rootArgument =
        root === undefined ? null : { [W3C_ELEMENT_KEY]: root.elementId };
      const baseArguments =
        root === undefined ? [browserOptions] : [browserOptions, rootArgument];
      let previousRefs: readonly string[] | undefined;
      let rawValue: unknown;
      if (candidates.length > 0) {
        try {
          rawValue = await this.#webdriver.execute<unknown>(
            script,
            [
              browserOptions,
              rootArgument,
              candidates.map(({ elementId }) => ({
                [W3C_ELEMENT_KEY]: elementId,
              })),
            ],
            signal,
          );
          previousRefs = candidates.map(({ ref }) => ref);
        } catch (error) {
          // A reload drops the provider's handle variables, which surfaces as
          // a stale element. Survival matching is an optimization, so only
          // that case observes again without previous handles.
          if (
            signal?.aborted ||
            !(error instanceof PumarejoError) ||
            error.code !== "STALE_ELEMENT_REF"
          ) {
            throw error;
          }
          rawValue = undefined;
        }
      }
      rawValue ??= await this.#webdriver.execute<unknown>(
        script,
        baseArguments,
        signal,
      );
      if (
        typeof rawValue === "object" &&
        rawValue !== null &&
        Array.isArray((rawValue as { handles?: unknown }).handles) &&
        (rawValue as { handles: unknown[] }).handles.some(
          (handle) => handle === null,
        ) &&
        Array.isArray((rawValue as { nodes?: unknown }).nodes)
      ) {
        const rawNodes = (
          rawValue as {
            nodes: Array<Record<string, unknown>>;
          }
        ).nodes;
        const maximumProviderIndex = Math.max(
          ...rawNodes.map((node) =>
            Number.isInteger(node.providerHandleIndex)
              ? (node.providerHandleIndex as number)
              : -1,
          ),
        );
        stage = "materialize_handles";
        const providerHandles = await this.#webdriver.snapshotElementHandles(
          signal,
          maximumProviderIndex,
        );
        const nodes = rawNodes.map((node, handleIndex) => {
          const providerHandleIndex = node.providerHandleIndex;
          if (
            !Number.isInteger(providerHandleIndex) ||
            (providerHandleIndex as number) < 0 ||
            (providerHandleIndex as number) >= providerHandles.length
          ) {
            throw new Error("invalid provider handle index");
          }
          const { providerHandleIndex: _providerIndex, ...rawNode } = node;
          return { ...rawNode, handleIndex };
        });
        const handles = rawNodes.map((node) => ({
          [W3C_ELEMENT_KEY]:
            providerHandles[node.providerHandleIndex as number],
        }));
        rawValue = { ...rawValue, handles, nodes };
      }
      stage = "read_title";
      const rawTitle = await this.#webdriver.title(signal);
      const { title, truncated: titleTruncated } = boundedWindowTitle(rawTitle);
      stage = "validate_schema";
      const raw: RawSnapshot = rawSnapshotSchema.parse(
        previousRefs === undefined ||
          typeof rawValue !== "object" ||
          rawValue === null
          ? rawValue
          : { ...rawValue, previousRefs },
      );
      stage = "validate_redaction";
      for (const { descriptor } of raw.nodes) {
        assertRedactionBoundary(descriptor);
      }
      stage = "publish_references";
      const staged =
        mode === "publish" ? undefined : this.references.stage(raw);
      const nodes =
        staged === undefined ? this.references.replace(raw) : staged.nodes;
      const snapshot: SemanticSnapshot = {
        generation: staged?.generation ?? this.references.generation,
        observedAt: this.#now().toISOString(),
        window: {
          label: this.#windowLabel,
          title,
          width: raw.viewport.width,
          height: raw.viewport.height,
        },
        ...(this.#surface === undefined ? {} : { surface: this.#surface }),
        nodes,
        truncation: titleTruncated
          ? {
              ...raw.truncation,
              truncated: true,
              reasons: raw.truncation.reasons.includes("fieldBudget")
                ? raw.truncation.reasons
                : [...raw.truncation.reasons, "fieldBudget" as const],
            }
          : raw.truncation,
      };
      if (mode === "publish") {
        this.#currentSnapshot = snapshot;
        this.#currentSnapshotComparable = hasDefaultComparableScope(request);
      } else {
        this.#comparisonRaw.set(snapshot, raw);
      }
      return snapshot;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof SnapshotCaptureError) throw error;
      if (error instanceof PumarejoError && error.code !== "INTERNAL_ERROR") {
        throw error;
      }
      throw new SnapshotCaptureError(stage, error);
    }
  }
}
