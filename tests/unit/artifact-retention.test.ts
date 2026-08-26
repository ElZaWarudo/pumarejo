import { describe, expect, it } from "vitest";

import { evaluateRetentionPlan } from "../../src/artifacts/retention.js";

const NOW = "2026-08-24T12:00:00.000Z";

function session(
  sessionId: string,
  createdAt: string,
  bytes: number,
  overrides: object = {},
) {
  return {
    sessionId,
    createdAt,
    bytes,
    closed: true,
    retainArtifacts: true,
    owned: true,
    active: false,
    manifestState: "valid",
    ...overrides,
  } as const;
}

describe("deterministic artifact retention planning", () => {
  it("preserves everything when policy is absent or invalid", () => {
    const sessions = [session("a", "2026-08-24T11:00:00.000Z", 10)];
    expect(evaluateRetentionPlan({ now: NOW, sessions }).deletions).toEqual([]);
    expect(
      evaluateRetentionPlan({
        now: NOW,
        sessions,
        policy: { maxCount: Number.POSITIVE_INFINITY },
      }),
    ).toMatchObject({ policyApplied: false, deletions: [] });
  });

  it("applies age, count, and bytes to oldest-first deterministic order", () => {
    const sessions = [
      session("b", "2026-08-24T10:00:00.000Z", 40),
      session("a", "2026-08-24T10:00:00.000Z", 30),
      session("c", "2026-08-24T11:30:00.000Z", 20),
      session("d", "2026-08-24T11:50:00.000Z", 10),
    ];
    const result = evaluateRetentionPlan({
      now: NOW,
      sessions,
      policy: { maxAgeMs: 90 * 60_000, maxCount: 3, maxBytes: 50 },
    });
    expect(result.deletions).toEqual([
      {
        sessionId: "a",
        createdAt: "2026-08-24T10:00:00.000Z",
        bytes: 30,
        reasons: ["age", "count", "bytes"],
      },
      {
        sessionId: "b",
        createdAt: "2026-08-24T10:00:00.000Z",
        bytes: 40,
        reasons: ["age", "bytes"],
      },
    ]);
    expect(result.bytesScheduled).toBe(70);
  });

  it("preserves active, malformed, foreign, and unmanifested sessions", () => {
    const sessions = [
      session("active", "2026-08-24T10:00:00.000Z", 10, {
        active: true,
        closed: false,
      }),
      session("malformed", "not-a-date", 10, { manifestState: "malformed" }),
      session("foreign", "2026-08-24T10:00:00.000Z", 10, { owned: false }),
      session("unknown", "2026-08-24T10:00:00.000Z", 10, {
        unmanifested: true,
      }),
    ];
    const result = evaluateRetentionPlan({
      now: NOW,
      sessions,
      policy: { maxAgeMs: 1 },
    });
    expect(result.deletions).toEqual([]);
    expect(result.preserved).toEqual([
      { sessionId: "active", reason: "active" },
      { sessionId: "malformed", reason: "malformed" },
      { sessionId: "foreign", reason: "foreign" },
      { sessionId: "unknown", reason: "unmanifested" },
    ]);
  });

  it("requires affirmative ownership, validity, retention, closure, and inactivity", () => {
    const candidates = [
      session("missing-owned", "2026-08-24T10:00:00.000Z", 10, {
        owned: undefined,
      }),
      session("missing-state", "2026-08-24T10:00:00.000Z", 10, {
        manifestState: undefined,
      }),
      session("missing-retain", "2026-08-24T10:00:00.000Z", 10, {
        retainArtifacts: undefined,
      }),
      session("unclosed", "2026-08-24T10:00:00.000Z", 10, {
        closed: false,
      }),
      session("unproven", "2026-08-24T10:00:00.000Z", 10, {
        active: undefined,
      }),
      session("conflicting", "2026-08-24T10:00:00.000Z", 10, {
        status: "foreign",
      }),
    ];
    expect(
      evaluateRetentionPlan({
        now: NOW,
        sessions: candidates,
        policy: { maxCount: 0 },
      }).deletions,
    ).toEqual([]);
  });

  it("is repeatable and does not mutate caller order", () => {
    const sessions = [
      session("b", "2026-08-24T11:00:00.000Z", 10),
      session("a", "2026-08-24T11:00:00.000Z", 10),
    ];
    const first = evaluateRetentionPlan({
      now: NOW,
      sessions,
      policy: { maxCount: 1 },
    });
    const second = evaluateRetentionPlan({
      now: NOW,
      sessions,
      policy: { maxCount: 1 },
    });
    expect(first).toEqual(second);
    expect(sessions.map(({ sessionId }) => sessionId)).toEqual(["b", "a"]);
  });
});
