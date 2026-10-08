import { setTimeout as delay } from "node:timers/promises";

import { markPreDispatchFailure, PumarejoError } from "../shared/errors.js";
import { createWryCapabilities } from "./capabilities.js";
import {
  isInvalidSessionError,
  normalizeWebDriverError,
  WebDriverCancellationError,
  WebDriverTransportError,
} from "./errors.js";
import {
  elementIdFrom,
  jsonObject,
  responseValue,
  W3C_ELEMENT_KEY,
  W3C_SHADOW_KEY,
  type JsonObject,
  type WindowRect,
} from "./protocol.js";
import {
  deniedCapability,
  providerCapabilitiesFrom,
  providerDialogFrom,
  unsupportedCapability,
  unavailableCapability,
  type DialogDecision,
  type DialogDetection,
  type NativeDialogMetadata,
  type WindowCapabilities,
} from "./native-control.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]"]);
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ROUTE_LENGTH = 8_192;
const MAX_SELECTOR_LENGTH = 16_384;
const MAX_SCRIPT_LENGTH = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const ACTION_CLEANUP_TIMEOUT_MS = 250;

export interface WebDriverClientOptions {
  readonly port: number;
  readonly nonce: string;
  readonly host?: string;
  readonly requestTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface WaitForReadyOptions {
  readonly deadlineMs?: number;
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
}

export interface EffectiveWindowResult {
  readonly state: "maximized" | "restored";
  readonly rect: WindowRect;
}

export interface NativeDialogDecisionInput {
  readonly action: "accept" | "cancel";
  /** Provider-private dialog instance id. Never serialize this at MCP. */
  readonly instanceId: string;
}

function abortSignal(
  timeoutMs: number,
  signal: AbortSignal | undefined,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("WebDriver response exceeds the size limit.");
  }
  if (response.body === null) {
    return {};
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("WebDriver response exceeds the size limit.");
    }
    chunks.push(value);
  }
  if (length === 0) return {};
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function requireString(value: unknown, description: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Provider returned no ${description}.`);
  }
  return value;
}

function windowRectFrom(value: unknown): WindowRect | undefined {
  const object = jsonObject(value);
  const rect = {
    x: Number(object?.x),
    y: Number(object?.y),
    width: Number(object?.width),
    height: Number(object?.height),
  };
  return Object.values(rect).every(Number.isFinite) &&
    rect.width >= 0 &&
    rect.height >= 0
    ? rect
    : undefined;
}

export class WebDriverClient {
  readonly baseUrl: URL;
  readonly requestTimeoutMs: number;
  readonly nonce: string;
  readonly fetchImplementation: typeof globalThis.fetch;
  #sessionId: string | undefined;
  #sessionCreationPending = false;
  #restoreRect: WindowRect | undefined;
  #windowState: "maximized" | "restored" = "restored";
  #windowCapabilities: WindowCapabilities | undefined;

  constructor(options: WebDriverClientOptions) {
    const host = (options.host ?? "127.0.0.1").trim().toLowerCase();
    if (
      !Number.isInteger(options.port) ||
      options.port < 1024 ||
      options.port > 65_535 ||
      !LOOPBACK_HOSTS.has(host)
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    if (
      !/^[a-f0-9]{64}$/u.test(options.nonce) ||
      (options.requestTimeoutMs !== undefined &&
        (!Number.isInteger(options.requestTimeoutMs) ||
          options.requestTimeoutMs < 100 ||
          options.requestTimeoutMs > 120_000))
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    const normalizedHost = host === "::1" ? "[::1]" : host;
    this.baseUrl = new URL(`http://${normalizedHost}:${options.port}`);
    this.nonce = options.nonce;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
  }

  get sessionId(): string | undefined {
    return this.#sessionId;
  }

  get windowCapabilities(): WindowCapabilities | undefined {
    return this.#windowCapabilities;
  }

  private async request(
    method: string,
    route: string,
    payload?: unknown,
    signal?: AbortSignal,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<JsonObject> {
    if (
      route.length > MAX_ROUTE_LENGTH ||
      !route.startsWith("/") ||
      new URL(route, this.baseUrl).origin !== this.baseUrl.origin
    ) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    let response: Response;
    let body: unknown;
    try {
      response = await this.fetchImplementation(new URL(route, this.baseUrl), {
        method,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          "x-pumarejo-session-nonce": this.nonce,
        },
        redirect: "error",
        signal: abortSignal(timeoutMs, signal),
      });
      body = await boundedJson(response);
    } catch (error) {
      if (signal?.aborted) {
        throw new WebDriverCancellationError(signal.reason);
      }
      throw error;
    }
    if (!response.ok) {
      throw new WebDriverTransportError(response.status, body);
    }
    return jsonObject(body) ?? {};
  }

  private async sessionCommand(
    method: string,
    route: string,
    payload?: unknown,
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    if (this.#sessionId === undefined) {
      throw new PumarejoError("SESSION_NOT_ACTIVE");
    }
    return await this.request(
      method,
      `/session/${encodeURIComponent(this.#sessionId)}${route}`,
      payload,
      signal,
    );
  }

  async waitUntilReady(options: WaitForReadyOptions = {}): Promise<void> {
    const deadlineMs = options.deadlineMs ?? 15_000;
    const intervalMs = options.intervalMs ?? 100;
    if (
      !Number.isInteger(deadlineMs) ||
      deadlineMs < 100 ||
      deadlineMs > 600_000 ||
      !Number.isInteger(intervalMs) ||
      intervalMs < 10 ||
      intervalMs > deadlineMs
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    const deadline = Date.now() + deadlineMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      options.signal?.throwIfAborted();
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const body = await this.request(
          "GET",
          "/status",
          undefined,
          options.signal,
          Math.min(this.requestTimeoutMs, remaining),
        );
        const value = jsonObject(responseValue(body));
        if (value?.ready === true) return;
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        lastError = error;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        await delay(Math.min(intervalMs, remaining), undefined, {
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        throw error;
      }
    }
    throw normalizeWebDriverError(lastError, "WEBDRIVER_NOT_READY");
  }

  async createSession(signal?: AbortSignal): Promise<void> {
    if (this.#sessionId !== undefined || this.#sessionCreationPending) {
      throw new PumarejoError("SESSION_ALREADY_ACTIVE");
    }
    this.#sessionCreationPending = true;
    try {
      const body = await this.request(
        "POST",
        "/session",
        createWryCapabilities(),
        signal,
      );
      const value = jsonObject(responseValue(body));
      const sessionId = [body.sessionId, value?.sessionId].find(
        (candidate) =>
          typeof candidate === "string" &&
          candidate.length > 0 &&
          candidate.length <= 4_096,
      );
      if (typeof sessionId !== "string") {
        await this.request("DELETE", "/session").catch(() => undefined);
        throw new Error("Provider returned no valid session id.");
      }
      this.#sessionId = sessionId;
    } catch (error) {
      throw normalizeWebDriverError(error, "SESSION_CREATE_FAILED");
    } finally {
      this.#sessionCreationPending = false;
    }
  }

  async deleteSession(signal?: AbortSignal): Promise<void> {
    if (this.#sessionId === undefined) return;
    try {
      await this.sessionCommand("DELETE", "", undefined, signal);
      this.#sessionId = undefined;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const normalized = normalizeWebDriverError(error, "SESSION_NOT_ACTIVE");
      if (isInvalidSessionError(error)) {
        this.#sessionId = undefined;
      }
      throw normalized;
    }
  }

  async windowHandles(signal?: AbortSignal): Promise<readonly string[]> {
    try {
      const value = responseValue(
        await this.sessionCommand("GET", "/window/handles", undefined, signal),
      );
      if (
        !Array.isArray(value) ||
        !value.every(
          (handle) => typeof handle === "string" && handle.length > 0,
        )
      ) {
        throw new Error("invalid window handles");
      }
      return value;
    } catch (error) {
      throw normalizeWebDriverError(error, "WINDOW_NOT_FOUND");
    }
  }

  async selectWindow(label: string, signal?: AbortSignal): Promise<void> {
    const handles = await this.windowHandles(signal);
    const handle = handles.find((candidate) => candidate === label);
    if (handle === undefined) {
      throw new PumarejoError("WINDOW_NOT_FOUND");
    }
    if (handles.length === 1) {
      return;
    }
    try {
      await this.sessionCommand("POST", "/window", { handle }, signal);
    } catch (error) {
      throw normalizeWebDriverError(error, "WINDOW_NOT_FOUND");
    }
  }

  async switchToFrame(elementId: string, signal?: AbortSignal): Promise<void> {
    if (elementId.length === 0 || elementId.length > 4_096) {
      throw new PumarejoError("SURFACE_NOT_FOUND");
    }
    try {
      await this.sessionCommand(
        "POST",
        "/frame",
        { id: { [W3C_ELEMENT_KEY]: elementId } },
        signal,
      );
    } catch (error) {
      throw normalizeWebDriverError(error, "SURFACE_SELECTION_FAILED");
    }
  }

  async switchToParentFrame(signal?: AbortSignal): Promise<void> {
    try {
      await this.sessionCommand("POST", "/frame/parent", {}, signal);
    } catch (error) {
      throw normalizeWebDriverError(error, "SURFACE_SELECTION_FAILED");
    }
  }

  async title(signal?: AbortSignal): Promise<string> {
    try {
      const value = responseValue(
        await this.sessionCommand("GET", "/title", undefined, signal),
      );
      if (typeof value !== "string") {
        throw new Error("Provider returned no window title.");
      }
      return value;
    } catch (error) {
      throw normalizeWebDriverError(error, "WINDOW_NOT_FOUND");
    }
  }

  async windowRect(signal?: AbortSignal): Promise<WindowRect> {
    let value: unknown;
    try {
      value = responseValue(
        await this.sessionCommand("GET", "/window/rect", undefined, signal),
      );
    } catch (error) {
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      if (providerError !== "unknown command") {
        throw normalizeWebDriverError(error);
      }
      value = await this.execute(
        "return { x: window.screenX ?? 0, y: window.screenY ?? 0, width: window.innerWidth, height: window.innerHeight }",
        [],
        signal,
      );
    }
    const rect = windowRectFrom(value);
    if (rect === undefined) throw new PumarejoError("INTERNAL_ERROR");
    return rect;
  }

  /**
   * Probe the dedicated provider capability boundary without dispatching an
   * action. A provider that does not expose the boundary is unavailable for
   * capability projection; callers must not infer support from the static MCP
   * tool list.
   */
  async probeWindowCapabilities(
    signal?: AbortSignal,
  ): Promise<WindowCapabilities> {
    try {
      const body = await this.sessionCommand(
        "GET",
        "/pumarejo/window-capabilities",
        undefined,
        signal,
      );
      this.#windowCapabilities = providerCapabilitiesFrom(responseValue(body));
      return this.#windowCapabilities;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      const evidence =
        providerError === "unknown command"
          ? unsupportedCapability("provider_capability_unsupported")
          : String(providerError).toLowerCase().includes("denied") ||
              String(providerError).toLowerCase().includes("unauthorized")
            ? deniedCapability("provider_capability_denied")
            : unavailableCapability("provider_capability_probe_unavailable");
      this.#windowCapabilities = {
        resize: evidence,
        maximize: evidence,
        restore: evidence,
        initialSize: evidence,
      };
      return this.#windowCapabilities;
    }
  }

  /**
   * Read only the purpose-built Tauri dialog boundary. WebDriver alert
   * endpoints are intentionally not used here: they describe browser alerts,
   * not a proved Tauri dialog integration.
   */
  async detectNativeDialog(signal?: AbortSignal): Promise<
    DialogDetection & {
      readonly providerDialog?: NativeDialogMetadata;
      readonly pending?: boolean;
    }
  > {
    try {
      const body = await this.sessionCommand(
        "GET",
        "/pumarejo/tauri-dialog",
        undefined,
        signal,
      );
      const parsed = providerDialogFrom(responseValue(body));
      if (parsed.contradictory) {
        return {
          state: "failed",
          code: "provider_dialog_invalid_response",
        };
      }
      if (!parsed.supported) {
        return {
          state: "unsupported",
          code: parsed.code,
          ...(parsed.evidence === undefined
            ? {}
            : { evidence: parsed.evidence }),
        };
      }
      if (parsed.pending === false) {
        return {
          state: "unavailable",
          code: "provider_dialog_absent",
          pending: false,
          ...(parsed.evidence === undefined
            ? {}
            : { evidence: parsed.evidence }),
        };
      }
      if (parsed.dialog === undefined) {
        return { state: "failed", code: "provider_dialog_invalid_metadata" };
      }
      return {
        state: "supported",
        code: parsed.code,
        providerDialog: parsed.dialog,
        pending: true,
        dialog: {
          title: parsed.dialog.title,
          message: parsed.dialog.message,
          buttons: parsed.dialog.buttons,
        },
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      const providerErrorText = String(providerError).toLowerCase();
      if (providerErrorText === "no such alert") {
        return {
          state: "unavailable",
          code: "provider_dialog_absent",
          pending: false,
        };
      }
      const unsupported = providerError === "unknown command";
      const denied =
        providerErrorText.includes("denied") ||
        providerErrorText.includes("unauthorized");
      return {
        state: unsupported ? "unsupported" : denied ? "denied" : "unavailable",
        code: unsupported
          ? "provider_dialog_boundary_unsupported"
          : denied
            ? "provider_dialog_denied"
            : "provider_dialog_unavailable",
      };
    }
  }

  async decideNativeDialog(
    input: NativeDialogDecisionInput,
    signal?: AbortSignal,
  ): Promise<DialogDecision> {
    if (
      input.instanceId.length === 0 ||
      input.instanceId.length > 256 ||
      !/^[\u0021-\u007E]+$/u.test(input.instanceId)
    ) {
      return {
        state: "denied",
        code: "provider_dialog_instance_invalid",
        action: input.action,
      };
    }
    try {
      const body = await this.sessionCommand(
        "POST",
        "/pumarejo/tauri-dialog/decision",
        { action: input.action, instanceId: input.instanceId },
        signal,
      );
      const value = jsonObject(responseValue(body));
      if (value?.resolved !== true) {
        return {
          state: "failed",
          code: "provider_dialog_postcondition_failed",
          action: input.action,
        };
      }
      return {
        state: "supported",
        code: "provider_dialog_decided",
        action: input.action,
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const providerError = String(
        jsonObject(
          jsonObject(
            error instanceof WebDriverTransportError ? error.body : undefined,
          )?.value,
        )?.error ?? "",
      ).toLowerCase();
      return {
        state:
          providerError === "unknown command"
            ? "unsupported"
            : providerError.includes("denied") ||
                providerError.includes("unauthorized")
              ? "denied"
              : "unavailable",
        code:
          providerError === "unknown command"
            ? "provider_dialog_decision_unsupported"
            : providerError.includes("denied") ||
                providerError.includes("unauthorized")
              ? "provider_dialog_decision_denied"
              : "provider_dialog_decision_unavailable",
        action: input.action,
      };
    }
  }

  async execute<T>(
    script: string,
    args: readonly unknown[] = [],
    signal?: AbortSignal,
  ): Promise<T> {
    if (script.length === 0 || script.length > MAX_SCRIPT_LENGTH) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    try {
      const body = await this.sessionCommand(
        "POST",
        "/execute/sync",
        { script, args },
        signal,
      );
      return responseValue(body) as T;
    } catch (error) {
      throw normalizeWebDriverError(error, "INTERNAL_ERROR");
    }
  }

  async findElement(selector: string, signal?: AbortSignal): Promise<string> {
    if (selector.length === 0 || selector.length > MAX_SELECTOR_LENGTH) {
      throw new PumarejoError("ELEMENT_NOT_FOUND");
    }
    try {
      const body = await this.sessionCommand(
        "POST",
        "/element",
        { using: "css selector", value: selector },
        signal,
      );
      const id = elementIdFrom(responseValue(body));
      if (id === undefined) throw new Error("invalid element");
      return id;
    } catch (error) {
      throw normalizeWebDriverError(error, "ELEMENT_NOT_FOUND");
    }
  }

  async findElements(
    selector: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    if (selector.length === 0 || selector.length > MAX_SELECTOR_LENGTH) {
      throw new PumarejoError("ELEMENT_NOT_FOUND");
    }
    try {
      const value = responseValue(
        await this.sessionCommand(
          "POST",
          "/elements",
          { using: "css selector", value: selector },
          signal,
        ),
      );
      if (!Array.isArray(value)) throw new Error("invalid elements");
      const elements = value.map(elementIdFrom);
      if (elements.some((element) => element === undefined)) {
        throw new Error("invalid element");
      }
      return elements as string[];
    } catch (error) {
      throw normalizeWebDriverError(error, "ELEMENT_NOT_FOUND");
    }
  }

  async shadowRoot(
    elementId: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const value = jsonObject(
        responseValue(
          await this.sessionCommand(
            "GET",
            `/element/${encodeURIComponent(elementId)}/shadow`,
            undefined,
            signal,
          ),
        ),
      );
      const shadow = value?.[W3C_SHADOW_KEY];
      if (typeof shadow !== "string" || shadow.length === 0) {
        throw new Error("invalid shadow root");
      }
      return shadow;
    } catch (error) {
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      if (providerError === "no such shadow root") return undefined;
      throw normalizeWebDriverError(error, "ELEMENT_NOT_FOUND");
    }
  }

  async findElementsInShadow(
    shadowId: string,
    selector: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    if (selector.length === 0 || selector.length > MAX_SELECTOR_LENGTH) {
      throw new PumarejoError("ELEMENT_NOT_FOUND");
    }
    try {
      const value = responseValue(
        await this.sessionCommand(
          "POST",
          `/shadow/${encodeURIComponent(shadowId)}/elements`,
          { using: "css selector", value: selector },
          signal,
        ),
      );
      if (!Array.isArray(value)) throw new Error("invalid shadow elements");
      const elements = value.map(elementIdFrom);
      if (elements.some((element) => element === undefined)) {
        throw new Error("invalid shadow element");
      }
      return elements as string[];
    } catch (error) {
      throw normalizeWebDriverError(error, "ELEMENT_NOT_FOUND");
    }
  }

  async snapshotElementHandles(
    signal?: AbortSignal,
    maximumIndex?: number,
  ): Promise<readonly string[]> {
    if (
      maximumIndex !== undefined &&
      (!Number.isInteger(maximumIndex) ||
        maximumIndex < 0 ||
        maximumIndex >= 10_000)
    ) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    const deadline = AbortSignal.timeout(this.requestTimeoutMs);
    const boundedSignal =
      signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
    const handles = [...(await this.findElements("*", boundedSignal))];
    if (maximumIndex !== undefined && handles.length > maximumIndex) {
      return handles.slice(0, maximumIndex + 1);
    }
    if (handles.length > 10_000) {
      throw new PumarejoError("INTERNAL_ERROR");
    }
    let scanned = 0;
    while (
      scanned < handles.length &&
      (maximumIndex === undefined || handles.length <= maximumIndex)
    ) {
      boundedSignal.throwIfAborted();
      const end = handles.length;
      const batch = handles.slice(scanned, end);
      const shadowHosts = await this.execute<unknown>(
        "return arguments[0].map((element) => Boolean(element && element.shadowRoot))",
        [
          batch.map((elementId) => ({
            [W3C_ELEMENT_KEY]: elementId,
          })),
        ],
        boundedSignal,
      );
      if (
        !Array.isArray(shadowHosts) ||
        shadowHosts.length !== batch.length ||
        shadowHosts.some((value) => typeof value !== "boolean")
      ) {
        throw new PumarejoError("INTERNAL_ERROR");
      }
      for (let index = 0; index < batch.length; index += 1) {
        if (shadowHosts[index] !== true) continue;
        const shadow = await this.shadowRoot(batch[index]!, boundedSignal);
        if (shadow === undefined) {
          throw new PumarejoError("INTERNAL_ERROR");
        }
        handles.push(
          ...(await this.findElementsInShadow(shadow, "*", boundedSignal)),
        );
      }
      if (handles.length > 10_000) {
        throw new PumarejoError("INTERNAL_ERROR");
      }
      scanned = end;
    }
    return maximumIndex === undefined
      ? handles
      : handles.slice(0, maximumIndex + 1);
  }

  private async elementBoolean(
    elementId: string,
    command: "displayed" | "enabled",
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const body = await this.sessionCommand(
        "GET",
        `/element/${encodeURIComponent(elementId)}/${command}`,
        undefined,
        signal,
      );
      return responseValue(body) === true;
    } catch (error) {
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      if (providerError !== "unknown command") throw error;
      const script =
        command === "displayed"
          ? "const e=arguments[0],s=getComputedStyle(e),r=e.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0"
          : "const e=arguments[0]; return !e.disabled&&e.getAttribute('aria-disabled')!=='true'";
      return await this.execute<boolean>(
        script,
        [{ [W3C_ELEMENT_KEY]: elementId }],
        signal,
      );
    }
  }

  async click(elementId: string, signal?: AbortSignal): Promise<void> {
    try {
      if (!(await this.elementBoolean(elementId, "displayed", signal))) {
        throw new PumarejoError("ELEMENT_HIDDEN");
      }
      if (!(await this.elementBoolean(elementId, "enabled", signal))) {
        throw new PumarejoError("ELEMENT_DISABLED");
      }
      await this.sessionCommand(
        "POST",
        `/element/${encodeURIComponent(elementId)}/click`,
        {},
        signal,
      );
    } catch (error) {
      throw normalizeWebDriverError(error);
    }
  }

  async clear(elementId: string, signal?: AbortSignal): Promise<void> {
    try {
      await this.sessionCommand(
        "POST",
        `/element/${encodeURIComponent(elementId)}/clear`,
        {},
        signal,
      );
    } catch (error) {
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      if (providerError === "unknown command") {
        await this.execute(
          "const e=arguments[0]; if ('value' in e) e.value=''; else e.textContent=''; e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',data:null})); e.dispatchEvent(new Event('change',{bubbles:true}));",
          [{ [W3C_ELEMENT_KEY]: elementId }],
          signal,
        );
        return;
      }
      throw normalizeWebDriverError(error);
    }
  }

  async type(
    elementId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (text.length > MAX_SCRIPT_LENGTH) {
      throw new PumarejoError("ELEMENT_NOT_INTERACTABLE");
    }
    try {
      await this.sessionCommand(
        "POST",
        `/element/${encodeURIComponent(elementId)}/value`,
        { text, value: [...text] },
        signal,
      );
    } catch (error) {
      throw normalizeWebDriverError(error);
    }
  }

  private async performActions(
    actions: readonly JsonObject[],
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.sessionCommand(
        "POST",
        "/actions",
        {
          actions,
        },
        signal,
      );
    } catch (error) {
      throw normalizeWebDriverError(error, "UNSUPPORTED_ACTION");
    } finally {
      await this.sessionCommand(
        "DELETE",
        "/actions",
        undefined,
        AbortSignal.timeout(ACTION_CLEANUP_TIMEOUT_MS),
      ).catch(() => undefined);
    }
  }

  async pressKey(
    value: string,
    modifiers: readonly string[] = [],
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      value.length === 0 ||
      value.length > 16 ||
      modifiers.length > 4 ||
      modifiers.some(
        (modifier) => modifier.length === 0 || modifier.length > 16,
      )
    ) {
      throw new PumarejoError("UNSUPPORTED_KEY");
    }
    await this.performActions(
      [
        {
          type: "key",
          id: "pumarejo-keyboard",
          actions: [
            ...modifiers.map((modifier) => ({
              type: "keyDown",
              value: modifier,
            })),
            { type: "keyDown", value },
            { type: "keyUp", value },
            ...[...modifiers].reverse().map((modifier) => ({
              type: "keyUp",
              value: modifier,
            })),
          ],
        },
      ],
      signal,
    );
  }

  async pointer(
    action: "hover" | "double_click" | "context_menu",
    elementId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const move = {
      type: "pointerMove",
      duration: 0,
      origin: { [W3C_ELEMENT_KEY]: elementId },
      x: 0,
      y: 0,
    };
    const click = (button: number) => [
      { type: "pointerDown", button },
      { type: "pointerUp", button },
    ];
    let actions: readonly JsonObject[];
    switch (action) {
      case "hover":
        actions = [move];
        break;
      case "double_click":
        actions = [move, ...click(0), ...click(0)];
        break;
      case "context_menu":
        actions = [move, ...click(2)];
        break;
    }
    await this.performActions(
      [
        {
          type: "pointer",
          id: "pumarejo-pointer",
          parameters: { pointerType: "mouse" },
          actions,
        },
      ],
      signal,
    );
  }

  async scroll(
    elementId: string,
    deltaX: number,
    deltaY: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.performActions(
      [
        {
          type: "wheel",
          id: "pumarejo-wheel",
          actions: [
            {
              type: "scroll",
              duration: 0,
              origin: { [W3C_ELEMENT_KEY]: elementId },
              x: 0,
              y: 0,
              deltaX,
              deltaY,
            },
          ],
        },
      ],
      signal,
    );
  }

  async selectOption(
    elementId: string,
    signal?: AbortSignal,
    match?: { readonly value?: string; readonly label?: string },
  ): Promise<void> {
    // With a match, arguments[0] is the <select> and the option is chosen by
    // exact value or label; otherwise arguments[0] is the exact <option>.
    // Selection then fires input and change like a user pick, so framework
    // listeners (React onChange) observe it.
    const result = await this.execute<string>(
      "const target=arguments[0],match=arguments[1]; let option=target; if(match){ if(!(target instanceof HTMLSelectElement))return 'unsupported'; const all=Array.from(target.options); option=match.value!==undefined?all.find(o=>o.value===match.value):all.find(o=>(o.label||o.text).trim()===match.label.trim()); if(!option)return 'missing'; } if(!(option instanceof HTMLOptionElement))return 'unsupported'; const parent=option.parentElement,select=parent instanceof HTMLSelectElement?parent:parent instanceof HTMLOptGroupElement&&parent.parentElement instanceof HTMLSelectElement?parent.parentElement:null; if(!select)return 'unsupported'; const style=getComputedStyle(select),rect=select.getBoundingClientRect(); if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||rect.width<=0||rect.height<=0)return 'hidden'; if(option.disabled||select.disabled||option.closest('optgroup')?.disabled)return 'disabled'; option.selected=true; select.dispatchEvent(new Event('input',{bubbles:true})); select.dispatchEvent(new Event('change',{bubbles:true})); return 'selected';",
      [{ [W3C_ELEMENT_KEY]: elementId }, match ?? null],
      signal,
    );
    if (result === "missing") throw new PumarejoError("ELEMENT_NOT_FOUND");
    if (result === "selected") return;
    if (result === "hidden") throw new PumarejoError("ELEMENT_HIDDEN");
    if (result === "disabled") throw new PumarejoError("ELEMENT_DISABLED");
    throw new PumarejoError("UNSUPPORTED_ACTION");
  }

  async windowAction(
    input:
      | { readonly action: "maximize" | "restore" }
      | {
          readonly action: "resize";
          readonly width: number;
          readonly height: number;
        },
    signal?: AbortSignal,
  ): Promise<EffectiveWindowResult> {
    const capability = this.#windowCapabilities?.[input.action];
    if (capability !== undefined && capability.state !== "supported") {
      const code = {
        unsupported: "WINDOW_ACTION_UNSUPPORTED",
        denied: "WINDOW_ACTION_DENIED",
        unavailable: "WINDOW_ACTION_UNAVAILABLE",
        failed: "WINDOW_ACTION_FAILED",
      } as const;
      const error = new PumarejoError(code[capability.state]);
      markPreDispatchFailure(error);
      throw error;
    }
    try {
      if (input.action === "maximize") {
        if (this.#windowState === "maximized") {
          return { state: "maximized", rect: await this.windowRect(signal) };
        }
        this.#restoreRect = await this.windowRect(signal);
        const response = await this.sessionCommand(
          "POST",
          "/window/maximize",
          {},
          signal,
        );
        const verified = await this.windowRect(signal);
        this.#windowState = "maximized";
        return {
          state: "maximized",
          rect: verified,
        };
      }
      if (input.action === "restore") {
        // Native recovery must not wait for JavaScript in a suspended WebView.
        const rect = windowRectFrom(
          responseValue(
            await this.sessionCommand(
              "POST",
              "/pumarejo/window/restore",
              {},
              signal,
            ),
          ),
        );
        if (rect === undefined || rect.width <= 0 || rect.height <= 0) {
          throw new PumarejoError("WINDOW_ACTION_POSTCONDITION_FAILED");
        }
        this.#restoreRect = rect;
        this.#windowState = "restored";
        return { state: "restored", rect };
      }
      const target =
        input.action === "resize"
          ? { width: input.width, height: input.height }
          : this.#restoreRect;
      if (target === undefined) {
        throw new PumarejoError("WINDOW_ACTION_UNAVAILABLE");
      }
      const response = await this.sessionCommand(
        "POST",
        "/window/rect",
        target,
        signal,
      );
      const rect = await this.windowRect(signal);
      if (
        input.action === "resize" &&
        (rect.width !== input.width || rect.height !== input.height)
      ) {
        throw new PumarejoError("WINDOW_ACTION_POSTCONDITION_FAILED");
      }
      if (input.action === "resize") this.#restoreRect = rect;
      this.#windowState = "restored";
      return { state: "restored", rect };
    } catch (error) {
      const providerError = jsonObject(
        jsonObject(
          error instanceof WebDriverTransportError ? error.body : undefined,
        )?.value,
      )?.error;
      if (providerError === "unknown command" && input.action === "restore") {
        throw new PumarejoError("WINDOW_ACTION_UNAVAILABLE", { cause: error });
      }
      if (providerError === "unknown command") {
        const target =
          input.action === "resize"
            ? { width: input.width, height: input.height }
            : input.action === "restore"
              ? this.#restoreRect
              : undefined;
        const currentRect =
          target === undefined ? undefined : await this.windowRect(signal);
        const viewport =
          target === undefined
            ? undefined
            : await this.execute<{
                readonly width: number;
                readonly height: number;
              }>(
                "return {width:globalThis.innerWidth,height:globalThis.innerHeight}",
                [],
                signal,
              );
        const clientTarget =
          target === undefined
            ? undefined
            : {
                width: Math.max(
                  1,
                  target.width -
                    Math.max(
                      0,
                      (currentRect?.width ?? target.width) -
                        (viewport?.width ?? currentRect?.width ?? target.width),
                    ),
                ),
                height: Math.max(
                  1,
                  target.height -
                    Math.max(
                      0,
                      (currentRect?.height ?? target.height) -
                        (viewport?.height ??
                          currentRect?.height ??
                          target.height),
                    ),
                ),
              };
        const invoked = await this.execute<boolean>(
          "const action=arguments[0],width=arguments[1],height=arguments[2],tauri=globalThis.__TAURI__,api=tauri?.window,LogicalSize=tauri?.dpi?.LogicalSize,current=api?.getCurrentWindow?.(); if(!current)return false; if(action==='maximize')return current.maximize().then(()=>current.isMaximized()).catch(()=>false); if(action==='restore')return current.unmaximize().then(()=>Number.isFinite(width)&&Number.isFinite(height)&&LogicalSize?current.setSize(new LogicalSize(width,height)):undefined).then(()=>true).catch(()=>false); if(action==='resize'&&Number.isFinite(width)&&Number.isFinite(height)&&LogicalSize)return current.setSize(new LogicalSize(width,height)).then(()=>true).catch(()=>false); return false;",
          [input.action, clientTarget?.width, clientTarget?.height],
          signal,
        );
        if (!invoked) {
          throw new PumarejoError(
            capability === undefined
              ? "WINDOW_ACTION_UNSUPPORTED"
              : "WINDOW_ACTION_FAILED",
          );
        }
        const deadline = Date.now() + 3_000;
        let rect = await this.windowRect(signal);
        while (
          Date.now() < deadline &&
          target !== undefined &&
          (rect.width !== target.width || rect.height !== target.height)
        ) {
          await delay(25, undefined, { signal });
          rect = await this.windowRect(signal);
        }
        if (
          target !== undefined &&
          (rect.width !== target.width || rect.height !== target.height)
        ) {
          throw new PumarejoError("WINDOW_ACTION_POSTCONDITION_FAILED");
        }
        if (input.action === "resize") this.#restoreRect = rect;
        this.#windowState =
          input.action === "maximize" ? "maximized" : "restored";
        return { state: this.#windowState, rect };
      }
      throw normalizeWebDriverError(error, "WINDOW_ACTION_FAILED");
    }
  }

  async screenshot(signal?: AbortSignal): Promise<string> {
    try {
      const encoded = requireString(
        responseValue(
          await this.sessionCommand("GET", "/screenshot", undefined, signal),
        ),
        "screenshot",
      );
      const png = Buffer.from(encoded, "base64");
      if (
        png.length <= PNG_SIGNATURE.length ||
        !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      ) {
        throw new Error("provider returned a non-PNG screenshot");
      }
      return encoded;
    } catch (error) {
      throw normalizeWebDriverError(error, "SCREENSHOT_FAILED");
    }
  }
}
