import type { SemanticNode, SemanticSnapshot } from "./schema.js";

export const DEFAULT_OUTLINE_CHARS = 8_000;
export const MAX_OUTLINE_CHARS = 60_000;
const MAX_LABEL_LENGTH = 120;
const MAX_VALUE_LENGTH = 80;
const MAX_CHANGE_LINES = 40;
// Collapsing these hides the most decision-relevant content, so they are the
// last candidates when the outline must shrink.
const PROTECTED_ROLES = new Set(["dialog", "alertdialog", "alert", "status"]);

function bounded(value: string, limit: number): string {
  const singleLine = value.replace(/\s+/gu, " ").trim();
  return singleLine.length <= limit
    ? singleLine
    : `${singleLine.slice(0, limit - 1)}…`;
}

function quoted(value: string, limit: number): string {
  return JSON.stringify(bounded(value, limit));
}

function roleOf(node: SemanticNode): string {
  return node.role ?? (node.kind === "content" ? node.tag : node.kind);
}

function flags(node: SemanticNode): string[] {
  const result: string[] = [];
  if (node.focused) result.push("focused");
  if (!node.enabled) result.push("disabled");
  if (!node.visible) result.push("hidden");
  if (node.checked !== undefined) {
    result.push(
      node.checked === "mixed"
        ? "checked=mixed"
        : node.checked
          ? "checked"
          : "unchecked",
    );
  }
  if (node.selected === true) result.push("selected");
  if (node.expanded !== undefined) {
    result.push(node.expanded ? "expanded" : "collapsed");
  }
  if (node.pressed !== undefined && node.pressed !== false) {
    result.push(node.pressed === "mixed" ? "pressed=mixed" : "pressed");
  }
  if (node.required === true) result.push("required");
  if (node.invalid !== undefined && node.invalid !== false) {
    result.push(node.invalid === true ? "invalid" : `invalid=${node.invalid}`);
  }
  if (node.readOnly === true) result.push("readonly");
  if (node.current !== undefined && node.current !== false) {
    result.push(node.current === true ? "current" : `current=${node.current}`);
  }
  return result;
}

/** One outline line for a node, without indentation or collapse summary. */
export function describeNode(node: SemanticNode, hasChildren = false): string {
  let line = roleOf(node);
  if (node.name !== undefined && node.name.length > 0) {
    line += ` ${quoted(node.name, MAX_LABEL_LENGTH)}`;
  }
  line += ` [${node.ref}]`;
  const nodeFlags = flags(node);
  if (nodeFlags.length > 0) line += ` (${nodeFlags.join(", ")})`;
  if (node.redacted) {
    line += ": [redacted]";
  } else if (node.value !== undefined) {
    line += `: ${quoted(node.value, MAX_VALUE_LENGTH)}`;
  } else if (
    !hasChildren &&
    node.text !== undefined &&
    node.text.trim().length > 0 &&
    bounded(node.text, MAX_LABEL_LENGTH) !==
      bounded(node.name ?? "", MAX_LABEL_LENGTH)
  ) {
    line += `: ${quoted(node.text, MAX_LABEL_LENGTH)}`;
  }
  return line;
}

interface OutlineTree {
  readonly roots: readonly SemanticNode[];
  readonly children: ReadonlyMap<string, readonly SemanticNode[]>;
}

function buildTree(nodes: readonly SemanticNode[]): OutlineTree {
  const refs = new Set(nodes.map((node) => node.ref));
  const children = new Map<string, SemanticNode[]>();
  const roots: SemanticNode[] = [];
  for (const node of nodes) {
    if (node.parentRef === undefined || !refs.has(node.parentRef)) {
      roots.push(node);
      continue;
    }
    const siblings = children.get(node.parentRef) ?? [];
    siblings.push(node);
    children.set(node.parentRef, siblings);
  }
  return { roots, children };
}

