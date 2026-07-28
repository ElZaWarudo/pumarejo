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
import { SessionManager } from "../session/manager.js";
import type { ReadySession, SessionSnapshot } from "../session/state.js";
import { TauriAgentError } from "../shared/errors.js";
import type {
  ClickInput,
  LaunchInput,
  PressKeyInput,
  ScreenshotInput,
  TypeInput,
} from "./schemas.js";
import type {
  DomainCallContext,
  DomainResult,
  ScreenshotDomainResult,
  TauriAgentDomainPorts,
} from "./domain-ports.js";

interface RuntimeSessionManager {
  readonly snapshot: SessionSnapshot;
  launch(options: {
    readonly mode: "visible" | "background";
    readonly platform: "windows" | "linux";
    readonly window: string;
    readonly webdriverPort?: number;
    readonly signal?: AbortSignal;
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
  snapshot(signal?: AbortSignal): ReturnType<SnapshotEngine["snapshot"]>;
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
}

export interface TauriAgentRuntimeDependencies {
  readonly config: LoadedProjectConfig;
  readonly platform: "windows" | "linux";
  readonly platformName: NodeJS.Platform;
  readonly manager: RuntimeSessionManager;
  recoverArtifacts(): Promise<void>;
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
): TauriAgentRuntimeDependencies {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "linux"
        ? "linux"
        : undefined;
  if (platform === undefined) {
    throw new TauriAgentError("PLATFORM_UNSUPPORTED");
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

export class TauriAgentRuntime implements TauriAgentDomainPorts {
  readonly #dependencies: TauriAgentRuntimeDependencies;
  #active: ActiveRuntime | undefined;
  #pendingArtifactClose: RuntimeArtifacts | undefined;
  #tail: Promise<void> = Promise.resolve();
  #activeAbort: AbortController | undefined;

  constructor(dependencies: TauriAgentRuntimeDependencies) {
    this.#dependencies = dependencies;
  }

  async initialize(): Promise<void> {
    await this.#dependencies.recoverArtifacts();
  }

  launch(
    input: LaunchInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      if (this.#active !== undefined) {
        throw new TauriAgentError("SESSION_ALREADY_ACTIVE");
      }
      if (this.#pendingArtifactClose !== undefined) {
        await this.closeNow();
      }
      const sessionId = this.#dependencies.sessionId();
      if (!/^[a-f0-9]{32,64}$/u.test(sessionId)) {
        throw new TauriAgentError("INTERNAL_ERROR");
      }
      const ready = await this.#dependencies.manager.launch({
        mode: input.mode,
        platform: this.#dependencies.platform,
        window: this.#dependencies.config.config.window,
        ...(this.#dependencies.config.config.webdriverPort === undefined
          ? {}
          : {
              webdriverPort: this.#dependencies.config.config.webdriverPort,
            }),
        signal,
      });
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
        const initial = await snapshot.snapshot(signal);
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
          await artifacts.close().catch((cleanupError: unknown) => {
            cleanupFailures.push(cleanupError);
          });
          await this.#dependencies.manager
            .close()
            .catch((cleanupError: unknown) => {
              cleanupFailures.push(cleanupError);
            });
        }
        if (cleanupFailures.length > 0) {
          throw new TauriAgentError("CLOSE_FAILED", {
            cause: new AggregateError([error, ...cleanupFailures]),
          });
        }
        throw error;
      }
    }, context.signal);
  }

  snapshot(context: DomainCallContext): Promise<DomainResult> {
    return this.run(async (signal) => {
      return { ...(await this.requireActive().snapshot.snapshot(signal)) };
    }, context.signal);
  }

  screenshot(
    input: ScreenshotInput,
    context: DomainCallContext,
  ): Promise<ScreenshotDomainResult> {
    return this.run(async (signal) => {
      const result = await this.requireActive().screenshot.capture(
        input.save,
        signal,
      );
      return { metadata: { ...result.metadata }, image: result.image };
    }, context.signal);
  }

  click(input: ClickInput, context: DomainCallContext): Promise<DomainResult> {
    return this.run(async (signal) => {
      return {
        ...(await this.requireActive().interactions.click(input, signal)),
      };
    }, context.signal);
  }

  type(input: TypeInput, context: DomainCallContext): Promise<DomainResult> {
    return this.run(async (signal) => {
      return {
        ...(await this.requireActive().interactions.type(input, signal)),
      };
    }, context.signal);
  }

  pressKey(
    input: PressKeyInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      return {
        ...(await this.requireActive().interactions.pressKey(input, signal)),
      };
    }, context.signal);
  }

  close(_context: DomainCallContext): Promise<DomainResult> {
    this.#activeAbort?.abort(new DOMException("Session closed.", "AbortError"));
    return this.enqueue(async () => {
      const alreadyClosed =
        this.#active === undefined &&
        this.#pendingArtifactClose === undefined &&
        this.#dependencies.manager.snapshot.state === "idle";
      await this.closeNow();
      return { alreadyClosed, state: "idle" };
    });
  }

  shutdown(): Promise<void> {
    this.#activeAbort?.abort(
      new DOMException("MCP transport closed.", "AbortError"),
    );
    return this.enqueue(async () => {
      await this.closeNow();
    });
  }

  private requireActive(): ActiveRuntime {
    if (this.#active === undefined) {
      throw new TauriAgentError("SESSION_NOT_ACTIVE");
    }
    return this.#active;
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
          await this.closeNow();
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
      throw new TauriAgentError("CLOSE_FAILED", {
        cause: new AggregateError(failures),
      });
    }
  }
}

export async function createTauriAgentRuntime(
  projectPath: string,
): Promise<TauriAgentRuntime> {
  const config = await loadProjectConfig(projectPath);
  const runtime = new TauriAgentRuntime(defaultDependencies(config));
  await runtime.initialize();
  return runtime;
}
