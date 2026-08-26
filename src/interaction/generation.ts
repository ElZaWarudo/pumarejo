export type GenerationEffect =
  | "proven_no_change"
  | "proven_state_change"
  | "uncertain";

export type GenerationReason =
  | "pre_dispatch_rejected"
  | "no_observable_change"
  | "stale_reference"
  | "surface_changed"
  | "window_changed"
  | "semantic_changed"
  | "focus_changed"
  | "uncertain_effect"
  | "cancelled_after_dispatch"
  | "final_refresh_failed";

export interface GenerationOutcome {
  readonly effect: GenerationEffect;
  readonly reason: GenerationReason;
}

export interface GenerationDecision extends GenerationOutcome {
  readonly generation: number;
  readonly preservesReferences: boolean;
  readonly requiresPublication: boolean;
}

/** The sole pure authority for mapping bounded action facts to generations. */
export function reduceGeneration(
  currentGeneration: number,
  outcome: GenerationOutcome,
): GenerationDecision {
  if (!Number.isSafeInteger(currentGeneration) || currentGeneration < 0) {
    throw new RangeError("currentGeneration must be a non-negative integer");
  }
  const preservesReferences = outcome.effect === "proven_no_change";
  return {
    ...outcome,
    generation: preservesReferences ? currentGeneration : currentGeneration + 1,
    preservesReferences,
    requiresPublication: !preservesReferences,
  };
}
