import { randomBytes, timingSafeEqual } from "node:crypto";

import { PumarejoError } from "../shared/errors.js";
import type { WebDriverClient } from "./client.js";

export const CAPABILITY_STATES = [
  "supported",
  "unsupported",
  "unavailable",
  "denied",
  "failed",
] as const;

export type CapabilityState = (typeof CAPABILITY_STATES)[number];

const MAX_CODE_LENGTH = 64;
const MAX_EVIDENCE_LENGTH = 256;
const MAX_DIALOG_TEXT_LENGTH = 4_096;
const MAX_DIALOG_BUTTONS = 8;
const MAX_DIALOG_BUTTON_LENGTH = 128;
const MAX_DIALOG_ID_LENGTH = 256;
const MAX_SURFACE_REF_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 256;
const MAX_PROCESS_ID_LENGTH = 128;
const MAX_GENERATION = 2_147_483_647;

export interface CapabilityEvidence {
  readonly state: CapabilityState;
  readonly code: string;
  readonly evidence?: string;
}

export interface WindowCapabilities {
  readonly resize: CapabilityEvidence;
  readonly maximize: CapabilityEvidence;
  readonly restore: CapabilityEvidence;
  readonly initialSize: CapabilityEvidence;
}

export interface InitialWindowEvidence {
  readonly state: CapabilityState;
  readonly code: string;
  readonly requested: { readonly width: number; readonly height: number };
  readonly effective?: {
    readonly width: number;
    readonly height: number;
  };
  readonly evidence?: string;
}

export interface NativeDialogMetadata {
  /** Stable per-provider instance identity kept private by the controller. */
  readonly instanceId: string;
  readonly title: string;
  readonly message: string;
  readonly buttons: readonly string[];
  readonly surfaceRef?: string;
}

export interface SanitizedDialogMetadata {
  readonly title: string;
  readonly message: string;
  readonly buttons: readonly string[];
}

export interface DialogDetection {
  readonly state: CapabilityState;
  readonly code: string;
  readonly dialog?: SanitizedDialogMetadata;
  readonly pending?: boolean;
  readonly evidence?: string;
}

export interface DialogDecision {
  readonly state: CapabilityState;
  readonly code: string;
  readonly action: "accept" | "cancel";
  readonly dialog?: SanitizedDialogMetadata;
  readonly evidence?: string;
}

export interface DialogBinding {
  readonly sessionId: string;
  readonly processId: string;
  readonly nonce: string;
  readonly surfaceRef: string;
  readonly generation: number;
}

export interface DialogGrant {
  readonly allowedActions: readonly ("accept" | "cancel")[];
  readonly grantId: string;
}

interface PrivateDialogGrant extends DialogGrant {
  readonly binding: DialogBinding;
  readonly instanceId?: string;
  consumed: boolean;
}

function bounded(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .trim()
    .slice(0, maximum);
}

function boundedCode(value: unknown, fallback: string): string {
  const code = bounded(value, MAX_CODE_LENGTH);
  return code.length === 0 ? fallback : code;
}

function boundedEvidence(value: unknown): string | undefined {
  const evidence = bounded(value, MAX_EVIDENCE_LENGTH);
  return evidence.length === 0 ? undefined : evidence;
}

function capability(
  state: CapabilityState,
  code: string,
  evidence?: unknown,
): CapabilityEvidence {
  const boundedReason = boundedEvidence(evidence);
  return {
    state,
    code: boundedCode(code, "provider_capability_unknown"),
    ...(boundedReason === undefined ? {} : { evidence: boundedReason }),
  };
}

export function unsupportedCapability(
  code = "provider_capability_unsupported",
): CapabilityEvidence {
  return capability("unsupported", code);
}

export function unavailableCapability(
  code = "provider_capability_unavailable",
): CapabilityEvidence {
  return capability("unavailable", code);
}

export function deniedCapability(
  code = "provider_capability_denied",
): CapabilityEvidence {
  return capability("denied", code);
}

function validBinding(binding: DialogBinding): boolean {
  return (
    bounded(binding.sessionId, MAX_SESSION_ID_LENGTH).length > 0 &&
    bounded(binding.processId, MAX_PROCESS_ID_LENGTH).length > 0 &&
    /^[a-f0-9]{64}$/u.test(binding.nonce) &&
    bounded(binding.surfaceRef, MAX_SURFACE_REF_LENGTH).length > 0 &&
    Number.isInteger(binding.generation) &&
    binding.generation > 0 &&
    binding.generation <= MAX_GENERATION
  );
}

function sameBinding(left: DialogBinding, right: DialogBinding): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.processId === right.processId &&
    left.nonce === right.nonce &&
    left.surfaceRef === right.surfaceRef &&
    left.generation === right.generation
  );
}

