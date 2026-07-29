import { PumarejoError } from "../shared/errors.js";
import type { WebDriverClient } from "../webdriver/client.js";
import { W3C_ELEMENT_KEY } from "../webdriver/protocol.js";
import { assertRedactionBoundary } from "./redaction.js";
import { ReferenceTable } from "./refs.js";
import {
  rawSnapshotSchema,
  type RawSnapshot,
  type SemanticSnapshot,
  type SnapshotRequest,
} from "./schema.js";
import { loadSnapshotScript } from "./snapshot-script.js";

const MAX_WINDOW_TITLE_LENGTH = 4_096;

export interface SnapshotEngineOptions {
  readonly webdriver: WebDriverClient;
  readonly windowLabel: string;
  readonly references?: ReferenceTable;
  readonly script?: () => Promise<string>;
  readonly now?: () => Date;
}

function hasDefaultComparableScope(request?: SnapshotRequest): boolean {
  return (
    request?.rootRef === undefined &&
    (request?.maxNodes === undefined || request.maxNodes === 500) &&
    (request?.maxDepth === undefined || request.maxDepth === 32) &&
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

export class SnapshotEngine {
  readonly references: ReferenceTable;
  readonly #webdriver: WebDriverClient;
  readonly #windowLabel: string;
  readonly #script: () => Promise<string>;
  readonly #now: () => Date;
  #tail: Promise<void> = Promise.resolve();
  #currentSnapshot: SemanticSnapshot | undefined;
  #currentSnapshotComparable = false;

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
  }

  get currentSnapshot(): SemanticSnapshot | undefined {
    return this.#currentSnapshot;
  }

  get currentSnapshotComparable(): boolean {
    return this.#currentSnapshotComparable;
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
  ): Promise<SemanticSnapshot> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.capture(request, signal);
      } catch (error) {
        if (
          signal?.aborted ||
          !(error instanceof PumarejoError) ||
          error.code !== "INTERNAL_ERROR"
        ) {
          throw error;
        }
      }
    }
    return await this.partialSnapshot(signal);
  }

  private async partialSnapshot(
    signal?: AbortSignal,
  ): Promise<SemanticSnapshot> {
    signal?.throwIfAborted();
    const [rawTitle, rect] = await Promise.all([
      this.#webdriver.title(signal),
      this.#webdriver.windowRect(signal),
    ]);
    const { title } = boundedWindowTitle(rawTitle);
    signal?.throwIfAborted();
    const generation = this.references.advance();
    const snapshot: SemanticSnapshot = {
      generation,
      observedAt: this.#now().toISOString(),
      window: {
        label: this.#windowLabel,
        title,
        width: rect.width,
        height: rect.height,
      },
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
        },
      ],
    };
    this.#currentSnapshot = snapshot;
    this.#currentSnapshotComparable = false;
    return snapshot;
  }

  private async capture(
    request?: SnapshotRequest,
    signal?: AbortSignal,
  ): Promise<SemanticSnapshot> {
    signal?.throwIfAborted();
    try {
      const script = await this.#script();
      const root =
        request?.rootRef === undefined
          ? undefined
          : this.references.resolve(request.rootRef);
      const browserOptions = {
        maxNodes: request?.maxNodes ?? 500,
        maxDepth: request?.maxDepth ?? 32,
        maxTextLength: request?.maxTextLength ?? 4096,
        visibleOnly: request?.visibleOnly ?? true,
        includeNames: request?.includeNames ?? true,
        includeText: request?.includeText ?? true,
        includeValues: request?.includeValues ?? true,
        ...(request?.roles === undefined ? {} : { roles: request.roles }),
        ...(request?.name === undefined ? {} : { name: request.name }),
        ...(request?.types === undefined ? {} : { types: request.types }),
      };
      let rawValue = await this.#webdriver.execute<unknown>(
        script,
        root === undefined
          ? [browserOptions]
          : [browserOptions, { [W3C_ELEMENT_KEY]: root.elementId }],
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
      const rawTitle = await this.#webdriver.title(signal);
      const { title, truncated: titleTruncated } = boundedWindowTitle(rawTitle);
      const raw: RawSnapshot = rawSnapshotSchema.parse(rawValue);
      for (const { descriptor } of raw.nodes) {
        assertRedactionBoundary(descriptor);
      }
      const nodes = this.references.replace(raw);
      const snapshot: SemanticSnapshot = {
        generation: this.references.generation,
        observedAt: this.#now().toISOString(),
        window: {
          label: this.#windowLabel,
          title,
          width: raw.viewport.width,
          height: raw.viewport.height,
        },
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
      this.#currentSnapshot = snapshot;
      this.#currentSnapshotComparable = hasDefaultComparableScope(request);
      return snapshot;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof PumarejoError) throw error;
      throw new PumarejoError("INTERNAL_ERROR", { cause: error });
    }
  }
}
