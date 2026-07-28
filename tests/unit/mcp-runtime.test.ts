import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../../src/mcp/server.js";
import { TauriAgentRuntime } from "../../src/mcp/runtime.js";
import { ReferenceTable } from "../../src/observation/refs.js";
import type { SemanticSnapshot } from "../../src/observation/schema.js";
import type { ReadySession, SessionSnapshot } from "../../src/session/state.js";
import { TauriAgentError } from "../../src/shared/errors.js";
import type { WebDriverClient } from "../../src/webdriver/client.js";

const SESSION_ID = "0123456789abcdef0123456789abcdef";

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
    webdriver: {} as WebDriverClient,
  };
  const launch = vi.fn(async (options: { mode: "visible" | "background" }) => {
    managerState = { ...ready, mode: options.mode };
    return { ...ready, mode: options.mode };
  });
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
  const artifactOpen = vi.fn(async () => undefined);
  const artifactClose = vi.fn(async () => undefined);
  const writePng = vi.fn(async () => ({
    projectRelativePath: ".tauri-agent/artifacts/screenshot.png",
  }));
  const references = new ReferenceTable();
  const snapshot = vi.fn(async () => semanticSnapshot());
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
  }));
  const type = vi.fn(async () => ({
    generation: 2,
    action: "type" as const,
    ref: "e1-1",
    cleared: true,
  }));
  const pressKey = vi.fn(async () => ({
    generation: 2,
    action: "pressKey" as const,
    key: "ENTER" as const,
  }));
  const runtime = new TauriAgentRuntime({
    config: {
      projectRoot: "C:\\fixture",
      configPath: "C:\\fixture\\.tauri-agent.json",
      artifactsPath: "C:\\fixture\\.tauri-agent\\artifacts",
      config: {
        version: 1,
        launch: {
          command: "pnpm",
          args: ["tauri", "dev", "--config", "{tauriConfig}"],
        },
        webdriverPort: 4567,
        window: "main",
        artifactsDirectory: ".tauri-agent/artifacts",
        retainArtifacts: false,
      },
    },
    platform: "windows",
    platformName: "win32",
    manager,
    recoverArtifacts,
    sessionId: () => SESSION_ID,
    createArtifacts: () => ({
      open: artifactOpen,
      close: artifactClose,
      writePng,
    }),
    createSnapshot: () => ({ references, snapshot, interaction }),
    createScreenshot: () => ({ capture: screenshot }),
    createInteractions: () => ({ click, type, pressKey }),
  });
  return {
    runtime,
    manager,
    launch,
    managerClose,
    recoverArtifacts,
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
      test.runtime.snapshot(context()),
      test.runtime.screenshot({ save: true }, context()),
      test.runtime.click({ ref: "e1-1" }, context()),
      test.runtime.type({ ref: "e1-1", text: "x", clear: true }, context()),
      test.runtime.pressKey({ key: "ENTER" }, context()),
    ];

    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
    }
  });

  it("routes all seven operations through one owned session", async () => {
    const test = harness();
    const launchSignal = new AbortController().signal;

    await expect(
      test.runtime.launch({ mode: "background" }, context(launchSignal)),
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
    });
    await expect(
      test.runtime.launch({ mode: "visible" }, context()),
    ).rejects.toMatchObject({ code: "SESSION_ALREADY_ACTIVE" });

    await expect(test.runtime.snapshot(context())).resolves.toMatchObject({
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

  it("completes the seven-tool workflow through an independent MCP client", async () => {
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
        ["tauri_snapshot", {}],
        ["tauri_screenshot", { save: false }],
        ["tauri_click", { ref: "e1-1" }],
        ["tauri_type", { ref: "e1-1", text: "Ada", clear: true }],
        ["tauri_press_key", { key: "ENTER" }],
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
    test.snapshot.mockRejectedValueOnce(new TauriAgentError("INTERNAL_ERROR"));

    await expect(
      test.runtime.launch({ mode: "visible" }, context()),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
  });

  it("cleans the process when artifact initialization fails", async () => {
    const test = harness();
    test.artifactOpen.mockRejectedValueOnce(
      new TauriAgentError("SCREENSHOT_FAILED"),
    );

    await expect(
      test.runtime.launch({ mode: "visible" }, context()),
    ).rejects.toMatchObject({ code: "SCREENSHOT_FAILED" });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
  });

  it("cancels an active call and closes every resource", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible" }, context());
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    test.snapshot.mockImplementationOnce(
      async (signal?: AbortSignal) =>
        await new Promise<SemanticSnapshot>((_resolve, reject) => {
          markStarted();
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const pending = test.runtime.snapshot(context(controller.signal));
    await started;
    controller.abort(new DOMException("cancelled", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalledOnce();
    await expect(test.runtime.snapshot(context())).rejects.toMatchObject({
      code: "SESSION_NOT_ACTIVE",
    });
  });

  it("lets close interrupt an in-flight operation before taking the FIFO", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible" }, context());
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    test.snapshot.mockImplementationOnce(
      async (signal?: AbortSignal) =>
        await new Promise<SemanticSnapshot>((_resolve, reject) => {
          markStarted();
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const pending = test.runtime.snapshot(context());
    await started;
    const closing = test.runtime.close(context());

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(closing).resolves.toEqual({
      alreadyClosed: true,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledOnce();
    expect(test.managerClose).toHaveBeenCalled();
  });

  it("continues process cleanup when artifact cleanup fails", async () => {
    const test = harness();
    await test.runtime.launch({ mode: "visible" }, context());
    test.artifactClose.mockRejectedValueOnce(new Error("artifact close"));

    await expect(test.runtime.close(context())).rejects.toMatchObject({
      code: "CLOSE_FAILED",
    });
    expect(test.managerClose).toHaveBeenCalledOnce();

    await expect(test.runtime.close(context())).resolves.toEqual({
      alreadyClosed: false,
      state: "idle",
    });
    expect(test.artifactClose).toHaveBeenCalledTimes(2);
    expect(test.managerClose).toHaveBeenCalledTimes(2);
  });
});