function safeDialog(value: unknown): NativeDialogMetadata | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const instanceId = bounded(
    candidate.instanceId ?? candidate.id,
    MAX_DIALOG_ID_LENGTH,
  );
  const title = bounded(candidate.title, MAX_DIALOG_TEXT_LENGTH);
  const message = bounded(candidate.message, MAX_DIALOG_TEXT_LENGTH);
  const rawButtons = Array.isArray(candidate.buttons) ? candidate.buttons : [];
  const buttons = rawButtons
    .slice(0, MAX_DIALOG_BUTTONS)
    .map((button) => bounded(button, MAX_DIALOG_BUTTON_LENGTH))
    .filter((button) => button.length > 0);
  if (instanceId.length === 0 || buttons.length === 0) return undefined;
  const surfaceRef = bounded(candidate.surfaceRef, MAX_SURFACE_REF_LENGTH);
  if (surfaceRef.length === 0) return undefined;
  return {
    instanceId,
    title,
    message,
    buttons,
    ...(surfaceRef.length === 0 ? {} : { surfaceRef }),
  };
}

export function sanitizeDialog(
  dialog: NativeDialogMetadata,
): SanitizedDialogMetadata {
  return {
    title: bounded(dialog.title, MAX_DIALOG_TEXT_LENGTH),
    message: bounded(dialog.message, MAX_DIALOG_TEXT_LENGTH),
    buttons: dialog.buttons
      .slice(0, MAX_DIALOG_BUTTONS)
      .map((button) => bounded(button, MAX_DIALOG_BUTTON_LENGTH))
      .filter((button) => button.length > 0),
  };
}

function sanitizePublicDialog(
  dialog: SanitizedDialogMetadata,
): SanitizedDialogMetadata {
  return {
    title: bounded(dialog.title, MAX_DIALOG_TEXT_LENGTH),
    message: bounded(dialog.message, MAX_DIALOG_TEXT_LENGTH),
    buttons: Array.isArray(dialog.buttons)
      ? dialog.buttons
          .slice(0, MAX_DIALOG_BUTTONS)
          .map((button) => bounded(button, MAX_DIALOG_BUTTON_LENGTH))
          .filter((button) => button.length > 0)
      : [],
  };
}

export function providerDialogFrom(value: unknown): {
  readonly supported: boolean;
  readonly pending: boolean;
  readonly dialog?: NativeDialogMetadata;
  readonly code: string;
  readonly evidence?: string;
  readonly contradictory: boolean;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      supported: false,
      pending: false,
      code: "provider_dialog_invalid_response",
      contradictory: true,
    };
  }
  const candidate = value as Record<string, unknown>;
  const supported = candidate.supported === true;
  const dialog = safeDialog(candidate.dialog);
  const hasDialogField = Object.prototype.hasOwnProperty.call(
    candidate,
    "dialog",
  );
  const hasDialog =
    typeof candidate.dialog === "object" &&
    candidate.dialog !== null &&
    !Array.isArray(candidate.dialog);
  const pending =
    candidate.pending === false
      ? false
      : dialog !== undefined || candidate.pending === true;
  const contradictory =
    (supported && pending === false && hasDialogField) ||
    (!supported && pending === true && hasDialogField);
  const canonicalDialog = pending ? dialog : undefined;
  return {
    supported,
    pending,
    ...(canonicalDialog === undefined ? {} : { dialog: canonicalDialog }),
    code: boundedCode(
      candidate.code,
      supported ? "provider_dialog_supported" : "provider_dialog_unsupported",
    ),
    ...(boundedEvidence(candidate.evidence) === undefined
      ? {}
      : { evidence: boundedEvidence(candidate.evidence) }),
    contradictory,
  };
}

export function providerCapabilitiesFrom(value: unknown): WindowCapabilities {
  const fallback = unavailableCapability(
    "provider_capability_probe_unavailable",
  );
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      resize: fallback,
      maximize: fallback,
      restore: fallback,
      initialSize: fallback,
    };
  }
  const candidate = value as Record<string, unknown>;
  const window =
    typeof candidate.window === "object" &&
    candidate.window !== null &&
    !Array.isArray(candidate.window)
      ? (candidate.window as Record<string, unknown>)
      : {};
  const parse = (name: string): CapabilityEvidence => {
    const raw = window[name];
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const item = raw as Record<string, unknown>;
      const state = CAPABILITY_STATES.includes(item.state as CapabilityState)
        ? (item.state as CapabilityState)
        : "failed";
      return capability(
        state,
        boundedCode(item.code, `window_${name}_unknown`),
        item.evidence,
      );
    }
    return fallback;
  };
  return {
    resize: parse("resize"),
    maximize: parse("maximize"),
    restore: parse("restore"),
    initialSize: parse("initialSize"),
  };
}

