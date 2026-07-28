import { PumarejoError } from "../shared/errors.js";
import type { ErrorEnvelope } from "../shared/errors.js";

export type IntegrationPlanErrorReason =
  | "ALREADY_INTEGRATED_MODIFIED"
  | "CAPABILITY_AMBIGUOUS"
  | "CAPABILITY_INVALID"
  | "CARGO_DEPENDENCY_AMBIGUOUS"
  | "CARGO_FEATURE_AMBIGUOUS"
  | "CARGO_MANIFEST_INVALID"
  | "PROJECT_CHANGED"
  | "RUST_LAYOUT_AMBIGUOUS"
  | "UNSAFE_TARGET"
  | "WRITE_FAILED";

const GUIDANCE: Record<IntegrationPlanErrorReason, string> = {
  ALREADY_INTEGRATED_MODIFIED:
    "Run pumarejo doctor; preserve the existing files and resolve the reported integration drift manually.",
  CAPABILITY_AMBIGUOUS:
    "Keep one capability that applies to the configured primary window, then rerun init.",
  CAPABILITY_INVALID:
    "Fix the selected JSON or TOML capability permissions, then rerun init.",
  CARGO_DEPENDENCY_AMBIGUOUS:
    "Make tauri-plugin-wdio-webdriver optional without changing unrelated dependency settings, then rerun init.",
  CARGO_FEATURE_AMBIGUOUS:
    'Define pumarejo as a string array containing "dep:tauri-plugin-wdio-webdriver", then rerun init.',
  CARGO_MANIFEST_INVALID:
    "Fix src-tauri/Cargo.toml so it can be parsed safely, then rerun init.",
  PROJECT_CHANGED:
    "Review the concurrent project change and rerun init from a stable working tree.",
  RUST_LAYOUT_AMBIGUOUS:
    "Manually wrap the single Tauri builder with the documented debug-and-feature-gated pumarejo_builder helper.",
  UNSAFE_TARGET:
    "Replace linked or escaping integration targets with regular project-local files, then rerun init.",
  WRITE_FAILED:
    "Inspect the reported files, restore any unresolved attributable change, and rerun doctor.",
};

export class IntegrationPlanError extends PumarejoError {
  readonly reason: IntegrationPlanErrorReason;

  constructor(reason: IntegrationPlanErrorReason, options?: ErrorOptions) {
    super("INTEGRATION_INCOMPLETE", options);
    this.name = "IntegrationPlanError";
    this.reason = reason;
  }

  override toJSON(): ErrorEnvelope {
    return {
      code: "INTEGRATION_INCOMPLETE",
      message: `The pumarejo integration could not be completed (${this.reason}).`,
      phase: "integration",
      retryable: false,
      suggestion: GUIDANCE[this.reason],
    };
  }
}
