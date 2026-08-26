import { describe, expect, it, vi } from "vitest";

import {
  SequenceExecutor,
  type SequenceInteractionPort,
} from "../../src/interaction/sequence.js";
import {
  markPostDispatchFailure,
  type InteractionResult,
} from "../../src/interaction/engine.js";
import type { SemanticSnapshot } from "../../src/observation/schema.js";
import { PumarejoError } from "../../src/shared/errors.js";

function result(
  generation: number,
  effect: InteractionResult["effect"]["kind"] = "no_observable_change",
): InteractionResult {
  return {
    generation,
    action: "click",
    dispatch: { method: "webdriver", dispatched: true },
    focus: {
      before: { generation, ref: null, actionable: false },
      after: { generation, ref: null, actionable: false },
    },
    effect: { kind: effect, settleMs: 0 },
  };
}

function snapshot(generation: number): SemanticSnapshot {
  return {
    generation,
    observedAt: "2026-08-24T00:00:00.000Z",
    window: { label: "main", title: "Fixture", width: 800, height: 600 },
    nodes: [],
    truncation: {
      truncated: false,
      reasons: [],
      counts: {
        visited: 0,
        candidates: 0,
        matched: 0,
        returned: 0,
        filtered: 0,
      },
      refineWith: [],
    },
  };
}

function port() {
  let generation = 4;
  const click = vi.fn(async (_input: { readonly ref: string }) =>
    result(generation),
  );
  const interaction: SequenceInteractionPort = {
    get generation() {
      return generation;
    },
    focusedRef: vi.fn(() => "e4-focus"),
    click,
    type: vi.fn(async () => result(generation)),
    pressKey: vi.fn(async () => result(generation)),
    pointer: vi.fn(async () => result(generation)),
    scroll: vi.fn(async () => result(generation)),
    selectOption: vi.fn(async () => result(generation)),
    stabilize: vi.fn(async () => ({
      generation,
      effect: "no_observable_change" as const,
      snapshot: snapshot(generation),
    })),
    invalidateUncertain: vi.fn(() => {
      generation += 1;
      return generation;
    }),
  };
  return {
    interaction,
    click,
    setGeneration: (value: number) => (generation = value),
  };
}

