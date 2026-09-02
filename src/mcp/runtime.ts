import { randomBytes } from "node:crypto";
import { join } from "node:path";

import {
  ArtifactStore,
  type ArtifactCleanupOutcome,
  type ArtifactRecoveryResult,
} from "../artifacts/store.js";
import { loadProjectConfig, type LoadedProjectConfig } from "../config/load.js";
import {
  InteractionEngine,
  type InteractionResult,
} from "../interaction/engine.js";
import {
  SequenceExecutor,
  type SequenceInteractionPort,
} from "../interaction/sequence.js";
import {
  ScreenshotService,
  diagnoseCoverage,
  type ScreenshotResult,
} from "../observation/screenshot.js";
import { SnapshotEngine } from "../observation/snapshot.js";
import {
  SurfaceGraphManager,
  type SurfaceGraph,
} from "../observation/surfaces.js";
import {
  DiagnosticStore,
  type DiagnosticQueryOptions,
} from "../observability/diagnostics.js";
import { prepareOwnedLinuxLaunch } from "../platform/linux/launch.js";
import { createLinuxProcessAdapter } from "../platform/linux/process.js";
import { prepareWindowsLaunch } from "../platform/windows/launch.js";
import { createWindowsProcessAdapter } from "../platform/windows/process.js";
import { readBuildDevUrl } from "../platform/mode-config.js";
import type {
  BuildDevUrlResult,
  LoopbackDiagnosticOutcome,
} from "../platform/loopback.js";
import type { CleanupLabel } from "../session/cleanup.js";
import type { SanitizedCustodyEvidence } from "../session/custody-lease.js";
import { SessionManager } from "../session/manager.js";
import type {
  LaunchPhase,
  ReadySession,
  SessionSnapshot,
} from "../session/state.js";
import { NativeDialogSession } from "../webdriver/native-control.js";
import type {
  DialogDecision,
  DialogDetection,
  DialogGrant,
} from "../webdriver/native-control.js";
import {
  PumarejoError,
  toErrorEnvelope,
  type ErrorEnvelope,
} from "../shared/errors.js";
import { recordLaunchVerification } from "../installer/launch-verification.js";
import type {
  ClickInput,
  DialogInput,
  DiagnosticsInput,
  LaunchInput,
  PointerInput,
  PressKeyInput,
  ScrollInput,
  SequenceInput,
  ScreenshotInput,
  SurfaceCoverageInput,
  SurfaceDiscoverInput,
  SurfaceSelectInput,
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
    readonly initialWindow?: {
      readonly width: number;
      readonly height: number;
    };
    readonly webdriverPort?: number;
    readonly loopbackFamily?: "ipv4" | "ipv6";
    readonly devUrl?: BuildDevUrlResult;
    readonly signal?: AbortSignal;
    readonly onPhase?: (phase: LaunchPhase) => void;
    readonly onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
  }): Promise<ReadySession>;
  close(): Promise<SessionSnapshot>;
}

interface RuntimeArtifacts {
  open(): Promise<void>;
  close(): Promise<ArtifactCleanupOutcome | void>;
  writePng(contents: Buffer): Promise<{ readonly projectRelativePath: string }>;
}

interface RuntimeSnapshot {
  readonly references: SnapshotEngine["references"];
  readonly currentSnapshot: SnapshotEngine["currentSnapshot"];
  readonly currentSnapshotComparable: SnapshotEngine["currentSnapshotComparable"];
  readonly activeSurface: SnapshotEngine["activeSurface"];
  setSurface: SnapshotEngine["setSurface"];
  snapshot(
    input?: SnapshotInput,
    signal?: AbortSignal,
  ): ReturnType<SnapshotEngine["snapshot"]>;
  interaction: SnapshotEngine["interaction"];
  interactionComparison: SnapshotEngine["interactionComparison"];
  publishComparison: SnapshotEngine["publishComparison"];
  preserveComparison: SnapshotEngine["preserveComparison"];
}

interface RuntimeScreenshot {
  capture(save: boolean, signal?: AbortSignal): Promise<ScreenshotResult>;
}

interface RuntimeSurfaces {
  readonly graph: SurfaceGraph | undefined;
  readonly activeSurfaceRef: string | undefined;
  discover(signal?: AbortSignal): Promise<SurfaceGraph>;
  select(
    surfaceRef: string,
    graphGeneration: number,
    signal?: AbortSignal,
  ): ReturnType<SurfaceGraphManager["select"]>;
}

