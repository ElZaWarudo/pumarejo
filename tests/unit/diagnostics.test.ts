import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_CAPABILITY_STATES,
  DiagnosticStore,
} from "../../src/observability/diagnostics.js";

const SESSION_ID = "0123456789abcdef0123456789abcdef";

describe("bounded runtime diagnostics", () => {
  it("sanitizes before storing producer data", () => {
    const store = new DiagnosticStore({ sessionId: SESSION_ID });

    store.recordProcess(
      "stderr",
      "password=super-secret token-super-secret C:\\Users\\private\\app\\error.log",
    );
    store.recordConsole("sensitive application content", {
      sensitive: true,
      surfaceRef: "surface-1",
    });

    const serialized = JSON.stringify(store.query());
    expect(serialized).not.toContain("super-secret");
    expect(store.query().records[0]?.message).not.toContain(
      "C:\\Users\\private",
    );
    expect(store.query().records[0]?.message).toContain("[REDACTED_PATH]");
    expect(serialized).not.toContain("sensitive application content");
    expect(store.query().records[0]).toMatchObject({
      source: "process_stderr",
      scope: { owner: "process", sessionId: SESSION_ID },
    });
    expect(store.query().records[1]).toMatchObject({
      source: "console",
      sensitive: true,
      scope: { surfaceRef: "surface-1" },
    });
  });

  it.each([
    "C:\\Users\\private\\cli\\index.js:567",
    "c:/Users/private/cli/index.js:567",
  ])("redacts a native launch stack path before retention: %s", (path) => {
    const store = new DiagnosticStore({ sessionId: SESSION_ID });
    store.recordProcess("stderr", `Cannot find native binding at ${path}`);
    expect(store.query().records[0]?.message).toBe(
      "Cannot find native binding at [REDACTED_PATH]",
    );
  });

  it("evicts oldest entries deterministically by count and bytes", () => {
    const store = new DiagnosticStore({
      sessionId: SESSION_ID,
      maxRecords: 2,
      maxBytes: 2_000,
      maxFieldBytes: 128,
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    });

    store.record("phase", { phase: "starting_process" });
    store.record("phase", { phase: "waiting_provider" });
    const result = store.record("phase", { phase: "starting_proxy" });

    expect(result).toMatchObject({ accepted: true, evicted: 1 });
    expect(
      store.query({ sources: ["phase"] }).records.map((item) => item.phase),
    ).toEqual(["waiting_provider", "starting_proxy"]);
    expect(store.query().truncation.evicted).toBe(1);
  });

  it("returns explicit capability states and a bounded latest-error projection", () => {
    const store = new DiagnosticStore({ sessionId: SESSION_ID });
    store.recordLastError({
      owner: "process",
      code: "app_start_failed",
      retryable: true,
      suggestion: "Check stderr diagnostics and retry.",
    });

    const result = store.query({ sources: ["console", "last_error"] });
    expect(
      Object.values(result.capabilities).map((item) => item.state),
    ).toEqual([
      "unsupported",
      "supported",
      "supported",
      "supported",
      "supported",
      "supported",
    ]);
    expect(DIAGNOSTIC_CAPABILITY_STATES).toEqual([
      "supported",
      "unsupported",
      "unavailable",
      "denied",
      "failed",
    ]);
    expect(result.lastErrors).toHaveLength(1);
    expect(result.lastErrors[0]).toMatchObject({
      source: "last_error",
      code: "app_start_failed",
      retryable: true,
    });
  });

  it("keeps loopback outcome fields bounded and rejects invalid identities", () => {
    const store = new DiagnosticStore({ sessionId: SESSION_ID });
    store.recordLastError({
      code: "loopback_probe_timeout",
      family: "ipv6",
      port: 49_152,
      count: 2,
      retryable: true,
      suggestion: "Retry the bounded probe.",
    });
    store.recordLastError({
      code: "loopback_probe_timeout",
      family: "http://127.0.0.1:49152?token=secret",
      port: 80,
      count: Number.POSITIVE_INFINITY,
    });

    expect(store.query().records).toEqual([
      expect.objectContaining({
        family: "ipv6",
        port: 49_152,
        count: 2,
        retryable: true,
      }),
      expect.not.objectContaining({ family: expect.anything(), port: 80 }),
    ]);
    expect(JSON.stringify(store.query())).not.toContain("token");
  });

  it("keeps memory-only default and requires an explicit bounded retention opt-in", async () => {
    const store = new DiagnosticStore({ sessionId: SESSION_ID });
    store.record("invocation", { code: "tauri_snapshot" });
    const sink = { retain: async () => undefined };

    await expect(store.retain()).resolves.toEqual({
      retained: false,
      records: 0,
      bytes: 0,
    });
    await expect(
      store.retain({ enabled: true, sink, maxRecords: 1, maxBytes: 4_096 }),
    ).resolves.toMatchObject({
      retained: true,
      records: 1,
    });
  });

  it("reports bounded cleanup unavailability without path or cause data", () => {
    const store = new DiagnosticStore({ sessionId: SESSION_ID });

    store.recordArtifactCleanupUnavailable({
      retained: 4_096,
      removed: 4_096,
      retryable: true,
      path: "C:\\Users\\private\\.pumarejo\\artifacts\\.quarantine-secret",
      cause: new Error("native delete failed at /tmp/private"),
    });

    const serialized = JSON.stringify(store.query());
    expect(serialized).toContain("artifact_cleanup_unavailable");
    expect(serialized).toContain("preserved bytes remain");
    expect(serialized).not.toContain(".quarantine-secret");
    expect(serialized).not.toContain("native delete failed");
    expect(serialized).not.toContain("/tmp/private");
    expect(store.query().records[0]).toMatchObject({
      code: "artifact_cleanup_unavailable",
      retryable: true,
      count: 4_096,
    });
  });
});
