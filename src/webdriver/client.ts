import { setTimeout as delay } from "node:timers/promises";

import { TauriAgentError } from "../shared/errors.js";
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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]"]);
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ROUTE_LENGTH = 8_192;
const MAX_SELECTOR_LENGTH = 16_384;
const MAX_SCRIPT_LENGTH = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

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

export class WebDriverClient {
  readonly baseUrl: URL;
  readonly requestTimeoutMs: number;
  readonly nonce: string;
  readonly fetchImplementation: typeof globalThis.fetch;
  #sessionId: string | undefined;
  #sessionCreationPending = false;

  constructor(options: WebDriverClientOptions) {
    const host = (options.host ?? "127.0.0.1").trim().toLowerCase();
    if (
      !Number.isInteger(options.port) ||
      options.port < 1024 ||
      options.port > 65_535 ||
      !LOOPBACK_HOSTS.has(host)
    ) {
      throw new TauriAgentError("CONFIG_INVALID");
    }
    if (
      !/^[a-f0-9]{64}$/u.test(options.nonce) ||
      (options.requestTimeoutMs !== undefined &&
        (!Number.isInteger(options.requestTimeoutMs) ||
          options.requestTimeoutMs < 100 ||
          options.requestTimeoutMs > 120_000))
    ) {
      throw new TauriAgentError("CONFIG_INVALID");
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
      throw new TauriAgentError("INTERNAL_ERROR");
    }
    let response: Response;
    let body: unknown;
    try {
      response = await this.fetchImplementation(new URL(route, this.baseUrl), {
        method,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          "x-tauri-agent-session-nonce": this.nonce,
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
      throw new TauriAgentError("SESSION_NOT_ACTIVE");
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
      throw new TauriAgentError("CONFIG_INVALID");
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
      throw new TauriAgentError("SESSION_ALREADY_ACTIVE");
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
      throw new TauriAgentError("WINDOW_NOT_FOUND");
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
    let value: JsonObject | undefined;
    try {
      value = jsonObject(
        responseValue(
          await this.sessionCommand("GET", "/window/rect", undefined, signal),
        ),
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
      value = jsonObject(
        await this.execute(
          "return { x: window.screenX ?? 0, y: window.screenY ?? 0, width: window.innerWidth, height: window.innerHeight }",
          [],
          signal,
        ),
      );
    }
    const rect = {
      x: Number(value?.x),
      y: Number(value?.y),
      width: Number(value?.width),
      height: Number(value?.height),
    };
    if (
      !Object.values(rect).every(Number.isFinite) ||
      rect.width < 0 ||
      rect.height < 0
    ) {
      throw new TauriAgentError("INTERNAL_ERROR");
    }
    return rect;
  }

  async execute<T>(
    script: string,
    args: readonly unknown[] = [],
    signal?: AbortSignal,
  ): Promise<T> {
    if (script.length === 0 || script.length > MAX_SCRIPT_LENGTH) {
      throw new TauriAgentError("INTERNAL_ERROR");
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
      throw new TauriAgentError("ELEMENT_NOT_FOUND");
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
      throw new TauriAgentError("ELEMENT_NOT_FOUND");
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
      throw new TauriAgentError("ELEMENT_NOT_FOUND");
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
  ): Promise<readonly string[]> {
    const deadline = AbortSignal.timeout(this.requestTimeoutMs);
    const boundedSignal =
      signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
    const handles = [...(await this.findElements("*", boundedSignal))];
    if (handles.length > 10_000) {
      throw new TauriAgentError("INTERNAL_ERROR");
    }
    let scanned = 0;
    while (scanned < handles.length) {
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
        throw new TauriAgentError("INTERNAL_ERROR");
      }
      for (let index = 0; index < batch.length; index += 1) {
        if (shadowHosts[index] !== true) continue;
        const shadow = await this.shadowRoot(batch[index]!, boundedSignal);
        if (shadow === undefined) {
          throw new TauriAgentError("INTERNAL_ERROR");
        }
        handles.push(
          ...(await this.findElementsInShadow(shadow, "*", boundedSignal)),
        );
      }
      if (handles.length > 10_000) {
        throw new TauriAgentError("INTERNAL_ERROR");
      }
      scanned = end;
    }
    return handles;
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
        throw new TauriAgentError("ELEMENT_HIDDEN");
      }
      if (!(await this.elementBoolean(elementId, "enabled", signal))) {
        throw new TauriAgentError("ELEMENT_DISABLED");
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
      throw new TauriAgentError("ELEMENT_NOT_INTERACTABLE");
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

  async pressKey(value: string, signal?: AbortSignal): Promise<void> {
    if (value.length === 0 || value.length > 16) {
      throw new TauriAgentError("UNSUPPORTED_KEY");
    }
    try {
      await this.sessionCommand(
        "POST",
        "/actions",
        {
          actions: [
            {
              type: "key",
              id: "tauri-agent-keyboard",
              actions: [
                { type: "keyDown", value },
                { type: "keyUp", value },
              ],
            },
          ],
        },
        signal,
      );
    } catch (error) {
      throw normalizeWebDriverError(error);
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
