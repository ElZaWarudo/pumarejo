import { TauriAgentError } from "../shared/errors.js";
import type {
  ClickInput,
  LaunchInput,
  PressKeyInput,
  ScreenshotInput,
  TypeInput,
} from "./schemas.js";

export type DomainResult = Record<string, unknown>;

export interface DomainCallContext {
  readonly signal: AbortSignal;
}

export interface ScreenshotDomainResult {
  readonly metadata: DomainResult;
  readonly image: {
    readonly data: string;
    readonly mimeType: "image/png";
  };
}

export interface TauriAgentDomainPorts {
  launch(input: LaunchInput, context: DomainCallContext): Promise<DomainResult>;
  snapshot(context: DomainCallContext): Promise<DomainResult>;
  screenshot(
    input: ScreenshotInput,
    context: DomainCallContext,
  ): Promise<ScreenshotDomainResult>;
  click(input: ClickInput, context: DomainCallContext): Promise<DomainResult>;
  type(input: TypeInput, context: DomainCallContext): Promise<DomainResult>;
  pressKey(
    input: PressKeyInput,
    context: DomainCallContext,
  ): Promise<DomainResult>;
  close(context: DomainCallContext): Promise<DomainResult>;
}

async function unavailable(): Promise<never> {
  throw new TauriAgentError("INTEGRATION_INCOMPLETE");
}

export function createStubDomainPorts(): TauriAgentDomainPorts {
  return {
    launch: unavailable,
    snapshot: unavailable,
    screenshot: unavailable,
    click: unavailable,
    type: unavailable,
    pressKey: unavailable,
    close: unavailable,
  };
}
