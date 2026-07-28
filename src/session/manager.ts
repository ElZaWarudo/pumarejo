import { randomBytes } from "node:crypto";

import {
  launchCommandHash,
  type ProcessAdapter,
  type SpawnRequest,
} from "../platform/types.js";
import { TauriAgentError } from "../shared/errors.js";
import { WebDriverClient } from "../webdriver/client.js";
import { CleanupStack } from "./cleanup.js";
import {
  reserveProviderPort,
  startAuthenticatedProxy,
  type AuthenticatedProxy,
  type PortReservation,
} from "./endpoint.js";
import {
  processIdentityMatches,
  terminateProcessLease,
  type ProcessLease,
} from "./process-lease.js";
import type {
  ReadySession,
  RuntimeMode,
  SessionSnapshot,
  SessionState,
} from "./state.js";

export interface PreparedLaunch {
  readonly request: Omit<SpawnRequest, "shell">;
  readonly window?: string;
  cleanup(): Promise<void>;
}

export interface PrepareLaunchOptions {
  readonly mode: RuntimeMode;
  readonly providerPort: number;
  readonly providerNonce: string;
}

export interface SessionLaunchOptions {
  readonly mode: RuntimeMode;
  readonly platform: "windows" | "linux";
  readonly window: string;
  readonly webdriverPort?: number;
  readonly signal?: AbortSignal;
}

export interface SessionManagerDependencies {
  readonly process: ProcessAdapter;
  prepareLaunch(options: PrepareLaunchOptions): Promise<PreparedLaunch>;
  reservePort(preferredPort?: number): Promise<PortReservation>;
  startProxy(options: {
    readonly providerPort: number;
    readonly sessionNonce: string;
    readonly providerNonce: string;
    readonly authorizeUpstream?: () => Promise<boolean>;
  }): Promise<AuthenticatedProxy>;
  createWebDriver(options: {
    readonly port: number;
    readonly nonce: string;
  }): WebDriverClient;
  nonce(): string;
}

function defaultDependencies(
  dependencies: Pick<SessionManagerDependencies, "process" | "prepareLaunch">,
): SessionManagerDependencies {
  return {
    ...dependencies,
    reservePort: reserveProviderPort,
    startProxy: startAuthenticatedProxy,
    createWebDriver: (options) =>
      new WebDriverClient({ ...options, requestTimeoutMs: 30_000 }),
    nonce: () => randomBytes(32).toString("hex"),
  };
}

function launchError(error: unknown): Error {
  return error instanceof TauriAgentError
    ? error
    : new TauriAgentError("APP_START_FAILED", { cause: error });
}

export class SessionManager {
  readonly #dependencies: SessionManagerDependencies;
  #state: SessionState = "idle";
  #snapshot: SessionSnapshot = { state: "idle" };
  #ready: ReadySession | undefined;
  #cleanup = new CleanupStack();
  #launchOperation: Promise<ReadySession> | undefined;
  #launchAbort: AbortController | undefined;
  #closeOperation: Promise<SessionSnapshot> | undefined;

  constructor(
    dependencies:
      | SessionManagerDependencies
      | Pick<SessionManagerDependencies, "process" | "prepareLaunch">,
  ) {
    this.#dependencies =
      "reservePort" in dependencies
        ? dependencies
        : defaultDependencies(dependencies);
  }

