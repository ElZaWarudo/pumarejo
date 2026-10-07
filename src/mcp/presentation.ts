import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { InteractionResult } from "../interaction/engine.js";
import {
  DEFAULT_OUTLINE_CHARS,
  renderChanges,
  renderOutline,
} from "../observation/outline.js";
import type { SemanticSnapshot } from "../observation/schema.js";
import type { DomainResult } from "./domain-ports.js";

export type SnapshotFormat = "outline" | "json";

export interface PresentationOptions {
  readonly format?: SnapshotFormat;
  readonly maxChars?: number;
}

function isSnapshot(value: unknown): value is SemanticSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { nodes?: unknown }).nodes) &&
    typeof (value as { generation?: unknown }).generation === "number" &&
    typeof (value as { window?: unknown }).window === "object" &&
    (value as { window?: unknown }).window !== null &&
    typeof (value as { truncation?: unknown }).truncation === "object" &&
    (value as { truncation?: unknown }).truncation !== null
  );
}

/** Metadata that stays machine-readable without repeating the node list. */
export function snapshotSummary(snapshot: SemanticSnapshot): DomainResult {
  return {
    generation: snapshot.generation,
    observedAt: snapshot.observedAt,
    window: snapshot.window,
    ...(snapshot.surface === undefined ? {} : { surface: snapshot.surface }),
    nodeCount: snapshot.nodes.length,
    truncation: snapshot.truncation,
    ...(snapshot.partial === true ? { partial: true } : {}),
    ...(snapshot.issues === undefined ? {} : { issues: snapshot.issues }),
  };
}

function textResult(text: string, structured: DomainResult): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structured,
  };
}

export function presentSnapshot(
  result: DomainResult,
  options: PresentationOptions,
  serialize: (value: DomainResult) => string,
): CallToolResult {
  if (options.format === "json" || !isSnapshot(result)) {
    return {
      content: [{ type: "text", text: serialize(result) }],
      structuredContent: result,
    };
  }
  return textResult(
    renderOutline(result, { maxChars: options.maxChars }),
    snapshotSummary(result),
  );
}

export function presentLaunch(
  result: DomainResult,
  serialize: (value: DomainResult) => string,
): CallToolResult {
  const snapshot = result.snapshot;
  if (!isSnapshot(snapshot)) {
    return {
      content: [{ type: "text", text: serialize(result) }],
      structuredContent: result,
    };
  }
  const { snapshot: _snapshot, ...launch } = result;
  const structured = { ...launch, snapshot: snapshotSummary(snapshot) };
  return textResult(
    `launched ${String(launch.mode)} on ${String(launch.platform)}\n${renderOutline(
      snapshot,
      { maxChars: DEFAULT_OUTLINE_CHARS },
    )}`,
    structured,
  );
}

function isInteraction(
  value: DomainResult,
): value is DomainResult & InteractionResult {
  return (
    typeof value.action === "string" &&
    typeof value.generation === "number" &&
    typeof value.effect === "object" &&
    value.effect !== null
  );
}

export function presentInteraction(
  result: DomainResult,
  options: PresentationOptions,
  serialize: (value: DomainResult) => string,
): CallToolResult {
  if (options.format === "json" || !isInteraction(result)) {
    return {
      content: [{ type: "text", text: serialize(result) }],
      structuredContent: result,
    };
  }
  const { snapshotAfter, changes: _changes, ...summary } = result;
  const target = result.ref ?? result.target?.ref;
  const headline = [
    `${result.action}${target === undefined ? "" : ` ${target}`}`,
    `effect ${result.effect.kind}`,
    `generation ${result.generation}`,
    ...(result.focus === undefined
      ? []
      : [
          `focus ${result.focus.before.ref ?? "none"} → ${
            result.focus.after.ref ?? "none"
          }`,
        ]),
  ].join(" · ");
  const lines = [headline];
  if (result.window !== undefined) {
    lines.push(
      `window ${result.window.state} ${Math.round(
        result.window.rect.width,
      )}x${Math.round(result.window.rect.height)}`,
    );
  }
  if (result.changes !== undefined) {
    lines.push(...renderChanges(result.changes));
  } else if (result.effect.kind === "unknown") {
    lines.push(
      "change details unavailable; call tauri_snapshot to see the current state",
    );
  }
  const after = isSnapshot(snapshotAfter) ? snapshotAfter : undefined;
  if (after !== undefined) {
    lines.push(renderOutline(after, { maxChars: options.maxChars }));
  }
  return textResult(lines.join("\n"), {
    ...summary,
    ...(result.changes === undefined
      ? {}
      : { changeCounts: result.changes.counts }),
    ...(snapshotAfter === undefined
      ? {}
      : {
          snapshotAfter:
            after === undefined ? snapshotAfter : snapshotSummary(after),
        }),
  });
}
