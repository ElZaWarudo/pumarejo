import { randomBytes } from "node:crypto";

import { ArtifactStore } from "../artifacts/store.js";
import { loadProjectConfig, type LoadedProjectConfig } from "../config/load.js";
import {
  InteractionEngine,
  type InteractionResult,
} from "../interaction/engine.js";
import {
  ScreenshotService,
  type ScreenshotResult,
} from "../observation/screenshot.js";
import { SnapshotEngine } from "../observation/snapshot.js";
import { prepareOwnedLinuxLaunch } from "../platform/linux/launch.js";
import { createLinuxProcessAdapter } from "../platform/linux/process.js";
import { prepareWindowsLaunch } from "../platform/windows/launch.js";
import { createWindowsProcessAdapter } from "../platform/windows/process.js";
import type { CleanupLabel } from "../session/cleanup.js";
import { SessionManager } from "../session/manager.js";
import type {
  LaunchPhase,
  ReadySession,
  SessionSnapshot,
} from "../session/state.js";
import {
  PumarejoError,
  toErrorEnvelope,
  type ErrorEnvelope,
} from "../shared/errors.js";
import { recordLaunchVerification } from "../installer/launch-verification.js";
import type {
  ClickInput,
  LaunchInput,
  PointerInput,
  PressKeyInput,
  ScrollInput,
  ScreenshotInput,
  SelectOptionInput,
  SnapshotInput,
  TypeInput,
  WindowInput,
} from "./schemas.js";
import type {
  DomainCallContext,
  DomainResult,
  ScreenshotDomainResult,
  PumarejoDomainPorts,
} from "./domain-ports.js";

interface RuntimeSessionManager {
  readonly snapshot: SessionSnapshot;
  launch(options: {
    readonly mode: "visible" | "background";
    readonly platform: "windows" | "linux";
    readonly window: string;
    readonly webdriverPort?: number;
    readonly signal?: AbortSignal;
    readonly onPhase?: (phase: LaunchPhase) => void;
  }): Promise<ReadySession>;
  close(): Promise<SessionSnapshot>;
}

interface RuntimeArtifacts {
  open(): Promise<void>;
  close(): Promise<void>;
  writePng(contents: Buffer): Promise<{ readonly projectRelativePath: string }>;
}

interface RuntimeSnapshot {
  readonly references: SnapshotEngine["references"];
  readonly currentSnapshot: SnapshotEngine["currentSnapshot"];
  readonly currentSnapshotComparable: SnapshotEngine["currentSnapshotComparable"];
  snapshot(
    input?: SnapshotInput,
    signal?: AbortSignal,
  ): ReturnType<SnapshotEngine["snapshot"]>;
  interaction: SnapshotEngine["interaction"];
}

interface RuntimeScreenshot {
  capture(save: boolean, signal?: AbortSignal): Promise<ScreenshotResult>;
}