  get snapshot(): SessionSnapshot {
    return { ...this.#snapshot };
  }

  get readySession(): ReadySession {
    if (this.#ready === undefined || this.#state !== "ready") {
      throw new TauriAgentError("SESSION_NOT_ACTIVE");
    }
    return this.#ready;
  }

  async launch(options: SessionLaunchOptions): Promise<ReadySession> {
    if (this.#state !== "idle") {
      throw new TauriAgentError("SESSION_ALREADY_ACTIVE");
    }
    if (
      options.window.trim().length === 0 ||
      options.window.length > 128 ||
      options.signal?.aborted
    ) {
      options.signal?.throwIfAborted();
      throw new TauriAgentError("CONFIG_INVALID");
    }
    this.setState("starting", {
      mode: options.mode,
      platform: options.platform,
      window: options.window,
      webdriverPort: options.webdriverPort,
    });
    const launchAbort = new AbortController();
    this.#launchAbort = launchAbort;
    const operation = this.launchTransaction({
      ...options,
      signal:
        options.signal === undefined
          ? launchAbort.signal
          : AbortSignal.any([options.signal, launchAbort.signal]),
    });
    this.#launchOperation = operation;
    try {
      return await operation;
    } finally {
      if (this.#launchOperation === operation) {
        this.#launchOperation = undefined;
      }
      if (this.#launchAbort === launchAbort) {
        this.#launchAbort = undefined;
      }
    }
  }

  async close(): Promise<SessionSnapshot> {
    if (this.#closeOperation !== undefined) {
      return await this.#closeOperation;
    }
    if (this.#state === "starting" && this.#launchOperation !== undefined) {
      this.#launchAbort?.abort(
        new TauriAgentError("APP_START_FAILED", {
          cause: new Error("Launch cancelled by close."),
        }),
      );
      await this.#launchOperation.catch(() => undefined);
    }
    if (this.#closeOperation !== undefined) {
      return await this.#closeOperation;
    }
    if (this.#state === "idle") return this.snapshot;

    const operation = this.closeTransaction();
    this.#closeOperation = operation;
    try {
      return await operation;
    } finally {
      if (this.#closeOperation === operation) {
        this.#closeOperation = undefined;
      }
    }
  }

  private setState(
    state: SessionState,
    details: Partial<Omit<SessionSnapshot, "state">> = {},
  ): void {
    this.#state = state;
    this.#snapshot = { ...this.#snapshot, ...details, state };
  }

  private async launchTransaction(
    options: SessionLaunchOptions,
  ): Promise<ReadySession> {
    const sessionNonce = this.#dependencies.nonce();
    const providerNonce = this.#dependencies.nonce();
    if (
      !/^[a-f0-9]{64}$/u.test(sessionNonce) ||
      !/^[a-f0-9]{64}$/u.test(providerNonce) ||
      sessionNonce === providerNonce
    ) {
      return await this.failLaunch(new TauriAgentError("INTERNAL_ERROR"));
    }

    let lease: ProcessLease | undefined;
    try {
      const reservation = await this.#dependencies.reservePort(
        options.webdriverPort,
      );
      this.#cleanup.add("provider-port-reservation", async () => {
        await reservation.release();
      });

