import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../../src/mcp/server.js";
import { PumarejoRuntime } from "../../src/mcp/runtime.js";
import { DiagnosticStore } from "../../src/observability/diagnostics.js";
import { ReferenceTable } from "../../src/observation/refs.js";
import type { ArtifactCleanupOutcome } from "../../src/artifacts/store.js";
import type { SemanticSnapshot } from "../../src/observation/schema.js";
import type {
  LaunchPhase,
  ReadySession,
  SessionSnapshot,
} from "../../src/session/state.js";
import { PumarejoError } from "../../src/shared/errors.js";
import type { DialogDetection } from "../../src/webdriver/native-control.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";
import type { SnapshotInput } from "../../src/mcp/schemas.js";

const SESSION_ID = "0123456789abcdef0123456789abcdef";
const SNAPSHOT_INPUT = {
  maxNodes: 500,
  maxDepth: 128,
  maxTextLength: 4096,
  visibleOnly: true,
  includeNames: true,
  includeText: true,
  includeValues: true,
} as const;

function semanticSnapshot(generation = 1): SemanticSnapshot {
  return {
    generation,
    observedAt: "2026-07-27T12:00:00.000Z",
    window: {
      label: "main",
      title: "Fixture",
      width: 800,
      height: 600,
    },
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

function harness() {
  let managerState: SessionSnapshot = { state: "idle" };
  const ready: ReadySession = {
    state: "ready",
    mode: "visible",
    platform: "windows",
    window: "main",
    webdriverPort: 4567,
    ownedPid: 71,
    webdriver: {} as WebDriverClient,
  };
  const launch = vi.fn(
    async (options: {
      mode: "visible" | "background";
      signal?: AbortSignal;
      onPhase?: (phase: LaunchPhase) => void;
      onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
    }) => {
      managerState = { ...ready, mode: options.mode };
      return { ...ready, mode: options.mode };
    },
  );
  const managerClose = vi.fn(async () => {
    managerState = { state: "idle" };
    return managerState;
  });
  const manager = {
    get snapshot() {
      return managerState;
    },
    launch,
    close: managerClose,
  };
  const recoverArtifacts = vi.fn(async () => undefined);
  const recordVerification = vi.fn(async () => undefined);
  const artifactOpen = vi.fn(async () => undefined);
  const artifactClose = vi.fn(
    async (): Promise<ArtifactCleanupOutcome | void> => undefined,
  );
  let diagnostics = new DiagnosticStore({ sessionId: SESSION_ID });
  const sessionId = vi.fn(() => SESSION_ID);
  let diagnosticsCreated = false;
  const writePng = vi.fn(async () => ({
    projectRelativePath: ".pumarejo/artifacts/screenshot.png",
  }));
  const references = new ReferenceTable();
  const snapshot = vi.fn(
    async (_input?: SnapshotInput, _signal?: AbortSignal) => semanticSnapshot(),
  );
  const interaction = async <T>(
    operation: (refresh: () => Promise<SemanticSnapshot>) => Promise<T>,
  ): Promise<T> => await operation(snapshot);
  const screenshot = vi.fn(async () => ({
    metadata: {
      generation: 1,
      observedAt: "2026-07-27T12:00:00.000Z",
      mimeType: "image/png" as const,
      width: 1,
      height: 1,
    },
    image: { data: "png", mimeType: "image/png" as const },
  }));
  const dialogDetect = vi.fn(
    async (): Promise<DialogDetection> => ({
      state: "supported",
      code: "dialog_detected",
      dialog: {
        title: "Fixture",
        message: "Continue?",
        buttons: ["OK", "Cancel"],
      },
    }),
  );
  let authorizedAction: "accept" | "cancel" | undefined;
  const dialogAuthorize = vi.fn(
    (
      action: "accept" | "cancel",
      _context: { readonly surfaceRef: string; readonly generation: number },
    ) => {
      authorizedAction = action;
      return {
        allowedActions: [action] as readonly ("accept" | "cancel")[],
        grantId: "private-grant",
      };
    },
  );
  const dialogDecide = vi.fn(
    async (
      action: "accept" | "cancel",
      _context: { readonly surfaceRef: string; readonly generation: number },
    ) => {
      const authorized = authorizedAction === action;
      authorizedAction = undefined;
      return {
        state: authorized ? ("supported" as const) : ("denied" as const),
        code: authorized ? "dialog_decision_verified" : "dialog_grant_denied",
        action,
        dialog: {
          title: "Fixture",
          message: "Continue?",
          buttons: ["OK", "Cancel"],
        },
      };
    },
  );
  const click = vi.fn(async (_input?: { readonly ref: string }) => ({
    generation: 2,
    action: "click" as const,
    ref: "e1-1",
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "no_observable_change" as const, settleMs: 250 },
  }));
  const type = vi.fn(async () => ({
    generation: 2,
    action: "type" as const,
    ref: "e1-1",
    cleared: true,
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "semantic_change" as const, settleMs: 250 },
  }));
  const pressKey = vi.fn(async () => ({
    generation: 2,
    action: "pressKey" as const,
    key: "ENTER" as const,
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "no_observable_change" as const, settleMs: 250 },
  }));
  const windowAction = vi.fn(async () => ({
    generation: 2,
    action: "window" as const,
    window: {
      state: "restored" as const,
      rect: { x: 0, y: 0, width: 800, height: 600 },
    },
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "window_change" as const, settleMs: 250 },
  }));
  const pointer = vi.fn(async () => ({
    generation: 2,
    action: "pointer" as const,
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "focus_only" as const, settleMs: 250 },
  }));
  const scroll = vi.fn(async () => ({
    generation: 2,
    action: "scroll" as const,
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "semantic_change" as const, settleMs: 250 },
  }));
  const selectOption = vi.fn(async () => ({
    generation: 2,
    action: "selectOption" as const,
    dispatch: { method: "webdriver" as const, dispatched: true as const },
    focus: {
      before: { generation: 1, ref: null, actionable: false },
      after: { generation: 2, ref: null, actionable: false },
    },
    effect: { kind: "semantic_change" as const, settleMs: 250 },
  }));
  const stabilize = vi.fn(async () => ({
    generation: 1,
    effect: "no_observable_change" as const,
    snapshot: semanticSnapshot(1),
  }));
  const invalidateUncertain = vi.fn(() => 2);
  const runtime = new PumarejoRuntime({
    config: {
      projectRoot: "C:\\fixture",
      configPath: "C:\\fixture\\.pumarejo.json",
      artifactsPath: "C:\\fixture\\.pumarejo\\artifacts",
      config: {
        version: 1,
        launch: {
          command: "pnpm",
          args: ["tauri", "dev", "--config", "{tauriConfig}"],
        },
        webdriverPort: 4567,
        window: "main",
        artifactsDirectory: ".pumarejo/artifacts",
        retainArtifacts: false,
      },
    },
    platform: "windows",
    platformName: "win32",
    manager,
    recoverArtifacts,
    recordLaunchVerification: recordVerification,
    sessionId,
    createArtifacts: () => ({
      open: artifactOpen,
      close: artifactClose,
      writePng,
    }),
    createSnapshot: () => ({
      references,
      currentSnapshot: semanticSnapshot(),
      currentSnapshotComparable: true,
      activeSurface: undefined,
      setSurface: vi.fn(() => 1),
      snapshot,
      interaction,
      interactionComparison: interaction,
      publishComparison: (comparison, reservation) => {
        references.abandon(reservation);
        return { ...comparison, generation: reservation.generation };
      },
      preserveComparison: (comparison) => ({
        ...comparison,
        generation: references.generation,
      }),
    }),
    createScreenshot: () => ({ capture: screenshot }),
    createInteractions: () => ({
      generation: 1,
      focusedRef: vi.fn(() => null),
      click,
      type,
      pressKey,
      window: windowAction,
      pointer,
      scroll,
      selectOption,
      stabilize,
      invalidateUncertain,
    }),
    createDialogs: () => ({
      detect: dialogDetect,
      authorize: dialogAuthorize,
      decide: dialogDecide,
    }),
    createSurfaces: () => ({
      graph: undefined,
      activeSurfaceRef: undefined,
      discover: vi.fn(async () => {
        throw new PumarejoError("SURFACE_UNAVAILABLE");
      }),
      select: vi.fn(async () => {
        throw new PumarejoError("SURFACE_NOT_FOUND");
      }),
    }),
    createDiagnostics: (sessionId) => {
      if (diagnosticsCreated) diagnostics = new DiagnosticStore({ sessionId });
      diagnosticsCreated = true;
      return diagnostics;
    },
  });
  return {
    runtime,
    sessionId,
    manager,
    setManagerState(state: SessionSnapshot) {
      managerState = state;
    },
    launch,
    managerClose,
    recoverArtifacts,
    recordVerification,
    artifactOpen,
    artifactClose,
    get diagnostics() {
      return diagnostics;
    },
    snapshot,
    screenshot,
    click,
    type,
    pressKey,
    stabilize,
    invalidateUncertain,
    dialogDetect,
    dialogAuthorize,
    dialogDecide,
  };
}

