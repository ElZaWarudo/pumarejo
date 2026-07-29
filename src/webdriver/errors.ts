import { PumarejoError } from "../shared/errors.js";
import { jsonObject } from "./protocol.js";

type WebDriverFallbackCode =
  | "WEBDRIVER_NOT_READY"
  | "SESSION_CREATE_FAILED"
  | "SESSION_NOT_ACTIVE"
  | "WINDOW_NOT_FOUND"
  | "ELEMENT_NOT_FOUND"
  | "ELEMENT_NOT_INTERACTABLE"
  | "UNSUPPORTED_ACTION"
  | "SCREENSHOT_FAILED"
  | "INTERNAL_ERROR";

function providerErrorCode(
  providerCode: string,
  fallback: WebDriverFallbackCode,
) {
  if (providerCode.includes("stale element")) return "STALE_ELEMENT_REF";
  if (providerCode.includes("no such element")) return "ELEMENT_NOT_FOUND";
  if (
    providerCode.includes("not interactable") ||
    providerCode.includes("click intercepted")
  ) {
    return "ELEMENT_NOT_INTERACTABLE";
  }
  if (providerCode.includes("invalid session")) return "SESSION_NOT_ACTIVE";
  if (providerCode.includes("no such window")) return "WINDOW_NOT_FOUND";
  if (
    providerCode.includes("unknown command") ||
    providerCode.includes("unsupported operation")
  ) {
    return "UNSUPPORTED_ACTION";
  }
  return fallback;
}

export class WebDriverTransportError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    options?: ErrorOptions,
  ) {
    super(`WebDriver request failed (${status}).`, options);
    this.name = "WebDriverTransportError";
  }
}

export class WebDriverCancellationError extends Error {
  constructor(readonly reason: unknown) {
    super("WebDriver request was cancelled.");
    this.name = "WebDriverCancellationError";
  }
}

export function isInvalidSessionError(error: unknown): boolean {
  if (!(error instanceof WebDriverTransportError)) return false;
  const value = jsonObject(jsonObject(error.body)?.value);
  return String(value?.error ?? "")
    .toLowerCase()
    .includes("invalid session");
}

export function normalizeWebDriverError(
  error: unknown,
  fallback: WebDriverFallbackCode = "ELEMENT_NOT_INTERACTABLE",
): Error {
  if (error instanceof WebDriverCancellationError) {
    return error.reason instanceof Error
      ? error.reason
      : new DOMException("The operation was aborted.", "AbortError");
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return error;
  }
  if (error instanceof PumarejoError) {
    return error;
  }
  if (error instanceof WebDriverTransportError) {
    const value = jsonObject(jsonObject(error.body)?.value);
    const providerCode = String(value?.error ?? "").toLowerCase();
    const code = providerErrorCode(providerCode, fallback);
    return new PumarejoError(code, { cause: error });
  }
  return new PumarejoError(fallback, { cause: error });
}
