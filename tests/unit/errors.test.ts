import { describe, expect, it } from "vitest";

import {
  TAURI_AGENT_ERROR_CODES,
  TauriAgentError,
  toErrorEnvelope,
} from "../../src/shared/errors.js";

describe("TauriAgentError", () => {
  it("matches the complete stable v1 code list", () => {
    expect(TAURI_AGENT_ERROR_CODES).toEqual([
      "PROJECT_NOT_FOUND",
      "UNSUPPORTED_TAURI_VERSION",
      "CONFIG_INVALID",
      "INTEGRATION_INCOMPLETE",
      "PLATFORM_UNSUPPORTED",
      "BACKGROUND_UNAVAILABLE",
      "PORT_UNAVAILABLE",
      "APP_START_FAILED",
      "WEBDRIVER_NOT_READY",
      "SESSION_CREATE_FAILED",
      "SESSION_NOT_ACTIVE",
      "SESSION_ALREADY_ACTIVE",
      "WINDOW_NOT_FOUND",
      "STALE_ELEMENT_REF",
      "ELEMENT_NOT_FOUND",
      "ELEMENT_HIDDEN",
      "ELEMENT_DISABLED",
      "ELEMENT_NOT_INTERACTABLE",
      "UNSUPPORTED_KEY",
      "SCREENSHOT_FAILED",
      "CLOSE_FAILED",
      "INTERNAL_ERROR",
    ]);
  });

  it("serializes a stable expected error envelope", () => {
    const error = new TauriAgentError("CONFIG_INVALID");

    expect(toErrorEnvelope(error)).toEqual({
      code: "CONFIG_INVALID",
      message: "The project configuration does not satisfy the v1 contract.",
      phase: "configuration",
      retryable: false,
      suggestion: "Fix .tauri-agent.json or run tauri-agent doctor.",
    });
  });

  it("never promotes a secret-bearing cause into a public typed error", () => {
    const secret = "token-super-secret";
    const error = new TauriAgentError("CONFIG_INVALID", {
      cause: new Error(secret),
    });

    expect(JSON.stringify(toErrorEnvelope(error))).not.toContain(secret);
  });

  it("does not leak unexpected messages, stacks, or secrets", () => {
    const secret = "token-super-secret";
    const unexpected = new Error(`failure ${secret}`);
    unexpected.stack = `stack ${secret}`;

    expect(JSON.stringify(toErrorEnvelope(unexpected))).not.toContain(secret);
    expect(toErrorEnvelope(unexpected)).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected internal error occurred.",
      phase: "internal",
      retryable: false,
      suggestion: "Check stderr diagnostics and retry.",
    });
  });
});
