import { describe, expect, it, vi } from "vitest";

import {
  SequenceExecutor,
  type SequenceInteractionPort,
} from "../../src/interaction/sequence.js";
import { sequenceInputSchema } from "../../src/mcp/schemas.js";
import type { InteractionResult } from "../../src/interaction/engine.js";

function noChange(action: InteractionResult["action"]): InteractionResult {
  return {
    generation: 3,
    action,
    dispatch: { method: "webdriver", dispatched: true },
    focus: {
      before: { generation: 3, ref: null, actionable: false },
      after: { generation: 3, ref: null, actionable: false },
    },
    effect: { kind: "no_observable_change", settleMs: 250 },
  };
}

describe("public sequence integration", () => {
  it("parses public defaults, executes exact actions, and returns only final stabilization", async () => {
    const click = vi.fn(async () => noChange("click"));
    const type = vi.fn(async () => noChange("type"));
    const stabilize = vi.fn(async () => ({
      generation: 3,
      effect: "no_observable_change" as const,
    }));
    const interactions: SequenceInteractionPort = {
      generation: 3,
      focusedRef: () => null,
      click,
      type,
      pressKey: async () => noChange("pressKey"),
      pointer: async () => noChange("pointer"),
      scroll: async () => noChange("scroll"),
      selectOption: async () => noChange("selectOption"),
      stabilize,
      invalidateUncertain: () => 4,
    };
    const secret = "do-not-echo-this-secret";
    const input = sequenceInputSchema.parse({
      generation: 3,
      steps: [
        { kind: "click", ref: "e3-1" },
        { kind: "type", ref: "e3-2", text: secret },
      ],
    });

    const output = await new SequenceExecutor({ interactions }).execute(input);

    expect(click).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "e3-1" }),
      expect.any(AbortSignal),
    );
    expect(type).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "e3-2", text: secret }),
      expect.any(AbortSignal),
    );
    expect(stabilize).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(output)).not.toContain(secret);
    expect(output.steps).toHaveLength(2);
  });
});
