import { createHash } from "node:crypto";

import { PumarejoError } from "../shared/errors.js";
import type { WebDriverClient } from "../webdriver/client.js";

const MAX_SURFACES = 64;
const MAX_LABEL_LENGTH = 128;
const MAX_EVIDENCE_LENGTH = 256;
const MAX_GRAPH_GENERATION = 2_147_483_647;

export const SURFACE_OPERATION_NAMES = [
  "discovery",
  "selection",
  "observation",
  "interaction",
  "screenshot",
] as const;

export type SurfaceOperation = (typeof SURFACE_OPERATION_NAMES)[number];
export type SurfaceCapabilityState =
  | "supported"
  | "unsupported"
  | "unavailable"
  | "denied"
  | "failed";

export interface SurfaceCapability {
  readonly state: SurfaceCapabilityState;
  readonly code: string;
  readonly evidence?: string;
}

export type SurfaceKind =
  | "window"
  | "panel"
  | "shadow-root"
  | "iframe"
  | "webview";

export interface SurfaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SurfaceRecord {
  readonly surfaceRef: string;
  readonly identity: string;
  readonly parentRef?: string;
  readonly kind: SurfaceKind;
  readonly label: string;
  readonly title?: string;
  readonly bounds?: SurfaceBounds;
  readonly lifecycle: "active" | "available" | "unsupported";
  readonly active: boolean;
  readonly capabilities: Readonly<Record<SurfaceOperation, SurfaceCapability>>;
}

export interface SurfaceGraph {
  readonly sessionId: string;
  readonly generation: number;
  readonly activeSurfaceRef: string;
  readonly surfaces: readonly SurfaceRecord[];
  readonly provider: {
    readonly runtime: "webdriver";
    readonly platform: "windows" | "linux" | "unknown";
  };
}

interface ProviderContext {
  readonly key: string;
  readonly parentKey?: string;
  readonly kind: SurfaceKind;
  readonly label?: string;
  readonly title?: string;
  readonly bounds?: SurfaceBounds;
  readonly reachable: boolean;
  readonly frameIndex?: number;
  readonly reason?: string;
}

interface ProviderWindow {
  readonly handle: string;
  readonly title?: string;
  readonly bounds?: SurfaceBounds;
}

interface InternalSurface {
  readonly ref: string;
  readonly key: string;
  readonly windowHandle: string;
  readonly context: ProviderContext;
  readonly parentRef?: string;
}

export interface SurfaceManagerOptions {
  readonly webdriver: Pick<
    WebDriverClient,
    "windowHandles" | "selectWindow" | "title" | "windowRect" | "execute"
  > &
    Partial<
      Pick<
        WebDriverClient,
        "findElements" | "switchToFrame" | "switchToParentFrame"
      >
    >;
  readonly sessionId: string;
  readonly configuredWindow: string;
  readonly platform?: "windows" | "linux" | "unknown";
  readonly now?: () => Date;
}

export interface SurfaceSelection {
  readonly graph: SurfaceGraph;
  readonly selected: SurfaceRecord;
}

const CONTEXT_DISCOVERY_SCRIPT = `
  const limit = 64;
  const bounded = (value, max = 128) => typeof value === 'string' ? value.slice(0, max) : undefined;
  const rect = (element) => {
    try {
      const r = element.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0
        ? { x: r.x, y: r.y, width: r.width, height: r.height }
        : undefined;
    } catch { return undefined; }
  };
  const contexts = [];
  const push = (value) => { if (contexts.length < limit) contexts.push(value); };
  let iframeIndex = 0;
  for (const [index, element] of [...document.querySelectorAll('iframe, [data-dockview-panel], [data-pumarejo-surface]')].entries()) {
    if (contexts.length >= limit) break;
    const kind = element.localName === 'iframe' ? 'iframe' : element.shadowRoot?.mode === 'open' ? 'shadow-root' : 'panel';
    let reachable = true;
    let reason;
    if (element.localName === 'iframe') {
      try { reachable = element.contentDocument !== null; } catch { reachable = false; reason = 'cross_origin'; }
      if (element.src && !reachable) reason = reason ?? 'provider_unavailable';
    }
    if (kind === 'shadow-root' && element.shadowRoot === null) { reachable = false; reason = 'closed_root'; }
    const frameIndex = element.localName === 'iframe' ? iframeIndex++ : undefined;
    push({ key: kind + '-' + index, parentKey: undefined, kind, label: bounded(element.getAttribute('aria-label') ?? element.getAttribute('data-title')), title: bounded(element.getAttribute('title')), bounds: rect(element), reachable, ...(frameIndex === undefined ? {} : { frameIndex }), reason });
  }
  return contexts;
`;

function boundedText(
  value: string | undefined,
  max = MAX_LABEL_LENGTH,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, max);
}

