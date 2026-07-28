import type { RawSemanticDescriptor } from "./schema.js";

export function assertRedactionBoundary(
  descriptor: RawSemanticDescriptor,
): void {
  if (
    descriptor.redacted &&
    (descriptor.text !== undefined || descriptor.value !== undefined)
  ) {
    throw new Error(
      "Sensitive semantic content crossed the redaction boundary.",
    );
  }
  if (
    descriptor.redacted &&
    descriptor.name !== undefined &&
    descriptor.nameSafe !== true
  ) {
    throw new Error(
      "An unsafe accessible name crossed the redaction boundary.",
    );
  }
}
