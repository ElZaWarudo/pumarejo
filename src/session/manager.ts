import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  launchCommandHash,
  type ProcessAdapter,
  type SpawnRequest,
} from "../platform/types.js";
import { PumarejoError } from "../shared/errors.js";
import { WebDriverClient } from "../webdriver/client.js";
import { CleanupStack } from "./cleanup.js";
import {
  createLoopbackEndpoint,
  loopbackDiagnosticOutcome,
  observeLoopback,
  type BuildDevUrlResult,
  type LoopbackDiagnosticOutcome,
  type LoopbackFamily,
} from "../platform/loopback.js";
import {
  probeLoopbackEndpoint,
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
import {
  CustodyLeaseStore,
  identityForLease,
  proveCustodyOwnership,
  sanitizeCustodyEvidence,
  type CustodyLeaseContext,
  type CustodyLeaseRecord,
  type SanitizedCustodyEvidence,
} from "./custody-lease.js";
import type {
  InitialWindowEvidence,
  ReadySession,
  LaunchPhase,
  RuntimeMode,
  SessionSnapshot,
  SessionState,
  WindowCapabilities,
} from "./state.js";

export interface PreparedLaunch {
  readonly request: Omit<SpawnRequest, "shell">;
  readonly window?: string;
  /** Sanitized config facts supplied by the platform launch adapter. */
  readonly devUrl?: BuildDevUrlResult;
  readonly loopbackFamily?: LoopbackFamily;
  cleanup(): Promise<void>;
}

export interface PrepareLaunchOptions {
  readonly mode: RuntimeMode;
  readonly providerPort: number;
  readonly providerNonce: string;
  readonly loopbackFamily?: LoopbackFamily;
}

export interface SessionLaunchOptions {
  readonly mode: RuntimeMode;
  readonly platform: "windows" | "linux";
  readonly window: string;
  readonly webdriverPort?: number;
  /** Explicit family selection; IPv4 remains the compatibility default. */
  readonly loopbackFamily?: LoopbackFamily;
  /** Already-sanitized build.devUrl facts from the mode-config boundary. */
  readonly devUrl?: BuildDevUrlResult;
  readonly initialWindow?: { readonly width: number; readonly height: number };
  readonly signal?: AbortSignal;
  readonly onPhase?: (phase: LaunchPhase) => void;
  readonly onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
}

export interface SessionManagerDependencies {
  readonly process: ProcessAdapter;
  /** Internal durable lease root. Omit only for non-native test doubles. */
  readonly leaseRoot?: string;
  readonly leaseStore?: CustodyLeaseStore;
  readonly leaseContext?: Omit<CustodyLeaseContext, "runtimeMode">;
  readonly custodyEvidence?: (
    evidence: SanitizedCustodyEvidence,
  ) => void | Promise<void>;
  readonly loopbackEvidence?: (
    evidence: LoopbackDiagnosticOutcome,
  ) => void | Promise<void>;
  prepareLaunch(options: PrepareLaunchOptions): Promise<PreparedLaunch>;
  reservePort(
    preferredPort?: number,
    family?: LoopbackFamily,
  ): Promise<PortReservation>;
  startProxy(options: {
    readonly providerPort: number;
    readonly family?: LoopbackFamily;
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

export function providerReadinessTimeout(request: SpawnRequest): number {
  const configured = Number(
    request.env.PUMAREJO_PROVIDER_READY_TIMEOUT_MS ?? "300000",
  );
  if (!Number.isInteger(configured) || configured < 1_000) return 5_000;
  return Math.min(configured, 600_000);
}

function readinessFailure(state: string): PumarejoError {
  return new PumarejoError("WEBDRIVER_NOT_READY", {
    cause: new Error(`Loopback provider readiness state: ${state}.`),
  });
}

export class SessionManager {
  readonly #dependencies: SessionManagerDependencies;
  #snapshot: SessionSnapshot = { state: "idle" };
  #ready: ReadySession | undefined;
  #cleanup = new CleanupStack();
  #launchOperation: Promise<ReadySession> | undefined;
  #launchAbort: AbortController | undefined;
  #closeOperation: Promise<SessionSnapshot> | undefined;
  readonly #controllerId: string;
  readonly #leaseStore: CustodyLeaseStore | undefined;
  #durableLease: CustodyLeaseRecord | undefined;
  #custodyAttachment:
    | (NonNullable<ProcessAdapter["custody"]> extends infer T
        ? T extends { attach(identity: infer _I): Promise<infer A> }
          ? A
          : never
        : never)
    | undefined;
  #custodyEvidence?: (
    evidence: SanitizedCustodyEvidence,
  ) => void | Promise<void>;
  #loopbackEvidence?: (
    evidence: LoopbackDiagnosticOutcome,
  ) => void | Promise<void>;

  constructor(
    dependencies:
      | SessionManagerDependencies
      | Pick<SessionManagerDependencies, "process" | "prepareLaunch">,
  ) {
    this.#controllerId =
      ("leaseStore" in dependencies
        ? dependencies.leaseStore?.controllerId
        : undefined) ?? randomBytes(32).toString("hex");
    this.#dependencies =
      "reservePort" in dependencies
        ? dependencies
        : defaultDependencies(dependencies);
    this.#custodyEvidence = this.#dependencies.custodyEvidence;
    this.#loopbackEvidence = this.#dependencies.loopbackEvidence;
    this.#leaseStore =
      this.#dependencies.leaseStore ??
      (this.#dependencies.leaseRoot === undefined ||
      this.#dependencies.process.custody === undefined
        ? undefined
        : new CustodyLeaseStore({
            root: this.#dependencies.leaseRoot,
            controllerId: this.#controllerId,
            context: this.#dependencies.leaseContext,
          }));
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
    await this.recoverOrphans();
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
    const startedAt = Date.now();
    let phase: LaunchPhase = "preparing_runtime";
    let budgetMs: number | undefined;
    const enter = (next: LaunchPhase): void => {
      phase = next;
      options.onPhase?.(next);
    };
    try {
      enter("preparing_runtime");
      const requestedFamily =
        options.loopbackFamily ??
        (options.devUrl?.ok === true ? options.devUrl.value.family : "ipv4");
      const reservation = await this.#dependencies.reservePort(
        options.webdriverPort,
        requestedFamily,
      );
      this.#cleanup.add("provider-port-reservation", async () => {
        await reservation.release();
      });

      const prepared = await this.#dependencies.prepareLaunch({
        mode: options.mode,
        providerPort: reservation.port,
        providerNonce,
        loopbackFamily: requestedFamily,
      });
      this.#cleanup.add("runtime-configuration", async () => {
        await prepared.cleanup();
      });
      const window = prepared.window ?? options.window;
      if (window.trim().length === 0 || window.length > 128) {
        throw new PumarejoError("CONFIG_INVALID");
      }

      const family = requestedFamily;
      if (
        (reservation.family !== undefined &&
          reservation.family !== requestedFamily) ||
        (prepared.loopbackFamily !== undefined &&
          prepared.loopbackFamily !== requestedFamily)
      ) {
        throw new PumarejoError("CONFIG_INVALID");
      }
      const createdEndpoint = createLoopbackEndpoint({
        host: family === "ipv6" ? "::1" : "127.0.0.1",
        port: reservation.port,
        family,
      });
      const endpoint =
        reservation.endpoint?.family === family
          ? reservation.endpoint
          : createdEndpoint.ok
            ? createdEndpoint.endpoint
            : undefined;
      if (endpoint === undefined) throw new PumarejoError("CONFIG_INVALID");
      if (
        reservation.endpoint !== undefined &&
        reservation.endpoint.family !== family
      ) {
        throw new PumarejoError("CONFIG_INVALID");
      }
      if (
        options.devUrl !== undefined &&
        prepared.devUrl !== undefined &&
        JSON.stringify(options.devUrl) !== JSON.stringify(prepared.devUrl)
      ) {
        throw new PumarejoError("CONFIG_INVALID");
      }

      await reservation.release();
      const released = await reservation.listenerState?.();
      if (released !== undefined && released !== "released") {
        throw new PumarejoError("PORT_UNAVAILABLE");
      }
      this.#cleanup.complete("provider-port-reservation");
      enter("starting_process");
      const request: SpawnRequest = {
        ...prepared.request,
        env: {
          ...prepared.request.env,
          TAURI_WEBDRIVER_PORT: String(reservation.port),
          TAURI_WEBDRIVER_NONCE: providerNonce,
          PUMAREJO_SESSION_NONCE: sessionNonce,
        },
        shell: false,
        onOutput: options.onOutput,
      };
      const spawned = await this.#dependencies.process.spawn(request);
      const expectedHash = launchCommandHash(request.command, request.args);
      lease = {
        ...spawned,
        commandHash: expectedHash,
        sessionNonce,
        providerPid: spawned.pid,
        providerPort: reservation.port,
        providerFamily: family,
        proxyPort: 0,
      };
      this.#cleanup.add("application-process", async () => {
        if (lease !== undefined) {
          cleanupOutcome.application = await this.terminateOwnedProcess(lease);
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
      let custodyAttachment: NonNullable<
        ProcessAdapter["custody"]
      > extends infer T
        ? T extends { attach(identity: infer _I): Promise<infer A> }
          ? A
          : never
        : never;
      if (this.#dependencies.process.custody !== undefined) {
        custodyAttachment =
          spawned.custodyAttachment ??
          (await this.#dependencies.process.custody.attach(spawned));
        this.#custodyAttachment = custodyAttachment;
        const custodyFacts = await this.#dependencies.process.custody.inspect(
          spawned,
          custodyAttachment,
        );
        if (custodyFacts === undefined) {
          throw new PumarejoError("SESSION_CREATE_FAILED");
        }
        const capability =
          await this.#dependencies.process.custody.capability();
        this.#durableLease = await this.#leaseStore?.create({
          controllerId: this.#controllerId,
          identity: spawned,
          mechanism: custodyFacts.mechanism,
          providerPort: reservation.port,
          providerFamily: family,
          ...(custodyFacts.groupId === undefined
            ? {}
            : { groupId: custodyFacts.groupId }),
          ...(custodyFacts.sessionId === undefined
            ? {}
            : { sessionId: custodyFacts.sessionId }),
          context: {
            ...(this.#dependencies.leaseContext ?? {
              command: "session-manager",
            }),
            runtimeMode: options.mode,
          },
        });
        await this.emitCustodyEvidence(
          sanitizeCustodyEvidence({
            phase: "attach",
            code: capability.code,
            mechanism: capability.mechanism,
            state: capability.state,
            retryable: capability.state !== "supported",
          }),
        );
      }
      this.setState("starting", { ownedPid: spawned.pid });

      enter("waiting_provider");
      const familyAwareReadiness =
        reservation.endpoint !== undefined ||
        options.loopbackFamily !== undefined ||
        prepared.loopbackFamily !== undefined ||
        options.devUrl !== undefined;
      let providerPid: number | undefined;
      budgetMs = providerReadinessTimeout(request);
      const launchDeadline = Date.now() + budgetMs;
      if (familyAwareReadiness) {
        const deadline = launchDeadline;
        let observation: Awaited<ReturnType<typeof observeLoopback>>;
        do {
          options.signal?.throwIfAborted();
          if (
            !processIdentityMatches(
              lease,
              await this.#dependencies.process.inspect(spawned.pid),
            )
          ) {
            throw new PumarejoError("SESSION_CREATE_FAILED");
          }
          const remainingMs = Math.max(1, deadline - Date.now());
          observation = await observeLoopback(endpoint, {
            probe: probeLoopbackEndpoint,
            // Windows ownership proof may require a PowerShell/CIM roundtrip;
            // keep enough deadline for that proof once the listener appears.
            timeoutMs: Math.min(5_000, remainingMs),
            signal: options.signal,
            ownership: async (_endpoint, signal) => {
              const owner = await this.#dependencies.process.providerOwner(
                spawned.pid,
                reservation.port,
                family,
                signal,
              );
              signal.throwIfAborted();
              if (owner === undefined) return "unknown";
              providerPid = owner;
              return "owned";
            },
          });
          if (observation.state === "occupied") break;
          const waitMs = Math.min(50, Math.max(0, deadline - Date.now()));
          if (waitMs === 0) break;
          await delay(waitMs, undefined, { signal: options.signal });
        } while (Date.now() < deadline);
        await this.emitLoopbackEvidence(observation);
        if (observation.state !== "occupied") {
          throw readinessFailure(observation.state);
        }
      } else {
        await spawned.waitUntilProviderReady(
          reservation.port,
          options.signal,
          family,
        );
      }
      if (
        !processIdentityMatches(
          lease,
          await this.#dependencies.process.inspect(spawned.pid),
        )
      ) {
        throw new PumarejoError("SESSION_CREATE_FAILED");
      }
      const recheckedProviderPid =
        await this.#dependencies.process.providerOwner(
          spawned.pid,
          reservation.port,
          family,
          options.signal,
        );
      if (
        recheckedProviderPid === undefined ||
        recheckedProviderPid <= 0 ||
        (providerPid !== undefined && providerPid !== recheckedProviderPid)
      ) {
        throw new PumarejoError("SESSION_CREATE_FAILED");
      }
      providerPid = recheckedProviderPid;
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
              family,
              options.signal,
            )) === providerPid;
          authorizationAllowed = allowed;
          authorizationCheckedAt = Date.now();
          return allowed;
        })().finally(() => {
          authorizationPending = undefined;
        });
        return await authorizationPending;
      };

      enter("starting_proxy");
      const proxy = await this.#dependencies.startProxy({
        providerPort: reservation.port,
        family,
        sessionNonce,
        providerNonce,
        authorizeUpstream,
      });
      this.#cleanup.add("authenticated-proxy", async () => {
        await proxy.close();
      });
      lease = { ...lease, providerPid, proxyPort: proxy.port };
      if (this.#durableLease !== undefined && this.#leaseStore !== undefined) {
        this.#durableLease = await this.#leaseStore.update(this.#durableLease, {
          providerPid,
          providerPort: reservation.port,
          providerFamily: family,
          proxyPort: proxy.port,
        });
      }
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
          family,
          options.signal,
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
      enter("creating_session");
      try {
        // A cold first run can still be loading the frontend when the
        // provider starts listening; keep waiting within the launch budget.
        await webdriver.waitUntilReady({
          signal: options.signal,
          deadlineMs: Math.min(
            600_000,
            Math.max(15_000, launchDeadline - Date.now()),
          ),
        });
        await webdriver.createSession(options.signal);
      } catch (error) {
        throw proxy.takeAuthorizationFailure?.() ?? error;
      }
      this.#cleanup.add("webdriver-session", async () => {
        await webdriver.deleteSession();
      });
      enter("selecting_window");
      await webdriver.selectWindow(window, options.signal);

      let windowCapabilities: WindowCapabilities | undefined;
      if (typeof webdriver.probeWindowCapabilities === "function") {
        windowCapabilities = await webdriver.probeWindowCapabilities(
          options.signal,
        );
      }
      let initialWindow: InitialWindowEvidence | undefined;
      if (options.initialWindow !== undefined) {
        const requested = {
          width: options.initialWindow.width,
          height: options.initialWindow.height,
        };
        const probe = windowCapabilities?.initialSize;
        if (probe === undefined || probe.state !== "supported") {
          initialWindow = {
            state: probe?.state ?? "unavailable",
            code: probe?.code ?? "provider_capability_probe_unavailable",
            requested,
            ...(probe?.evidence === undefined
              ? {}
              : { evidence: probe.evidence }),
          };
        } else {
          try {
            const effective = await webdriver.windowAction(
              { action: "resize", ...requested },
              options.signal,
            );
            initialWindow = {
              state: "supported",
              code: "window_initial_size_verified",
              requested,
              effective: {
                width: effective.rect.width,
                height: effective.rect.height,
              },
            };
          } catch (error) {
            if (options.signal?.aborted) throw options.signal.reason;
            initialWindow = {
              state: "failed",
              code: "window_initial_size_failed",
              requested,
              evidence:
                error instanceof PumarejoError
                  ? error.code
                  : "provider_action_failed",
            };
          }
        }
      }

      const ready: ReadySession = {
        state: "ready",
        mode: options.mode,
        platform: options.platform,
        window,
        webdriverPort: proxy.port,
        ownedPid: spawned.pid,
        webdriver,
        ...(windowCapabilities === undefined ? {} : { windowCapabilities }),
        ...(initialWindow === undefined ? {} : { initialWindow }),
      };
      this.#ready = ready;
      this.setState("ready", {
        mode: ready.mode,
        platform: ready.platform,
        window: ready.window,
        webdriverPort: ready.webdriverPort,
        ownedPid: ready.ownedPid,
        ...(ready.windowCapabilities === undefined
          ? {}
          : { windowCapabilities: ready.windowCapabilities }),
        ...(ready.initialWindow === undefined
          ? {}
          : { initialWindow: ready.initialWindow }),
      });
      return ready;
    } catch (error) {
      return await this.failLaunch(launchError(error), cleanupOutcome, {
        phase,
        elapsedMs: Date.now() - startedAt,
        budgetMs,
      });
    }
  }

  private async failLaunch(
    error: Error,
    cleanupOutcome: {
      readonly application?: "terminated" | "already-exited";
    } = {},
    progress?: {
      readonly phase: LaunchPhase;
      readonly elapsedMs: number;
      readonly budgetMs: number | undefined;
    },
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
    if (
      progress !== undefined &&
      error instanceof PumarejoError &&
      error.diagnostic === undefined
    ) {
      const seconds = Math.round(progress.elapsedMs / 1_000);
      const limit =
        progress.budgetMs === undefined
          ? ""
          : `; launch budget ${Math.round(progress.budgetMs / 1_000)}s (PUMAREJO_PROVIDER_READY_TIMEOUT_MS)`;
      throw new PumarejoError(error.code, {
        cause: error.cause ?? error,
        diagnostic: {
          check: `Failed during ${progress.phase} after ${seconds}s${limit}`,
          applicationStarted,
          cleanup: this.#cleanup.pendingLabels.includes("application-process")
            ? "survived"
            : (cleanupOutcome.application ??
              (applicationStarted ? "already-exited" : "not-required")),
          webdriverSessionCreated: [
            "selecting_window",
            "capturing_first_snapshot",
          ].includes(progress.phase),
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

  private async emitCustodyEvidence(
    evidence: SanitizedCustodyEvidence,
  ): Promise<void> {
    try {
      await this.#custodyEvidence?.(evidence);
    } catch {
      // Evidence is advisory and must never widen the destructive target.
    }
  }

  private async emitLoopbackEvidence(
    observation: Parameters<typeof loopbackDiagnosticOutcome>[0],
  ): Promise<void> {
    try {
      await this.#loopbackEvidence?.(loopbackDiagnosticOutcome(observation));
    } catch {
      // Diagnostics are advisory and must never change readiness or cleanup.
    }
  }

  private async terminateOwnedProcess(
    lease: ProcessLease,
  ): Promise<"terminated" | "already-exited"> {
    const custody = this.#dependencies.process.custody;
    const attachment = this.#custodyAttachment;
    let durable = this.#durableLease;
    if (custody === undefined || attachment === undefined) {
      return await terminateProcessLease(lease, this.#dependencies.process);
    }

    if (durable !== undefined && this.#leaseStore !== undefined) {
      durable = this.#durableLease = await this.#leaseStore.transition(
        durable,
        "closing",
      );
    }
    const identity = durable === undefined ? lease : identityForLease(durable);
    const before = await custody.inspect(identity, attachment);
    const proof =
      durable === undefined
        ? undefined
        : proveCustodyOwnership(durable, before);
    if (proof !== undefined && !proof.owned && before !== undefined) {
      await this.emitCustodyEvidence(
        sanitizeCustodyEvidence({
          phase: "terminate",
          code: "custody_termination_proof_failed",
          mechanism: durable?.mechanism,
          state: "denied",
          retryable: true,
          resourcePresent: before !== undefined,
        }),
      );
      throw new Error(
        "Owned process proof was lost; cleanup retained as retryable.",
      );
    }
    const result = await custody.terminate(identity, attachment, {
      graceMs: 2_000,
      pollMs: 25,
    });
    if (result.state === "retryable") {
      if (durable !== undefined && this.#leaseStore !== undefined) {
        durable = this.#durableLease = await this.#leaseStore.transition(
          durable,
          "retryable",
        );
      }
      throw new Error("Owned process cleanup remains retryable.");
    }
    const after = await custody.inspect(identity, attachment);
    const providerPort = durable?.providerPort ?? lease.providerPort;
    const providerFamily = durable?.providerFamily ?? lease.providerFamily;
    const listenerOwner =
      providerPort > 0 && providerFamily !== undefined
        ? await this.#dependencies.process.providerOwner(
            lease.pid,
            providerPort,
            providerFamily,
            undefined,
          )
        : undefined;
    if (after !== undefined || listenerOwner !== undefined) {
      if (durable !== undefined && this.#leaseStore !== undefined) {
        durable = this.#durableLease = await this.#leaseStore.transition(
          durable,
          "retryable",
        );
      }
      await this.emitCustodyEvidence(
        sanitizeCustodyEvidence({
          phase: "listener",
          code: "custody_postcondition_pending",
          mechanism: durable?.mechanism,
          state: "failed",
          retryable: true,
          resourcePresent: true,
        }),
      );
      throw new Error("Owned process or listener postcondition is pending.");
    }
    await custody.release(attachment);
    this.#custodyAttachment = undefined;
    if (durable !== undefined && this.#leaseStore !== undefined) {
      const closed = await this.#leaseStore.transition(durable, "closed");
      await this.#leaseStore.remove(closed);
      this.#durableLease = undefined;
    }
    await this.emitCustodyEvidence(
      sanitizeCustodyEvidence({
        phase: "terminate",
        code: "custody_cleanup_converged",
        mechanism: durable?.mechanism,
        state: "supported",
        retryable: false,
        resourcePresent: false,
      }),
    );
    return result.state;
  }

  private async recoverOrphans(): Promise<void> {
    const store = this.#leaseStore;
    const custody = this.#dependencies.process.custody;
    if (store === undefined || custody === undefined) return;
    let scan;
    try {
      scan = await store.scan();
    } catch {
      await this.emitCustodyEvidence(
        sanitizeCustodyEvidence({
          phase: "recover",
          code: "custody_lease_scan_failed",
          state: "unavailable",
          retryable: true,
        }),
      );
      throw new PumarejoError("APP_START_FAILED");
    }
    if (scan.malformed.length > 0 || scan.skipped.length > 0) {
      await this.emitCustodyEvidence(
        sanitizeCustodyEvidence({
          phase: "recover",
          code: "custody_lease_scan_invalid",
          state: "failed",
          retryable: true,
        }),
      );
      throw new PumarejoError("APP_START_FAILED");
    }
    for (const lease of scan.leases) {
      if (lease.controllerPid === process.pid) continue;
      let controllerAlive = false;
      try {
        process.kill(lease.controllerPid, 0);
        controllerAlive = true;
      } catch (error) {
        // EPERM means a process exists but is not probeable; treating it as
        // dead could race a live controller, so preserve the lease.
        controllerAlive = (error as NodeJS.ErrnoException).code === "EPERM";
      }
      if (controllerAlive) continue;
      let claimed: CustodyLeaseRecord | undefined;
      let attachment:
        | Awaited<ReturnType<NonNullable<ProcessAdapter["custody"]>["attach"]>>
        | undefined;
      try {
        claimed = await store.claimForRecovery(lease);
        if (claimed === undefined) continue;
        const identity = identityForLease(claimed);
        // A dead controller's Job closed with it (kill-on-close). When the
        // exact owned identity is gone and nothing owned holds the provider
        // port, there is nothing to terminate: close the lease instead of
        // leaving it ambiguous forever. Inspection failures keep the old path.
        const observed = await this.#dependencies.process
          .inspect(claimed.pid)
          .then(
            (value) => ({ known: true as const, value }),
            () => ({ known: false as const }),
          );
        if (
          claimed.mechanism === "windows_job_object" &&
          observed.known &&
          !processIdentityMatches(identity, observed.value)
        ) {
          const listener =
            claimed.providerPort === undefined ||
            claimed.providerFamily === undefined
              ? undefined
              : await this.#dependencies.process.providerOwner(
                  claimed.pid,
                  claimed.providerPort,
                  claimed.providerFamily,
                );
          if (listener === undefined) {
            const closed = await store.transition(claimed, "closed");
            await store.remove(closed);
            claimed = undefined;
            await this.emitCustodyEvidence(
              sanitizeCustodyEvidence({
                phase: "recover",
                code: "custody_orphan_already_exited",
                mechanism: lease.mechanism,
                state: "supported",
                retryable: false,
                resourcePresent: false,
              }),
            );
            continue;
          }
        }
        attachment = await custody.attach(identity);
        const before = await custody.inspect(identity, attachment);
        const proof = proveCustodyOwnership(claimed, before);
        if (!proof.owned) {
          await store.transition(claimed, "retryable").catch(() => undefined);
          await this.emitCustodyEvidence(
            sanitizeCustodyEvidence({
              phase: "recover",
              code: "custody_orphan_proof_failed",
              mechanism: claimed.mechanism,
              state: "denied",
              retryable: true,
              resourcePresent: before !== undefined,
            }),
          );
          continue;
        }
        const result = await custody.terminate(identity, attachment);
        if (
          result.state !== "terminated" &&
          result.state !== "already-exited"
        ) {
          await store.transition(claimed, "retryable");
          continue;
        }
        const after = await custody.inspect(identity, attachment);
        const listenerOwner =
          claimed.providerPort === undefined ||
          claimed.providerFamily === undefined
            ? undefined
            : await this.#dependencies.process.providerOwner(
                claimed.pid,
                claimed.providerPort,
                claimed.providerFamily,
              );
        if (after !== undefined || listenerOwner !== undefined) {
          await store.transition(claimed, "retryable");
          continue;
        }
        const closed = await store.transition(claimed, "closed");
        await store.remove(closed);
        await this.emitCustodyEvidence(
          sanitizeCustodyEvidence({
            phase: "recover",
            code: "custody_orphan_repaired",
            mechanism: claimed?.mechanism ?? lease.mechanism,
            state: "supported",
            retryable: false,
            resourcePresent: false,
          }),
        );
      } catch {
        if (claimed !== undefined) {
          await store.transition(claimed, "retryable").catch(() => undefined);
        }
        await this.emitCustodyEvidence(
          sanitizeCustodyEvidence({
            phase: "recover",
            code: "custody_orphan_repair_failed",
            mechanism: claimed?.mechanism ?? lease.mechanism,
            state: "failed",
            retryable: true,
          }),
        );
      } finally {
        if (attachment !== undefined)
          await custody.release(attachment).catch(() => undefined);
        if (claimed !== undefined)
          await store.releaseRecovery(claimed).catch(() => undefined);
      }
    }
  }
}
