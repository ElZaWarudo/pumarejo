export const TAURI_AGENT_ERROR_CODES = [
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
] as const;

export type TauriAgentErrorCode = (typeof TAURI_AGENT_ERROR_CODES)[number];

export type TauriAgentErrorPhase =
  | "configuration"
  | "integration"
  | "platform"
  | "launch"
  | "webdriver"
  | "session"
  | "observation"
  | "interaction"
  | "close"
  | "internal";

export interface ErrorEnvelope {
  readonly code: TauriAgentErrorCode;
  readonly message: string;
  readonly phase: TauriAgentErrorPhase;
  readonly retryable: boolean;
  readonly suggestion: string;
}

const ERROR_DEFINITIONS: Record<
  TauriAgentErrorCode,
  Omit<ErrorEnvelope, "code">
> = {
  PROJECT_NOT_FOUND: {
    message: "The requested Tauri project directory was not found.",
    phase: "configuration",
    retryable: false,
    suggestion: "Pass --project with an existing Tauri 2 project directory.",
  },
  UNSUPPORTED_TAURI_VERSION: {
    message: "The project uses an unsupported Tauri version.",
    phase: "configuration",
    retryable: false,
    suggestion: "Use a supported Tauri 2 release.",
  },
  CONFIG_INVALID: {
    message: "The project configuration does not satisfy the v1 contract.",
    phase: "configuration",
    retryable: false,
    suggestion: "Fix .tauri-agent.json or run tauri-agent doctor.",
  },
  INTEGRATION_INCOMPLETE: {
    message: "The Tauri Agent integration is incomplete.",
    phase: "integration",
    retryable: false,
    suggestion: "Run tauri-agent doctor and complete the reported setup.",
  },
  PLATFORM_UNSUPPORTED: {
    message: "The current platform is unsupported.",
    phase: "platform",
    retryable: false,
    suggestion: "Use a certified Windows or Ubuntu environment.",
  },
  BACKGROUND_UNAVAILABLE: {
    message: "Background mode is unavailable.",
    phase: "platform",
    retryable: false,
    suggestion: "Resolve the platform diagnostic or use visible mode.",
  },
  PORT_UNAVAILABLE: {
    message: "The requested loopback port is unavailable.",
    phase: "launch",
    retryable: true,
    suggestion: "Release the port or omit webdriverPort and retry.",
  },
  APP_START_FAILED: {
    message: "The configured application failed to start.",
    phase: "launch",
    retryable: true,
    suggestion: "Check stderr diagnostics and the approved launch profile.",
  },
  WEBDRIVER_NOT_READY: {
    message: "WebDriver did not become ready.",
    phase: "webdriver",
    retryable: true,
    suggestion: "Check provider diagnostics and retry.",
  },
  SESSION_CREATE_FAILED: {
    message: "The WebDriver session could not be created.",
    phase: "session",
    retryable: true,
    suggestion: "Close any owned residue and retry.",
  },
  SESSION_NOT_ACTIVE: {
    message: "No Tauri Agent session is active.",
    phase: "session",
    retryable: true,
    suggestion: "Call tauri_launch first.",
  },
  SESSION_ALREADY_ACTIVE: {
    message: "A Tauri Agent session is already active.",
    phase: "session",
    retryable: false,
    suggestion: "Close the active session before launching another.",
  },
  WINDOW_NOT_FOUND: {
    message: "The configured primary window was not found.",
    phase: "session",
    retryable: false,
    suggestion: "Check the configured Tauri window label.",
  },
  STALE_ELEMENT_REF: {
    message: "The element reference is no longer valid.",
    phase: "interaction",
    retryable: true,
    suggestion: "Call tauri_snapshot and retry with a current reference.",
  },
  ELEMENT_NOT_FOUND: {
    message: "The requested element was not found.",
    phase: "interaction",
    retryable: true,
    suggestion: "Call tauri_snapshot and use a current reference.",
  },
  ELEMENT_HIDDEN: {
    message: "The requested element is hidden.",
    phase: "interaction",
    retryable: true,
    suggestion: "Reveal the element, take a new snapshot, and retry.",
  },
  ELEMENT_DISABLED: {
    message: "The requested element is disabled.",
    phase: "interaction",
    retryable: true,
    suggestion: "Satisfy the application state, take a snapshot, and retry.",
  },
  ELEMENT_NOT_INTERACTABLE: {
    message: "The requested element is not interactable.",
    phase: "interaction",
    retryable: true,
    suggestion: "Take a new snapshot and choose a compatible control.",
  },
  UNSUPPORTED_KEY: {
    message: "The requested key is unsupported.",
    phase: "interaction",
    retryable: false,
    suggestion: "Use a key from the documented v1 set.",
  },
  SCREENSHOT_FAILED: {
    message: "The WebView screenshot could not be captured.",
    phase: "observation",
    retryable: true,
    suggestion: "Check rendering diagnostics and retry.",
  },
  CLOSE_FAILED: {
    message: "One or more owned resources could not be released.",
    phase: "close",
    retryable: true,
    suggestion: "Retry tauri_close and inspect stderr diagnostics.",
  },
  INTERNAL_ERROR: {
    message: "An unexpected internal error occurred.",
    phase: "internal",
    retryable: false,
    suggestion: "Check stderr diagnostics and retry.",
  },
};

export class TauriAgentError extends Error {
  readonly code: TauriAgentErrorCode;
  readonly phase: TauriAgentErrorPhase;
  readonly retryable: boolean;
  readonly suggestion: string;

  constructor(code: TauriAgentErrorCode, options?: ErrorOptions) {
    const envelope = ERROR_DEFINITIONS[code];
    super(envelope.message, options);
    this.name = "TauriAgentError";
    this.code = code;
    this.phase = envelope.phase;
    this.retryable = envelope.retryable;
    this.suggestion = envelope.suggestion;
  }

  toJSON(): ErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      phase: this.phase,
      retryable: this.retryable,
      suggestion: this.suggestion,
    };
  }
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  return error instanceof TauriAgentError
    ? error.toJSON()
    : new TauriAgentError("INTERNAL_ERROR").toJSON();
}