function capability(
  state: SurfaceCapabilityState,
  code: string,
  evidence?: string,
): SurfaceCapability {
  return {
    state,
    code: code.slice(0, 64),
    ...(evidence === undefined
      ? {}
      : { evidence: boundedText(evidence, MAX_EVIDENCE_LENGTH) }),
  };
}

function hashIdentity(sessionId: string, key: string): string {
  return createHash("sha256")
    .update(`${sessionId}:${key}`)
    .digest("hex")
    .slice(0, 24);
}

function safeBounds(value: unknown): SurfaceBounds | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const bounds = {
    x: Number(candidate.x),
    y: Number(candidate.y),
    width: Number(candidate.width),
    height: Number(candidate.height),
  };
  return Object.values(bounds).every(Number.isFinite) &&
    bounds.width >= 0 &&
    bounds.height >= 0
    ? bounds
    : undefined;
}

function providerContext(value: unknown, index: number): ProviderContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      key: `provider-${index}`,
      kind: "webview",
      reachable: false,
      reason: "invalid_provider_record",
    };
  }
  const candidate = value as Record<string, unknown>;
  const kind = ["panel", "shadow-root", "iframe", "webview"].includes(
    candidate.kind as string,
  )
    ? (candidate.kind as SurfaceKind)
    : "webview";
  return {
    key:
      boundedText(candidate.key as string | undefined, 64) ??
      `provider-${index}`,
    ...(boundedText(candidate.parentKey as string | undefined, 64) === undefined
      ? {}
      : {
          parentKey: boundedText(candidate.parentKey as string | undefined, 64),
        }),
    kind,
    ...(boundedText(candidate.label as string | undefined) === undefined
      ? {}
      : { label: boundedText(candidate.label as string | undefined) }),
    ...(boundedText(candidate.title as string | undefined) === undefined
      ? {}
      : { title: boundedText(candidate.title as string | undefined) }),
    ...(safeBounds(candidate.bounds) === undefined
      ? {}
      : { bounds: safeBounds(candidate.bounds) }),
    reachable: candidate.reachable === true,
    ...(Number.isInteger(candidate.frameIndex) &&
    (candidate.frameIndex as number) >= 0
      ? { frameIndex: candidate.frameIndex as number }
      : {}),
    ...(boundedText(candidate.reason as string | undefined, 64) === undefined
      ? {}
      : { reason: boundedText(candidate.reason as string | undefined, 64) }),
  };
}

function capabilitiesFor(
  context: ProviderContext,
  root: boolean,
  frameTraversal = false,
  rootFailure?: string,
): Readonly<Record<SurfaceOperation, SurfaceCapability>> {
  if (root) {
    const probeFailure =
      rootFailure === undefined
        ? undefined
        : capability("failed", "provider_probe_failed", rootFailure);
    return {
      discovery: capability("supported", "provider_window_enumerated"),
      selection: capability("supported", "provider_window_selectable"),
      observation:
        probeFailure ?? capability("supported", "provider_semantics_available"),
      interaction:
        probeFailure ?? capability("supported", "provider_actions_available"),
      screenshot:
        probeFailure ??
        capability("supported", "provider_screenshot_available"),
    };
  }
  if (context.reachable) {
    if (context.kind === "iframe" && !frameTraversal) {
      return {
        discovery: capability("supported", "provider_context_enumerated"),
        selection: capability("unavailable", "nested_frame_switch_unavailable"),
        observation: capability(
          "unavailable",
          "nested_frame_switch_unavailable",
        ),
        interaction: capability(
          "unavailable",
          "nested_frame_switch_unavailable",
        ),
        screenshot: capability(
          "unavailable",
          "nested_frame_switch_unavailable",
        ),
      };
    }
    return {
      discovery: capability("supported", "provider_context_enumerated"),
      selection: capability(
        context.kind === "iframe" ? "supported" : "unsupported",
        context.kind === "iframe"
          ? "provider_frame_selectable"
          : "nested_selection_unavailable",
      ),
      observation: capability("supported", "provider_context_reachable"),
      interaction: capability(
        context.kind === "iframe" ? "supported" : "supported",
        context.kind === "iframe"
          ? "provider_frame_actions_available"
          : "provider_nested_actions_available",
      ),
      screenshot: capability(
        "supported",
        context.kind === "iframe"
          ? "provider_frame_screenshot_available"
          : "provider_nested_screenshot_available",
      ),
    };
  }
  const reason = context.reason ?? "provider_context_unreachable";
  const state: SurfaceCapabilityState =
    reason === "cross_origin" || reason === "closed_root"
      ? "unsupported"
      : reason === "provider_probe_failed"
        ? "failed"
        : "unavailable";
  return {
    discovery: capability("supported", "provider_context_enumerated"),
    selection: capability(state, `nested_${reason}`, reason),
    observation: capability(state, `nested_${reason}`, reason),
    interaction: capability(state, `nested_${reason}`, reason),
    screenshot: capability(state, `nested_${reason}`, reason),
  };
}