function context(signal = new AbortController().signal) {
  return { signal };
}

describe("application-scoped MCP runtime", () => {
  it("recovers stale artifacts before serving calls", async () => {
    const test = harness();

    await test.runtime.initialize();

    expect(test.recoverArtifacts).toHaveBeenCalledOnce();
  });

  it("rejects every active-session handler before launch", async () => {
    const test = harness();
    const calls = [
      test.runtime.snapshot(SNAPSHOT_INPUT, context()),
      test.runtime.screenshot({ save: true }, context()),
      test.runtime.click({ ref: "e1-1" }, context()),
      test.runtime.type({ ref: "e1-1", text: "x", clear: true }, context()),
      test.runtime.pressKey({ key: "ENTER" }, context()),
      test.runtime.window({ action: "maximize" }, context()),
      test.runtime.pointer({ action: "hover", ref: "e1-1" }, context()),
      test.runtime.scroll({ ref: "e1-1", deltaX: 0, deltaY: 1 }, context()),
      test.runtime.selectOption({ ref: "e1-1" }, context()),
      test.runtime.sequence(
        {
          generation: 1,
          steps: [{ kind: "wait", waitMs: 0 }],
          maxSteps: 8,
          timeoutMs: 10_000,
        },
        context(),
      ),
      test.runtime.dialog({ action: "detect", authorize: false }, context()),
    ];

    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
    }
  });

  it("reports idle status without starting a session", async () => {
    const test = harness();

    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "idle",
      lastAction: "none",
    });
  });

  it("retains the runtime FIFO for the full sequence and stabilizes once", async () => {
    const test = harness();
    const order: string[] = [];
    test.click.mockImplementation(async (input?: { readonly ref: string }) => {
      if (input === undefined) throw new Error("missing click input");
      order.push(input.ref);
      return {
        generation: 1,
        action: "click" as const,
        ref: input.ref,
        dispatch: { method: "webdriver" as const, dispatched: true as const },
        focus: {
          before: { generation: 1, ref: null, actionable: false },
          after: { generation: 1, ref: null, actionable: false },
        },
        effect: { kind: "no_observable_change" as const, settleMs: 0 },
      };
    });
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());

    const sequence = test.runtime.sequence(
      {
        generation: 1,
        steps: [
          { kind: "wait", waitMs: 20 },
          { kind: "click", ref: "sequence-ref", settleMs: 0 },
        ],
        maxSteps: 8,
        timeoutMs: 10_000,
      },
      context(),
    );
    const standalone = test.runtime.click(
      { ref: "standalone-ref", settleMs: 0, snapshotAfter: false },
      context(),
    );

    await Promise.all([sequence, standalone]);
    expect(order).toEqual(["sequence-ref", "standalone-ref"]);
    expect(test.stabilize).toHaveBeenCalledTimes(1);
  });

  it("returns launching after waitMs and becomes ready through status", async () => {
    const test = harness();
    let finishLaunch!: () => void;
    const releaseLaunch = new Promise<void>((resolve) => {
      finishLaunch = resolve;
    });
    test.launch.mockImplementationOnce(async (options) => {
      options.onPhase?.("creating_session");
      await releaseLaunch;
      return {
        state: "ready",
        mode: options.mode,
        platform: "windows",
        window: "main",
        webdriverPort: 4567,
        webdriver: {} as WebDriverClient,
      };
    });

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 0 }, context()),
    ).resolves.toMatchObject({
      state: "launching",
      phase: expect.stringMatching(
        /^(resolving_command|preparing_runtime|starting_process|waiting_provider|starting_proxy|creating_session|selecting_window|capturing_first_snapshot)$/,
      ),
      pollAfterMs: 500,
      recommendedClientTimeoutMs: 10000,
    });
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 0 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_ALREADY_ACTIVE" });
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "launching",
      proxyReady: true,
      webdriverReady: false,
    });

    finishLaunch();
    await vi.waitFor(async () => {
      await expect(test.runtime.status(context())).resolves.toMatchObject({
        state: "ready",
        window: "main",
        generation: 1,
      });
    });
  });

  it("preserves a sanitized asynchronous launch failure through status", async () => {
    const test = harness();
    let rejectLaunch!: (error: Error) => void;
    test.launch.mockImplementationOnce(
      async () =>
        await new Promise<ReadySession>((_resolve, reject) => {
          rejectLaunch = reject;
        }),
    );

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 0 }, context()),
    ).resolves.toMatchObject({ state: "launching" });
    rejectLaunch(
      new PumarejoError("PROCESS_INSPECTION_DENIED", {
        cause: new Error("private path and nonce"),
        diagnostic: {
          check: "Windows process identity and ownership via CIM",
          applicationStarted: true,
          cleanup: "terminated",
          webdriverSessionCreated: false,
        },
      }),
    );
    await vi.waitFor(async () => {
      await expect(test.runtime.status(context())).resolves.toMatchObject({
        state: "idle",
        lastAction: "launch",
        lastFailure: {
          code: "PROCESS_INSPECTION_DENIED",
          phase: "process-inspection",
          retryable: false,
          diagnostic: {
            check: "Windows process identity and ownership via CIM",
            applicationStarted: true,
            cleanup: "terminated",
            webdriverSessionCreated: false,
          },
        },
      });
    });
    expect(JSON.stringify(await test.runtime.status(context()))).not.toContain(
      "private path and nonce",
    );
  });

  it("retains sanitized failed-launch diagnostics until close and isolates relaunches", async () => {
    const test = harness();
    test.launch.mockImplementationOnce(async (options) => {
      options.onPhase?.("creating_session");
      options.onOutput?.(
        "stderr",
        "launch failed at /private/trace C:\\Users\\private\\cli.js token=secret123",
      );
      throw new PumarejoError("SESSION_CREATE_FAILED");
    });

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_CREATE_FAILED" });

    const failedLaunch = await test.runtime.diagnostics(
      { maxRecords: 16, maxBytes: 8_192 },
      context(),
    );
    expect(failedLaunch).toMatchObject({
      sessionId: SESSION_ID,
      records: expect.arrayContaining([
        expect.objectContaining({ source: "phase", phase: "creating_session" }),
        expect.objectContaining({ source: "process_stderr" }),
        expect.objectContaining({
          source: "last_error",
          code: "session_create_failed",
        }),
      ]),
    });
    const failedLaunchJson = JSON.stringify(failedLaunch);
    expect(failedLaunchJson).toContain("[REDACTED_PATH]");
    expect(failedLaunchJson).toContain("token=[REDACTED]");
    expect(failedLaunchJson).not.toContain("/private/trace");
    expect(failedLaunch.records).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("C:\\Users"),
        }),
      ]),
    );
    const oldStore = test.diagnostics;
    const closeOldStore = vi.spyOn(oldStore, "close");

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).resolves.toMatchObject({ sessionId: SESSION_ID });
    expect(closeOldStore).toHaveBeenCalledTimes(1);
    expect(oldStore.query().records).toEqual([]);
    const relaunched = await test.runtime.diagnostics(
      { maxRecords: 16, maxBytes: 8_192 },
      context(),
    );
    expect(JSON.stringify(relaunched)).not.toContain("secret123");
    expect(JSON.stringify(relaunched)).not.toContain("session_create_failed");

    await expect(
      test.runtime.diagnostics(
        { surfaceRef: "stale-surface", maxRecords: 16, maxBytes: 8_192 },
        context(),
      ),
    ).resolves.toMatchObject({ records: [], lastErrors: [] });
    await expect(test.runtime.close(context())).resolves.toMatchObject({
      state: "idle",
    });
    await expect(
      test.runtime.diagnostics({ maxRecords: 16, maxBytes: 8_192 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
  });

  it("discards failed-launch records even if the replacement session ID is invalid", async () => {
    const test = harness();
    test.launch.mockRejectedValueOnce(
      new PumarejoError("SESSION_CREATE_FAILED"),
    );
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_CREATE_FAILED" });
    const oldStore = test.diagnostics;
    test.sessionId.mockReturnValueOnce("invalid");
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(oldStore.query().records).toEqual([]);
    await expect(
      test.runtime.diagnostics({ maxRecords: 16, maxBytes: 8_192 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
  });

  it("keeps failed-launch diagnostics queryable when owned cleanup requires a retry", async () => {
    const test = harness();
    test.launch.mockRejectedValueOnce(
      new PumarejoError("SESSION_CREATE_FAILED"),
    );
    test.artifactClose.mockRejectedValueOnce(new PumarejoError("CLOSE_FAILED"));
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_CREATE_FAILED" });
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "cleanup_failed",
    });
    await expect(
      test.runtime.diagnostics({ maxRecords: 16, maxBytes: 8_192 }, context()),
    ).resolves.toMatchObject({
      lastErrors: expect.arrayContaining([
        expect.objectContaining({ code: "session_create_failed" }),
      ]),
    });
    await test.runtime.close(context());
    await expect(
      test.runtime.diagnostics({ maxRecords: 16, maxBytes: 8_192 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
  });

  it("exposes bounded diagnostics only for the active owned session and clears them on close", async () => {
    const test = harness();

    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    const result = await test.runtime.diagnostics(
      { maxRecords: 16, maxBytes: 8_192 },
      context(),
    );
    expect(result).toMatchObject({
      sessionId: SESSION_ID,
      records: expect.arrayContaining([
        expect.objectContaining({ source: "phase" }),
        expect.objectContaining({ source: "invocation" }),
      ]),
      capabilities: {
        console: {
          state: "unsupported",
          code: "provider_console_unsupported",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("C:\\fixture");

    await expect(test.runtime.close(context())).resolves.toMatchObject({
      state: "idle",
    });
    await expect(
      test.runtime.diagnostics({ maxRecords: 16, maxBytes: 8_192 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
  });

  it("reports preserved artifacts as residue without blocking close or the next launch", async () => {
    const test = harness();
    const recordCleanup = vi.spyOn(
      test.diagnostics,
      "recordArtifactCleanupUnavailable",
    );
    const diagnosticsClose = vi.spyOn(test.diagnostics, "close");
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    test.artifactClose.mockResolvedValueOnce({
      state: "quarantined",
      status: "unavailable",
      removed: 0,
      retained: 1,
      retryable: true,
      reason: "identity_bound_quarantine_deletion_unavailable",
      path: ".pumarejo/artifacts/.quarantine-AbC123",
    });

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
      residue: [
        {
          resource: "artifacts",
          path: ".pumarejo/artifacts/.quarantine-AbC123",
          reason:
            "Quarantined artifacts contain unexpected content and were preserved.",
        },
      ],
    });
    expect(recordCleanup).toHaveBeenCalledWith({
      removed: 0,
      retained: 1,
      retryable: true,
      path: ".pumarejo/artifacts/.quarantine-AbC123",
    });
    expect(recordCleanup.mock.invocationCallOrder[0]).toBeLessThan(
      diagnosticsClose.mock.invocationCallOrder[0]!,
    );
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "idle",
      lastAction: "close",
    });
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).resolves.toMatchObject({ snapshot: expect.anything() });
  });

  it("names held resources and keeps diagnostics when process cleanup fails", async () => {
    const test = harness();
    const diagnosticsClose = vi.spyOn(test.diagnostics, "close");
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    test.managerClose.mockImplementationOnce(async () => {
      test.setManagerState({
        state: "failed",
        cleanupPending: ["application-process"],
      });
      throw new Error("Owned process cleanup remains retryable.");
    });

    await expect(test.runtime.close(context())).rejects.toMatchObject({
      code: "CLOSE_FAILED",
      pending: ["application-process"],
    });
    expect(diagnosticsClose).not.toHaveBeenCalled();
    await expect(
      test.runtime.diagnostics!(
        { maxRecords: 128, maxBytes: 48 * 1024 },
        context(),
      ),
    ).resolves.toMatchObject({
      records: expect.arrayContaining([
        expect.objectContaining({
          code: "session_cleanup_failed",
          message: expect.stringContaining("application-process"),
        }),
      ]),
    });
  });

  it("lets close cancel a pending launch", async () => {
    const test = harness();
    test.launch.mockImplementationOnce(
      async (options) =>
        await new Promise<ReadySession>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    );

    await test.runtime.launch({ mode: "visible", waitMs: 0 }, context());
    await expect(test.runtime.close(context())).resolves.toMatchObject({
      state: "idle",
    });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "idle",
      lastAction: "close",
    });
  });

  it("retries cleanup after cancelling a pending launch and converges to idle", async () => {
    const test = harness();
    test.launch.mockImplementationOnce(async (options) => {
      test.setManagerState({
        state: "starting",
        cleanupPending: ["application-process"],
      });
      return await new Promise<ReadySession>((_resolve, reject) => {
        options.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
      });
    });
    test.managerClose
      .mockImplementationOnce(async () => {
        test.setManagerState({
          state: "failed",
          cleanupPending: ["application-process"],
        });
        throw new PumarejoError("CLOSE_FAILED");
      })
      .mockImplementationOnce(async () => {
        const idle = { state: "idle" as const };
        test.setManagerState(idle);
        return idle;
      });

    await test.runtime.launch({ mode: "visible", waitMs: 0 }, context());
    await expect(test.runtime.close(context())).rejects.toMatchObject({
      code: "CLOSE_FAILED",
    });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "cleanup_failed",
      cleanupPending: ["application-process"],
      lastAction: "close",
    });

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.launch).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledTimes(2);
  });

  it("routes all twelve operations through one owned session", async () => {
    const test = harness();
    const launchSignal = new AbortController().signal;

    await expect(
      test.runtime.launch(
        { mode: "background", waitMs: 5_000 },
        context(launchSignal),
      ),
    ).resolves.toMatchObject({
      sessionId: SESSION_ID,
      mode: "background",
      platform: "win32",
      webdriverPort: 4567,
      snapshot: { generation: 1 },
    });
    expect(test.launch).toHaveBeenCalledWith({
      mode: "background",
      platform: "windows",
      window: "main",
      webdriverPort: 4567,
      signal: expect.any(AbortSignal),
      onPhase: expect.any(Function),
      onOutput: expect.any(Function),
    });
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "ready",
      ownedPid: 71,
    });
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_ALREADY_ACTIVE" });

    await expect(
      test.runtime.snapshot(SNAPSHOT_INPUT, context()),
    ).resolves.toMatchObject({
      generation: 1,
    });
    await expect(
      test.runtime.screenshot({ save: false }, context()),
    ).resolves.toMatchObject({
      metadata: { generation: 1 },
      image: { mimeType: "image/png" },
    });
    await expect(
      test.runtime.click({ ref: "e1-1" }, context()),
    ).resolves.toMatchObject({ action: "click" });
    await expect(
      test.runtime.type({ ref: "e1-1", text: "Ada", clear: true }, context()),
    ).resolves.toMatchObject({ action: "type" });
    await expect(
      test.runtime.pressKey({ key: "ENTER" }, context()),
    ).resolves.toMatchObject({ action: "pressKey" });
    await expect(
      test.runtime.window({ action: "maximize" }, context()),
    ).resolves.toMatchObject({ action: "window" });
    await expect(
      test.runtime.pointer({ action: "hover", ref: "e1-1" }, context()),
    ).resolves.toMatchObject({ action: "pointer" });
    await expect(
      test.runtime.scroll({ ref: "e1-1", deltaX: 0, deltaY: 480 }, context()),
    ).resolves.toMatchObject({ action: "scroll" });
    await expect(
      test.runtime.selectOption({ ref: "e1-1" }, context()),
    ).resolves.toMatchObject({ action: "selectOption" });
    await expect(
      test.runtime.dialog({ action: "detect", authorize: false }, context()),
    ).resolves.toMatchObject({
      state: "supported",
      code: "dialog_detected",
    });
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "ready",
      generation: 2,
      lastAction: "dialog",
      ownedPid: 71,
    });

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
    expect(test.artifactClose.mock.invocationCallOrder[0]).toBeLessThan(
      test.managerClose.mock.invocationCallOrder[0]!,
    );
    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: true,
      state: "idle",
    });
  });

  it("requires explicit dialog authorization and rejects stale or foreign bindings", async () => {
    const test = harness();
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 0 }, context()),
    ).resolves.toMatchObject({ snapshot: { generation: 1 } });

    await expect(
      test.runtime.dialog({ action: "accept", authorize: false }, context()),
    ).resolves.toEqual({
      state: "denied",
      code: "dialog_authorization_required",
      action: "accept",
    });
    expect(test.dialogAuthorize).not.toHaveBeenCalled();
    expect(test.dialogDetect).not.toHaveBeenCalled();
    expect(test.dialogDecide).not.toHaveBeenCalled();

    await expect(
      test.runtime.dialog(
        { action: "accept", authorize: true, generation: 2 },
        context(),
      ),
    ).resolves.toEqual({
      state: "denied",
      code: "dialog_binding_mismatch",
      action: "accept",
    });
    expect(test.dialogDecide).not.toHaveBeenCalled();

    await expect(
      test.runtime.dialog(
        { action: "cancel", authorize: true, surfaceRef: "foreign" },
        context(),
      ),
    ).resolves.toEqual({
      state: "denied",
      code: "dialog_binding_mismatch",
      action: "cancel",
    });
    expect(test.dialogDecide).not.toHaveBeenCalled();

    await expect(
      test.runtime.dialog(
        {
          action: "cancel",
          authorize: true,
          surfaceRef: "window:main",
          generation: 1,
        },
        context(),
      ),
    ).resolves.toMatchObject({ state: "supported", action: "cancel" });
    expect(test.dialogAuthorize).toHaveBeenCalledWith("cancel", {
      surfaceRef: "window:main",
      generation: 1,
    });
    expect(
      JSON.stringify(
        await test.runtime.dialog(
          { action: "detect", authorize: false },
          context(),
        ),
      ),
    ).not.toMatch(/private-grant|nonce|provider|path|cause/i);
  });

  it("fails closed before authorization when detection has no concrete dialog", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 0 }, context());
    test.dialogDetect.mockResolvedValueOnce({
      state: "unavailable" as const,
      code: "provider_dialog_absent",
    });

    await expect(
      test.runtime.dialog({ action: "accept", authorize: true }, context()),
    ).resolves.toEqual({
      state: "unavailable",
      code: "provider_dialog_not_detected",
      action: "accept",
    });
    expect(test.dialogAuthorize).not.toHaveBeenCalled();
    expect(test.dialogDecide).not.toHaveBeenCalled();
  });

  it("completes the twelve-tool workflow through an independent MCP client", async () => {
    const test = harness();
    const server = createMcpServer(test.runtime, { tools: "all" });
    const client = new Client({ name: "runtime-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      await expect(
        client.callTool({ name: "tauri_snapshot", arguments: {} }),
      ).resolves.toMatchObject({
        isError: true,
        structuredContent: { code: "SESSION_NOT_ACTIVE" },
      });
      for (const [name, arguments_] of [
        ["tauri_launch", { mode: "visible" }],
        ["tauri_status", {}],
        ["tauri_snapshot", {}],
        ["tauri_screenshot", { save: false }],
        ["tauri_click", { ref: "e1-1" }],
        ["tauri_type", { ref: "e1-1", text: "Ada", clear: true }],
        ["tauri_press_key", { key: "ENTER" }],
        ["tauri_window", { action: "resize", width: 800, height: 600 }],
        ["tauri_pointer", { action: "hover", ref: "e1-1" }],
        ["tauri_scroll", { ref: "e1-1", deltaX: 0, deltaY: 480 }],
        ["tauri_select_option", { ref: "e1-1" }],
        ["tauri_close", {}],
      ] as const) {
        const result = await client.callTool({
          name,
          arguments: arguments_,
        });
        expect(result.isError, name).not.toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("cleans the process and artifacts when initial observation fails", async () => {
    const test = harness();
    test.snapshot.mockRejectedValueOnce(new PumarejoError("INTERNAL_ERROR"));

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
  });

  it("cleans the process when artifact initialization fails", async () => {
    const test = harness();
    test.artifactOpen.mockRejectedValueOnce(
      new PumarejoError("ARTIFACTS_DIRECTORY_NOT_WRITABLE"),
    );

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "ARTIFACTS_DIRECTORY_NOT_WRITABLE" });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.launch).not.toHaveBeenCalled();
    expect(test.managerClose).not.toHaveBeenCalled();
  });

  it("preserves a managed launch failure when artifact cleanup is pending", async () => {
    const test = harness();
    test.launch.mockRejectedValueOnce(new PumarejoError("APP_START_FAILED"));
    test.artifactClose.mockResolvedValueOnce({
      state: "quarantined",
      status: "unavailable",
      removed: 0,
      retained: 1,
      retryable: true,
      reason: "identity_bound_quarantine_deletion_unavailable",
    });

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({
      code: "APP_START_FAILED",
      phase: "launch",
    });
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "cleanup_failed",
      cleanupPending: ["artifacts"],
      lastAction: "launch",
      lastFailure: {
        code: "APP_START_FAILED",
        phase: "launch",
      },
    });
  });

  it("retains artifact cleanup after launch setup and cleanup both fail", async () => {
    const test = harness();
    test.artifactOpen.mockRejectedValueOnce(
      new PumarejoError("ARTIFACTS_DIRECTORY_NOT_WRITABLE"),
    );
    test.artifactClose.mockRejectedValueOnce(new Error("artifact close"));

    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context()),
    ).rejects.toMatchObject({ code: "CLOSE_FAILED" });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "cleanup_failed",
      cleanupPending: ["artifacts"],
      lastAction: "launch",
    });

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledTimes(2);
  });

  it("cancels an active snapshot without closing the session or blocking follow-up observations", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    test.snapshot.mockImplementationOnce(
      async (_input, signal?: AbortSignal) =>
        await new Promise<SemanticSnapshot>((_resolve, reject) => {
          markStarted();
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const pending = test.runtime.snapshot(
      SNAPSHOT_INPUT,
      context(controller.signal),
    );
    await started;
    controller.abort(new DOMException("cancelled", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(test.artifactClose).not.toHaveBeenCalled();
    expect(test.managerClose).not.toHaveBeenCalled();
    await expect(
      test.runtime.snapshot({ ...SNAPSHOT_INPUT, maxDepth: 2 }, context()),
    ).resolves.toMatchObject({ generation: 1 });
    await expect(
      test.runtime.diagnostics({ maxRecords: 10, maxBytes: 4096 }, context()),
    ).resolves.toMatchObject({
      sessionId: SESSION_ID,
    });
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "ready",
      ownedPid: 71,
      lastAction: "diagnostics",
    });
  });

  it("retains the owned session after an SDK snapshot timeout reaches the runtime", async () => {
    const test = harness();
    const server = createMcpServer(test.runtime, { tools: "all" });
    const client = new Client({ name: "timeout-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      await client.callTool({
        name: "tauri_launch",
        arguments: { mode: "visible" },
      });
      let observationSignal: AbortSignal | undefined;
      test.snapshot.mockImplementationOnce(async (_input, signal) => {
        observationSignal = signal;
        return await new Promise<SemanticSnapshot>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      });
      await expect(
        client.callTool({ name: "tauri_snapshot", arguments: {} }, undefined, {
          timeout: 100,
        }),
      ).rejects.toMatchObject({ code: -32001 });
      await vi.waitFor(() => expect(observationSignal?.aborted).toBe(true));
      const fresh = await client.callTool({
        name: "tauri_snapshot",
        arguments: { maxDepth: 2 },
      });
      expect(fresh.isError).not.toBe(true);
      expect(fresh.structuredContent).toMatchObject({ generation: 1 });
      expect(test.managerClose).not.toHaveBeenCalled();
      expect(test.artifactClose).not.toHaveBeenCalled();
      await expect(
        client.callTool({ name: "tauri_status", arguments: {} }),
      ).resolves.toMatchObject({
        structuredContent: { state: "ready", ownedPid: 71 },
      });
      await expect(
        client.callTool({
          name: "tauri_diagnostics",
          arguments: { maxRecords: 10 },
        }),
      ).resolves.toMatchObject({
        structuredContent: { sessionId: SESSION_ID },
      });
      await client.callTool({ name: "tauri_close", arguments: {} });
      expect(test.managerClose).toHaveBeenCalledOnce();
      expect(test.artifactClose).toHaveBeenCalledOnce();
      await expect(
        client.callTool({ name: "tauri_status", arguments: {} }),
      ).resolves.toMatchObject({
        structuredContent: { state: "idle" },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("skips a cancelled queued snapshot and releases the FIFO for a fresh observation", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 0 }, context());
    let release!: (value: SemanticSnapshot) => void;
    test.snapshot.mockImplementationOnce(
      async () =>
        await new Promise<SemanticSnapshot>((resolve) => {
          release = resolve;
        }),
    );
    const active = test.runtime.snapshot(SNAPSHOT_INPUT, context());
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const controller = new AbortController();
    const queued = test.runtime.snapshot(
      SNAPSHOT_INPUT,
      context(controller.signal),
    );
    controller.abort(new DOMException("cancelled", "AbortError"));
    const rejected = expect(queued).rejects.toMatchObject({
      name: "AbortError",
    });
    const fresh = test.runtime.snapshot(
      { ...SNAPSHOT_INPUT, maxDepth: 2 },
      context(),
    );
    release(semanticSnapshot(2));
    await active;
    await rejected;
    await expect(fresh).resolves.toMatchObject({ generation: 1 });
    expect(test.snapshot).toHaveBeenCalledTimes(3);
    expect(test.managerClose).not.toHaveBeenCalled();
    expect(test.artifactClose).not.toHaveBeenCalled();
  });

  it.each(["close", "shutdown"] as const)(
    "preserves %s cleanup when an active snapshot is cancelled",
    async (teardown) => {
      const test = harness();
      await test.runtime.launch({ mode: "visible", waitMs: 0 }, context());
      let observationSignal: AbortSignal | undefined;
      test.snapshot.mockImplementationOnce(async (_input, signal) => {
        observationSignal = signal;
        return await new Promise<SemanticSnapshot>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      });
      const controller = new AbortController();
      const pending = test.runtime.snapshot(
        SNAPSHOT_INPUT,
        context(controller.signal),
      );
      await vi.waitFor(() => expect(observationSignal).toBeDefined());
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      controller.abort(new DOMException("cancelled", "AbortError"));
      await (teardown === "close"
        ? test.runtime.close(context())
        : test.runtime.shutdown());
      await rejected;
      expect(test.artifactClose).toHaveBeenCalledOnce();
      expect(test.managerClose).toHaveBeenCalled();
      await expect(
        test.runtime.snapshot(SNAPSHOT_INPUT, context()),
      ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
      await expect(test.runtime.status(context())).resolves.toMatchObject({
        state: "idle",
      });
    },
  );

  it("retains the session on caller screenshot cancellation", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 0 }, context());
    const controller = new AbortController();
    test.screenshot.mockImplementationOnce(async () => {
      controller.abort(new DOMException("cancelled", "AbortError"));
      throw controller.signal.reason;
    });
    await expect(
      test.runtime.screenshot({ save: false }, context(controller.signal)),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.managerClose).not.toHaveBeenCalled();
    expect(test.artifactClose).not.toHaveBeenCalled();
  });

  it("attributes a cancelled ENTER to pressKey and retains uncertain outcome without replay", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5000 }, context());
    await test.runtime.diagnostics(
      { maxRecords: 16, maxBytes: 8192 },
      context(),
    );
    const controller = new AbortController();
    test.pressKey.mockImplementationOnce(async () => {
      controller.abort(new DOMException("cancelled", "AbortError"));
      throw controller.signal.reason;
    });
    await expect(
      test.runtime.pressKey({ key: "ENTER" }, context(controller.signal)),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.pressKey).toHaveBeenCalledOnce();
    expect(test.managerClose).not.toHaveBeenCalled();
    expect(test.artifactClose).not.toHaveBeenCalled();
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "ready",
      ownedPid: 71,
      lastCancellation: { action: "pressKey", outcome: "uncertain" },
    });
    const records = test.diagnostics.query({
      maxRecords: 128,
      maxBytes: 49152,
    }).records;
    expect(
      records.some(
        (record) =>
          record.source === "invocation" && record.code === "press_key",
      ),
    ).toBe(true);
    expect(records.some((record) => record.code === "caller_cancelled")).toBe(
      true,
    );
    await test.runtime.snapshot(SNAPSHOT_INPUT, context());
    expect(test.pressKey).toHaveBeenCalledOnce();
    await test.runtime.close(context());
    expect(test.managerClose).toHaveBeenCalledOnce();
  });

  it("retains uncertain action outcome after public SDK ENTER timeout with no redispatch", async () => {
    const test = harness();
    const server = createMcpServer(test.runtime, { tools: "all" });
    const client = new Client({ name: "action-timeout", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      await client.callTool({
        name: "tauri_launch",
        arguments: { mode: "visible" },
      });
      let actionSignal: AbortSignal | undefined;
      test.pressKey.mockImplementationOnce(async (...args: unknown[]) => {
        actionSignal = args[1] as AbortSignal;
        return await new Promise<never>((_resolve, reject) => {
          actionSignal!.addEventListener(
            "abort",
            () => reject(actionSignal!.reason),
            { once: true },
          );
        });
      });
      await expect(
        client.callTool(
          { name: "tauri_press_key", arguments: { key: "ENTER" } },
          undefined,
          { timeout: 100 },
        ),
      ).rejects.toMatchObject({ code: -32001 });
      await vi.waitFor(() => expect(actionSignal?.aborted).toBe(true));
      await expect(
        client.callTool({ name: "tauri_status", arguments: {} }),
      ).resolves.toMatchObject({
        structuredContent: {
          state: "ready",
          ownedPid: 71,
          lastCancellation: { action: "pressKey", outcome: "uncertain" },
        },
      });
      await client.callTool({
        name: "tauri_snapshot",
        arguments: { maxDepth: 2 },
      });
      expect(test.pressKey).toHaveBeenCalledOnce();
      expect(test.managerClose).not.toHaveBeenCalled();
      await client.callTool({ name: "tauri_close", arguments: {} });
      expect(test.managerClose).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("labels snapshot diagnostics with the current operation after diagnostics", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5000 }, context());
    await test.runtime.diagnostics(
      { maxRecords: 16, maxBytes: 8192 },
      context(),
    );
    await test.runtime.snapshot(SNAPSHOT_INPUT, context());
    const records = test.diagnostics.query({
      maxRecords: 128,
      maxBytes: 49152,
    }).records;
    expect(
      records.filter((record) => record.source === "invocation").at(-1)?.code,
    ).toBe("snapshot");
  });

  it("reports cleanup failure when caller cancellation races explicit close", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    test.artifactClose.mockRejectedValueOnce(new Error("artifact close"));
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    test.snapshot.mockImplementationOnce(
      async (_input, signal?: AbortSignal) =>
        await new Promise<SemanticSnapshot>((_resolve, reject) => {
          markStarted();
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const pending = test.runtime.snapshot(
      SNAPSHOT_INPUT,
      context(controller.signal),
    );
    await started;
    controller.abort(new DOMException("cancelled", "AbortError"));
    test.artifactClose.mockRejectedValueOnce(new Error("artifact close retry"));
    const closing = test.runtime.close(context());

    await expect(pending).rejects.toMatchObject({ code: "CLOSE_FAILED" });
    await expect(closing).rejects.toMatchObject({ code: "CLOSE_FAILED" });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "cleanup_failed",
      cleanupPending: ["artifacts"],
      lastAction: "close",
    });
    await expect(test.runtime.close(context())).resolves.toMatchObject({
      state: "idle",
    });
  });

  it("lets close interrupt an in-flight operation before taking the FIFO", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    test.snapshot.mockImplementationOnce(
      async (_input, signal?: AbortSignal) =>
        await new Promise<SemanticSnapshot>((_resolve, reject) => {
          markStarted();
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const pending = test.runtime.snapshot(SNAPSHOT_INPUT, context());
    await started;
    const closing = test.runtime.close(context());

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(closing).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalled();
  });

  it("continues process cleanup when artifact cleanup fails", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    test.artifactClose.mockRejectedValueOnce(new Error("artifact close"));

    await expect(test.runtime.close(context())).rejects.toMatchObject({
      code: "CLOSE_FAILED",
    });
    expect(test.managerClose).toHaveBeenCalledOnce();
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "cleanup_failed",
      cleanupPending: ["artifacts"],
      lastAction: "close",
    });

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledTimes(2);
    expect(test.managerClose).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent close calls and rejects launch while closing", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    let releaseArtifact!: () => void;
    const artifactPending = new Promise<void>((resolve) => {
      releaseArtifact = resolve;
    });
    test.artifactClose.mockImplementationOnce(async () => {
      await artifactPending;
    });

    const first = test.runtime.close(context());
    const second = test.runtime.close(context());
    expect(second).toBe(first);
    await expect(
      test.runtime.launch({ mode: "visible", waitMs: 0 }, context()),
    ).rejects.toMatchObject({ code: "SESSION_ALREADY_ACTIVE" });

    releaseArtifact();
    await expect(first).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    await expect(second).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
  });

  it("reports sanitized manager and artifact cleanup labels and converges on retry", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    test.artifactClose.mockRejectedValueOnce(
      new Error("secret C:\\fixture\\.pumarejo\\artifact"),
    );
    test.managerClose.mockImplementationOnce(async () => {
      throw new PumarejoError("CLOSE_FAILED", {
        cause: new Error("nonce=do-not-expose"),
      });
    });
    Object.defineProperty(test.manager, "snapshot", {
      configurable: true,
      get: () =>
        test.managerClose.mock.calls.length === 1
          ? {
              state: "failed",
              cleanupPending: [
                "webdriver-session",
                "authenticated-proxy",
                "application-process",
                "runtime-configuration",
                "provider-port-reservation",
              ],
            }
          : { state: "idle" },
    });

    await expect(test.runtime.close(context())).rejects.toMatchObject({
      code: "CLOSE_FAILED",
    });
    const failedStatus = await test.runtime.status(context());
    expect(failedStatus).toEqual({
      state: "cleanup_failed",
      cleanupPending: [
        "artifacts",
        "webdriver-session",
        "authenticated-proxy",
        "application-process",
        "runtime-configuration",
        "provider-port-reservation",
      ],
      lastAction: "close",
    });
    expect(JSON.stringify(failedStatus)).not.toMatch(
      /secret|fixture|nonce|do-not-expose/u,
    );

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "idle",
      lastAction: "close",
    });
  });

  it("serves cleanup status outside the operation FIFO while closing", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible", waitMs: 5_000 }, context());
    let releaseArtifact!: () => void;
    const artifactPending = new Promise<void>((resolve) => {
      releaseArtifact = resolve;
    });
    test.artifactClose.mockImplementationOnce(async () => {
      await artifactPending;
    });

    const closing = test.runtime.close(context());
    await vi.waitFor(async () => {
      await expect(test.runtime.status(context())).resolves.toMatchObject({
        state: "closing",
        cleanupPending: ["artifacts"],
        lastAction: "close",
      });
    });
    releaseArtifact();
    await expect(closing).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
  });
});