      const prepared = await this.#dependencies.prepareLaunch({
        mode: options.mode,
        providerPort: reservation.port,
        providerNonce,
      });
      this.#cleanup.add("runtime-configuration", async () => {
        await prepared.cleanup();
      });
      const window = prepared.window ?? options.window;
      if (window.trim().length === 0 || window.length > 128) {
        throw new TauriAgentError("CONFIG_INVALID");
      }

      await reservation.release();
      const request: SpawnRequest = {
        ...prepared.request,
        env: {
          ...prepared.request.env,
          TAURI_WEBDRIVER_PORT: String(reservation.port),
          TAURI_WEBDRIVER_NONCE: providerNonce,
          TAURI_AGENT_SESSION_NONCE: sessionNonce,
        },
        shell: false,
      };
      const spawned = await this.#dependencies.process.spawn(request);
      const expectedHash = launchCommandHash(request.command, request.args);
      lease = {
        ...spawned,
        commandHash: expectedHash,
        sessionNonce,
        providerPid: spawned.pid,
        providerPort: reservation.port,
        proxyPort: 0,
      };
      this.#cleanup.add("application-process", async () => {
        if (lease !== undefined) {
          await terminateProcessLease(lease, this.#dependencies.process);
        }
      });
      if (
        spawned.pid <= 0 ||
        spawned.startedAt <= 0 ||
        spawned.commandHash !== expectedHash ||
        spawned.sessionNonce !== sessionNonce
      ) {
        throw new TauriAgentError("APP_START_FAILED");
      }

      await spawned.waitUntilProviderReady(reservation.port, options.signal);
      if (
        !processIdentityMatches(
          lease,
          await this.#dependencies.process.inspect(spawned.pid),
        )
      ) {
        throw new TauriAgentError("SESSION_CREATE_FAILED");
      }
      const providerPid = await this.#dependencies.process.providerOwner(
        spawned.pid,
        reservation.port,
      );
      if (providerPid === undefined || providerPid <= 0) {
        throw new TauriAgentError("SESSION_CREATE_FAILED");
      }
      let authorizationCheckedAt = Date.now();
      let authorizationAllowed = true;
      let authorizationPending: Promise<boolean> | undefined;
      const authorizeUpstream = async (): Promise<boolean> => {
        if (Date.now() - authorizationCheckedAt <= 500) {
          return authorizationAllowed;
        }
        authorizationPending ??= (async () => {
          const allowed =
            lease !== undefined &&
            processIdentityMatches(
              lease,
              await this.#dependencies.process.inspect(spawned.pid),
            ) &&
            (await this.#dependencies.process.providerOwner(
              spawned.pid,
              reservation.port,
            )) === providerPid;
          authorizationAllowed = allowed;
          authorizationCheckedAt = Date.now();
          return allowed;
        })().finally(() => {
          authorizationPending = undefined;
        });
        return await authorizationPending;
      };

      const proxy = await this.#dependencies.startProxy({
        providerPort: reservation.port,
        sessionNonce,
        providerNonce,
        authorizeUpstream,
      });
      this.#cleanup.add("authenticated-proxy", async () => {
        await proxy.close();
      });
      lease = { ...lease, providerPid, proxyPort: proxy.port };
      if (
        !processIdentityMatches(
          lease,
          await this.#dependencies.process.inspect(spawned.pid),
        )
      ) {
        throw new TauriAgentError("SESSION_CREATE_FAILED");
      }
      const confirmedProviderPid =
        await this.#dependencies.process.providerOwner(
          spawned.pid,
          reservation.port,
        );
      if (confirmedProviderPid !== providerPid) {
        throw new TauriAgentError("SESSION_CREATE_FAILED");
      }
      authorizationAllowed = true;
      authorizationCheckedAt = Date.now();

      const webdriver = this.#dependencies.createWebDriver({
        port: proxy.port,
        nonce: sessionNonce,
      });
      await webdriver.waitUntilReady({ signal: options.signal });
      await webdriver.createSession(options.signal);
      this.#cleanup.add("webdriver-session", async () => {
        await webdriver.deleteSession();
      });
      await webdriver.selectWindow(window, options.signal);

      const ready: ReadySession = {
        state: "ready",
        mode: options.mode,
        platform: options.platform,
        window,
        webdriverPort: proxy.port,
        webdriver,
      };
      this.#ready = ready;
      this.setState("ready", {
        mode: ready.mode,
        platform: ready.platform,
        window: ready.window,
        webdriverPort: ready.webdriverPort,
      });
      return ready;
    } catch (error) {
      return await this.failLaunch(launchError(error));
    }
  }

  private async failLaunch(error: Error): Promise<never> {
    this.setState("cleaning");
    try {
      await this.#cleanup.run();
      this.#ready = undefined;
      this.#snapshot = { state: "idle" };
      this.#state = "idle";
    } catch {
      this.#ready = undefined;
      this.setState("failed");
    }
    throw error;
  }

  private async closeTransaction(): Promise<SessionSnapshot> {
    this.setState("cleaning");
    try {
      await this.#cleanup.run();
      this.#ready = undefined;
      this.#snapshot = { state: "idle" };
      this.#state = "idle";
      return this.snapshot;
    } catch (error) {
      this.#ready = undefined;
      this.setState("failed");
      throw new TauriAgentError("CLOSE_FAILED", { cause: error });
    }
  }
}