function countDescendants(
  node: SemanticNode,
  tree: OutlineTree,
): { readonly items: number; readonly controls: number } {
  let items = 0;
  let controls = 0;
  const stack = [...(tree.children.get(node.ref) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    items += 1;
    if (current.kind === "control") controls += 1;
    stack.push(...(tree.children.get(current.ref) ?? []));
  }
  return { items, controls };
}

function collapseSummary(node: SemanticNode, tree: OutlineTree): string {
  const { items, controls } = countDescendants(node, tree);
  return ` … ${items} items, ${controls} controls hidden (expand: rootRef "${node.ref}")`;
}

/**
 * Plain text wrappers (a span inside a link, a cell's inner text) only repeat
 * what their parent already says. Leaving them out of the outline saves
 * context without hiding anything an agent can act on.
 */
function withoutEchoes(nodes: readonly SemanticNode[]): SemanticNode[] {
  const byRef = new Map(nodes.map((node) => [node.ref, node]));
  const hasChildren = new Set(
    nodes.flatMap((node) =>
      node.parentRef === undefined ? [] : [node.parentRef],
    ),
  );
  return nodes.filter((node) => {
    if (
      node.kind !== "content" ||
      (node.role !== undefined && node.role !== "generic") ||
      node.focused ||
      node.parentRef === undefined ||
      hasChildren.has(node.ref)
    ) {
      return true;
    }
    const text = bounded(node.text ?? node.name ?? "", MAX_LABEL_LENGTH);
    if (text.length === 0) return false;
    const parent = byRef.get(node.parentRef);
    const parentLabel = bounded(
      `${parent?.name ?? ""} ${parent?.text ?? ""}`,
      4 * MAX_LABEL_LENGTH,
    );
    return !parentLabel.includes(text);
  });
}

export interface OutlineOptions {
  readonly maxChars?: number;
}

/**
 * Render a snapshot as an indented outline that fits a character budget.
 * Large subtrees collapse bottom-up into one summary line naming the ref that
 * expands them, so the whole screen stays visible at low resolution.
 */
export function renderOutline(
  snapshot: SemanticSnapshot,
  options: OutlineOptions = {},
): string {
  const totalChars = Math.min(
    Math.max(options.maxChars ?? DEFAULT_OUTLINE_CHARS, 500),
    MAX_OUTLINE_CHARS,
  );
  const header = [
    `window ${quoted(snapshot.window.title, MAX_LABEL_LENGTH)} ${Math.round(
      snapshot.window.width,
    )}x${Math.round(snapshot.window.height)} · generation ${
      snapshot.generation
    }${
      snapshot.surface === undefined
        ? ""
        : ` · surface ${snapshot.surface.surfaceRef}`
    }`,
  ];
  if (snapshot.truncation.truncated) {
    header.push(
      `capture truncated (${snapshot.truncation.reasons.join(
        ", ",
      )}): ${snapshot.truncation.counts.returned} of ${
        snapshot.truncation.counts.matched
      } matched nodes kept; narrow with rootRef, roles, or name`,
    );
  }
  if (snapshot.partial === true) {
    header.push(
      "semantic extraction failed; take a screenshot or retry with rootRef",
    );
  }
  if (snapshot.nodes.length === 0 && snapshot.partial !== true) {
    header.push("no semantic nodes matched");
  }
  const maxChars = Math.max(
    totalChars - header.reduce((sum, line) => sum + line.length + 1, 0) - 90,
    200,
  );
  const nodes = withoutEchoes(snapshot.nodes);
  const tree = buildTree(nodes);
  const collapsed = new Set<string>();
  const lines = new Map<string, string>();
  for (const node of nodes) {
    lines.set(
      node.ref,
      describeNode(node, (tree.children.get(node.ref)?.length ?? 0) > 0),
    );
  }

  const depthOf = new Map<string, number>();
  const assignDepth = (node: SemanticNode, depth: number): void => {
    depthOf.set(node.ref, depth);
    for (const child of tree.children.get(node.ref) ?? []) {
      assignDepth(child, depth + 1);
    }
  };
  tree.roots.forEach((root) => assignDepth(root, 0));
  const ownSize = (node: SemanticNode): number =>
    (depthOf.get(node.ref) ?? 0) * 2 + 3 + lines.get(node.ref)!.length;
  const summaries = new Map<string, string>();
  const summaryOf = (node: SemanticNode): string => {
    let summary = summaries.get(node.ref);
    if (summary === undefined) {
      summary = collapseSummary(node, tree);
      summaries.set(node.ref, summary);
    }
    return summary;
  };
  // Children follow parents in snapshot order, so a reverse pass sizes every
  // subtree in linear time.
  const subtreeSizes = (): Map<string, number> => {
    const sizes = new Map<string, number>();
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]!;
      const kids = tree.children.get(node.ref) ?? [];
      let size = ownSize(node);
      if (kids.length > 0 && collapsed.has(node.ref)) {
        size += summaryOf(node).length;
      } else {
        for (const child of kids) size += sizes.get(child.ref) ?? 0;
      }
      sizes.set(node.ref, size);
    }
    return sizes;
  };

  let sizes = subtreeSizes();
  let current = tree.roots.reduce(
    (sum, root) => sum + (sizes.get(root.ref) ?? 0),
    0,
  );
  const savingOf = (node: SemanticNode): number =>
    (sizes.get(node.ref) ?? 0) - (ownSize(node) + summaryOf(node).length);
  while (current > maxChars) {
    let best: SemanticNode | undefined;
    let bestSaving = 0;
    for (const node of nodes) {
      const kids = tree.children.get(node.ref) ?? [];
      if (kids.length === 0 || collapsed.has(node.ref)) continue;
      // Collapse from the leaves upward: a node is a candidate once every
      // child is a leaf, already collapsed, or too small to be worth folding.
      const frontier = kids.every(
        (child) =>
          (tree.children.get(child.ref)?.length ?? 0) === 0 ||
          collapsed.has(child.ref) ||
          savingOf(child) <= 0,
      );
      if (!frontier) continue;
      const weight = PROTECTED_ROLES.has(roleOf(node)) ? 0.25 : 1;
      const saving = savingOf(node) * weight;
      if (saving > bestSaving) {
        bestSaving = saving;
        best = node;
      }
    }
    if (best === undefined) break;
    collapsed.add(best.ref);
    sizes = subtreeSizes();
    current = tree.roots.reduce(
      (sum, root) => sum + (sizes.get(root.ref) ?? 0),
      0,
    );
  }

  const output: string[] = [];
  let remainingRoots = 0;
  let used = 0;
  const emit = (node: SemanticNode, depth: number): void => {
    const kids = tree.children.get(node.ref) ?? [];
    const summary =
      kids.length > 0 && collapsed.has(node.ref) ? summaryOf(node) : "";
    const line = `${"  ".repeat(depth)}- ${lines.get(node.ref)!}${summary}`;
    output.push(line);
    used += line.length + 1;
    if (summary !== "") return;
    for (const child of kids) emit(child, depth + 1);
  };
  for (const [index, root] of tree.roots.entries()) {
    if (used > maxChars && index > 0) {
      remainingRoots = tree.roots.length - index;
      break;
    }
    emit(root, 0);
  }
  if (remainingRoots > 0) {
    output.push(
      `- … ${remainingRoots} more top-level items (narrow with rootRef, roles, or name)`,
    );
  }

  return [...header, ...output].join("\n");
}

