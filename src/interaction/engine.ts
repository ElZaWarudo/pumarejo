import { setTimeout as delay } from "node:timers/promises";

import type {
  ClickInput,
  PointerInput,
  PressKeyInput,
  ScrollInput,
  SelectOptionInput,
  TypeInput,
  WindowInput,
} from "../mcp/schemas.js";
import type { SnapshotEngine } from "../observation/snapshot.js";
import type { ReferenceTable, SemanticReference } from "../observation/refs.js";
import { diffSnapshots, type SnapshotChanges } from "../observation/outline.js";
import type { SemanticNode, SemanticSnapshot } from "../observation/schema.js";
import { loadIdentityScript } from "../observation/snapshot-script.js";
import { isPreDispatchFailure, PumarejoError } from "../shared/errors.js";
import { W3C_ELEMENT_KEY } from "../webdriver/protocol.js";
import {
  canonicalModifiers,
  webdriverKey,
  webdriverModifiers,
} from "./keys.js";
import { currentIdentitySchema, type CurrentIdentity } from "./schema.js";
import { reduceGeneration, type GenerationOutcome } from "./generation.js";

// Provider failures are intentionally kept out of the public error envelope.
// This internal marker lets the sequence boundary distinguish an ambiguous
// mutation failure from a target/configuration rejection that happened before
// dispatch, even when both use the same bounded Pumarejo error code.
const postDispatchFailures = new WeakSet<object>();

export function markPostDispatchFailure(error: unknown): void {
  if (
    (typeof error === "object" && error !== null) ||
    typeof error === "function"
  ) {
    postDispatchFailures.add(error);
  }
}

export function isPostDispatchFailure(error: unknown): boolean {
  return (
    ((typeof error === "object" && error !== null) ||
      typeof error === "function") &&
    postDispatchFailures.has(error)
  );
}

