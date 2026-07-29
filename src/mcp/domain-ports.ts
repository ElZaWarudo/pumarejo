import { PumarejoError } from "../shared/errors.js";
import type {
  ClickInput,
  LaunchInput,
  PointerInput,
  PressKeyInput,
  ScrollInput,
  ScreenshotInput,
  SelectOptionInput,
  SnapshotInput,
  TypeInput,
  WindowInput,
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

export interface PumarejoDomainPorts {
  launch(input: LaunchInput, context: DomainCallContext): Promise<DomainResult>;
  status(context: DomainCallContext): Promise<DomainResult>;
  snapshot(
    input: SnapshotInput,
    context: DomainCallContext,
  ): Promise<DomainResult>;
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
  window(input: WindowInput, context: DomainCallContext): Promise<DomainResult>;
  pointer(
    input: PointerInput,
    context: DomainCallContext,
  ): Promise<DomainResult>;
  scroll(input: ScrollInput, context: DomainCallContext): Promise<DomainResult>;
  selectOption(
    input: SelectOptionInput,
    context: DomainCallContext,
  ): Promise<DomainResult>;
  close(context: DomainCallContext): Promise<DomainResult>;
}

async function unavailable(): Promise<never> {
  throw new PumarejoError("INTEGRATION_INCOMPLETE");
}

export function createStubDomainPorts(): PumarejoDomainPorts {
  return {
    launch: unavailable,
    status: unavailable,
    snapshot: unavailable,
    screenshot: unavailable,
    click: unavailable,
    type: unavailable,
    pressKey: unavailable,
    window: unavailable,
    pointer: unavailable,
    scroll: unavailable,
    selectOption: unavailable,
    close: unavailable,
  };
}
