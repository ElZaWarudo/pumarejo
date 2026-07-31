export const PUMAREJO_ERROR_CODES = [
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
  "STALE_ELEMENT_REF",
  "ELEMENT_NOT_FOUND",
  "ELEMENT_HIDDEN",
  "ELEMENT_DISABLED",
  "ELEMENT_NOT_INTERACTABLE",
  "UNSUPPORTED_KEY",
  "UNSUPPORTED_ACTION",
  "SCREENSHOT_FAILED",
  "CLOSE_FAILED",
  "INTERNAL_ERROR",
] as const;

export type PumarejoErrorCode = (typeof PUMAREJO_ERROR_CODES)[number];

export type PumarejoErrorPhase =
  | "configuration"
  | "integration"
  | "platform"
  | "artifacts"
  | "launch"
  | "process-inspection"
  | "webdriver"
  | "session"
  | "observation"
  | "interaction"
  | "close"
  | "internal";

export interface ErrorEnvelope {
  readonly code: PumarejoErrorCode;
  readonly message: string;
  readonly phase: PumarejoErrorPhase;
  readonly retryable: boolean;
  readonly suggestion: string;
  readonly diagnostic?: ErrorDiagnostic;
}

export interface ErrorDiagnostic {
  readonly check: string;
  readonly applicationStarted: boolean;
  readonly cleanup:
    | "not-required"
    | "terminated"
    | "already-exited"
    | "survived"
    | "not-attempted";
  readonly webdriverSessionCreated: boolean;
}

const ERROR_DEFINITIONS: Record<
  PumarejoErrorCode,
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
    suggestion: "Fix .pumarejo.json or run pumarejo doctor.",
  },
  INTEGRATION_INCOMPLETE: {
    message: "The pumarejo integration is incomplete.",
    phase: "integration",
    retryable: false,
    suggestion: "Run pumarejo doctor and complete the reported setup.",
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
  ARTIFACTS_DIRECTORY_NOT_WRITABLE: {
    message:
      "The artifacts directory could not be created and verified as writable.",
    phase: "artifacts",
    retryable: false,
    suggestion:
      "Review the configured artifactsDirectory and its host filesystem permissions; no application or WebDriver session was started.",
  },
  ARTIFACT_RECOVERY_FAILED: {
    message:
      "Existing artifact state could not be validated or recovered safely.",
    phase: "artifacts",
    retryable: false,
    suggestion:
      "Inspect the artifact manifest and files for corruption or unsafe links; no application or WebDriver session was started.",
  },
  CAPABILITY_INCOMPATIBLE: {
    message:
      "The generated .pumarejo/agent-capability.json does not match the required pumarejo-agent identifier, configured window, and exact permissions.",
    phase: "integration",
    retryable: false,
    suggestion:
      "Regenerate .pumarejo/agent-capability.json with identifier pumarejo-agent and the permissions reported by pumarejo doctor before launching.",
  },
  LAUNCH_COMMAND_NOT_FOUND: {
    message: "The configured launch command could not be resolved safely.",
    phase: "launch",
    retryable: false,
    suggestion:
      "Check launch.command, launch.executablePath, and launch.pathPrepend; no application or WebDriver session was started.",
  },
  APP_START_FAILED: {
    message: "The configured application failed to start.",
    phase: "launch",
    retryable: true,
    suggestion: "Check stderr diagnostics and the approved launch profile.",
  },
  PROCESS_NOT_FOUND: {
    message:
      "The launched process was no longer present when its Windows identity was inspected.",
    phase: "process-inspection",
    retryable: true,
    suggestion:
      "Check application startup diagnostics; this happened before WebDriver or screenshot capture.",
  },
  PROCESS_INSPECTION_DENIED: {
    message:
      "Windows denied the CIM process-ownership check after the application started.",
    phase: "process-inspection",
    retryable: false,
    suggestion:
      "Review the host sandbox or policy permission for Get-CimInstance Win32_Process; this is not a WebDriver or screenshot failure.",
  },
  PROCESS_INSPECTION_UNAVAILABLE: {
    message:
      "Windows CIM process inspection was unavailable, so process ownership could not be proven.",
    phase: "process-inspection",
    retryable: false,
    suggestion:
      "Review whether the host provides PowerShell and the CIM cmdlets; this is not a WebDriver or screenshot failure.",
  },
  PROCESS_INSPECTION_TIMED_OUT: {
    message:
      "Windows CIM process inspection timed out, so process ownership could not be proven.",
    phase: "process-inspection",
    retryable: true,
    suggestion:
      "Review host policy and CIM responsiveness; this is not a WebDriver or screenshot failure.",
  },
  PROCESS_INSPECTION_INVALID_RESPONSE: {
    message:
      "Windows CIM returned an invalid process-inspection response, so ownership could not be proven.",
    phase: "process-inspection",
    retryable: false,
    suggestion:
      "Review PowerShell/CIM host diagnostics; this is not a WebDriver or screenshot failure.",
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
    message: "No pumarejo session is active.",
    phase: "session",
    retryable: true,
    suggestion: "Call tauri_launch first.",
  },
  SESSION_ALREADY_ACTIVE: {
    message: "A pumarejo session is already active.",
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
  UNSUPPORTED_ACTION: {
    message: "The requested WebDriver action is unsupported by this surface.",
    phase: "interaction",
    retryable: false,
    suggestion: "Use a documented WebView action or inspect another surface.",
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

export class PumarejoError extends Error {
  readonly code: PumarejoErrorCode;
  readonly phase: PumarejoErrorPhase;
  readonly retryable: boolean;
  readonly suggestion: string;
  readonly diagnostic: ErrorDiagnostic | undefined;

  constructor(
    code: PumarejoErrorCode,
    options?: ErrorOptions & { readonly diagnostic?: ErrorDiagnostic },
  ) {
    const envelope = ERROR_DEFINITIONS[code];
    super(envelope.message, options);
    this.name = "PumarejoError";
    this.code = code;
    this.phase = envelope.phase;
    this.retryable = envelope.retryable;
    this.suggestion = envelope.suggestion;
    this.diagnostic = options?.diagnostic;
  }

  toJSON(): ErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      phase: this.phase,
      retryable: this.retryable,
      suggestion: this.suggestion,
      ...(this.diagnostic === undefined ? {} : { diagnostic: this.diagnostic }),
    };
  }
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  return error instanceof PumarejoError
    ? error.toJSON()
    : new PumarejoError("INTERNAL_ERROR").toJSON();
}