interface InteractionWebDriver {
  execute(
    script: string,
    args: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<unknown>;
  click(elementId: string, signal?: AbortSignal): Promise<void>;
  clear(elementId: string, signal?: AbortSignal): Promise<void>;
  type(elementId: string, text: string, signal?: AbortSignal): Promise<void>;
  pressKey(
    value: string,
    modifiers: readonly string[],
    signal?: AbortSignal,
  ): Promise<void>;
  pointer?(
    action: PointerInput["action"],
    elementId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  scroll?(
    elementId: string,
    deltaX: number,
    deltaY: number,
    signal?: AbortSignal,
  ): Promise<void>;
  selectOption?(elementId: string, signal?: AbortSignal): Promise<void>;
  windowAction?(
    input:
      | { readonly action: "maximize" | "restore" }
      | {
          readonly action: "resize";
          readonly width: number;
          readonly height: number;
        },
    signal?: AbortSignal,
  ): Promise<{
    readonly state: "maximized" | "restored";
    readonly rect: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  }>;
}

export interface InteractionEngineOptions {
  readonly webdriver: InteractionWebDriver;
  readonly snapshot: InteractionSnapshotPort;
  readonly identityScript?: () => Promise<string>;
  readonly settle?: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
}

export interface InteractionStabilizationResult {
  readonly generation: number;
  readonly effect: "no_observable_change" | "state_changed" | "uncertain";
  readonly snapshot?: SemanticSnapshot;
}

type InteractionSnapshotPort = Pick<
  SnapshotEngine,
  | "currentSnapshot"
  | "currentSnapshotComparable"
  | "interactionComparison"
  | "publishComparison"
  | "preserveComparison"
  | "references"
>;

export type ObservableEffect =
  | "surface_change"
  | "window_change"
  | "semantic_change"
  | "focus_only"
  | "no_observable_change"
  | "unknown";

interface FocusEvidence {
  readonly generation: number;
  readonly ref: string | null;
  readonly actionable: boolean;
}

export interface InteractionResult {
  readonly generation: number;
  readonly action:
    | "click"
    | "type"
    | "pressKey"
    | "pointer"
    | "scroll"
    | "selectOption"
    | "window";
  readonly ref?: string;
  readonly key?: PressKeyInput["key"];
  readonly modifiers?: NonNullable<PressKeyInput["modifiers"]>;
  readonly cleared?: boolean;
  readonly pointerAction?: PointerInput["action"];
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly window?: {
    readonly state: "maximized" | "restored";
    readonly rect: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  };
  readonly target?: {
    readonly ref: string;
    readonly generation: number;
  };
  readonly dispatch: {
    readonly method: "webdriver";
    readonly dispatched: true;
  };
  readonly focus: {
    readonly before: FocusEvidence;
    readonly after: FocusEvidence;
  };
  readonly effect: {
    readonly kind: ObservableEffect;
    readonly settleMs: number;
  };
  /** What changed, by stable ref, when both observations are comparable. */
  readonly changes?: SnapshotChanges;
  readonly snapshotAfter?: SemanticSnapshot;
}

type ActionInput = Pick<ClickInput, "settleMs" | "snapshotAfter">;

interface SnapshotComparison {
  readonly semanticSignature: string;
  readonly focusedIndex: number | null;
}

const SNAPSHOT_COMPARISONS = new WeakMap<
  SemanticSnapshot,
  SnapshotComparison
>();

function focusEvidence(
  snapshot: SemanticSnapshot | undefined,
  generation: number,
  actionable: boolean,
): FocusEvidence {
  const focusedIndex =
    snapshot === undefined ? null : snapshotComparison(snapshot).focusedIndex;
  const focused =
    snapshot === undefined || focusedIndex === null
      ? undefined
      : snapshot.nodes[focusedIndex];
  return {
    generation,
    ref: focused?.ref ?? null,
    actionable: actionable && focused !== undefined,
  };
}

function normalizedRelationships(
  node: SemanticNode,
  indices: ReadonlyMap<string, number>,
): Record<string, readonly (number | null)[]> {
  return Object.fromEntries(
    (["labelledBy", "describedBy", "controls", "owns"] as const).map((name) => [
      name,
      node.relationships[name].map((ref) => indices.get(ref) ?? null),
    ]),
  );
}

function semanticSignature(snapshot: SemanticSnapshot): string {
  const indices = new Map(
    snapshot.nodes.map((node, index) => [node.ref, index] as const),
  );
  return JSON.stringify({
    truncated: snapshot.truncation.truncated,
    reasons: snapshot.truncation.reasons,
    nodes: snapshot.nodes.map((node) => {
      const {
        ref: _ref,
        parentRef,
        relationships: _relationships,
        focused: _focused,
        bounds: _bounds,
        ...semantic
      } = node;
      return {
        ...semantic,
        parent:
          parentRef === undefined ? null : (indices.get(parentRef) ?? null),
        relationships: normalizedRelationships(node, indices),
      };
    }),
  });
}

function snapshotComparison(snapshot: SemanticSnapshot): SnapshotComparison {
  const cached = SNAPSHOT_COMPARISONS.get(snapshot);
  if (cached !== undefined) return cached;
  const focusedIndex = snapshot.nodes.findIndex((node) => node.focused);
  const comparison = {
    semanticSignature: semanticSignature(snapshot),
    focusedIndex: focusedIndex < 0 ? null : focusedIndex,
  };
  SNAPSHOT_COMPARISONS.set(snapshot, comparison);
  return comparison;
}

function classifyEffect(
  before: SemanticSnapshot | undefined,
  beforeComparable: boolean,
  after: SemanticSnapshot,
  afterComparable: boolean,
): ObservableEffect {
  if (
    before === undefined ||
    !beforeComparable ||
    !afterComparable ||
    before.partial === true ||
    after.partial === true
  ) {
    return "unknown";
  }
  if (
    before.surface?.surfaceRef !== after.surface?.surfaceRef ||
    before.surface?.identity !== after.surface?.identity ||
    before.surface?.kind !== after.surface?.kind
  ) {
    return "surface_change";
  }
  if (
    before.window.label !== after.window.label ||
    before.window.title !== after.window.title ||
    before.window.width !== after.window.width ||
    before.window.height !== after.window.height
  ) {
    return "window_change";
  }
  const beforeComparison = snapshotComparison(before);
  const afterComparison = snapshotComparison(after);
  if (
    beforeComparison.semanticSignature !== afterComparison.semanticSignature
  ) {
    return "semantic_change";
  }
  return beforeComparison.focusedIndex !== afterComparison.focusedIndex
    ? "focus_only"
    : "no_observable_change";
}

function sameIdentity(
  reference: SemanticReference,
  current: CurrentIdentity,
): boolean {
  return (
    current.attached &&
    current.kind === reference.identity.kind &&
    current.tag === reference.identity.tag &&
    current.role === reference.identity.role &&
    current.name === reference.identity.name &&
    current.inputType === reference.identity.inputType &&
    current.ownershipContext === reference.identity.ownershipContext
  );
}

export class InteractionEngine {
  readonly #webdriver: InteractionWebDriver;
  readonly #snapshot: InteractionSnapshotPort;
  readonly #references: ReferenceTable;
  readonly #identityScript: () => Promise<string>;
  readonly #settle: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;

  constructor(options: InteractionEngineOptions) {
    this.#webdriver = options.webdriver;
    this.#snapshot = options.snapshot;
    this.#references = options.snapshot.references;
    this.#identityScript = options.identityScript ?? loadIdentityScript;
    this.#settle =
      options.settle ??
      (async (milliseconds, signal) => {
        if (milliseconds === 0) return;
        await delay(milliseconds, undefined, { signal });
      });
  }

  get generation(): number {
    return this.#references.generation;
  }

  focusedRef(generation: number): string | null {
    const snapshot = this.#snapshot.currentSnapshot;
    if (
      generation !== this.#references.generation ||
      snapshot?.generation !== generation ||
      snapshot.partial === true ||
      !this.#snapshot.currentSnapshotComparable
    ) {
      return null;
    }
    const ref = snapshot.nodes.find((node) => node.focused)?.ref;
    if (ref === undefined) return null;
    try {
      this.#references.resolve(ref);
      return ref;
    } catch {
      return null;
    }
  }

  invalidateUncertain(): number {
    return (
      this.advance({ effect: "uncertain", reason: "uncertain_effect" })
        ?.generation ?? this.#references.generation
    );
  }

  stabilize(signal?: AbortSignal): Promise<InteractionStabilizationResult> {
    return this.interaction(async (refresh) => {
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      let comparison: SemanticSnapshot;
      let refreshStarted = false;
      try {
        signal?.throwIfAborted();
        await this.#settle(250, signal);
        signal?.throwIfAborted();
        refreshStarted = true;
        comparison = await refresh();
      } catch (error) {
        this.advance({
          effect: "uncertain",
          reason: refreshStarted ? "final_refresh_failed" : "uncertain_effect",
        });
        if (signal?.aborted === true) throw error;
        return {
          generation: this.#references.generation,
          effect: "uncertain",
        };
      }
      const observed = classifyEffect(
        before,
        beforeComparable,
        comparison,
        comparison.partial !== true,
      );
      if (observed === "no_observable_change") {
        const snapshot = this.#snapshot.preserveComparison(comparison);
        return {
          generation: snapshot.generation,
          effect: "no_observable_change",
          snapshot,
        };
      }
      const reservation = this.#references.reserve();
      const snapshot = this.#snapshot.publishComparison(
        comparison,
        reservation,
      );
      return {
        generation: snapshot.generation,
        effect: observed === "unknown" ? "uncertain" : "state_changed",
        ...(snapshot.partial === true ? {} : { snapshot }),
      };
    }, signal);
  }

  click(input: ClickInput, signal?: AbortSignal): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      const reference = await this.requireTarget(input.ref, "click", signal);
      await this.mutate(
        () => this.#webdriver.click(reference.elementId, signal),
        signal,
      );
      return await this.observe(
        {
          action: "click",
          ref: input.ref,
          target: { ref: input.ref, generation: reference.generation },
        },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  type(input: TypeInput, signal?: AbortSignal): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      if (input.text.length > 65_536) {
        throw new PumarejoError("ELEMENT_NOT_INTERACTABLE");
      }
      const reference = await this.requireTarget(input.ref, "type", signal);
      const clear = input.clear ?? true;
      let mutationStarted = false;
      try {
        signal?.throwIfAborted();
        if (clear) {
          mutationStarted = true;
          await this.#webdriver.clear(reference.elementId, signal);
        }
        mutationStarted = true;
        await this.#webdriver.type(reference.elementId, input.text, signal);
      } catch (error) {
        if (mutationStarted) {
          markPostDispatchFailure(error);
          this.advance({
            effect: "uncertain",
            reason:
              signal?.aborted === true
                ? "cancelled_after_dispatch"
                : "uncertain_effect",
          });
        }
        throw error;
      }
      return await this.observe(
        {
          action: "type",
          ref: input.ref,
          target: { ref: input.ref, generation: reference.generation },
          cleared: clear,
        },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  pressKey(
    input: PressKeyInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      const value = webdriverKey(input.key);
      const modifiers = canonicalModifiers(input.modifiers);
      await this.mutate(
        () =>
          this.#webdriver.pressKey(
            value,
            webdriverModifiers(modifiers),
            signal,
          ),
        signal,
      );
      return await this.observe(
        { action: "pressKey", key: input.key, modifiers },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  pointer(
    input: PointerInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      const reference = await this.requireTarget(input.ref, "pointer", signal);
      const pointer = this.#webdriver.pointer;
      if (pointer === undefined) throw new PumarejoError("UNSUPPORTED_ACTION");
      await this.mutate(
        () =>
          pointer.call(
            this.#webdriver,
            input.action,
            reference.elementId,
            signal,
          ),
        signal,
      );
      return await this.observe(
        {
          action: "pointer",
          pointerAction: input.action,
          ref: input.ref,
          target: { ref: input.ref, generation: reference.generation },
        },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  scroll(input: ScrollInput, signal?: AbortSignal): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      const reference = await this.requireTarget(input.ref, "scroll", signal);
      const scroll = this.#webdriver.scroll;
      if (scroll === undefined) throw new PumarejoError("UNSUPPORTED_ACTION");
      await this.mutate(
        () =>
          scroll.call(
            this.#webdriver,
            reference.elementId,
            input.deltaX,
            input.deltaY,
            signal,
          ),
        signal,
      );
      return await this.observe(
        {
          action: "scroll",
          ref: input.ref,
          target: { ref: input.ref, generation: reference.generation },
          deltaX: input.deltaX,
          deltaY: input.deltaY,
        },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  selectOption(
    input: SelectOptionInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      const reference = await this.requireTarget(input.ref, "option", signal);
      const selectOption = this.#webdriver.selectOption;
      if (selectOption === undefined) {
        throw new PumarejoError("UNSUPPORTED_ACTION");
      }
      await this.mutate(
        () => selectOption.call(this.#webdriver, reference.elementId, signal),
        signal,
      );
      return await this.observe(
        {
          action: "selectOption",
          ref: input.ref,
          target: { ref: input.ref, generation: reference.generation },
        },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  window(input: WindowInput, signal?: AbortSignal): Promise<InteractionResult> {
    return this.interaction(async (refresh) => {
      this.validateInput(input);
      const before = this.#snapshot.currentSnapshot;
      const beforeComparable = this.#snapshot.currentSnapshotComparable;
      const windowAction = this.#webdriver.windowAction;
      if (windowAction === undefined) {
        throw new PumarejoError("UNSUPPORTED_ACTION");
      }
      const request =
        input.action === "resize"
          ? {
              action: input.action,
              width: input.width!,
              height: input.height!,
            }
          : { action: input.action };
      let effective:
        | {
            readonly state: "maximized" | "restored";
            readonly rect: {
              readonly x: number;
              readonly y: number;
              readonly width: number;
              readonly height: number;
            };
          }
        | undefined;
      await this.mutate(async () => {
        effective = await windowAction.call(this.#webdriver, request, signal);
      }, signal);
      if (effective === undefined) throw new PumarejoError("INTERNAL_ERROR");
      if (input.action === "restore") {
        // Native recovery is useful even while WebView script completion is stalled.
        // Invalidate semantic refs and let the caller request a fresh snapshot separately.
        const startingGeneration = this.#references.generation;
        const generation = this.invalidateUncertain();
        return {
          action: "window",
          window: effective,
          generation,
          dispatch: { method: "webdriver", dispatched: true },
          focus: {
            before: focusEvidence(before, startingGeneration, false),
            after: { generation, ref: null, actionable: false },
          },
          effect: { kind: "unknown", settleMs: 0 },
        };
      }
      return await this.observe(
        { action: "window", window: effective },
        input,
        before,
        beforeComparable,
        refresh,
        signal,
      );
    }, signal);
  }

  private async requireTarget(
    ref: string,
    action: "click" | "type" | "pointer" | "scroll" | "option",
    signal?: AbortSignal,
  ): Promise<SemanticReference> {
    const reference = this.#references.resolve(ref);
    let current: CurrentIdentity;
    try {
      const script = await this.#identityScript();
      current = currentIdentitySchema.parse(
        await this.#webdriver.execute(
          script,
          [{ [W3C_ELEMENT_KEY]: reference.elementId }],
          signal,
        ),
      );
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (
        error instanceof PumarejoError &&
        error.code === "STALE_ELEMENT_REF"
      ) {
        this.advance({
          effect: "proven_state_change",
          reason: "stale_reference",
        });
        throw error;
      }
      throw new PumarejoError("STALE_ELEMENT_REF");
    }
    if (!sameIdentity(reference, current)) {
      this.advance({
        effect: "proven_state_change",
        reason: "stale_reference",
      });
      throw new PumarejoError("STALE_ELEMENT_REF");
    }
    // Native <option> elements are commonly reported as non-visible even
    // while their owning <select> is visible. The WebDriver adapter validates
    // the owner atomically before changing the selection.
    if (!current.visible && action !== "option") {
      throw new PumarejoError("ELEMENT_HIDDEN");
    }
    if (!current.enabled) throw new PumarejoError("ELEMENT_DISABLED");
    if (
      ((action === "click" || action === "type" || action === "option") &&
        current.kind !== "control") ||
      (action === "option" &&
        (current.tag !== "option" || reference.identity.tag !== "option")) ||
      (action === "type" && !current.editable)
    ) {
      throw new PumarejoError("ELEMENT_NOT_INTERACTABLE");
    }
    return reference;
  }

  private async mutate(
    action: () => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    try {
      await action();
    } catch (error) {
      if (isPreDispatchFailure(error)) throw error;
      markPostDispatchFailure(error);
      this.advance({
        effect: "uncertain",
        reason:
          signal?.aborted === true
            ? "cancelled_after_dispatch"
            : "uncertain_effect",
      });
      throw error;
    }
  }

  private interaction<T>(
    operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.#snapshot.interactionComparison(operation, signal);
  }

  private validateInput(input: ActionInput): void {
    const settleMs = input.settleMs ?? 250;
    if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 2_000) {
      throw new PumarejoError("CONFIG_INVALID");
    }
  }

  private advance(outcome: GenerationOutcome) {
    const decision = reduceGeneration(this.#references.generation, outcome);
    if (decision.preservesReferences) return undefined;
    return this.#references.reserve();
  }

  private async observe(
    result: Pick<
      InteractionResult,
      | "action"
      | "cleared"
      | "deltaX"
      | "deltaY"
      | "key"
      | "modifiers"
      | "pointerAction"
      | "ref"
      | "target"
      | "window"
    >,
    input: ActionInput,
    before: SemanticSnapshot | undefined,
    beforeComparable: boolean,
    refresh: () => Promise<SemanticSnapshot>,
    signal?: AbortSignal,
  ): Promise<InteractionResult> {
    const startingGeneration = this.#references.generation;
    const settleMs = input.settleMs ?? 250;
    try {
      await this.#settle(settleMs, signal);
    } catch (error) {
      markPostDispatchFailure(error);
      this.advance({
        effect: "uncertain",
        reason:
          signal?.aborted === true
            ? "cancelled_after_dispatch"
            : "uncertain_effect",
      });
      throw error;
    }
    let comparison: SemanticSnapshot;
    try {
      comparison = await refresh();
    } catch (error) {
      markPostDispatchFailure(error);
      this.advance({ effect: "uncertain", reason: "final_refresh_failed" });
      throw error;
    }
    const effect = classifyEffect(before, beforeComparable, comparison, true);
    const outcome: GenerationOutcome =
      effect === "no_observable_change"
        ? { effect: "proven_no_change", reason: "no_observable_change" }
        : effect === "unknown"
          ? { effect: "uncertain", reason: "uncertain_effect" }
          : {
              effect: "proven_state_change",
              reason:
                effect === "semantic_change"
                  ? "semantic_changed"
                  : effect === "focus_only"
                    ? "focus_changed"
                    : effect === "surface_change"
                      ? "surface_changed"
                      : "window_changed",
            };
    const decision = reduceGeneration(this.#references.generation, outcome);
    let after: SemanticSnapshot;
    if (decision.preservesReferences) {
      after = this.#snapshot.preserveComparison(comparison);
    } else {
      const reservation = this.#references.reserve();
      after = this.#snapshot.publishComparison(comparison, reservation);
    }
    return {
      ...result,
      generation: decision.generation,
      dispatch: { method: "webdriver", dispatched: true },
      focus: {
        before: focusEvidence(before, startingGeneration, false),
        after: focusEvidence(after, after.generation, true),
      },
      effect: {
        kind: effect,
        settleMs,
      },
      ...(before !== undefined &&
      beforeComparable &&
      before.partial !== true &&
      after.partial !== true &&
      effect !== "unknown"
        ? { changes: diffSnapshots(before, after) }
        : {}),
      ...((input.snapshotAfter ?? false) ? { snapshotAfter: after } : {}),
    };
  }
}