export class SurfaceGraphManager {
  readonly #webdriver: SurfaceManagerOptions["webdriver"];
  readonly #sessionId: string;
  readonly #configuredWindow: string;
  readonly #platform: "windows" | "linux" | "unknown";
  readonly #now: () => Date;
  #generation = 0;
  #graph: SurfaceGraph | undefined;
  #internal = new Map<string, InternalSurface>();
  #activeRef: string | undefined;
  #frameActive = false;

  constructor(options: SurfaceManagerOptions) {
    if (!/^[a-f0-9]{32,64}$/u.test(options.sessionId)) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    if (
      options.configuredWindow.trim().length === 0 ||
      options.configuredWindow.length > MAX_LABEL_LENGTH
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    this.#webdriver = options.webdriver;
    this.#sessionId = options.sessionId;
    this.#configuredWindow = options.configuredWindow;
    this.#platform = options.platform ?? "unknown";
    this.#now = options.now ?? (() => new Date());
  }

  get graph(): SurfaceGraph | undefined {
    return this.#graph;
  }

  get activeSurfaceRef(): string | undefined {
    return this.#activeRef;
  }

  async discover(signal?: AbortSignal): Promise<SurfaceGraph> {
    signal?.throwIfAborted();
    if (
      this.#frameActive &&
      this.#webdriver.switchToParentFrame !== undefined
    ) {
      await this.#webdriver.switchToParentFrame(signal);
      this.#frameActive = false;
    }
    const handles = await this.#webdriver.windowHandles(signal);
    const boundedHandles = handles.slice(0, MAX_SURFACES);
    if (boundedHandles.length === 0) {
      throw new PumarejoError("SURFACE_UNAVAILABLE");
    }
    const windows: ProviderWindow[] = [];
    for (const handle of boundedHandles) {
      if (handle !== this.#configuredWindow) {
        windows.push({ handle });
        continue;
      }
      const [title, bounds] = await Promise.all([
        this.#webdriver.title(signal),
        this.#webdriver.windowRect(signal),
      ]);
      windows.push({
        handle,
        title: boundedText(title, MAX_LABEL_LENGTH),
        bounds: safeBounds(bounds),
      });
    }

    let contexts: ProviderContext[] = [];
    let rootProbeFailure: string | undefined;
    if (boundedHandles.includes(this.#configuredWindow)) {
      try {
        const value = await this.#webdriver.execute<unknown>(
          CONTEXT_DISCOVERY_SCRIPT,
          [],
          signal,
        );
        if (Array.isArray(value)) {
          contexts = value
            .slice(0, MAX_SURFACES - windows.length)
            .map(providerContext);
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        rootProbeFailure =
          error instanceof PumarejoError && error.code === "SESSION_NOT_ACTIVE"
            ? "session_inactive"
            : "provider_probe_failed";
        contexts = [
          {
            key: "provider-discovery",
            kind: "webview",
            reachable: false,
            reason:
              error instanceof PumarejoError &&
              error.code === "SESSION_NOT_ACTIVE"
                ? "session_inactive"
                : "provider_probe_failed",
          },
        ];
      }
    }

    this.#generation =
      this.#generation >= MAX_GRAPH_GENERATION ? 1 : this.#generation + 1;
    const graphGeneration = this.#generation;
    const internal = new Map<string, InternalSurface>();
    const records: SurfaceRecord[] = [];
    let activeRef = this.#activeRef;
    for (const [index, window] of windows.entries()) {
      const key = `window:${window.handle}`;
      const ref = `s${graphGeneration}-${hashIdentity(this.#sessionId, key)}`;
      const record: SurfaceRecord = {
        surfaceRef: ref,
        identity: hashIdentity(this.#sessionId, key),
        kind: "window",
        label:
          window.handle === this.#configuredWindow
            ? this.#configuredWindow
            : `window-${index + 1}`,
        ...(window.title === undefined ? {} : { title: window.title }),
        ...(window.bounds === undefined ? {} : { bounds: window.bounds }),
        lifecycle: "available",
        active: window.handle === this.#configuredWindow,
        capabilities: capabilitiesFor(
          { key, kind: "window", reachable: true },
          true,
          false,
          rootProbeFailure,
        ),
      };
      internal.set(ref, {
        ref,
        key,
        windowHandle: window.handle,
        context: { key, kind: "window", reachable: true },
      });
      records.push(record);
      if (window.handle === this.#configuredWindow) activeRef = ref;
    }
    const parentByKey = new Map<string, string>();
    for (const context of contexts) {
      const parentRef =
        context.parentKey === undefined
          ? activeRef
          : (parentByKey.get(context.parentKey) ?? activeRef);
      const key = `context:${context.key}`;
      const ref = `s${graphGeneration}-${hashIdentity(this.#sessionId, key)}`;
      const record: SurfaceRecord = {
        surfaceRef: ref,
        identity: hashIdentity(this.#sessionId, key),
        ...(parentRef === undefined ? {} : { parentRef }),
        kind: context.kind,
        label: context.label ?? `${context.kind}-${records.length + 1}`,
        ...(context.title === undefined ? {} : { title: context.title }),
        ...(context.bounds === undefined ? {} : { bounds: context.bounds }),
        lifecycle: context.reachable ? "available" : "unsupported",
        active: false,
        capabilities: capabilitiesFor(
          context,
          false,
          context.kind === "iframe" &&
            this.#webdriver.findElements !== undefined &&
            this.#webdriver.switchToFrame !== undefined &&
            this.#webdriver.switchToParentFrame !== undefined,
        ),
      };
      internal.set(ref, {
        ref,
        key,
        windowHandle: this.#configuredWindow,
        context,
        ...(parentRef === undefined ? {} : { parentRef }),
      });
      parentByKey.set(context.key, ref);
      records.push(record);
      if (records.length >= MAX_SURFACES) break;
    }
    if (
      activeRef === undefined ||
      !records.some((record) => record.surfaceRef === activeRef)
    ) {
      activeRef = records[0]?.surfaceRef;
    }
    if (activeRef === undefined) throw new PumarejoError("SURFACE_UNAVAILABLE");
    this.#internal = internal;
    this.#activeRef = activeRef;
    const activeRecord = records.find(
      (record) => record.surfaceRef === activeRef,
    );
    const normalized = records.map((record) => ({
      ...record,
      active: record.surfaceRef === activeRef,
    }));
    this.#graph = {
      sessionId: this.#sessionId,
      generation: graphGeneration,
      activeSurfaceRef: activeRef,
      surfaces: normalized,
      provider: { runtime: "webdriver", platform: this.#platform },
    };
    // Keep a read of the active record in this method so accidental graph
    // changes cannot silently discard the active surface metadata.
    void activeRecord;
    void this.#now;
    return this.#graph;
  }

  async select(
    surfaceRef: string,
    graphGeneration: number,
    signal?: AbortSignal,
  ): Promise<SurfaceSelection> {
    signal?.throwIfAborted();
    const graph = this.#graph;
    if (
      graph === undefined ||
      graphGeneration !== graph.generation ||
      surfaceRef.length === 0
    ) {
      throw new PumarejoError("STALE_SURFACE_REF");
    }
    const internal = this.#internal.get(surfaceRef);
    const selected = graph.surfaces.find(
      (surface) => surface.surfaceRef === surfaceRef,
    );
    if (internal === undefined || selected === undefined) {
      throw new PumarejoError("SURFACE_NOT_FOUND");
    }
    const capability = selected.capabilities.selection;
    if (capability.state !== "supported") {
      throw new PumarejoError(
        capability.state === "denied"
          ? "SURFACE_ACCESS_DENIED"
          : capability.state === "unavailable"
            ? "SURFACE_UNAVAILABLE"
            : "SURFACE_UNSUPPORTED",
      );
    }
    try {
      if (
        this.#frameActive &&
        this.#webdriver.switchToParentFrame !== undefined
      ) {
        await this.#webdriver.switchToParentFrame(signal);
        this.#frameActive = false;
      }
      await this.#webdriver.selectWindow(internal.windowHandle, signal);
      if (internal.context.kind === "iframe") {
        if (
          internal.context.frameIndex === undefined ||
          this.#webdriver.findElements === undefined ||
          this.#webdriver.switchToFrame === undefined
        ) {
          throw new PumarejoError("SURFACE_UNAVAILABLE");
        }
        const frames = await this.#webdriver.findElements("iframe", signal);
        const frame = frames[internal.context.frameIndex];
        if (frame === undefined) throw new PumarejoError("SURFACE_UNAVAILABLE");
        await this.#webdriver.switchToFrame(frame, signal);
        this.#frameActive = true;
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof PumarejoError) throw error;
      throw new PumarejoError("SURFACE_SELECTION_FAILED", { cause: error });
    }
    this.#activeRef = surfaceRef;
    const surfaces = graph.surfaces.map((surface) => ({
      ...surface,
      active: surface.surfaceRef === surfaceRef,
    }));
    this.#graph = {
      ...graph,
      activeSurfaceRef: surfaceRef,
      surfaces,
    };
    return {
      graph: this.#graph,
      selected: surfaces.find((item) => item.surfaceRef === surfaceRef)!,
    };
  }
}
