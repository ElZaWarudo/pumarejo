import { computeAccessibleName, getRole } from "dom-accessibility-api";

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
// bound used here; object framing remains covered by the transport cap.
const MAX_PUBLIC_STRING_BUDGET = 256 * 1024;
const MAX_IDENTITY_STRING_BUDGET = 256 * 1024;
const MAX_OWNERSHIP_CONTEXT_LENGTH = 64;
const NON_EDITABLE_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

interface CollectedNode {
  readonly element: Element;
  readonly descriptor: Record<string, unknown> & {
    relationships: {
      labelledBy: number[];
      describedBy: number[];
      owns: number[];
    };
  };
  readonly relationshipIds: {
    readonly labelledBy: readonly string[];
    readonly describedBy: readonly string[];
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

function booleanAttribute(
  element: Element,
  ariaName: string,
  nativeValue?: boolean,
): boolean | undefined {
  const aria = element.getAttribute(ariaName);
  if (aria === "true") return true;
  if (aria === "false") return false;
  return nativeValue;
}

function triState(value: string | null): boolean | "mixed" | undefined {
  if (value === "mixed") return "mixed";
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function relationshipIds(element: Element, name: string): readonly string[] {
  return (element.getAttribute(name) ?? "")
    .slice(0, MAX_FIELD_LENGTH)
    .split(/\s+/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 256);
}

function isSensitive(element: Element): boolean {
  for (
    let candidate: Element | undefined = element;
    candidate;
    candidate = composedParent(candidate)
  ) {
    if (candidate.getAttribute("data-tauri-agent-sensitive") === "true") {
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
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) return root.getElementById(id) ?? undefined;
  return element.ownerDocument?.getElementById(id) ?? undefined;
}

function nameGraphContainsSensitive(
  element: Element,
  visited = new Set<Element>(),
): boolean {
  if (visited.has(element)) return false;
  if (visited.size >= MAX_TRAVERSED_ELEMENTS) return true;
  visited.add(element);
  if (isSensitive(element)) return true;
  const referencedIds = [
    ...relationshipIds(element, "aria-labelledby"),
    ...relationshipIds(element, "aria-owns"),
  ];
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
  const labelledBy = relationshipIds(element, "aria-labelledby");
  const owns = relationshipIds(element, "aria-owns");
  const labels =
    "labels" in element
      ? (element.labels as NodeListOf<HTMLLabelElement> | null)
      : null;
  if (
    [...labelledBy, ...owns].some((id) => {
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
    labelledBy.length === 0 &&
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

function effectivelyNativeDisabled(element: Element): boolean {
  if (
    "disabled" in element &&
    typeof element.disabled === "boolean" &&
    element.disabled
  ) {
    return true;
  }
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (ancestor instanceof HTMLFieldSetElement && ancestor.disabled) {
      const firstLegend = [...ancestor.children].find(
        (child) => child.localName === "legend",
      );
      if (firstLegend === undefined || !firstLegend.contains(element)) {
        return true;
      }
    }
    if (
      (ancestor instanceof HTMLOptGroupElement ||
        ancestor instanceof HTMLSelectElement) &&
      ancestor.disabled
    ) {
      return true;
    }
  }
  return element.matches(":disabled");
}

function elementValue(element: Element): string | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return element.innerText;
  }
  return undefined;
}

function childElements(element: Element): readonly Element[] {
  if (element instanceof HTMLSlotElement) {
    const assigned = element.assignedElements({ flatten: true });
    if (assigned.length > 0) return assigned;
  }
  if (element.shadowRoot?.mode === "open") {
    return [...element.shadowRoot.children];
  }
  return [...element.children];
}

function editable(element: Element): boolean {
  if (element.getAttribute("aria-readonly") === "true") return false;
  if (element instanceof HTMLInputElement) {
    return (
      !element.readOnly &&
      !NON_EDITABLE_INPUT_TYPES.has(element.type.toLowerCase())
    );
  }
  return (
    (element instanceof HTMLTextAreaElement && !element.readOnly) ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
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

function ownershipSegment(
  element: Element,
  role: string | null,
  name: string | undefined,
): string {
  return `${element.localName}:${role ?? ""}:${(name ?? "").slice(0, 64)}`;
}

function invalidState(
  element: Element,
): boolean | "grammar" | "spelling" | undefined {
  const aria = element.getAttribute("aria-invalid");
  if (aria === "grammar" || aria === "spelling") return aria;
  if (aria === "true") return true;
  if (aria === "false") return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return !element.validity.valid;
  }
  return undefined;
}

function currentState(
  element: Element,
): boolean | "page" | "step" | "location" | "date" | "time" | undefined {
  const current = element.getAttribute("aria-current");
  if (current === null || current === "false")
    return current === "false" ? false : undefined;
  if (["page", "step", "location", "date", "time"].includes(current)) {
    return current as "page" | "step" | "location" | "date" | "time";
  }
  return true;
}

export function collectSnapshot(elements?: readonly Element[]): {
  readonly scriptVersion: typeof SNAPSHOT_SCRIPT_VERSION;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly nodes: readonly {
    readonly handleIndex: number;
    readonly descriptor: CollectedNode["descriptor"];
  }[];
} {
  const collected: CollectedNode[] = [];
  const included = new Map<Element, number>();
  const allIds = new Map<Document | ShadowRoot, Map<string, Element>>();
  const visited = new Set<Element>();
  const automaticHandles = elements === undefined;
  const handles = [...(elements ?? [])];
  const handleIndices = new Map(
    handles.map((element, index) => [element, index] as const),
  );
  let publicStringBudget = MAX_PUBLIC_STRING_BUDGET;
  let identityStringBudget = MAX_IDENTITY_STRING_BUDGET;
  const consumeString = (
    value: string | null | undefined,
  ): string | undefined => {
    const normalized = normalize(value);
    if (normalized === undefined || publicStringBudget === 0) return undefined;
    const result = normalized.slice(0, publicStringBudget);
    publicStringBudget -= result.length;
    return result || undefined;
  };
  const consumeIdentityString = (
    value: string | undefined,
  ): string | undefined => {
    if (value === undefined) return undefined;
    if (value.length > identityStringBudget) {
      throw new Error("snapshot identity string budget exceeded");
    }
    identityStringBudget -= value.length;
    return value;
  };

  const visit = (element: Element, parentIndex: number | null): void => {
    if (visited.has(element)) return;
    if (visited.size >= MAX_TRAVERSED_ELEMENTS) {
      throw new Error("snapshot traversal limit exceeded");
    }
    visited.add(element);
    if (automaticHandles && !handleIndices.has(element)) {
      handleIndices.set(element, handles.length);
      handles.push(element);
    }
    const root = element.getRootNode();
    if (
      element.id &&
      (root instanceof Document || root instanceof ShadowRoot)
    ) {
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
    const kind = isVisible ? semanticKind(element, role, rawText) : undefined;
    let nextParent = parentIndex;

    if (kind !== undefined) {
      const contentSensitive = isSensitive(element);
      const nameSensitive = sensitiveNameSource(element);
      const sensitive = contentSensitive || nameSensitive;
      const identityName = consumeIdentityString(
        stableName(element, nameSensitive),
      );
      const name = consumeString(identityName);
      const text = sensitive ? undefined : consumeString(rawText);
      const value = sensitive
        ? undefined
        : consumeString(elementValue(element));
      const rect = element.getBoundingClientRect();
      const inputType =
        element instanceof HTMLInputElement
          ? element.type.toLowerCase()
          : undefined;
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
      const context =
        parentIndex === null
          ? "root"
          : String(
              collected[parentIndex]?.descriptor.identity &&
                (
                  collected[parentIndex]!.descriptor.identity as {
                    ownershipContext?: string;
                  }
                ).ownershipContext,
            );
      const ownershipContext =
        `${context}/${ownershipSegment(element, role, identityName)}`.slice(
          -MAX_OWNERSHIP_CONTEXT_LENGTH,
        );
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
        visible: true as const,
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
        relationships: { labelledBy: [], describedBy: [], owns: [] },
        ...(checked === undefined ? {} : { checked }),
        ...(selected === undefined ? {} : { selected }),
        ...(expanded === undefined ? {} : { expanded }),
        ...(pressed === undefined ? {} : { pressed }),
        ...(required === undefined ? {} : { required }),
        ...(invalidState(element) === undefined
          ? {}
          : { invalid: invalidState(element) }),
        ...(readOnly === undefined ? {} : { readOnly }),
        ...(currentState(element) === undefined
          ? {}
          : { current: currentState(element) }),
        identity: {
          ...(identityName === undefined ? {} : { name: identityName }),
          ...(inputType === undefined ? {} : { inputType }),
          ownershipContext,
        },
      };
      nextParent = collected.length;
      included.set(element, nextParent);
      collected.push({
        element,
        descriptor,
        relationshipIds: {
          labelledBy: relationshipIds(element, "aria-labelledby"),
          describedBy: relationshipIds(element, "aria-describedby"),
          owns: relationshipIds(element, "aria-owns"),
        },
      });
    }

    for (const child of childElements(element)) visit(child, nextParent);
  };

  for (const child of [...document.documentElement.children]) {
    visit(child, null);
  }

  for (const node of collected) {
    const root = node.element.getRootNode();
    const rootIds =
      root instanceof Document || root instanceof ShadowRoot
        ? allIds.get(root)
        : undefined;
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
    node.descriptor.relationships.owns = resolveIndices(
      node.relationshipIds.owns,
    );
  }

  return {
    scriptVersion: SNAPSHOT_SCRIPT_VERSION,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    nodes: collected.map(({ element, descriptor }) => {
      const handleIndex = handleIndices.get(element);
      if (handleIndex === undefined) {
        throw new Error("snapshot element has no WebDriver handle");
      }
      return { handleIndex, descriptor };
    }),
  };
}

export function collectIdentity(element: Element): {
  readonly attached: boolean;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly editable: boolean;
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
  const chain: {
    readonly element: Element;
    readonly role: string | null;
    readonly kind: SemanticKind;
    readonly name: string | undefined;
  }[] = [];
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
        name: stableName(candidate, undefined, !visible(candidate)),
      });
    }
  }
  chain.reverse();
  let ownershipContext = "root";
  for (const item of chain) {
    ownershipContext =
      `${ownershipContext}/${ownershipSegment(item.element, item.role, item.name)}`.slice(
        -MAX_OWNERSHIP_CONTEXT_LENGTH,
      );
  }
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
