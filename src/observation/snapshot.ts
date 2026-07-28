import { PumarejoError } from "../shared/errors.js";
import type { WebDriverClient } from "../webdriver/client.js";
import { W3C_ELEMENT_KEY } from "../webdriver/protocol.js";
import { assertRedactionBoundary } from "./redaction.js";
import { ReferenceTable } from "./refs.js";
import {
  rawSnapshotSchema,
  type RawSnapshot,
  type SemanticSnapshot,
} from "./schema.js";
import { loadSnapshotScript } from "./snapshot-script.js";

export interface SnapshotEngineOptions {
  readonly webdriver: WebDriverClient;
  readonly windowLabel: string;
  readonly references?: ReferenceTable;
  readonly script?: () => Promise<string>;
  readonly now?: () => Date;
}

export class SnapshotEngine {
  readonly references: ReferenceTable;
  readonly #webdriver: WebDriverClient;
  readonly #windowLabel: string;
  readonly #script: () => Promise<string>;
  readonly #now: () => Date;
  #tail: Promise<void> = Promise.resolve();

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

  snapshot(signal?: AbortSignal): Promise<SemanticSnapshot> {
    return this.enqueue(() => this.captureWithRetry(signal), signal);
  }

  interaction<T>(
    operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.enqueue(
      () => operation(() => this.captureWithRetry(signal)),
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
    signal?: AbortSignal,
  ): Promise<SemanticSnapshot> {
    try {
      return await this.capture(signal);
    } catch (error) {
      if (
        signal?.aborted ||
        !(error instanceof PumarejoError) ||
        error.code !== "INTERNAL_ERROR"
      ) {
        throw error;
      }
      return await this.capture(signal);
    }
  }

  private async capture(signal?: AbortSignal): Promise<SemanticSnapshot> {
    signal?.throwIfAborted();
    try {
      const script = await this.#script();
      const elementIds = await this.#webdriver.snapshotElementHandles(signal);
      const rawValue = await this.#webdriver.execute<unknown>(
        script,
        [
          elementIds.map((elementId) => ({
            [W3C_ELEMENT_KEY]: elementId,
          })),
        ],
        signal,
      );
      const title = await this.#webdriver.title(signal);
      const raw: RawSnapshot = rawSnapshotSchema.parse(rawValue);
      for (const { descriptor } of raw.nodes) {
        assertRedactionBoundary(descriptor);
      }
      const nodes = this.references.replace(raw, elementIds);
      return {
        generation: this.references.generation,
        observedAt: this.#now().toISOString(),
        window: {
          label: this.#windowLabel,
          title,
          width: raw.viewport.width,
          height: raw.viewport.height,
        },
        nodes,
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof PumarejoError) throw error;
      throw new PumarejoError("INTERNAL_ERROR", { cause: error });
    }
  }
}
