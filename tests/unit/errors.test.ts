import { describe, expect, it } from "vitest";

import {
  PUMAREJO_ERROR_CODES,
  PumarejoError,
  toErrorEnvelope,
} from "../../src/shared/errors.js";

describe("PumarejoError", () => {
  it("matches the complete stable v1 code list", () => {
    expect(PUMAREJO_ERROR_CODES).toEqual([
      "PROJECT_NOT_FOUND",
      "UNSUPPORTED_TAURI_VERSION",
      "CONFIG_INVALID",
      "INTEGRATION_INCOMPLETE",
      "PLATFORM_UNSUPPORTED",
      "BACKGROUND_UNAVAILABLE",
      "PORT_UNAVAILABLE",
      "ARTIFACTS_DIRECTORY_NOT_WRITABLE",
      "ARTIFACT_RECOVERY_FAILED",
      "CAPABILITY_INCOMPATIBLE",
      "LAUNCH_COMMAND_NOT_FOUND",
      "APP_START_FAILED",
      "PROCESS_NOT_FOUND",
      "PROCESS_INSPECTION_DENIED",
      "PROCESS_INSPECTION_UNAVAILABLE",
      "PROCESS_INSPECTION_TIMED_OUT",
      "PROCESS_INSPECTION_INVALID_RESPONSE",
      "WEBDRIVER_NOT_READY",
      "SESSION_CREATE_FAILED",
      "SESSION_NOT_ACTIVE",
      "SESSION_ALREADY_ACTIVE",
      "WINDOW_NOT_FOUND",
      "SURFACE_NOT_FOUND",
      "STALE_SURFACE_REF",
      "SURFACE_UNSUPPORTED",
      "SURFACE_UNAVAILABLE",
      "SURFACE_ACCESS_DENIED",
      "SURFACE_SELECTION_FAILED",
      "STALE_ELEMENT_REF",
      "ELEMENT_NOT_FOUND",
      "ELEMENT_HIDDEN",
      "ELEMENT_DISABLED",
      "ELEMENT_NOT_INTERACTABLE",
      "UNSUPPORTED_KEY",
      "UNSUPPORTED_ACTION",
      "WINDOW_ACTION_UNSUPPORTED",
      "WINDOW_ACTION_DENIED",
      "WINDOW_ACTION_UNAVAILABLE",
      "WINDOW_ACTION_FAILED",
      "WINDOW_ACTION_POSTCONDITION_FAILED",
      "SCREENSHOT_FAILED",
      "CLOSE_FAILED",
      "INTERNAL_ERROR",
    ]);
  });

  it("serializes a stable expected error envelope", () => {
    const error = new PumarejoError("CONFIG_INVALID");

    expect(toErrorEnvelope(error)).toEqual({
      code: "CONFIG_INVALID",
      message: "The project configuration does not satisfy the v1 contract.",
      phase: "configuration",
      retryable: false,
      suggestion: "Fix .pumarejo.json or run pumarejo doctor.",
    });
  });

  it("keeps the legacy window code and adds a precise discriminator", () => {
    const error = new PumarejoError("WINDOW_ACTION_DENIED");

    expect(error.code).toBe("WINDOW_ACTION_DENIED");
    expect(toErrorEnvelope(error)).toMatchObject({
      code: "UNSUPPORTED_ACTION",
      windowActionCode: "WINDOW_ACTION_DENIED",
      phase: "interaction",
      retryable: false,
    });
  });

  it("never promotes a secret-bearing cause into a public typed error", () => {
    const secret = "token-super-secret";
    const error = new PumarejoError("CONFIG_INVALID", {
      cause: new Error(secret),
    });

    expect(JSON.stringify(toErrorEnvelope(error))).not.toContain(secret);
  });

  it("exposes safe process-inspection context without leaking its cause", () => {
    const secret = "sensitive-cim-output";
    const error = new PumarejoError("PROCESS_INSPECTION_DENIED", {
      cause: new Error(secret),
      diagnostic: {
        check: "Windows process ownership via CIM",
        applicationStarted: true,
        cleanup: "terminated",
        webdriverSessionCreated: false,
      },
    });

    expect(toErrorEnvelope(error)).toMatchObject({
      code: "PROCESS_INSPECTION_DENIED",
      phase: "process-inspection",
      diagnostic: {
        check: "Windows process ownership via CIM",
        applicationStarted: true,
        cleanup: "terminated",
        webdriverSessionCreated: false,
      },
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