export interface NodeChange {
  readonly ref: string;
  readonly line: string;
  readonly fields: Readonly<
    Record<string, readonly [unknown, unknown] | undefined>
  >;
}

export interface SnapshotChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly NodeChange[];
  readonly counts: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
  };
  readonly truncated: boolean;
}

const COMPARED_FIELDS = [
  "name",
  "text",
  "value",
  "redacted",
  "enabled",
  "visible",
  "checked",
  "selected",
  "expanded",
  "pressed",
  "required",
  "invalid",
  "readOnly",
  "current",
] as const;

/**
 * Describe what changed between two snapshots by stable ref. Refs carry over
 * only for elements the browser proved are the same object, so matching by
 * ref never pairs two different elements.
 */
export function diffSnapshots(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): SnapshotChanges {
  const previous = new Map(before.nodes.map((node) => [node.ref, node]));
  const next = new Map(after.nodes.map((node) => [node.ref, node]));
  const afterTree = buildTree(after.nodes);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: NodeChange[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  const lineBudget = (): boolean =>
    added.length + removed.length + changed.length < MAX_CHANGE_LINES;

  for (const node of after.nodes) {
    const old = previous.get(node.ref);
    if (old === undefined) {
      addedCount += 1;
      if (lineBudget()) {
        added.push(
          describeNode(
            node,
            (afterTree.children.get(node.ref)?.length ?? 0) > 0,
          ),
        );
      }
      continue;
    }
    const fields: Record<string, readonly [unknown, unknown]> = {};
    for (const field of COMPARED_FIELDS) {
      const was = old[field];
      const now = node[field];
      if (was !== now) {
        const redact =
          (field === "value" || field === "text") &&
          (old.redacted || node.redacted);
        fields[field] = redact ? ["[redacted]", "[redacted]"] : [was, now];
      }
    }
    if (Object.keys(fields).length > 0) {
      changedCount += 1;
      if (lineBudget()) {
        changed.push({ ref: node.ref, line: describeNode(node), fields });
      }
    }
  }
  for (const node of before.nodes) {
    if (next.has(node.ref)) continue;
    removedCount += 1;
    if (lineBudget()) removed.push(describeNode(node));
  }
  return {
    added,
    removed,
    changed,
    counts: {
      added: addedCount,
      removed: removedCount,
      changed: changedCount,
    },
    truncated:
      added.length + removed.length + changed.length <
      addedCount + removedCount + changedCount,
  };
}

function formatFieldValue(value: unknown): string {
  if (value === undefined) return "unset";
  if (typeof value === "string") return quoted(value, MAX_VALUE_LENGTH);
  return String(value);
}

export function renderChanges(changes: SnapshotChanges): string[] {
  const lines: string[] = [];
  for (const line of changes.added) lines.push(`+ ${line}`);
  for (const line of changes.removed) lines.push(`- ${line}`);
  for (const change of changes.changed) {
    const detail = Object.entries(change.fields)
      .map(
        ([field, pair]) =>
          `${field} ${formatFieldValue(pair?.[0])} → ${formatFieldValue(
            pair?.[1],
          )}`,
      )
      .join("; ");
    lines.push(`~ ${change.line}: ${detail}`);
  }
  if (changes.truncated) {
    const hidden =
      changes.counts.added +
      changes.counts.removed +
      changes.counts.changed -
      lines.length;
    lines.push(`… ${hidden} more changes; call tauri_snapshot for the outline`);
  }
  return lines;
}