interface RuntimeInteractions {
  click(input: ClickInput, signal?: AbortSignal): Promise<InteractionResult>;
  type(input: TypeInput, signal?: AbortSignal): Promise<InteractionResult>;
  pressKey(
    input: PressKeyInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  window(input: WindowInput, signal?: AbortSignal): Promise<InteractionResult>;
  pointer(
    input: PointerInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
  scroll(input: ScrollInput, signal?: AbortSignal): Promise<InteractionResult>;
  selectOption(
    input: SelectOptionInput,
    signal?: AbortSignal,
  ): Promise<InteractionResult>;
}

export interface PumarejoRuntimeDependencies {
  readonly config: LoadedProjectConfig;
  readonly platform: "windows" | "linux";
  readonly platformName: NodeJS.Platform;
  readonly manager: RuntimeSessionManager;
  recoverArtifacts(): Promise<void>;
  recordLaunchVerification(): Promise<void>;
  sessionId(): string;
  createArtifacts(sessionId: string): RuntimeArtifacts;
  createSnapshot(ready: ReadySession): RuntimeSnapshot;
  createScreenshot(
    ready: ReadySession,
    snapshot: RuntimeSnapshot,
    artifacts: RuntimeArtifacts,
  ): RuntimeScreenshot;
  createInteractions(
    ready: ReadySession,
    snapshot: RuntimeSnapshot,
  ): RuntimeInteractions;
}

interface ActiveRuntime {
  readonly sessionId: string;
  readonly artifacts: RuntimeArtifacts;
  readonly snapshot: RuntimeSnapshot;
  readonly screenshot: RuntimeScreenshot;
  readonly interactions: RuntimeInteractions;
}

type PublicRuntimeState =
  | "idle"
  | "launching"
  | "ready"
  | "closing"
  | "cleanup_failed";

interface RuntimeStatus {
  readonly state: PublicRuntimeState;
  readonly phase?: LaunchPhase;
  readonly window?: string;
  readonly proxyReady?: boolean;
  readonly webdriverReady?: boolean;
  readonly ownedPid?: number;
  readonly generation?: number;
  readonly lastFailure?: Pick<
    ErrorEnvelope,
    "code" | "phase" | "retryable" | "suggestion"
  >;
  readonly lastAction:
    | "none"
    | "launch"
    | "snapshot"
    | "screenshot"
    | "click"
    | "type"
    | "pressKey"
    | "window"
    | "pointer"
    | "scroll"
    | "selectOption"
    | "close";
}

function publicFailure(error: unknown): RuntimeStatus["lastFailure"] {
  const envelope = toErrorEnvelope(error);
  return {
    code: envelope.code,
    phase: envelope.phase,
    retryable: envelope.retryable,
    suggestion: envelope.suggestion,
  };
}

type RuntimeInteractionAction = Exclude<
  RuntimeStatus["lastAction"],
  "none" | "launch" | "snapshot" | "screenshot" | "close"
>;

function publicCleanupLabels(
  artifactPending: boolean,
  managerPending: readonly CleanupLabel[] | undefined,
): readonly string[] {
  const labels = new Set<string>(artifactPending ? ["artifacts"] : []);
  for (const label of managerPending ?? []) {
    labels.add(label);
  }
  return [...labels];
}

const PENDING_LAUNCH_RESULT = {
  state: "launching",
  pollAfterMs: 500,
  recommendedClientTimeoutMs: 10_000,
} as const;

function defaultManager(
  config: LoadedProjectConfig,
  platform: "windows" | "linux",
): SessionManager {
  if (platform === "windows") {
    return new SessionManager({
      process: createWindowsProcessAdapter(),
      prepareLaunch: (options) =>
        prepareWindowsLaunch(config, options.mode, process.env),
    });
  }
  return new SessionManager({
    process: createLinuxProcessAdapter(),
    prepareLaunch: (options) =>
      prepareOwnedLinuxLaunch(config, options.mode, process.env),
  });
}

function defaultDependencies(
  config: LoadedProjectConfig,
): PumarejoRuntimeDependencies {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "linux"
        ? "linux"
        : undefined;
  if (platform === undefined) {
    throw new PumarejoError("PLATFORM_UNSUPPORTED");
  }
  return {
    config,
    platform,
    platformName: process.platform,
    manager: defaultManager(config, platform),
    recoverArtifacts: async () => {
      await ArtifactStore.recover({
        projectRoot: config.projectRoot,
        artifactsRoot: config.artifactsPath,
      });
    },
    recordLaunchVerification: async () =>
      await recordLaunchVerification(
        config,
        process.platform as "win32" | "linux",
      ),
    sessionId: () => randomBytes(16).toString("hex"),
    createArtifacts: (sessionId) =>
      new ArtifactStore({
        projectRoot: config.projectRoot,
        artifactsRoot: config.artifactsPath,
        retainArtifacts: config.config.retainArtifacts,
        sessionId,
      }),
    createSnapshot: (ready) =>
      new SnapshotEngine({
        webdriver: ready.webdriver,
        windowLabel: ready.window,
      }),
    createScreenshot: (ready, snapshot, artifacts) =>
      new ScreenshotService({
        webdriver: ready.webdriver,
        generation: () => snapshot.references.generation,
        artifacts,
      }),
    createInteractions: (ready, snapshot) =>
      new InteractionEngine({
        webdriver: ready.webdriver,
        snapshot,
      }),
  };
}

export class PumarejoRuntime implements PumarejoDomainPorts {
  readonly #dependencies: PumarejoRuntimeDependencies;
  #active: ActiveRuntime | undefined;
  #pendingArtifactClose: RuntimeArtifacts | undefined;
  #tail: Promise<void> = Promise.resolve();
  #activeAbort: AbortController | undefined;
  #launchOperation: Promise<DomainResult> | undefined;
  #closeOperation: Promise<DomainResult> | undefined;
  #status: RuntimeStatus = { state: "idle", lastAction: "none" };

  constructor(dependencies: PumarejoRuntimeDependencies) {
    this.#dependencies = dependencies;
  }

  async initialize(): Promise<void> {
    await this.#dependencies.recoverArtifacts();
  }

  async launch(
    input: LaunchInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    context.signal.throwIfAborted();
    if (
      this.#active !== undefined ||
      this.#launchOperation !== undefined ||
      this.#closeOperation !== undefined ||
      this.#dependencies.manager.snapshot.state !== "idle"
    ) {
      throw new PumarejoError("SESSION_ALREADY_ACTIVE");
    }

    const controller = new AbortController();
    this.#activeAbort = controller;
    this.#status = {
      state: "launching",
      phase: "resolving_command",
      window: this.#dependencies.config.config.window,
      proxyReady: false,
      webdriverReady: false,
      lastAction: "launch",
    };
    let rejectCancellation!: (reason: unknown) => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cancelWhileWaiting = () => {
      controller.abort(context.signal.reason);
      rejectCancellation(context.signal.reason);
    };
    context.signal.addEventListener("abort", cancelWhileWaiting, {
      once: true,
    });

    const operation = this.enqueue(async () => {
      return await this.launchNow(input, controller.signal);
    });
    this.#launchOperation = operation;
    void operation.then(
      () => this.finishLaunchOperation(operation, controller),
      () => this.finishLaunchOperation(operation, controller),
    );

    const waitMs = input.waitMs ?? 5_000;
    let waitTimer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        cancellation,
        new Promise<DomainResult>((resolve) => {
          waitTimer = setTimeout(() => {
            resolve({
              ...PENDING_LAUNCH_RESULT,
              phase: this.#status.phase ?? "resolving_command",
            });
          }, waitMs);
          waitTimer.unref();
        }),
      ]);
    } finally {
      if (waitTimer !== undefined) clearTimeout(waitTimer);
      context.signal.removeEventListener("abort", cancelWhileWaiting);
    }
  }

  async status(context: DomainCallContext): Promise<DomainResult> {
    context.signal.throwIfAborted();
    const managerSnapshot = this.#dependencies.manager.snapshot;
    const ownedPid = managerSnapshot.ownedPid;
    const includeCleanup =
      this.#status.state === "closing" ||
      this.#status.state === "cleanup_failed";
    const cleanupPending = includeCleanup
      ? publicCleanupLabels(
          this.#active !== undefined ||
            this.#pendingArtifactClose !== undefined,
          managerSnapshot.cleanupPending,
        )
      : [];
    return {
      ...this.#status,
      ...(ownedPid === undefined ? {} : { ownedPid }),
      ...(cleanupPending.length === 0 ? {} : { cleanupPending }),
    };
  }

  snapshot(
    input: SnapshotInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      this.#status = { ...this.#status, lastAction: "snapshot" };
      const result = await this.requireActive().snapshot.snapshot(
        input,
        signal,
      );
      this.#status = {
        ...this.#status,
        generation: result.generation,
        lastAction: "snapshot",
      };
      return { ...result };
    }, context.signal);
  }

  screenshot(
    input: ScreenshotInput,
    context: DomainCallContext,
  ): Promise<ScreenshotDomainResult> {
    return this.run(async (signal) => {
      this.#status = { ...this.#status, lastAction: "screenshot" };
      const result = await this.requireActive().screenshot.capture(
        input.save,
        signal,
      );
      this.#status = {
        ...this.#status,
        generation: result.metadata.generation,
        lastAction: "screenshot",
      };
      return { metadata: { ...result.metadata }, image: result.image };
    }, context.signal);
  }

  click(input: ClickInput, context: DomainCallContext): Promise<DomainResult> {
    return this.runInteraction("click", context, (interactions, signal) =>
      interactions.click(input, signal),
    );
  }

  type(input: TypeInput, context: DomainCallContext): Promise<DomainResult> {
    return this.runInteraction("type", context, (interactions, signal) =>
      interactions.type(input, signal),
    );
  }

  pressKey(
    input: PressKeyInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.runInteraction("pressKey", context, (interactions, signal) =>
      interactions.pressKey(input, signal),
    );
  }

  window(
    input: WindowInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.runInteraction("window", context, (interactions, signal) =>
      interactions.window(input, signal),
    );
  }

  pointer(
    input: PointerInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.runInteraction("pointer", context, (interactions, signal) =>
      interactions.pointer(input, signal),
    );
  }

  scroll(
    input: ScrollInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.runInteraction("scroll", context, (interactions, signal) =>
      interactions.scroll(input, signal),
    );
  }

  selectOption(
    input: SelectOptionInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.runInteraction(
      "selectOption",
      context,
      (interactions, signal) => interactions.selectOption(input, signal),
    );
  }

  close(_context: DomainCallContext): Promise<DomainResult> {
    if (this.#closeOperation !== undefined) {
      return this.#closeOperation;
    }
    const wasOpen =
      this.#launchOperation !== undefined ||
      this.#active !== undefined ||
      this.#dependencies.manager.snapshot.state !== "idle";
    this.#status = { ...this.#status, state: "closing", lastAction: "close" };
    this.#activeAbort?.abort(new DOMException("Session closed.", "AbortError"));
    const operation = this.enqueue(async () => {
      const alreadyClosed =
        !wasOpen &&
        this.#active === undefined &&
        this.#pendingArtifactClose === undefined &&
        this.#dependencies.manager.snapshot.state === "idle";
      try {
        await this.closeNow();
        this.#status = { state: "idle", lastAction: "close" };
        return { alreadyClosed, state: "idle" };
      } catch (error) {
        this.#status = { state: "cleanup_failed", lastAction: "close" };
        throw error;
      }
    });
    this.#closeOperation = operation;
    void operation.then(
      () => this.finishCloseOperation(operation),
      () => this.finishCloseOperation(operation),
    );
    return operation;
  }

  shutdown(): Promise<void> {
    this.#activeAbort?.abort(
      new DOMException("MCP transport closed.", "AbortError"),
    );
    return this.enqueue(async () => {
      await this.closeNow();
    });
  }

  private runInteraction(
    action: RuntimeInteractionAction,
    context: DomainCallContext,
    dispatch: (
      interactions: RuntimeInteractions,
      signal: AbortSignal,
    ) => Promise<InteractionResult>,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      this.#status = { ...this.#status, lastAction: action };
      const result = await dispatch(this.requireActive().interactions, signal);
      this.#status = {
        ...this.#status,
        generation: result.generation,
        lastAction: action,
      };
      return { ...result };
    }, context.signal);
  }

  private requireActive(): ActiveRuntime {
    if (this.#active === undefined) {
      throw new PumarejoError("SESSION_NOT_ACTIVE");
    }
    return this.#active;
  }

  private finishLaunchOperation(
    operation: Promise<DomainResult>,
    controller: AbortController,
  ): void {
    if (this.#launchOperation === operation) {
      this.#launchOperation = undefined;
    }
    if (this.#activeAbort === controller) {
      this.#activeAbort = undefined;
    }
  }

  private finishCloseOperation(operation: Promise<DomainResult>): void {
    if (this.#closeOperation === operation) {
      this.#closeOperation = undefined;
    }
  }

  private async launchNow(
    input: LaunchInput,
    signal: AbortSignal,
  ): Promise<DomainResult> {
    if (this.#pendingArtifactClose !== undefined) {
      try {
        await this.closeNow();
      } catch (error) {
        this.#status = { state: "cleanup_failed", lastAction: "launch" };
        throw error;
      }
    }
    const sessionId = this.#dependencies.sessionId();
    if (!/^[a-f0-9]{32,64}$/u.test(sessionId)) {
      this.#status = { state: "idle", lastAction: "launch" };
      throw new PumarejoError("INTERNAL_ERROR");
    }
    const setPhase = (phase: LaunchPhase): void => {
      if (this.#status.state === "launching") {
        const proxyReady = [
          "creating_session",
          "selecting_window",
          "capturing_first_snapshot",
        ].includes(phase);
        const webdriverReady = [
          "selecting_window",
          "capturing_first_snapshot",
        ].includes(phase);
        this.#status = {
          ...this.#status,
          phase,
          proxyReady,
          webdriverReady,
        };
      }
    };
    let ready: ReadySession;
    try {
      ready = await this.#dependencies.manager.launch({
        mode: input.mode,
        platform: this.#dependencies.platform,
        window: this.#dependencies.config.config.window,
        ...(this.#dependencies.config.config.webdriverPort === undefined
          ? {}
          : {
              webdriverPort: this.#dependencies.config.config.webdriverPort,
            }),
        signal,
        onPhase: setPhase,
      });
    } catch (error) {
      if (this.#status.state !== "closing") {
        this.#status = {
          state:
            this.#dependencies.manager.snapshot.state === "failed"
              ? "cleanup_failed"
              : "idle",
          lastAction: "launch",
          lastFailure: publicFailure(error),
        };
      }
      throw error;
    }
    const artifacts = this.#dependencies.createArtifacts(sessionId);
    try {
      await artifacts.open();
      const snapshot = this.#dependencies.createSnapshot(ready);
      const active: ActiveRuntime = {
        sessionId,
        artifacts,
        snapshot,
        screenshot: this.#dependencies.createScreenshot(
          ready,
          snapshot,
          artifacts,
        ),
        interactions: this.#dependencies.createInteractions(ready, snapshot),
      };
      this.#active = active;
      setPhase("capturing_first_snapshot");
      const initial = await snapshot.snapshot(undefined, signal);
      await this.#dependencies.recordLaunchVerification();
      this.#status = {
        state: "ready",
        window: ready.window,
        proxyReady: true,
        webdriverReady: true,
        ownedPid: ready.ownedPid,
        generation: initial.generation,
        lastAction: "launch",
      };
      return {
        sessionId,
        mode: ready.mode,
        platform: this.#dependencies.platformName,
        webdriverPort: ready.webdriverPort,
        snapshot: initial,
      };
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      if (this.#active !== undefined) {
        await this.closeNow().catch((cleanupError: unknown) => {
          cleanupFailures.push(cleanupError);
        });
      } else {
        this.#pendingArtifactClose = artifacts;
        await this.closeNow().catch((cleanupError: unknown) => {
          cleanupFailures.push(cleanupError);
        });
      }
      if (cleanupFailures.length > 0) {
        if (this.#status.state !== "closing") {
          this.#status = { state: "cleanup_failed", lastAction: "launch" };
        }
        throw new PumarejoError("CLOSE_FAILED", {
          cause: new AggregateError([error, ...cleanupFailures]),
        });
      }
      if (this.#status.state !== "closing") {
        this.#status = {
          state: "idle",
          lastAction: "launch",
          lastFailure: publicFailure(error),
        };
      }
      throw error;
    }
  }

  private run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    callerSignal: AbortSignal,
  ): Promise<T> {
    return this.enqueue(async () => {
      callerSignal.throwIfAborted();
      const controller = new AbortController();
      this.#activeAbort = controller;
      const signal = AbortSignal.any([callerSignal, controller.signal]);
      try {
        return await operation(signal);
      } catch (error) {
        if (signal.aborted && this.#active !== undefined) {
          const lastAction = this.#status.lastAction;
          try {
            await this.closeNow();
            this.#status = { state: "idle", lastAction };
          } catch (cleanupError) {
            this.#status = { state: "cleanup_failed", lastAction };
            throw cleanupError;
          }
        }
        throw error;
      } finally {
        if (this.#activeAbort === controller) {
          this.#activeAbort = undefined;
        }
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.#tail.then(operation);
    this.#tail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private async closeNow(): Promise<void> {
    const active = this.#active;
    this.#active = undefined;
    const failures: unknown[] = [];
    const artifacts = active?.artifacts ?? this.#pendingArtifactClose;
    if (artifacts !== undefined) {
      this.#pendingArtifactClose = artifacts;
      try {
        await artifacts.close();
        this.#pendingArtifactClose = undefined;
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await this.#dependencies.manager.close();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new PumarejoError("CLOSE_FAILED", {
        cause: new AggregateError(failures),
      });
    }
  }
}

export async function createPumarejoRuntime(
  projectPath: string,
): Promise<PumarejoRuntime> {
  const config = await loadProjectConfig(projectPath);
  const runtime = new PumarejoRuntime(defaultDependencies(config));
  await runtime.initialize();
  return runtime;
}