export interface RuntimeDiagnostics {
  readonly sessionId: string;
  append: DiagnosticStore["append"];
  record: DiagnosticStore["record"];
  recordPhase: DiagnosticStore["recordPhase"];
  recordInvocation: DiagnosticStore["recordInvocation"];
  recordLastError: DiagnosticStore["recordLastError"];
  readonly recordArtifactCleanupUnavailable?: DiagnosticStore["recordArtifactCleanupUnavailable"];
  recordProcess: DiagnosticStore["recordProcess"];
  recordConsole: DiagnosticStore["recordConsole"];
  query(options?: DiagnosticQueryOptions): ReturnType<DiagnosticStore["query"]>;
  close(): void;
}

interface RuntimeInteractions extends SequenceInteractionPort {
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

interface RuntimeDialogs {
  detect(signal?: AbortSignal): Promise<DialogDetection>;
  authorize(
    action: "accept" | "cancel",
    context: {
      readonly surfaceRef: string;
      readonly generation: number;
    },
  ): DialogGrant | undefined;
  decide(
    action: "accept" | "cancel",
    context: {
      readonly surfaceRef: string;
      readonly generation: number;
    },
    signal?: AbortSignal,
  ): Promise<DialogDecision>;
}

export interface PumarejoRuntimeDependencies {
  readonly config: LoadedProjectConfig;
  readonly platform: "windows" | "linux";
  readonly platformName: NodeJS.Platform;
  readonly manager: RuntimeSessionManager;
  recoverArtifacts(): Promise<void>;
  readonly resolveBuildDevUrl?: () => Promise<BuildDevUrlResult | undefined>;
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
  createSurfaces(ready: ReadySession, sessionId: string): RuntimeSurfaces;
  createDialogs?(
    ready: ReadySession,
    sessionId: string,
    snapshot: RuntimeSnapshot,
  ): RuntimeDialogs;
  createDiagnostics?(sessionId: string): RuntimeDiagnostics;
}

interface ActiveRuntime {
  readonly sessionId: string;
  readonly artifacts: RuntimeArtifacts;
  readonly snapshot: RuntimeSnapshot;
  readonly screenshot: RuntimeScreenshot;
  readonly interactions: RuntimeInteractions;
  readonly surfaces: RuntimeSurfaces;
  readonly dialogs?: RuntimeDialogs;
  readonly diagnostics: RuntimeDiagnostics;
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
  readonly windowCapabilities?: ReadySession["windowCapabilities"];
  readonly initialWindow?: ReadySession["initialWindow"];
  readonly lastFailure?: Pick<
    ErrorEnvelope,
    "code" | "phase" | "retryable" | "suggestion" | "diagnostic"
  >;
  readonly lastAction:
    | "none"
    | "launch"
    | "snapshot"
    | "screenshot"
    | "surfaceDiscover"
    | "surfaceSelect"
    | "surfaceCoverage"
    | "diagnostics"
    | "dialog"
    | "click"
    | "type"
    | "pressKey"
    | "window"
    | "pointer"
    | "scroll"
    | "selectOption"
    | "sequence"
    | "close";
}

function publicFailure(error: unknown): RuntimeStatus["lastFailure"] {
  const envelope = toErrorEnvelope(error);
  return {
    code: envelope.code,
    phase: envelope.phase,
    retryable: envelope.retryable,
    suggestion: envelope.suggestion,
    ...(envelope.diagnostic === undefined
      ? {}
      : { diagnostic: envelope.diagnostic }),
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

function isUnavailableArtifactCleanup(
  outcome: ArtifactCleanupOutcome | void,
): outcome is ArtifactCleanupOutcome {
  return (
    outcome?.status === "unavailable" &&
    outcome.state === "quarantined" &&
    outcome.retryable === true
  );
}

function recordUnavailableArtifactCleanup(
  diagnostics: RuntimeDiagnostics | undefined,
  outcome: ArtifactCleanupOutcome,
): void {
  diagnostics?.recordArtifactCleanupUnavailable?.({
    removed: outcome.removed,
    retained: outcome.retained,
    retryable: outcome.retryable,
  });
}

const PENDING_LAUNCH_RESULT = {
  state: "launching",
  pollAfterMs: 500,
  recommendedClientTimeoutMs: 10_000,
} as const;

function defaultManager(
  config: LoadedProjectConfig,
  platform: "windows" | "linux",
  custodyEvidence?: (evidence: SanitizedCustodyEvidence) => void,
  loopbackEvidence?: (evidence: LoopbackDiagnosticOutcome) => void,
): SessionManager {
  if (platform === "windows") {
    return new SessionManager({
      process: createWindowsProcessAdapter(),
      leaseRoot: join(config.projectRoot, ".pumarejo", "sessions"),
      leaseContext: { command: "mcp", projectRoot: config.projectRoot },
      custodyEvidence,
      loopbackEvidence,
      prepareLaunch: (options) =>
        prepareWindowsLaunch(
          config,
          options.mode,
          process.env,
          undefined,
          options.loopbackFamily,
        ),
    });
  }
  return new SessionManager({
    process: createLinuxProcessAdapter(),
    leaseRoot: join(config.projectRoot, ".pumarejo", "sessions"),
    leaseContext: { command: "mcp", projectRoot: config.projectRoot },
    custodyEvidence,
    loopbackEvidence,
    prepareLaunch: (options) =>
      prepareOwnedLinuxLaunch(
        config,
        options.mode,
        process.env,
        options.loopbackFamily,
      ),
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
  let activeDiagnostics: DiagnosticStore | undefined;
  let pendingArtifactRecovery: ArtifactRecoveryResult | undefined;
  const manager = defaultManager(
    config,
    platform,
    (evidence) => {
      activeDiagnostics?.record("last_error", {
        owner: "process",
        code: evidence.code,
        retryable: evidence.retryable,
        capability: {
          state: evidence.state,
          code: evidence.code,
          evidence: evidence.mechanism,
        },
      });
    },
    (evidence) => {
      activeDiagnostics?.record("last_error", {
        owner: "process",
        code: evidence.code,
        family: evidence.family,
        port: evidence.port,
        retryable: evidence.retryable,
        suggestion: evidence.suggestion,
      });
    },
  );
  return {
    config,
    platform,
    platformName: process.platform,
    manager,
    recoverArtifacts: async () => {
      pendingArtifactRecovery = await ArtifactStore.recover({
        projectRoot: config.projectRoot,
        artifactsRoot: config.artifactsPath,
      });
    },
    resolveBuildDevUrl: async () =>
      await readBuildDevUrl({
        projectRoot: config.projectRoot,
        platform,
      }),
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
    createSurfaces: (ready, sessionId) =>
      new SurfaceGraphManager({
        webdriver: ready.webdriver,
        sessionId,
        configuredWindow: ready.window,
        platform,
      }),
    createDialogs: (ready, sessionId) =>
      new NativeDialogSession({
        webdriver: ready.webdriver,
        sessionId,
        processId: ready.ownedPid ?? 0,
        nonce: ready.webdriver.nonce,
      }),
    createDiagnostics: (sessionId) => {
      activeDiagnostics = new DiagnosticStore({ sessionId });
      if (pendingArtifactRecovery !== undefined) {
        if (
          pendingArtifactRecovery.status === "unavailable" &&
          pendingArtifactRecovery.retryable === true
        ) {
          activeDiagnostics.recordArtifactCleanupUnavailable({
            removed: pendingArtifactRecovery.removed,
            retained: pendingArtifactRecovery.retained,
            retryable: true,
          });
        } else {
          activeDiagnostics.record("last_error", {
            owner: "session",
            code: "artifact_recovery",
            count: pendingArtifactRecovery.removed,
            retryable: pendingArtifactRecovery.retained > 0,
            suggestion:
              pendingArtifactRecovery.retained > 0
                ? "Unproven artifact entries were preserved."
                : "Artifact recovery completed.",
          });
        }
        pendingArtifactRecovery = undefined;
      }
      return activeDiagnostics;
    },
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
  #diagnostics: RuntimeDiagnostics | undefined;

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

  dialog(
    input: DialogInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      const active = this.requireActive();
      const dialogs = active.dialogs;
      this.#status = { ...this.#status, lastAction: "dialog" };
      if (dialogs === undefined) {
        return {
          state: "unsupported",
          code: "provider_dialog_boundary_unsupported",
        };
      }
      const current = active.snapshot.currentSnapshot;
      const currentSurfaceRef =
        current?.surface?.surfaceRef ??
        active.snapshot.activeSurface?.surfaceRef ??
        `window:${this.#status.window ?? "unknown"}`;
      const currentGeneration = current?.generation ?? this.#status.generation;
      if (
        (input.surfaceRef !== undefined &&
          input.surfaceRef !== currentSurfaceRef) ||
        (input.generation !== undefined &&
          input.generation !== currentGeneration)
      ) {
        return {
          state: "denied",
          code: "dialog_binding_mismatch",
          action: input.action,
        };
      }
      const surfaceRef = input.surfaceRef ?? currentSurfaceRef;
      const generation = input.generation ?? currentGeneration;
      if (
        typeof generation !== "number" ||
        !Number.isInteger(generation) ||
        generation <= 0
      ) {
        return {
          state: "denied",
          code: "dialog_generation_required",
          action: input.action,
        };
      }
      const effectiveGeneration = generation as number;
      const binding = { surfaceRef, generation: effectiveGeneration };
      if (input.action === "detect") {
        const detected = await dialogs.detect(signal);
        return {
          state: detected.state,
          code: detected.code,
          ...(detected.dialog === undefined ? {} : { dialog: detected.dialog }),
          ...(detected.pending === undefined
            ? {}
            : { pending: detected.pending }),
          ...(detected.evidence === undefined
            ? {}
            : { evidence: detected.evidence }),
        };
      }
      if (input.authorize !== true) {
        return {
          state: "denied",
          code: "dialog_authorization_required",
          action: input.action,
        };
      }
      const detected = await dialogs.detect(signal);
      if (detected.state !== "supported" || detected.dialog === undefined) {
        return {
          state: "unavailable",
          code: "provider_dialog_not_detected",
          action: input.action,
        };
      }
      const grant = dialogs.authorize(input.action, binding);
      if (grant === undefined) {
        return {
          state: "unavailable",
          code: "provider_dialog_not_detected",
          action: input.action,
        };
      }
      const result = await dialogs.decide(input.action, binding, signal);
      return {
        state: result.state,
        code: result.code,
        action: result.action,
        ...(result.dialog === undefined ? {} : { dialog: result.dialog }),
        ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
      };
    }, context.signal);
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

  surfaceDiscover(
    input: SurfaceDiscoverInput,
    context: DomainCallContext,
  ): Promise<{ graph: SurfaceGraph }> {
    return this.run(async (signal) => {
      const active = this.requireActive();
      this.#status = { ...this.#status, lastAction: "surfaceDiscover" };
      const graph =
        input.refresh || active.surfaces.graph === undefined
          ? await active.surfaces.discover(signal)
          : active.surfaces.graph;
      return { graph };
    }, context.signal);
  }

  surfaceSelect(
    input: SurfaceSelectInput,
    context: DomainCallContext,
  ): Promise<{ graph: SurfaceGraph; snapshot: DomainResult }> {
    return this.run(async (signal) => {
      const active = this.requireActive();
      this.#status = { ...this.#status, lastAction: "surfaceSelect" };
      const selection = await active.surfaces.select(
        input.surfaceRef,
        input.graphGeneration,
        signal,
      );
      active.snapshot.setSurface(selection.selected);
      const snapshot = await active.snapshot.snapshot(undefined, signal);
      this.#status = {
        ...this.#status,
        generation: snapshot.generation,
        lastAction: "surfaceSelect",
      };
      return { graph: selection.graph, snapshot: { ...snapshot } };
    }, context.signal);
  }

  surfaceCoverage(
    _input: SurfaceCoverageInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      const active = this.requireActive();
      this.#status = { ...this.#status, lastAction: "surfaceCoverage" };
      const graph =
        active.surfaces.graph ?? (await active.surfaces.discover(signal));
      const screenshot = await active.screenshot.capture(false, signal);
      const regions = graph.surfaces.flatMap((surface) =>
        surface.kind === "window" || surface.bounds === undefined
          ? []
          : [
              {
                surfaceRef: surface.surfaceRef,
                bounds: surface.bounds,
                supported:
                  surface.capabilities.observation.state === "supported",
                code: surface.capabilities.observation.code,
              },
            ],
      );
      return {
        graphGeneration: graph.generation,
        activeSurfaceRef: graph.activeSurfaceRef,
        screenshotGeneration: screenshot.metadata.generation,
        diagnostic: diagnoseCoverage({
          screenshot: {
            width: screenshot.metadata.width,
            height: screenshot.metadata.height,
          },
          regions,
          semanticBounds:
            active.snapshot.currentSnapshot?.nodes.map((node) => ({
              surfaceRef: graph.activeSurfaceRef,
              bounds: node.bounds,
            })) ?? [],
        }),
      };
    }, context.signal);
  }

  diagnostics(
    input: DiagnosticsInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      signal.throwIfAborted();
      const active = this.#active;
      const diagnostics =
        active?.diagnostics ??
        ((this.#status.state === "idle" ||
          this.#status.state === "cleanup_failed") &&
        this.#launchOperation === undefined
          ? this.#diagnostics
          : undefined);
      if (diagnostics === undefined) this.requireActive();
      this.#status = { ...this.#status, lastAction: "diagnostics" };
      const surfaceOwned =
        input.surfaceRef === undefined ||
        (active !== undefined &&
          (active.surfaces.graph?.surfaces.some(
            (surface) => surface.surfaceRef === input.surfaceRef,
          ) === true ||
            active.snapshot.activeSurface?.surfaceRef === input.surfaceRef));
      const projection = diagnostics!.query({
        sources: input.sources,
        surfaceRef: input.surfaceRef,
        maxRecords: input.maxRecords,
        maxBytes: input.maxBytes,
      });
      if (surfaceOwned) return { ...projection } as DomainResult;
      const deniedCapabilities = Object.fromEntries(
        Object.entries(projection.capabilities).map(([source]) => [
          source,
          {
            state: "denied",
            code: "diagnostics_surface_denied",
            evidence: "The requested surface is not owned by this session.",
          },
        ]),
      );
      return {
        ...projection,
        capabilities: deniedCapabilities,
        records: [],
        lastErrors: [],
        truncation: { ...projection.truncation, truncated: false, returned: 0 },
      } as DomainResult;
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

  sequence(
    input: SequenceInput,
    context: DomainCallContext,
  ): Promise<DomainResult> {
    return this.run(async (signal) => {
      this.#status = { ...this.#status, lastAction: "sequence" };
      const interactions = this.requireActive().interactions;
      const result = await new SequenceExecutor({ interactions }).execute(
        input,
        signal,
      );
      this.#status = {
        ...this.#status,
        generation: result.endingGeneration,
        lastAction: "sequence",
      };
      return { ...result };
    }, context.signal);
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
    this.#diagnostics?.close();
    this.#diagnostics = undefined;
    const sessionId = this.#dependencies.sessionId();
    if (!/^[a-f0-9]{32,64}$/u.test(sessionId)) {
      this.#status = { state: "idle", lastAction: "launch" };
      throw new PumarejoError("INTERNAL_ERROR");
    }
    const diagnostics =
      this.#dependencies.createDiagnostics?.(sessionId) ??
      new DiagnosticStore({ sessionId });
    this.#diagnostics = diagnostics;
    const setPhase = (phase: LaunchPhase): void => {
      diagnostics.recordPhase(phase);
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
    const artifacts = this.#dependencies.createArtifacts(sessionId);
    try {
      await artifacts.open();
    } catch (error) {
      const cleanupFailed = await artifacts.close().then(
        (outcome) => {
          if (isUnavailableArtifactCleanup(outcome)) {
            recordUnavailableArtifactCleanup(diagnostics, outcome);
            return true;
          }
          return false;
        },
        () => true,
      );
      if (cleanupFailed) {
        this.#pendingArtifactClose = artifacts;
        this.#status = { state: "cleanup_failed", lastAction: "launch" };
        throw new PumarejoError("CLOSE_FAILED", { cause: error });
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

    let ready: ReadySession;
    try {
      const devUrl = await this.#dependencies.resolveBuildDevUrl?.();
      ready = await this.#dependencies.manager.launch({
        mode: input.mode,
        platform: this.#dependencies.platform,
        window: this.#dependencies.config.config.window,
        ...(this.#dependencies.config.config.initialWindow === undefined
          ? {}
          : { initialWindow: this.#dependencies.config.config.initialWindow }),
        ...(this.#dependencies.config.config.webdriverPort === undefined
          ? {}
          : {
              webdriverPort: this.#dependencies.config.config.webdriverPort,
            }),
        ...(devUrl === undefined ? {} : { devUrl }),
        ...(devUrl?.ok !== true ? {} : { loopbackFamily: devUrl.value.family }),
        signal,
        onPhase: setPhase,
        onOutput: (stream, chunk) => diagnostics.recordProcess(stream, chunk),
      });
    } catch (error) {
      const failure = publicFailure(error);
      diagnostics.recordLastError({
        owner: "session",
        code: failure?.code,
        phase: failure?.phase,
        retryable: failure?.retryable,
        suggestion: failure?.suggestion,
      });
      const artifactCleanupFailed = await artifacts.close().then(
        (outcome) => {
          if (isUnavailableArtifactCleanup(outcome)) {
            recordUnavailableArtifactCleanup(diagnostics, outcome);
            return true;
          }
          return false;
        },
        () => true,
      );
      if (this.#status.state !== "closing") {
        this.#status = {
          state:
            artifactCleanupFailed ||
            this.#dependencies.manager.snapshot.state === "failed"
              ? "cleanup_failed"
              : "idle",
          lastAction: "launch",
          lastFailure: publicFailure(error),
        };
      }
      if (artifactCleanupFailed) {
        this.#pendingArtifactClose = artifacts;
        // Keep the managed launch failure as the observable error. Cleanup is
        // reported through status/pending labels and must not hide the phase
        // and code that explain why launch failed.
        throw error;
      }
      throw error;
    }
    try {
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
        surfaces: this.#dependencies.createSurfaces(ready, sessionId),
        diagnostics,
        ...(this.#dependencies.createDialogs === undefined
          ? {}
          : {
              dialogs: this.#dependencies.createDialogs(
                ready,
                sessionId,
                snapshot,
              ),
            }),
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
        ...(ready.windowCapabilities === undefined
          ? {}
          : { windowCapabilities: ready.windowCapabilities }),
        ...(ready.initialWindow === undefined
          ? {}
          : { initialWindow: ready.initialWindow }),
        lastAction: "launch",
      };
      diagnostics.recordInvocation({
        code: "tauri_launch",
        phase: "capturing_first_snapshot",
        durationMs: 0,
        retryable: false,
        suggestion: "The owned session is ready for a bounded observation.",
      });
      return {
        sessionId,
        mode: ready.mode,
        platform: this.#dependencies.platformName,
        webdriverPort: ready.webdriverPort,
        snapshot: initial,
      };
    } catch (error) {
      const failure = publicFailure(error);
      diagnostics.recordLastError({
        owner: "session",
        code: failure?.code,
        phase: failure?.phase,
        retryable: failure?.retryable,
        suggestion: failure?.suggestion,
      });
      const cleanupFailures: unknown[] = [];
      if (this.#active !== undefined) {
        await this.closeNow({ retainDiagnostics: true }).catch(
          (cleanupError: unknown) => {
            cleanupFailures.push(cleanupError);
          },
        );
      } else {
        this.#pendingArtifactClose = artifacts;
        await this.closeNow({ retainDiagnostics: true }).catch(
          (cleanupError: unknown) => {
            cleanupFailures.push(cleanupError);
          },
        );
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
      const startedAt = Date.now();
      const action = this.#status.lastAction;
      this.#diagnostics?.recordInvocation({
        code: action,
        owner: "session",
      });
      try {
        const result = await operation(signal);
        this.#diagnostics?.recordInvocation({
          code: action,
          owner: "session",
          durationMs: Math.max(0, Date.now() - startedAt),
          retryable: false,
        });
        return result;
      } catch (error) {
        const failure = publicFailure(error);
        this.#diagnostics?.recordLastError({
          owner: "session",
          code: failure?.code,
          phase: failure?.phase,
          retryable: failure?.retryable,
          suggestion: failure?.suggestion,
        });
        this.#diagnostics?.recordInvocation({
          code: action,
          owner: "session",
          durationMs: Math.max(0, Date.now() - startedAt),
          retryable: failure?.retryable,
        });
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

  private async closeNow(
    options: { retainDiagnostics?: boolean } = {},
  ): Promise<void> {
    const active = this.#active;
    this.#active = undefined;
    const diagnostics = active?.diagnostics ?? this.#diagnostics;
    const failures: unknown[] = [];
    const artifacts = active?.artifacts ?? this.#pendingArtifactClose;
    if (artifacts !== undefined) {
      this.#pendingArtifactClose = artifacts;
      try {
        const outcome = await artifacts.close();
        if (isUnavailableArtifactCleanup(outcome)) {
          recordUnavailableArtifactCleanup(diagnostics, outcome);
          failures.push(new PumarejoError("CLOSE_FAILED"));
        } else {
          this.#pendingArtifactClose = undefined;
        }
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await this.#dependencies.manager.close();
    } catch (error) {
      failures.push(error);
    }
    if (options.retainDiagnostics !== true) {
      diagnostics?.close();
      if (this.#diagnostics === diagnostics) this.#diagnostics = undefined;
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
