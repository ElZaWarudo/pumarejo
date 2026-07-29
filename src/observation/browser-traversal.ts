export function childElements(element: Element): readonly Element[] {
  if (element instanceof HTMLSlotElement) {
    const assigned = element.assignedElements({ flatten: true });
    if (assigned.length > 0) return assigned;
  }
  if (element.shadowRoot?.mode === "open") {
    return [...element.shadowRoot.children];
  }
  return [...element.children];
}

export function providerHandleIndices(
  targets: ReadonlySet<Element>,
): ReadonlyMap<Element, number> {
  const remaining = new Set(targets);
  const indices = new Map<Element, number>();
  let roots: readonly (Document | ShadowRoot)[] = [document];
  let index = 0;
  while (remaining.size > 0 && roots.length > 0) {
    const nextRoots: ShadowRoot[] = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      ) {
        const element = node as Element;
        if (remaining.delete(element)) indices.set(element, index);
        index += 1;
        if (remaining.size === 0) return indices;
        if (element.shadowRoot?.mode === "open") {
          nextRoots.push(element.shadowRoot);
        }
      }
    }
    roots = nextRoots;
  }
  return indices;
}
