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

export function booleanAttribute(
  element: Element,
  ariaName: string,
  nativeValue?: boolean,
): boolean | undefined {
  const aria = element.getAttribute(ariaName);
  if (aria === "true") return true;
  if (aria === "false") return false;
  return nativeValue;
}

export function triState(value: string | null): boolean | "mixed" | undefined {
  if (value === "mixed") return "mixed";
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function effectivelyNativeDisabled(element: Element): boolean {
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

export function elementValue(element: Element): string | undefined {
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

export function editable(element: Element): boolean {
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

export function invalidState(
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

export function currentState(
  element: Element,
): boolean | "page" | "step" | "location" | "date" | "time" | undefined {
  const current = element.getAttribute("aria-current");
  if (current === null || current === "false") {
    return current === "false" ? false : undefined;
  }
  if (["page", "step", "location", "date", "time"].includes(current)) {
    return current as "page" | "step" | "location" | "date" | "time";
  }
  return true;
}