/**
 * Private launch-scoped authorization for the purpose-built dialog boundary.
 * The opaque grant handle never appears in evidence or MCP output.
 */
export class DialogGrantStore {
  #grant: PrivateDialogGrant | undefined;

  issue(
    binding: DialogBinding,
    allowedActions: readonly ("accept" | "cancel")[],
    instanceId?: string,
  ): DialogGrant {
    if (
      !validBinding(binding) ||
      allowedActions.length === 0 ||
      allowedActions.some(
        (action) => action !== "accept" && action !== "cancel",
      )
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    const grant: PrivateDialogGrant = {
      grantId: randomBytes(16).toString("hex"),
      allowedActions: [...new Set(allowedActions)],
      binding: { ...binding },
      ...(instanceId === undefined
        ? {}
        : { instanceId: bounded(instanceId, MAX_DIALOG_ID_LENGTH) }),
      consumed: false,
    };
    this.#grant = grant;
    return {
      grantId: grant.grantId,
      allowedActions: [...grant.allowedActions],
    };
  }

  consume(
    grant: DialogGrant,
    binding: DialogBinding,
    action: "accept" | "cancel",
    instanceId: string,
  ): boolean {
    const current = this.#grant;
    if (
      current === undefined ||
      current.consumed ||
      !validBinding(binding) ||
      !sameBinding(current.binding, binding) ||
      current.grantId !== grant.grantId ||
      !current.allowedActions.includes(action) ||
      !grant.allowedActions.includes(action) ||
      bounded(instanceId, MAX_DIALOG_ID_LENGTH).length === 0 ||
      (current.instanceId !== undefined && current.instanceId !== instanceId)
    ) {
      return false;
    }
    // Keep a constant-time comparison in the private path even though the
    // opaque handle is never accepted from MCP. This protects future adapters
    // from accidentally turning grantId into an authority token.
    const supplied = Buffer.from(grant.grantId);
    const expected = Buffer.from(current.grantId);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return false;
    }
    current.consumed = true;
    return true;
  }

  clear(): void {
    this.#grant = undefined;
  }
}

export function dialogMetadataForEvidence(
  dialog: NativeDialogMetadata | undefined,
): SanitizedDialogMetadata | undefined {
  return dialog === undefined ? undefined : sanitizeDialog(dialog);
}

export interface NativeDialogSessionOptions {
  readonly webdriver: Pick<
    WebDriverClient,
    "detectNativeDialog" | "decideNativeDialog"
  >;
  readonly sessionId: string;
  readonly processId: number;
  readonly nonce: string;
}

/**
 * Session-private controller for the purpose-built dialog provider boundary.
 * It never accepts a grant token from MCP: authorization creates a random
 * launch-scoped grant in this object, then the provider receives only the
 * private instance id over the authenticated provider channel.
 */
export class NativeDialogSession {
  readonly #webdriver: NativeDialogSessionOptions["webdriver"];
  readonly #sessionId: string;
  readonly #processId: string;
  readonly #nonce: string;
  readonly #grants = new DialogGrantStore();
  #dialog: NativeDialogMetadata | undefined;
  #grant: DialogGrant | undefined;

  constructor(options: NativeDialogSessionOptions) {
    if (
      !/^[a-f0-9]{32,64}$/u.test(options.sessionId) ||
      !Number.isInteger(options.processId) ||
      options.processId <= 0 ||
      !/^[a-f0-9]{64}$/u.test(options.nonce)
    ) {
      throw new PumarejoError("CONFIG_INVALID");
    }
    this.#webdriver = options.webdriver;
    this.#sessionId = options.sessionId;
    this.#processId = String(options.processId);
    this.#nonce = options.nonce;
  }

