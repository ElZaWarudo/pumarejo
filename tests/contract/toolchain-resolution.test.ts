import { describe, expect, it } from "vitest";

import {
  projectToolchainEvidence,
  sanitizeToolchainEvidence,
} from "../../src/platform/toolchain-evidence.js";
import type { ToolchainResolution } from "../../src/platform/toolchain-resolver.js";

describe("toolchain evidence internal contract", () => {
  it("is additive, bounded, and contains no raw path, env, args, or causes", () => {
    const event = projectToolchainEvidence(
      {
        node: {
          kind: "node",
          outcome: "unavailable",
          candidates: Array.from({ length: 100 }, (_, index) => ({
            kind: "node" as const,
            source: "child-path" as const,
            path: `C:\\Users\\dev\\tools\\node-${index}.exe`,
            basename: `node-${index}.exe`,
            identity: "0123456789abcdef",
            fileKind: "regular-file" as const,
            accepted: false,
            rejection: "probe-failed" as const,
          })),
        },
      },
      { sessionId: "session-1" },
    )[0];
    expect(event?.version).toBe(1);
    expect(event?.candidates).toHaveLength(64);
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("PATH");
    expect(serialized).not.toContain("stderr");
    expect(serialized).not.toContain("args");
    expect(serialized).not.toContain("cause");
  });

  it("drops wrong-session and wrong-surface envelopes", () => {
    const resolution = {
      kind: "node" as const,
      outcome: "unavailable" as const,
      candidates: [],
    };
    expect(
      projectToolchainEvidence(
        { node: resolution },
        {
          sessionId: "session-1",
          surfaceRef: "surface-1",
          ownership: { sessionId: "session-2", surfaceRef: "surface-2" },
        },
      ),
    ).toEqual([]);
  });

  it.each([
    ["invalid session", { sessionId: "invalid session" }],
    [
      "inactive ownership",
      {
        sessionId: "session-1",
        ownership: { sessionId: "session-1", active: false },
      },
    ],
    [
      "wrong session",
      { sessionId: "session-1", ownership: { sessionId: "session-2" } },
    ],
    ["invalid surface", { sessionId: "session-1", surfaceRef: "bad surface" }],
    [
      "wrong surface",
      {
        sessionId: "session-1",
        surfaceRef: "surface-1",
        ownership: { sessionId: "session-1", surfaceRef: "surface-2" },
      },
    ],
  ] as const)("drops %s independently", (_name, context) => {
    expect(
      projectToolchainEvidence(
        {
          node: {
            kind: "node",
            outcome: "unavailable",
            candidates: [],
          },
        },
        context,
      ),
    ).toEqual([]);
  });

  it("normalizes malformed candidate, comparison, and environment fields", () => {
    const malformed = {
      kind: "node",
      outcome: "resolved",
      candidates: [
        {
          kind: "node",
          source: "C:\\secret",
          path: "C:\\secret\\node.exe",
          basename: "..\\secret\\node.exe",
          identity: "not-an-identity",
          fileKind: "C:\\secret",
          accepted: true,
          version: "development-secret",
          rejection: "raw-cause",
        },
      ],
      comparison: {
        disposition: "raw-disposition",
        identity: "C:\\secret",
        version: "secret",
      },
    } as unknown as ToolchainResolution;
    const event = sanitizeToolchainEvidence("node", malformed, {
      sessionId: "session-1",
      environment: {
        comparedKeys: Number.POSITIVE_INFINITY,
        categories: [{ category: "changed", count: 1 }],
      },
    });

    expect(event?.candidates[0]).toEqual({
      kind: "node",
      source: "child-path",
      basename: "unknown",
      identityToken: "unknown",
      accepted: true,
      fileKind: "unknown",
    });
    expect(event).not.toHaveProperty("comparison");
    expect(event).not.toHaveProperty("environment");
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("bounds valid environment comparison counts and drops invalid categories", () => {
    const [event] = projectToolchainEvidence(
      {
        node: { kind: "node", outcome: "unavailable", candidates: [] },
      },
      {
        sessionId: "session-1",
        environment: {
          comparedKeys: -10,
          categories: [
            { category: "changed", count: 9_999 },
            { category: "added-to-child", count: -1 },
          ],
        },
      },
    );

    expect(event?.environment).toEqual({
      comparedKeys: 0,
      categories: [{ category: "changed", count: 256 }],
    });
  });
});
