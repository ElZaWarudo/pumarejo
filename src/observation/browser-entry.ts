import { computeAccessibleName, getRole } from "dom-accessibility-api";

import {
  booleanAttribute,
  currentState,
  editable,
  effectivelyNativeDisabled,
  elementValue,
  invalidState,
  triState,
} from "./browser-state.js";
import { childElements, providerHandleIndices } from "./browser-traversal.js";

type SemanticKind =
  | "control"
  | "content"
  | "status"
  | "dialog"
  | "list"
  | "listitem"
  | "table"
  | "row"
  | "cell";

export const SNAPSHOT_SCRIPT_VERSION = 1;
const MAX_TRAVERSED_ELEMENTS = 10_000;
const MAX_FIELD_SOURCE_LENGTH = 131_072;
const MAX_FIELD_LENGTH = 65_536;
// Four UTF-8 bytes per UTF-16 code unit is the conservative serialization
// bound used here. The remaining MCP transport budget covers node framing and
// the separately bounded relationship references.
const MAX_PUBLIC_STRING_BUDGET = 64 * 1024;
const MAX_PUBLIC_RELATIONSHIP_TARGETS = 8_192;
const MAX_IDENTITY_NAME_LENGTH = 512;
const MAX_OWNERSHIP_CONTEXT_LENGTH = 64;
const MAX_RELATIONSHIP_TARGETS = 32;
const MAX_SECURITY_RELATIONSHIP_TARGETS = 256;

export interface BrowserSnapshotOptions {
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxTextLength?: number;
  readonly visibleOnly?: boolean;
  readonly includeNames?: boolean;
  readonly includeText?: boolean;
  readonly includeValues?: boolean;
  readonly roles?: readonly string[];
  readonly name?: string;
  readonly types?: readonly string[];
}

type TruncationReason =
  | "maxNodes"
  | "maxDepth"
  | "maxTextLength"
  | "fieldBudget"
  | "traversalLimit";
interface CollectedNode {
  readonly element: Element;
  readonly descriptor: Record<string, unknown> & {
    relationships: {
      labelledBy: number[];
      describedBy: number[];
      controls: number[];
      owns: number[];
    };
  };
  readonly relationshipIds: {
    readonly labelledBy: readonly string[];
    readonly describedBy: readonly string[];
    readonly controls: readonly string[];
    readonly owns: readonly string[];
  };
}

const CONTROL_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "scrollbar",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);
const CONTROL_TAGS = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);
const CONTENT_TAGS = new Set([
  "dd",
  "dt",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "label",
  "legend",
  "p",
  "pre",
  "section",
]);
const SENSITIVE_AUTOCOMPLETE = new Set([
  "cc-csc",
  "cc-number",
  "current-password",
  "new-password",
  "one-time-code",
]);
const CHECKED_ROLES = new Set([
  "checkbox",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
]);
const SELECTED_ROLES = new Set([
  "gridcell",
  "option",
  "row",
  "tab",
  "treeitem",
]);
const EXPANDED_ROLES = new Set([
  "button",
  "combobox",
  "link",
  "menuitem",
  "row",
  "tab",
  "treeitem",
]);
const REQUIRED_ROLES = new Set([
  "checkbox",
  "combobox",
  "gridcell",
  "listbox",
  "radio",
  "radiogroup",
  "searchbox",
  "spinbutton",
  "textbox",
  "tree",
]);
const READONLY_ROLES = new Set([
  "combobox",
  "grid",
  "gridcell",
  "listbox",
  "radiogroup",
  "slider",
  "searchbox",
  "spinbutton",
  "textbox",
]);

function normalize(value: string | null | undefined): string | undefined {
  const normalized = value
    ?.slice(0, MAX_FIELD_SOURCE_LENGTH)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
  return normalized ? normalized : undefined;
}

function composedParent(element: Element): Element | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
}

