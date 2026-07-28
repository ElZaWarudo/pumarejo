import { PumarejoError } from "../shared/errors.js";
import { jsonObject } from "./protocol.js";

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
  fallback:
    | "WEBDRIVER_NOT_READY"
    | "SESSION_CREATE_FAILED"
    | "SESSION_NOT_ACTIVE"
    | "WINDOW_NOT_FOUND"
    | "ELEMENT_NOT_FOUND"
    | "ELEMENT_NOT_INTERACTABLE"
    | "SCREENSHOT_FAILED"
    | "INTERNAL_ERROR" = "ELEMENT_NOT_INTERACTABLE",
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
    const code = providerCode.includes("stale element")
      ? "STALE_ELEMENT_REF"
      : providerCode.includes("no such element")
        ? "ELEMENT_NOT_FOUND"
        : providerCode.includes("not interactable") ||
            providerCode.includes("click intercepted")
          ? "ELEMENT_NOT_INTERACTABLE"
          : providerCode.includes("invalid session")
            ? "SESSION_NOT_ACTIVE"
            : providerCode.includes("no such window")
              ? "WINDOW_NOT_FOUND"
              : fallback;
    return new PumarejoError(code, { cause: error });
  }
  return new PumarejoError(fallback, { cause: error });
}
