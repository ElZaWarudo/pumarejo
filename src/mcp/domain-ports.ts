import { PumarejoError } from "../shared/errors.js";
import type {
  ClickInput,
  DialogInput,
  DiagnosticsInput,
  LaunchInput,
  PointerInput,
  PressKeyInput,
  ScrollInput,
  SequenceInput,
  ScreenshotInput,
  SurfaceCoverageInput,
  SurfaceDiscoverInput,
  SurfaceSelectInput,
  SelectOptionInput,
  SnapshotInput,
  TypeInput,
  WindowInput,
} from "./schemas.js";
import type { SurfaceGraph } from "../observation/surfaces.js";

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

export interface SurfaceDomainResult extends DomainResult {
  readonly graph: SurfaceGraph;
  readonly snapshot?: DomainResult;
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
  surfaceDiscover(
    input: SurfaceDiscoverInput,
    context: DomainCallContext,
  ): Promise<SurfaceDomainResult>;
  surfaceSelect(
    input: SurfaceSelectInput,
    context: DomainCallContext,
  ): Promise<SurfaceDomainResult>;
  surfaceCoverage(
    input: SurfaceCoverageInput,
    context: DomainCallContext,
  ): Promise<DomainResult>;
  diagnostics?(
    input: DiagnosticsInput,
    context: DomainCallContext,
  ): Promise<DomainResult>;
  click(input: ClickInput, context: DomainCallContext): Promise<DomainResult>;
  dialog(input: DialogInput, context: DomainCallContext): Promise<DomainResult>;
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
  sequence(
    input: SequenceInput,
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
    surfaceDiscover: unavailable,
    surfaceSelect: unavailable,
    surfaceCoverage: unavailable,
    diagnostics: unavailable,
    click: unavailable,
    dialog: unavailable,
    type: unavailable,
    pressKey: unavailable,
    window: unavailable,
    pointer: unavailable,
    scroll: unavailable,
    selectOption: unavailable,
    sequence: unavailable,
    close: unavailable,
  };
}
