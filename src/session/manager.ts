import { randomBytes } from "node:crypto";

import {
  launchCommandHash,
  type ProcessAdapter,
  type SpawnRequest,
} from "../platform/types.js";
import { PumarejoError } from "../shared/errors.js";
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
  LaunchPhase,
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
  readonly onPhase?: (phase: LaunchPhase) => void;
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
  return error instanceof PumarejoError
    ? error
    : new PumarejoError("APP_START_FAILED", { cause: error });
}

export class SessionManager {
  readonly #dependencies: SessionManagerDependencies;
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
    const cleanupPending =
      this.#snapshot.state === "cleaning" || this.#snapshot.state === "failed"
        ? this.#cleanup.pendingLabels
        : undefined;
    return {
      ...this.#snapshot,
      ...(cleanupPending === undefined ? {} : { cleanupPending }),
    };
  }

  get readySession(): ReadySession {
    if (this.#ready === undefined || this.#snapshot.state !== "ready") {
      throw new PumarejoError("SESSION_NOT_ACTIVE");
    }
    return this.#ready;
  }

  async launch(options: SessionLaunchOptions): Promise<ReadySession> {
    if (this.#snapshot.state !== "idle") {
      throw new PumarejoError("SESSION_ALREADY_ACTIVE");
    }
    if (
      options.window.trim().length === 0 ||
      options.window.length > 128 ||
      options.signal?.aborted
    ) {
      options.signal?.throwIfAborted();
      throw new PumarejoError("CONFIG_INVALID");
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
    if (
      this.#snapshot.state === "starting" &&
      this.#launchOperation !== undefined
    ) {
      this.#launchAbort?.abort(
        new PumarejoError("APP_START_FAILED", {
          cause: new Error("Launch cancelled by close."),
        }),
      );
      await this.#launchOperation.catch(() => undefined);
    }
    if (this.#closeOperation !== undefined) {
      return await this.#closeOperation;
    }
    if (this.#snapshot.state === "idle") return this.snapshot;

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
    this.#snapshot = { ...this.#snapshot, ...details, state };
  }

  private setCleanupFailed(): void {
    const { ownedPid, ...details } = this.#snapshot;
    const processPending = this.#cleanup.pendingLabels.includes(
      "application-process",
    );
    this.#snapshot = {
      ...details,
      ...(processPending && ownedPid !== undefined ? { ownedPid } : {}),
      state: "failed",
    };
  }

  private async launchTransaction(
    options: SessionLaunchOptions,
  ): Promise<ReadySession> {
    const cleanupOutcome: {
      application?: "terminated" | "already-exited";
    } = {};
    const sessionNonce = this.#dependencies.nonce();
    const providerNonce = this.#dependencies.nonce();
    if (
      !/^[a-f0-9]{64}$/u.test(sessionNonce) ||
      !/^[a-f0-9]{64}$/u.test(providerNonce) ||
      sessionNonce === providerNonce
    ) {
      return await this.failLaunch(new PumarejoError("INTERNAL_ERROR"));
    }

    let lease: ProcessLease | undefined;
    try {
      options.onPhase?.("preparing_runtime");
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
        throw new PumarejoError("CONFIG_INVALID");
      }

      await reservation.release();
      this.#cleanup.complete("provider-port-reservation");
      options.onPhase?.("starting_process");
      const request: SpawnRequest = {
        ...prepared.request,
        env: {
          ...prepared.request.env,
          TAURI_WEBDRIVER_PORT: String(reservation.port),
          TAURI_WEBDRIVER_NONCE: providerNonce,
          PUMAREJO_SESSION_NONCE: sessionNonce,
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
          cleanupOutcome.application = await terminateProcessLease(
            lease,
            this.#dependencies.process,
          );
        }
      });
      if (
        spawned.pid <= 0 ||
        spawned.startedAt <= 0 ||
        spawned.commandHash !== expectedHash ||
        spawned.sessionNonce !== sessionNonce
      ) {
        throw new PumarejoError("APP_START_FAILED");
      }
      this.setState("starting", { ownedPid: spawned.pid });

      options.onPhase?.("waiting_provider");
      await spawned.waitUntilProviderReady(reservation.port, options.signal);
      if (
        !processIdentityMatches(
          lease,
          await this.#dependencies.process.inspect(spawned.pid),
        )
      ) {
        throw new PumarejoError("SESSION_CREATE_FAILED");
      }
      const providerPid = await this.#dependencies.process.providerOwner(
        spawned.pid,
        reservation.port,
      );
      if (providerPid === undefined || providerPid <= 0) {
        throw new PumarejoError("SESSION_CREATE_FAILED");
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

      options.onPhase?.("starting_proxy");
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
        throw new PumarejoError("SESSION_CREATE_FAILED");
      }
      const confirmedProviderPid =
        await this.#dependencies.process.providerOwner(
          spawned.pid,
          reservation.port,
        );
      if (confirmedProviderPid !== providerPid) {
        throw new PumarejoError("SESSION_CREATE_FAILED");
      }
      authorizationAllowed = true;
      authorizationCheckedAt = Date.now();

      const webdriver = this.#dependencies.createWebDriver({
        port: proxy.port,
        nonce: sessionNonce,
      });
      options.onPhase?.("creating_session");
      try {
        await webdriver.waitUntilReady({ signal: options.signal });
        await webdriver.createSession(options.signal);
      } catch (error) {
        throw proxy.takeAuthorizationFailure?.() ?? error;
      }
      this.#cleanup.add("webdriver-session", async () => {
        await webdriver.deleteSession();
      });
      options.onPhase?.("selecting_window");
      await webdriver.selectWindow(window, options.signal);

      const ready: ReadySession = {
        state: "ready",
        mode: options.mode,
        platform: options.platform,
        window,
        webdriverPort: proxy.port,
        ownedPid: spawned.pid,
        webdriver,
      };
      this.#ready = ready;
      this.setState("ready", {
        mode: ready.mode,
        platform: ready.platform,
        window: ready.window,
        webdriverPort: ready.webdriverPort,
        ownedPid: ready.ownedPid,
      });
      return ready;
    } catch (error) {
      return await this.failLaunch(launchError(error), cleanupOutcome);
    }
  }

  private async failLaunch(
    error: Error,
    cleanupOutcome: {
      readonly application?: "terminated" | "already-exited";
    } = {},
  ): Promise<never> {
    const applicationStarted =
      this.#snapshot.ownedPid !== undefined ||
      this.#cleanup.pendingLabels.includes("application-process");
    this.setState("cleaning");
    try {
      await this.#cleanup.run();
      this.#ready = undefined;
      this.#snapshot = { state: "idle" };
    } catch {
      this.#ready = undefined;
      this.setCleanupFailed();
    }
    if (
      error instanceof PumarejoError &&
      error.phase === "process-inspection"
    ) {
      const processStillPending = this.#cleanup.pendingLabels.includes(
        "application-process",
      );
      throw new PumarejoError(error.code, {
        cause: error.cause ?? error,
        diagnostic: {
          check: "Windows process identity and provider ownership via CIM",
          applicationStarted,
          cleanup: processStillPending
            ? "survived"
            : (cleanupOutcome.application ?? "already-exited"),
          webdriverSessionCreated: false,
        },
      });
    }
    throw error;
  }

  private async closeTransaction(): Promise<SessionSnapshot> {
    this.setState("cleaning");
    try {
      await this.#cleanup.run();
      this.#ready = undefined;
      this.#snapshot = { state: "idle" };
      return this.snapshot;
    } catch (error) {
      this.#ready = undefined;
      this.setCleanupFailed();
      throw new PumarejoError("CLOSE_FAILED", { cause: error });
    }
  }
}