function visible(element: Element): boolean {
  for (
    let candidate: Element | undefined = element;
    candidate;
    candidate = composedParent(candidate)
  ) {
    const style = getComputedStyle(candidate);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      candidate.hasAttribute("hidden") ||
      candidate.hasAttribute("inert") ||
      candidate.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function semanticKind(
  element: Element,
  role: string | null,
  text: string | undefined,
): SemanticKind | undefined {
  const tag = element.localName;
  if (
    CONTROL_TAGS.has(tag) ||
    (tag === "a" && element.hasAttribute("href")) ||
    CONTROL_ROLES.has(role ?? "") ||
    (element instanceof HTMLElement && element.tabIndex >= 0)
  ) {
    return "control";
  }
  if (role === "status" || role === "alert" || tag === "output")
    return "status";
  if (role === "dialog" || role === "alertdialog" || tag === "dialog") {
    return "dialog";
  }
  if (
    role === "list" ||
    role === "listbox" ||
    role === "menu" ||
    tag === "ul" ||
    tag === "ol"
  ) {
    return "list";
  }
  if (
    role === "listitem" ||
    role === "option" ||
    role === "menuitem" ||
    tag === "li"
  ) {
    return "listitem";
  }
  if (
    role === "table" ||
    role === "grid" ||
    role === "treegrid" ||
    tag === "table"
  ) {
    return "table";
  }
  if (role === "row" || tag === "tr") return "row";
  if (
    role === "cell" ||
    role === "gridcell" ||
    role === "columnheader" ||
    role === "rowheader" ||
    tag === "td" ||
    tag === "th"
  ) {
    return "cell";
  }
  if (
    CONTENT_TAGS.has(tag) ||
    ["definition", "heading", "img", "note", "term"].includes(role ?? "") ||
    (text !== undefined && element.children.length === 0)
  ) {
    return "content";
  }
  return undefined;
}

function relationshipTokens(
  element: Element,
  name: string,
): { readonly ids: readonly string[]; readonly complete: boolean } {
  const source = element.getAttribute(name) ?? "";
  return {
    ids: source
      .slice(0, MAX_FIELD_LENGTH)
      .split(/\s+/u)
      .map((value) => value.trim())
      .filter(Boolean),
    complete: source.length <= MAX_FIELD_LENGTH,
  };
}

function relationshipIds(
  element: Element,
  name: string,
): { readonly ids: readonly string[]; readonly complete: boolean } {
  const tokens = relationshipTokens(element, name);
  return {
    ids: tokens.ids.slice(0, MAX_RELATIONSHIP_TARGETS),
    complete: tokens.complete && tokens.ids.length <= MAX_RELATIONSHIP_TARGETS,
  };
}

function securityRelationshipIds(
  element: Element,
  name: string,
): { readonly ids: readonly string[]; readonly complete: boolean } {
  const tokens = relationshipTokens(element, name);
  return {
    ids: tokens.ids.slice(0, MAX_SECURITY_RELATIONSHIP_TARGETS),
    complete:
      tokens.complete && tokens.ids.length <= MAX_SECURITY_RELATIONSHIP_TARGETS,
  };
}

function isSensitive(element: Element): boolean {
  for (
    let candidate: Element | undefined = element;
    candidate;
    candidate = composedParent(candidate)
  ) {
    if (candidate.getAttribute("data-pumarejo-sensitive") === "true") {
      return true;
    }
  }
  if (element instanceof HTMLInputElement) {
    if (element.type.toLowerCase() === "password") return true;
    const tokens = element.autocomplete.toLowerCase().split(/\s+/u);
    return tokens.some((token) => SENSITIVE_AUTOCOMPLETE.has(token));
  }
  return false;
}

function idReference(element: Element, id: string): Element | undefined {
  return relationshipRoot(element).getElementById(id) ?? undefined;
}

function relationshipRoot(element: Element): Document | ShadowRoot {
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root : element.ownerDocument;
}

function nameGraphContainsSensitive(
  element: Element,
  visited = new Set<Element>(),
): boolean {
  if (visited.has(element)) return false;
  if (visited.size >= MAX_TRAVERSED_ELEMENTS) return true;
  visited.add(element);
  if (isSensitive(element)) return true;
  const labelledBy = securityRelationshipIds(element, "aria-labelledby");
  const owns = securityRelationshipIds(element, "aria-owns");
  if (!labelledBy.complete || !owns.complete) return true;
  const referencedIds = [...labelledBy.ids, ...owns.ids];
  if (
    referencedIds.some((id) => {
      const referenced = idReference(element, id);
      return (
        referenced !== undefined &&
        nameGraphContainsSensitive(referenced, visited)
      );
    })
  ) {
    return true;
  }
  const labels =
    "labels" in element
      ? (element.labels as NodeListOf<HTMLLabelElement> | null)
      : null;
  if (
    labels !== null &&
    [...labels].some((label) => nameGraphContainsSensitive(label, visited))
  ) {
    return true;
  }
  return childElements(element).some((child) =>
    nameGraphContainsSensitive(child, visited),
  );
}

function sensitiveNameSource(element: Element): boolean {
  const labelledBy = securityRelationshipIds(element, "aria-labelledby");
  const owns = securityRelationshipIds(element, "aria-owns");
  if (!labelledBy.complete || !owns.complete) return true;
  const labels =
    "labels" in element
      ? (element.labels as NodeListOf<HTMLLabelElement> | null)
      : null;
  if (
    [...labelledBy.ids, ...owns.ids].some((id) => {
      const referenced = idReference(element, id);
      return referenced !== undefined && nameGraphContainsSensitive(referenced);
    }) ||
    (labels !== null &&
      [...labels].some((label) => nameGraphContainsSensitive(label)))
  ) {
    return true;
  }
  if (
    childElements(element).some((child) => nameGraphContainsSensitive(child))
  ) {
    return true;
  }
  return (
    isSensitive(element) &&
    labelledBy.ids.length === 0 &&
    (labels === null || labels.length === 0)
  );
}

function ariaDisabled(element: Element): boolean {
  for (
    let candidate: Element | undefined = element;
    candidate;
    candidate = composedParent(candidate)
  ) {
    if (candidate.getAttribute("aria-disabled") === "true") return true;
  }
  return false;
}

function stableName(
  element: Element,
  nameSensitive = sensitiveNameSource(element),
  includeHidden = false,
): string | undefined {
  return nameSensitive
    ? undefined
    : normalize(
        computeAccessibleName(element, includeHidden ? { hidden: true } : {}),
      );
}

function boundedIdentityName(
  element: Element,
  nameSensitive = sensitiveNameSource(element),
  includeHidden = false,
): string | undefined {
  return stableName(element, nameSensitive, includeHidden)?.slice(
    0,
    MAX_IDENTITY_NAME_LENGTH,
  );
}

function ownershipSegment(
  element: Element,
  role: string | null,
  name: string | undefined,
): string {
  return `${element.localName}:${role ?? ""}:${(name ?? "").slice(0, 64)}`;
}

interface SemanticIdentityItem {
  readonly element: Element;
  readonly role: string | null;
  readonly kind: SemanticKind;
  readonly name: string | undefined;
}

function semanticIdentityChain(
  element: Element,
  currentNameSensitive?: boolean,
  nameSensitiveFor: (candidate: Element) => boolean = sensitiveNameSource,
  identityNameFor: (
    candidate: Element,
    nameSensitive: boolean,
    includeHidden: boolean,
  ) => string | undefined = boundedIdentityName,
): readonly SemanticIdentityItem[] {
  const chain: SemanticIdentityItem[] = [];
  let traversed = 0;
  for (
    let candidate: Element | undefined = element;
    candidate;
    candidate = composedParent(candidate)
  ) {
    traversed += 1;
    if (traversed > MAX_TRAVERSED_ELEMENTS) {
      throw new Error("identity traversal limit exceeded");
    }
    const role = getRole(candidate);
    const rawText =
      candidate instanceof HTMLElement
        ? normalize(candidate.innerText || candidate.textContent)
        : normalize(candidate.textContent);
    const kind = semanticKind(candidate, role, rawText);
    if (kind !== undefined) {
      chain.push({
        element: candidate,
        role,
        kind,
        name: identityNameFor(
          candidate,
          candidate === element
            ? (currentNameSensitive ?? nameSensitiveFor(candidate))
            : nameSensitiveFor(candidate),
          !visible(candidate),
        ),
      });
    }
  }
  chain.reverse();
  return chain;
}

function ownershipContextFor(chain: readonly SemanticIdentityItem[]): string {
  let context = "root";
  for (const item of chain) {
    context =
      `${context}/${ownershipSegment(item.element, item.role, item.name)}`.slice(
        -MAX_OWNERSHIP_CONTEXT_LENGTH,
      );
  }
  return context;
}

export function collectSnapshot(
  options: BrowserSnapshotOptions = {},
  rootElement?: Element,
): {
  readonly scriptVersion: typeof SNAPSHOT_SCRIPT_VERSION;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly handles: readonly Element[];
  readonly nodes: readonly {
    readonly handleIndex: number;
    readonly providerHandleIndex: number;
    readonly descriptor: CollectedNode["descriptor"];
  }[];
  readonly truncation: {
    readonly truncated: boolean;
    readonly reasons: readonly TruncationReason[];
    readonly counts: {
      readonly visited: number;
      readonly candidates: number;
      readonly matched: number;
      readonly returned: number;
      readonly filtered: number;
    };
    readonly refineWith: readonly (
      | "rootRef"
      | "maxNodes"
      | "maxDepth"
      | "maxTextLength"
      | "filters"
    )[];
  };
} {
  const maxNodes = Math.min(Math.max(options.maxNodes ?? 500, 1), 500);
  const maxDepth = Math.min(Math.max(options.maxDepth ?? 32, 0), 256);
  const maxTextLength = Math.min(
    Math.max(options.maxTextLength ?? 4096, 1),
    MAX_FIELD_LENGTH,
  );
  const visibleOnly = options.visibleOnly ?? true;
  const includeNames = options.includeNames ?? true;
  const includeText = options.includeText ?? true;
  const includeValues = options.includeValues ?? true;
  const roleFilter = new Set(
    options.roles?.map((role) => role.trim().toLowerCase()).filter(Boolean) ??
      [],
  );
  const typeFilter = new Set(
    options.types?.map((type) => type.trim().toLowerCase()).filter(Boolean) ??
      [],
  );
  const nameFilter = options.name?.trim().toLocaleLowerCase();
  const collected: CollectedNode[] = [];
  const included = new Map<Element, number>();
  const allIds = new Map<Document | ShadowRoot, Map<string, Element>>();
  const visited = new Set<Element>();
  const handles: Element[] = [];
  const reasons = new Set<TruncationReason>();
  let traversalExhausted = false;
  let candidates = 0;
  let matched = 0;
  let filtered = 0;
  let publicStringBudget = MAX_PUBLIC_STRING_BUDGET;
  let publicRelationshipBudget = MAX_PUBLIC_RELATIONSHIP_TARGETS;
  const nameSensitivityCache = new WeakMap<Element, boolean>();
  const identityNameCache = new WeakMap<
    Element,
    Map<boolean, string | undefined>
  >();
  const cachedNameSensitivity = (element: Element): boolean => {
    const cached = nameSensitivityCache.get(element);
    if (cached !== undefined) return cached;
    const result = sensitiveNameSource(element);
    nameSensitivityCache.set(element, result);
    return result;
  };
  const cachedIdentityName = (
    element: Element,
    nameSensitive: boolean,
    includeHidden: boolean,
  ): string | undefined => {
    let byVisibility = identityNameCache.get(element);
    if (byVisibility === undefined) {
      byVisibility = new Map();
      identityNameCache.set(element, byVisibility);
    }
    if (byVisibility.has(includeHidden)) return byVisibility.get(includeHidden);
    const result = boundedIdentityName(element, nameSensitive, includeHidden);
    byVisibility.set(includeHidden, result);
    return result;
  };
  const consumeString = (
    value: string | null | undefined,
  ): string | undefined => {
    const normalized = normalize(value);
    if (normalized === undefined) return undefined;
    if (publicStringBudget === 0) {
      reasons.add("fieldBudget");
      return undefined;
    }
    const fieldBounded = normalized.slice(0, maxTextLength);
    if (fieldBounded.length < normalized.length) reasons.add("maxTextLength");
    const result = fieldBounded.slice(0, publicStringBudget);
    if (result.length < fieldBounded.length) reasons.add("fieldBudget");
    publicStringBudget -= result.length;
    return result || undefined;
  };
  const consumeRelationshipIds = (
    element: Element,
    name: string,
  ): readonly string[] => {
    const relationship = relationshipIds(element, name);
    const result = relationship.ids.slice(0, publicRelationshipBudget);
    if (!relationship.complete || result.length < relationship.ids.length) {
      reasons.add("fieldBudget");
    }
    publicRelationshipBudget -= result.length;
    return result;
  };

  const visit = (
    element: Element,
    parentIndex: number | null,
    depth: number,
  ): void => {
    if (traversalExhausted || visited.has(element)) return;
    if (visited.size >= MAX_TRAVERSED_ELEMENTS) {
      reasons.add("traversalLimit");
      traversalExhausted = true;
      return;
    }
    if (depth > maxDepth) {
      reasons.add("maxDepth");
      return;
    }
    visited.add(element);
    const root = relationshipRoot(element);
    if (element.id) {
      const rootIds = allIds.get(root) ?? new Map<string, Element>();
      if (!rootIds.has(element.id)) rootIds.set(element.id, element);
      allIds.set(root, rootIds);
    }

    const isVisible = visible(element);
    const role = getRole(element);
    const rawText =
      element instanceof HTMLElement
        ? normalize(element.innerText || element.textContent)
        : normalize(element.textContent);
    const kind =
      !visibleOnly || isVisible
        ? semanticKind(element, role, rawText)
        : undefined;
    let nextParent = parentIndex;

    if (kind !== undefined) {
      candidates += 1;
      const inputType =
        element instanceof HTMLInputElement
          ? element.type.toLowerCase()
          : undefined;
      const cheapFilterMatches =
        (roleFilter.size === 0 || roleFilter.has(role ?? "")) &&
        (typeFilter.size === 0 ||
          (inputType !== undefined && typeFilter.has(inputType)));
      let nameSensitive: boolean | undefined;
      let rawIdentityName: string | undefined;
      if (cheapFilterMatches && nameFilter !== undefined) {
        nameSensitive = cachedNameSensitivity(element);
        rawIdentityName = cachedIdentityName(element, nameSensitive, false);
      }
      const filterMatches =
        cheapFilterMatches &&
        (nameFilter === undefined ||
          (rawIdentityName?.toLocaleLowerCase().includes(nameFilter) ?? false));
      if (!filterMatches) {
        filtered += 1;
        for (const child of childElements(element)) {
          visit(child, nextParent, depth + 1);
          if (traversalExhausted) break;
        }
        return;
      }
      matched += 1;
      if (collected.length >= maxNodes) {
        reasons.add("maxNodes");
        for (const child of childElements(element)) {
          visit(child, nextParent, depth + 1);
          if (traversalExhausted) break;
        }
        return;
      }
      nameSensitive ??= cachedNameSensitivity(element);
      const identityChain = semanticIdentityChain(
        element,
        nameSensitive,
        cachedNameSensitivity,
        cachedIdentityName,
      );
      const identityName =
        identityChain.at(-1)?.element === element
          ? identityChain.at(-1)?.name
          : undefined;
      const sensitive = isSensitive(element) || nameSensitive;
      const name = includeNames ? consumeString(identityName) : undefined;
      const text =
        sensitive || !includeText ? undefined : consumeString(rawText);
      const value =
        sensitive || !includeValues
          ? undefined
          : consumeString(elementValue(element));
      const rect = element.getBoundingClientRect();
      const checkedValue =
        element instanceof HTMLInputElement &&
        (element.type === "checkbox" || element.type === "radio")
          ? (triState(element.getAttribute("aria-checked")) ?? element.checked)
          : triState(element.getAttribute("aria-checked"));
      const checked = CHECKED_ROLES.has(role ?? "") ? checkedValue : undefined;
      const pressed =
        role === "button"
          ? triState(element.getAttribute("aria-pressed"))
          : undefined;
      const selected = SELECTED_ROLES.has(role ?? "")
        ? booleanAttribute(
            element,
            "aria-selected",
            element instanceof HTMLOptionElement ? element.selected : undefined,
          )
        : undefined;
      const nativeExpanded =
        element.localName === "summary" &&
        element.parentElement instanceof HTMLDetailsElement
          ? element.parentElement.open
          : undefined;
      const expanded = EXPANDED_ROLES.has(role ?? "")
        ? booleanAttribute(element, "aria-expanded", nativeExpanded)
        : undefined;
      const required = REQUIRED_ROLES.has(role ?? "")
        ? booleanAttribute(
            element,
            "aria-required",
            "required" in element && typeof element.required === "boolean"
              ? element.required
              : undefined,
          )
        : undefined;
      const readOnly = READONLY_ROLES.has(role ?? "")
        ? booleanAttribute(
            element,
            "aria-readonly",
            "readOnly" in element && typeof element.readOnly === "boolean"
              ? element.readOnly
              : undefined,
          )
        : undefined;
      const invalid = invalidState(element);
      const current = currentState(element);
      const ownershipContext = ownershipContextFor(identityChain);
      const descriptor = {
        parentIndex,
        kind,
        tag: element.localName,
        ...(role === null ? {} : { role }),
        ...(name === undefined ? {} : { name }),
        ...(name === undefined ? {} : { nameSafe: true as const }),
        ...(text === undefined ? {} : { text }),
        ...(value === undefined ? {} : { value }),
        redacted: sensitive,
        enabled: !effectivelyNativeDisabled(element) && !ariaDisabled(element),
        visible: isVisible,
        focused:
          document.activeElement === element ||
          (element.getRootNode() instanceof ShadowRoot &&
            (element.getRootNode() as ShadowRoot).activeElement === element),
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        relationships: {
          labelledBy: [],
          describedBy: [],
          controls: [],
          owns: [],
        },
        ...(checked === undefined ? {} : { checked }),
        ...(selected === undefined ? {} : { selected }),
        ...(expanded === undefined ? {} : { expanded }),
        ...(pressed === undefined ? {} : { pressed }),
        ...(required === undefined ? {} : { required }),
        ...(invalid === undefined ? {} : { invalid }),
        ...(readOnly === undefined ? {} : { readOnly }),
        ...(current === undefined ? {} : { current }),
        identity: {
          ...(identityName === undefined ? {} : { name: identityName }),
          ...(inputType === undefined ? {} : { inputType }),
          ownershipContext,
        },
      };
      nextParent = collected.length;
      included.set(element, nextParent);
      handles.push(element);
      collected.push({
        element,
        descriptor,
        relationshipIds: {
          labelledBy: consumeRelationshipIds(element, "aria-labelledby"),
          describedBy: consumeRelationshipIds(element, "aria-describedby"),
          controls: consumeRelationshipIds(element, "aria-controls"),
          owns: consumeRelationshipIds(element, "aria-owns"),
        },
      });
    }

    for (const child of childElements(element)) {
      visit(child, nextParent, depth + 1);
      if (traversalExhausted) break;
    }
  };

  if (rootElement !== undefined) {
    visit(rootElement, null, 0);
  } else {
    for (const child of [...document.documentElement.children]) {
      visit(child, null, 0);
      if (traversalExhausted) break;
    }
  }

  for (const node of collected) {
    const rootIds = allIds.get(relationshipRoot(node.element));
    const resolveIndices = (ids: readonly string[]): number[] =>
      ids
        .map((id) => included.get(rootIds?.get(id)!))
        .filter((index): index is number => index !== undefined);
    node.descriptor.relationships.labelledBy = resolveIndices(
      node.relationshipIds.labelledBy,
    );
    node.descriptor.relationships.describedBy = resolveIndices(
      node.relationshipIds.describedBy,
    );
    node.descriptor.relationships.controls = resolveIndices(
      node.relationshipIds.controls,
    );
    node.descriptor.relationships.owns = resolveIndices(
      node.relationshipIds.owns,
    );
  }

  const providerIndices = providerHandleIndices(
    new Set(collected.map(({ element }) => element)),
  );
  return {
    scriptVersion: SNAPSHOT_SCRIPT_VERSION,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    handles,
    nodes: collected.map(({ element, descriptor }, handleIndex) => {
      const providerHandleIndex = providerIndices.get(element);
      if (providerHandleIndex === undefined) {
        throw new Error("snapshot element is outside provider handle order");
      }
      return { handleIndex, providerHandleIndex, descriptor };
    }),
    truncation: {
      truncated: reasons.size > 0,
      reasons: [...reasons],
      counts: {
        visited: visited.size,
        candidates,
        matched,
        returned: collected.length,
        filtered,
      },
      refineWith:
        reasons.size === 0
          ? []
          : ["rootRef", "maxNodes", "maxDepth", "maxTextLength", "filters"],
    },
  };
}

export function collectIdentity(element: Element): {
  readonly attached: boolean;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly editable: boolean;
  readonly tag?: string;
  readonly kind?: SemanticKind;
  readonly role?: string;
  readonly name?: string;
  readonly inputType?: string;
  readonly ownershipContext?: string;
} {
  if (
    !(element instanceof Element) ||
    !element.isConnected ||
    element.ownerDocument !== document
  ) {
    return {
      attached: false,
      visible: false,
      enabled: false,
      editable: false,
    };
  }
  const chain = semanticIdentityChain(element);
  const ownershipContext = ownershipContextFor(chain);
  const current = chain.at(-1);
  const inputType =
    element instanceof HTMLInputElement
      ? element.type.toLowerCase()
      : undefined;
  return {
    attached: true,
    visible: visible(element),
    enabled: !effectivelyNativeDisabled(element) && !ariaDisabled(element),
    editable: editable(element),
    tag: element.localName,
    ...(current?.element !== element || current.kind === undefined
      ? {}
      : { kind: current.kind }),
    ...(current?.element !== element || current.role === null
      ? {}
      : { role: current.role }),
    ...(current?.element !== element || current.name === undefined
      ? {}
      : { name: current.name }),
    ...(inputType === undefined ? {} : { inputType }),
    ...(current?.element === element ? { ownershipContext } : {}),
  };
}
