import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../../src/mcp/server.js";
import { PumarejoRuntime } from "../../src/mcp/runtime.js";
import { ReferenceTable } from "../../src/observation/refs.js";
import type { SemanticSnapshot } from "../../src/observation/schema.js";
import type {
  LaunchPhase,
  ReadySession,
  SessionSnapshot,
} from "../../src/session/state.js";
import { PumarejoError } from "../../src/shared/errors.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";
import type { SnapshotInput } from "../../src/mcp/schemas.js";

const SESSION_ID = "0123456789abcdef0123456789abcdef";
const SNAPSHOT_INPUT = {
  maxNodes: 500,
  maxDepth: 32,
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
  const artifactClose = vi.fn(async () => undefined);
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
  const click = vi.fn(async () => ({
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
    sessionId: () => SESSION_ID,
    createArtifacts: () => ({
      open: artifactOpen,
      close: artifactClose,
      writePng,
    }),
    createSnapshot: () => ({
      references,
      currentSnapshot: semanticSnapshot(),
      currentSnapshotComparable: true,
      snapshot,
      interaction,
    }),
    createScreenshot: () => ({ capture: screenshot }),
    createInteractions: () => ({
      click,
      type,
      pressKey,
      window: windowAction,
      pointer,
      scroll,
      selectOption,
    }),
  });
  return {
    runtime,
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
    snapshot,
    screenshot,
    click,
    type,
    pressKey,
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
    await expect(test.runtime.status(context())).resolves.toMatchObject({
      state: "ready",
      generation: 2,
      lastAction: "selectOption",
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

  it("completes the twelve-tool workflow through an independent MCP client", async () => {
    const test = harness();
    const server = createMcpServer(test.runtime);
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

  it("cancels an active call and closes every resource", async () => {
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
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
    await expect(
      test.runtime.snapshot(SNAPSHOT_INPUT, context()),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_ACTIVE",
    });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "idle",
      lastAction: "snapshot",
    });
  });

  it("reports cleanup failure when cancellation cannot close artifacts", async () => {
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

    await expect(pending).rejects.toMatchObject({ code: "CLOSE_FAILED" });
    await expect(test.runtime.status(context())).resolves.toEqual({
      state: "cleanup_failed",
      cleanupPending: ["artifacts"],
      lastAction: "snapshot",
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
