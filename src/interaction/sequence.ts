import { setTimeout as delay } from "node:timers/promises";

import {
  sequenceInputSchema,
  type SequenceInput,
  type SequenceStep,
} from "../mcp/schemas.js";
import type { SemanticSnapshot } from "../observation/schema.js";
import { PumarejoError } from "../shared/errors.js";
import { isPostDispatchFailure, type InteractionResult } from "./engine.js";

export type SequenceStepStatus =
  | "completed"
  | "rejected"
  | "not_run"
  | "timed_out"
  | "cancelled";

export type SequenceStepEffect =
  | "no_change"
  | "state_changed"
  | "uncertain"
  | "not_run";

export interface SequenceStepOutcome {
  readonly index: number;
  readonly status: SequenceStepStatus;
  readonly effect: SequenceStepEffect;
  readonly reason: string;
  readonly elapsedMs: number;
  readonly dispatched: boolean;
}

export interface SequenceStabilization {
  readonly generation: number;
  readonly effect: "no_observable_change" | "state_changed" | "uncertain";
  readonly snapshot?: SemanticSnapshot;
}

export interface SequenceInteractionPort {
  readonly generation: number;
  focusedRef(generation: number): string | null;
  click(
    input: Extract<SequenceStep, { kind: "click" }>,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  type(
    input: Extract<SequenceStep, { kind: "type" }>,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  pressKey(
    input: Omit<Extract<SequenceStep, { kind: "pressKey" }>, "kind" | "ref">,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  pointer(
    input: Omit<Extract<SequenceStep, { kind: "pointer" }>, "kind">,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  scroll(
    input: Omit<Extract<SequenceStep, { kind: "scroll" }>, "kind">,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  selectOption(
    input: Omit<Extract<SequenceStep, { kind: "selectOption" }>, "kind">,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  stabilize(signal?: AbortSignal): Promise<SequenceStabilization>;
  invalidateUncertain(): number;
}

export interface SequenceResult {
  readonly startedGeneration: number;
  readonly endingGeneration: number;
  readonly steps: readonly SequenceStepOutcome[];
  readonly stoppedEarly: boolean;
  readonly stopReason: string;
  readonly snapshotAfter?: SemanticSnapshot;
}

export interface SequenceExecutorOptions {
  readonly interactions: SequenceInteractionPort;
  readonly now?: () => number;
  readonly wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function publicReason(error: unknown): string {
  if (!(error instanceof PumarejoError)) return "interaction_rejected";
  switch (error.code) {
    case "STALE_ELEMENT_REF":
      return "stale_reference";
    case "ELEMENT_HIDDEN":
    case "ELEMENT_DISABLED":
    case "ELEMENT_NOT_INTERACTABLE":
      return "invalid_target";
    case "UNSUPPORTED_ACTION":
    case "WINDOW_ACTION_UNSUPPORTED":
    case "UNSUPPORTED_KEY":
    case "INTEGRATION_INCOMPLETE":
      return "unsupported";
    case "WINDOW_ACTION_DENIED":
      return "capability_denied";
    case "WINDOW_ACTION_UNAVAILABLE":
      return "capability_unavailable";
    case "WINDOW_ACTION_FAILED":
    case "WINDOW_ACTION_POSTCONDITION_FAILED":
      return "window_action_failed";
    case "SESSION_NOT_ACTIVE":
      return "session_not_active";
    default:
      return "interaction_rejected";
  }
}

function failureDispatched(error: unknown): boolean {
  return isPostDispatchFailure(error);
}

function isChanging(
  result: InteractionResult,
  beforeGeneration: number,
): boolean {
  return (
    result.generation !== beforeGeneration ||
    result.effect.kind !== "no_observable_change"
  );
}

export class SequenceExecutor {
  readonly #interactions: SequenceInteractionPort;
  readonly #now: () => number;
  readonly #wait: (milliseconds: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: SequenceExecutorOptions) {
    this.#interactions = options.interactions;
    this.#now = options.now ?? (() => performance.now());
    this.#wait =
      options.wait ??
      (async (milliseconds, signal) => {
        if (milliseconds === 0) return;
        await delay(milliseconds, undefined, { signal });
      });
  }

  async execute(
    input: SequenceInput,
    callerSignal?: AbortSignal,
  ): Promise<SequenceResult> {
    const startedAt = this.#now();
    input = sequenceInputSchema.parse(input);
    const startedGeneration = this.#interactions.generation;
    if (input.generation !== startedGeneration) {
      throw new PumarejoError("STALE_ELEMENT_REF");
    }
    if (
      input.steps.length === 0 ||
      input.steps.length > input.maxSteps ||
      input.steps.length > 32
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }

    const deadline = startedAt + input.timeoutMs;
    const outcomes: SequenceStepOutcome[] = [];
    let stopReason = "completed";
    let attempted = false;
    let typedInputAttempted = false;

    for (let index = 0; index < input.steps.length; index += 1) {
      const step = input.steps[index]!;
      const stepStarted = this.#now();
      const elapsed = () =>
        Math.min(input.timeoutMs, Math.max(0, this.#now() - stepStarted));
      if (stepStarted >= deadline) {
        stopReason = "deadline_exceeded";
        break;
      }
      if (this.#interactions.generation !== input.generation) {
        stopReason = "generation_changed";
        break;
      }

      attempted = true;
      if (
        step.kind === "pressKey" &&
        this.#interactions.focusedRef(input.generation) !== step.ref
      ) {
        outcomes.push({
          index,
          status: "rejected",
          effect: "no_change",
          reason: "focus_mismatch",
          elapsedMs: elapsed(),
          dispatched: false,
        });
        stopReason = "focus_mismatch";
        break;
      }

      let dispatched = false;
      try {
        callerSignal?.throwIfAborted();
        let actionResult: InteractionResult | undefined;
        if (step.kind === "wait") {
          const remaining = Math.max(1, Math.ceil(deadline - this.#now()));
          const deadlineSignal = AbortSignal.timeout(remaining);
          const signal =
            callerSignal === undefined
              ? deadlineSignal
              : AbortSignal.any([callerSignal, deadlineSignal]);
          await this.#wait(step.waitMs, signal);
        } else {
          dispatched = true;
          if (step.kind === "type") typedInputAttempted = true;
          const remaining = Math.max(1, Math.ceil(deadline - this.#now()));
          const deadlineSignal = AbortSignal.timeout(remaining);
          const signal =
            callerSignal === undefined
              ? deadlineSignal
              : AbortSignal.any([callerSignal, deadlineSignal]);
          actionResult = await this.dispatch(step, signal);
        }

        if (this.#now() >= deadline) {
          if (
            dispatched &&
            this.#interactions.generation === input.generation
          ) {
            this.#interactions.invalidateUncertain();
          }
          outcomes.push({
            index,
            status: "timed_out",
            effect: dispatched ? "uncertain" : "no_change",
            reason: "deadline_exceeded",
            elapsedMs: elapsed(),
            dispatched,
          });
          stopReason = "deadline_exceeded";
          break;
        }

        const changed =
          actionResult !== undefined &&
          isChanging(actionResult, input.generation);
        outcomes.push({
          index,
          status: "completed",
          effect: changed ? "state_changed" : "no_change",
          reason: changed ? "state_changed" : "no_observable_change",
          elapsedMs: elapsed(),
          dispatched,
        });
        if (changed) {
          stopReason = "generation_changed";
          break;
        }
      } catch (error) {
        if (callerSignal?.aborted === true) throw error;
        const timedOut =
          this.#now() >= deadline ||
          (error instanceof DOMException && error.name === "TimeoutError");
        const didDispatch =
          dispatched && (timedOut || failureDispatched(error));
        if (didDispatch && this.#interactions.generation === input.generation) {
          this.#interactions.invalidateUncertain();
        }
        const advanced = this.#interactions.generation !== input.generation;
        const reason = timedOut ? "deadline_exceeded" : publicReason(error);
        const effect: SequenceStepEffect =
          reason === "stale_reference" &&
          advanced &&
          !isPostDispatchFailure(error)
            ? "state_changed"
            : advanced || didDispatch
              ? "uncertain"
              : "no_change";
        outcomes.push({
          index,
          status: timedOut ? "timed_out" : "rejected",
          effect,
          reason,
          elapsedMs: elapsed(),
          dispatched: didDispatch,
        });
        stopReason = reason;
        break;
      }
    }

    for (let index = outcomes.length; index < input.steps.length; index += 1) {
      outcomes.push({
        index,
        status: "not_run",
        effect: "not_run",
        reason: stopReason,
        elapsedMs: 0,
        dispatched: false,
      });
    }

    let final: SequenceStabilization | undefined;
    if (attempted && this.#now() < deadline) {
      const remaining = Math.max(1, Math.ceil(deadline - this.#now()));
      const deadlineSignal = AbortSignal.timeout(remaining);
      const signal =
        callerSignal === undefined
          ? deadlineSignal
          : AbortSignal.any([callerSignal, deadlineSignal]);
      try {
        final = await this.#interactions.stabilize(signal);
        if (this.#now() >= deadline) {
          if (this.#interactions.generation === input.generation) {
            this.#interactions.invalidateUncertain();
          }
          final = {
            generation: this.#interactions.generation,
            effect: "uncertain",
          };
          stopReason = "final_stabilization_timeout";
        } else if (
          final.effect !== "no_observable_change" &&
          stopReason === "completed"
        ) {
          stopReason =
            final.effect === "uncertain"
              ? "final_stabilization_failed"
              : "generation_changed";
        }
      } catch (error) {
        if (callerSignal?.aborted === true) throw error;
        if (this.#interactions.generation === input.generation) {
          this.#interactions.invalidateUncertain();
        }
        final = {
          generation: this.#interactions.generation,
          effect: "uncertain",
        };
        stopReason = "final_stabilization_failed";
      }
    } else if (
      attempted &&
      this.#interactions.generation === input.generation
    ) {
      this.#interactions.invalidateUncertain();
      if (stopReason === "completed")
        stopReason = "final_stabilization_timeout";
    }

    return {
      startedGeneration,
      endingGeneration: this.#interactions.generation,
      steps: outcomes,
      stoppedEarly:
        outcomes.some((outcome) => outcome.status !== "completed") ||
        stopReason !== "completed",
      stopReason,
      ...(typedInputAttempted ||
      final?.snapshot === undefined ||
      final.snapshot.partial === true
        ? {}
        : { snapshotAfter: final.snapshot }),
    };
  }

  private dispatch(
    step: Exclude<SequenceStep, { kind: "wait" }>,
    signal: AbortSignal,
  ): Promise<InteractionResult> {
    switch (step.kind) {
      case "click":
        return this.#interactions.click(step, signal);
      case "type":
        return this.#interactions.type(step, signal);
      case "pressKey": {
        const { kind: _kind, ref: _ref, ...input } = step;
        return this.#interactions.pressKey(input, signal);
      }
      case "pointer": {
        const { kind: _kind, ...input } = step;
        return this.#interactions.pointer(input, signal);
      }
      case "scroll": {
        const { kind: _kind, ...input } = step;
        return this.#interactions.scroll(input, signal);
      }
      case "selectOption": {
        const { kind: _kind, ...input } = step;
        return this.#interactions.selectOption(input, signal);
      }
    }
  }
}