  #clearAuthority(): void {
    this.#dialog = undefined;
    this.#grant = undefined;
    this.#grants.clear();
  }

  #publicDetection(
    result: Awaited<ReturnType<WebDriverClient["detectNativeDialog"]>>,
  ): DialogDetection {
    const evidence =
      result.evidence === undefined
        ? undefined
        : boundedEvidence(result.evidence);
    return {
      state: result.state,
      code: result.code,
      ...(result.dialog === undefined
        ? {}
        : { dialog: sanitizePublicDialog(result.dialog) }),
      ...(result.pending === undefined ? {} : { pending: result.pending }),
      ...(evidence === undefined ? {} : { evidence }),
    };
  }

  async detect(signal?: AbortSignal): Promise<DialogDetection> {
    let result: Awaited<ReturnType<WebDriverClient["detectNativeDialog"]>>;
    try {
      result = await this.#webdriver.detectNativeDialog(signal);
    } catch (error) {
      this.#clearAuthority();
      throw error;
    }
    const privateDialog = result.providerDialog;
    const hasConcreteBinding =
      result.state === "supported" &&
      privateDialog !== undefined &&
      result.dialog !== undefined &&
      bounded(privateDialog.instanceId, MAX_DIALOG_ID_LENGTH).length > 0 &&
      bounded(privateDialog.surfaceRef, MAX_SURFACE_REF_LENGTH).length > 0 &&
      result.dialog.buttons.length > 0;
    if (!hasConcreteBinding) {
      this.#clearAuthority();
      if (result.state === "supported") {
        return {
          state: "failed",
          code: "provider_dialog_invalid_metadata",
        };
      }
      return this.#publicDetection(result);
    }
    this.#dialog = privateDialog;
    return this.#publicDetection(result);
  }

  authorize(
    action: "accept" | "cancel",
    context: { readonly surfaceRef: string; readonly generation: number },
  ): DialogGrant | undefined {
    const dialog = this.#dialog;
    const binding: DialogBinding = {
      sessionId: this.#sessionId,
      processId: this.#processId,
      nonce: this.#nonce,
      surfaceRef: context.surfaceRef,
      generation: context.generation,
    };
    if (
      dialog === undefined ||
      bounded(dialog.instanceId, MAX_DIALOG_ID_LENGTH).length === 0 ||
      bounded(dialog.surfaceRef, MAX_SURFACE_REF_LENGTH).length === 0 ||
      dialog.surfaceRef !== context.surfaceRef ||
      !validBinding(binding)
    ) {
      this.#clearAuthority();
      return undefined;
    }
    try {
      this.#grant = this.#grants.issue(binding, [action], dialog.instanceId);
    } catch {
      this.#clearAuthority();
      return undefined;
    }
    return this.#grant;
  }

  async decide(
    action: "accept" | "cancel",
    context: { readonly surfaceRef: string; readonly generation: number },
    signal?: AbortSignal,
  ): Promise<DialogDecision> {
    // Re-read immediately before consuming authority so a dialog observed
    // during an earlier call cannot be replayed after the provider changes it.
    await this.detect(signal);
    const dialog = this.#dialog;
    if (dialog === undefined) {
      this.#clearAuthority();
      return {
        state: "unavailable",
        code: "provider_dialog_not_detected",
        action,
      };
    }
    const binding: DialogBinding = {
      sessionId: this.#sessionId,
      processId: this.#processId,
      nonce: this.#nonce,
      surfaceRef: context.surfaceRef,
      generation: context.generation,
    };
    if (
      dialog.surfaceRef !== undefined &&
      dialog.surfaceRef !== binding.surfaceRef
    ) {
      this.#clearAuthority();
      return {
        state: "denied",
        code: "dialog_surface_mismatch",
        action,
        dialog: sanitizeDialog(dialog),
      };
    }
    const grant = this.#grant;
    if (
      grant === undefined ||
      !this.#grants.consume(grant, binding, action, dialog.instanceId)
    ) {
      this.#clearAuthority();
      return {
        state: "denied",
        code: "dialog_grant_denied",
        action,
        dialog: sanitizeDialog(dialog),
      };
    }
    this.#grant = undefined;
    let decision: DialogDecision;
    try {
      decision = await this.#webdriver.decideNativeDialog(
        { action, instanceId: dialog.instanceId },
        signal,
      );
    } catch (error) {
      this.#clearAuthority();
      throw error;
    }
    if (decision.state !== "supported") {
      this.#clearAuthority();
      return {
        state: decision.state,
        code: decision.code,
        action: decision.action,
        dialog: sanitizeDialog(dialog),
        ...(decision.evidence === undefined
          ? {}
          : { evidence: decision.evidence }),
      };
    }
    let after: DialogDetection;
    try {
      after = await this.detect(signal);
    } catch (error) {
      this.#clearAuthority();
      throw error;
    }
    if (
      after.state !== "unavailable" ||
      after.code !== "provider_dialog_absent" ||
      after.pending === true ||
      this.#dialog !== undefined
    ) {
      this.#clearAuthority();
      return {
        state: "failed",
        code: "provider_dialog_postcondition_failed",
        action,
        dialog: sanitizeDialog(dialog),
      };
    }
    this.#clearAuthority();
    return {
      state: "supported",
      code: "dialog_decision_verified",
      action,
      dialog: sanitizeDialog(dialog),
      ...(after.evidence === undefined ? {} : { evidence: after.evidence }),
    };
  }

  clear(): void {
    this.#clearAuthority();
  }
}