describe("bounded sequence executor", () => {
  it("executes no-change exact-ref steps in order and emits one final snapshot", async () => {
    const { interaction, click } = port();
    const events: string[] = [];
    click.mockImplementation(async (input: { readonly ref: string }) => {
      events.push(input.ref);
      return result(4);
    });
    const executor = new SequenceExecutor({
      interactions: interaction,
      wait: async (milliseconds) => {
        events.push(`wait:${milliseconds}`);
      },
      now: (() => {
        let now = 0;
        return () => now++;
      })(),
    });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [
        { kind: "click", ref: "e4-1", settleMs: 0 },
        { kind: "wait", waitMs: 5 },
        { kind: "click", ref: "e4-2", settleMs: 0 },
      ],
    });

    expect(events).toEqual(["e4-1", "wait:5", "e4-2"]);
    expect(output).toMatchObject({
      startedGeneration: 4,
      endingGeneration: 4,
      stoppedEarly: false,
      stopReason: "completed",
      snapshotAfter: { generation: 4 },
    });
    expect(output.steps.map(({ status }) => status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(interaction.stabilize).toHaveBeenCalledTimes(1);
  });

  it("stops after one changing step and marks later steps not_run", async () => {
    const { interaction, click, setGeneration } = port();
    click.mockImplementationOnce(async () => {
      setGeneration(5);
      return result(5, "semantic_change");
    });
    const executor = new SequenceExecutor({ interactions: interaction });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [
        { kind: "click", ref: "e4-1", settleMs: 0 },
        { kind: "click", ref: "e4-2", settleMs: 0 },
      ],
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(output.endingGeneration).toBe(5);
    expect(output.steps).toMatchObject([
      {
        index: 0,
        status: "completed",
        effect: "state_changed",
        dispatched: true,
      },
      { index: 1, status: "not_run", effect: "not_run", dispatched: false },
    ]);
    expect(output.stoppedEarly).toBe(true);
  });

  it("binds pressKey to the current actionable focus", async () => {
    const { interaction } = port();
    const executor = new SequenceExecutor({ interactions: interaction });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [
        {
          kind: "pressKey",
          ref: "e4-other",
          key: "ENTER",
          modifiers: [],
          settleMs: 0,
        },
      ],
    });

    expect(interaction.pressKey).not.toHaveBeenCalled();
    expect(output.steps[0]).toMatchObject({
      status: "rejected",
      reason: "focus_mismatch",
      dispatched: false,
    });
  });

  it.each([
    new PumarejoError("ELEMENT_NOT_INTERACTABLE"),
    new Error("provider rejected before dispatch"),
  ])(
    "reports an unmarked pre-dispatch failure as no-change and not dispatched",
    async (error) => {
      const { interaction, click } = port();
      click.mockRejectedValueOnce(error);
      const executor = new SequenceExecutor({ interactions: interaction });

      const output = await executor.execute({
        generation: 4,
        maxSteps: 8,
        timeoutMs: 10_000,
        steps: [{ kind: "click", ref: "e4-1", settleMs: 0 }],
      });

      expect(output.steps[0]).toMatchObject({
        status: "rejected",
        effect: "no_change",
        dispatched: false,
      });
      expect(output.endingGeneration).toBe(4);
    },
  );

  it("distinguishes stale rejection without advancement from identity drift", async () => {
    const unchanged = port();
    unchanged.click.mockRejectedValueOnce(
      new PumarejoError("STALE_ELEMENT_REF"),
    );
    const unchangedOutput = await new SequenceExecutor({
      interactions: unchanged.interaction,
    }).execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [{ kind: "click", ref: "e4-1", settleMs: 0 }],
    });

    expect(unchangedOutput.steps[0]).toMatchObject({
      effect: "no_change",
      dispatched: false,
      reason: "stale_reference",
    });
    expect(unchangedOutput.endingGeneration).toBe(4);

    const drifted = port();
    drifted.click.mockImplementationOnce(async () => {
      drifted.setGeneration(5);
      throw new PumarejoError("STALE_ELEMENT_REF");
    });
    const driftedOutput = await new SequenceExecutor({
      interactions: drifted.interaction,
    }).execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [{ kind: "click", ref: "e4-1", settleMs: 0 }],
    });

    expect(driftedOutput.steps[0]).toMatchObject({
      effect: "state_changed",
      dispatched: false,
      reason: "stale_reference",
    });
    expect(driftedOutput.endingGeneration).toBe(5);
  });

  it("marks an ambiguous post-dispatch failure uncertain and advances once", async () => {
    const { interaction, click } = port();
    const error = new PumarejoError("WEBDRIVER_NOT_READY");
    markPostDispatchFailure(error);
    click.mockRejectedValueOnce(error);
    const executor = new SequenceExecutor({ interactions: interaction });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [{ kind: "click", ref: "e4-1", settleMs: 0 }],
    });

    expect(output.steps[0]).toMatchObject({
      effect: "uncertain",
      dispatched: true,
    });
    expect(interaction.invalidateUncertain).toHaveBeenCalledTimes(1);
    expect(output.endingGeneration).toBe(5);
  });

  it("does not begin a step after the monotonic deadline", async () => {
    const { interaction, click } = port();
    let now = 0;
    click.mockImplementationOnce(async () => {
      now = 11;
      return result(4);
    });
    const executor = new SequenceExecutor({
      interactions: interaction,
      now: () => now,
    });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10,
      steps: [
        { kind: "click", ref: "e4-1", settleMs: 0 },
        { kind: "click", ref: "e4-2", settleMs: 0 },
      ],
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(output.steps[0]).toMatchObject({
      status: "timed_out",
      effect: "uncertain",
      elapsedMs: 10,
      dispatched: true,
    });
    expect(output.steps[1]).toMatchObject({
      status: "not_run",
      reason: "deadline_exceeded",
    });
  });

  it("never echoes typed text in step outcomes", async () => {
    const { interaction } = port();
    const executor = new SequenceExecutor({ interactions: interaction });
    const secret = "super-secret-value";
    vi.mocked(interaction.stabilize).mockResolvedValueOnce({
      generation: 4,
      effect: "no_observable_change",
      snapshot: {
        ...snapshot(4),
        window: {
          ...snapshot(4).window,
          title: `Result: ${secret}`,
        },
        nodes: [
          {
            ref: "e4-1",
            kind: "control",
            tag: "input",
            role: "textbox",
            name: secret,
            text: secret,
            value: secret,
            redacted: false,
            enabled: true,
            visible: true,
            focused: true,
            bounds: { x: 0, y: 0, width: 100, height: 20 },
            relationships: {
              labelledBy: [],
              describedBy: [],
              controls: [],
              owns: [],
            },
          },
        ],
      },
    });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [
        { kind: "type", ref: "e4-1", text: secret, clear: true, settleMs: 0 },
      ],
    });

    expect(JSON.stringify(output)).not.toContain(secret);
    expect(output).not.toHaveProperty("snapshotAfter");
  });

  it("invalidates once and returns no old snapshot when final stabilization fails", async () => {
    const { interaction } = port();
    vi.mocked(interaction.stabilize).mockRejectedValueOnce(
      new DOMException("deadline", "TimeoutError"),
    );
    const executor = new SequenceExecutor({ interactions: interaction });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10_000,
      steps: [{ kind: "wait", waitMs: 0 }],
    });

    expect(output).toMatchObject({
      startedGeneration: 4,
      endingGeneration: 5,
      stopReason: "final_stabilization_failed",
    });
    expect(output).not.toHaveProperty("snapshotAfter");
    expect(interaction.invalidateUncertain).toHaveBeenCalledTimes(1);
  });

  it("invalidates once and omits a stabilization snapshot returned after the deadline", async () => {
    const { interaction } = port();
    let now = 0;
    vi.mocked(interaction.stabilize).mockImplementationOnce(async () => {
      now = 11;
      return {
        generation: 4,
        effect: "no_observable_change",
        snapshot: snapshot(4),
      };
    });
    const executor = new SequenceExecutor({
      interactions: interaction,
      now: () => now,
    });

    const output = await executor.execute({
      generation: 4,
      maxSteps: 8,
      timeoutMs: 10,
      steps: [{ kind: "wait", waitMs: 0 }],
    });

    expect(output).toMatchObject({
      endingGeneration: 5,
      stoppedEarly: true,
      stopReason: "final_stabilization_timeout",
    });
    expect(output).not.toHaveProperty("snapshotAfter");
    expect(interaction.invalidateUncertain).toHaveBeenCalledTimes(1);
  });
});
