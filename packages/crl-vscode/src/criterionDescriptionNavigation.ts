/// <reference lib="dom" />

/** Local navigation between a criterion's SVG indicator and its selectable long description. */
export function installCriterionDescriptionNavigation(root: HTMLElement) {
  const doc = root.ownerDocument;
  let selected: { identity: string; occurrence: string } | undefined;
  let disclosureOpen: boolean | undefined;
  let highlightTimer: number | undefined;
  const findByData = <T extends HTMLElement | SVGElement>(selector: string, field: string, value: string): T | undefined =>
    Array.from(root.querySelectorAll<T>(selector)).find((element) => element.dataset[field] === value);
  const visible = (element: Element): boolean =>
    !element.closest(".flow-focus-hidden") && doc.defaultView!.getComputedStyle(element).display !== "none" && element.getClientRects().length > 0;
  const occurrenceControl = (key: string): SVGElement | undefined =>
    findByData<SVGElement>("[data-criterion-info]", "criterionInfo", key);
  const clearEntryHighlight = () => {
    if (highlightTimer !== undefined) doc.defaultView!.clearTimeout(highlightTimer);
    highlightTimer = undefined;
    for (const entry of Array.from(root.querySelectorAll(".flow-criterion-description.is-target"))) entry.classList.remove("is-target");
  };
  const paintSelection = () => {
    for (const control of Array.from(root.querySelectorAll(".flow-criterion-info"))) {
      control.classList.remove("is-description-active");
      control.setAttribute("aria-expanded", "false");
    }
    if (!selected) return;
    const control = occurrenceControl(selected.occurrence);
    control?.classList.add("is-description-active");
    control?.setAttribute("aria-expanded", "true");
  };
  const clearSelection = () => {
    const details = root.querySelector<HTMLDetailsElement>(".flow-criterion-descriptions");
    const control = selected && occurrenceControl(selected.occurrence);
    if (details?.contains(doc.activeElement) && control && visible(control)) control.focus({ preventScroll: true });
    if (details) { details.open = false; details.hidden = true; }
    disclosureOpen = false;
    selected = undefined;
    paintSelection();
    clearEntryHighlight();
  };
  const highlightEntry = (entry: HTMLElement) => {
    clearEntryHighlight();
    entry.classList.add("is-target");
    highlightTimer = doc.defaultView!.setTimeout(() => {
      entry.classList.remove("is-target");
      highlightTimer = undefined;
    }, 1800);
  };
  const close = (details: HTMLDetailsElement) => {
    details.open = false;
    clearSelection();
  };
  const open = (identity: string, occurrence: string, control: SVGElement) => {
    const entry = findByData<HTMLElement>("[data-criterion-description]", "criterionDescription", identity);
    const details = entry?.closest<HTMLDetailsElement>(".flow-criterion-descriptions");
    if (!entry || !details) { clearSelection(); return; }
    control.focus({ preventScroll: true });
    if (selected?.occurrence === occurrence && details.open) { close(details); return; }
    selected = { identity, occurrence };
    details.hidden = false;
    details.open = true;
    disclosureOpen = true;
    paintSelection();
    entry.scrollIntoView({ block: "center", inline: "nearest" });
    highlightEntry(entry);
  };
  root.addEventListener("click", (event) => {
    const info = (event.target as Element).closest<SVGElement>("[data-criterion-info]");
    if (!info) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const owner = info.closest<SVGElement>("[data-flow-criterion]");
    const identity = owner?.dataset.flowCriterion;
    if (identity) open(identity, info.dataset.criterionInfo!, info);
  });
  root.addEventListener("toggle", (event) => {
    const details = event.target as HTMLDetailsElement;
    if (!details.matches(".flow-criterion-descriptions") || details.open) return;
    disclosureOpen = false;
    clearSelection();
  }, true);
  const refresh = () => {
    const details = root.querySelector<HTMLDetailsElement>(".flow-criterion-descriptions");
    if (!details?.open || !selected) { clearSelection(); return; }
    const control = occurrenceControl(selected.occurrence);
    if (!control || !visible(control)) clearSelection();
    else { details.hidden = false; paintSelection(); }
  };
  return {
    beforeRender() { disclosureOpen = root.querySelector<HTMLDetailsElement>(".flow-criterion-descriptions")?.open; },
    restore() {
      const details = root.querySelector<HTMLDetailsElement>(".flow-criterion-descriptions");
      if (!details) { clearSelection(); return; }
      if (disclosureOpen !== undefined) details.open = disclosureOpen;
      if (selected && !findByData<HTMLElement>("[data-criterion-description]", "criterionDescription", selected.identity)) selected = undefined;
      refresh();
    },
    refresh,
    reset() { clearSelection(); disclosureOpen = undefined; },
  };
}

/** Make live criterion-description affordances inert while retaining readable description/context text. */
export function sanitizeCriterionDescriptionSnapshot(clone: HTMLElement) {
  for (const info of Array.from(clone.querySelectorAll("[data-criterion-info]"))) info.remove();
  // Static snapshots have no live info controls; keep native disclosure access to their text.
  for (const details of Array.from(clone.querySelectorAll<HTMLElement>(".flow-criterion-descriptions"))) details.hidden = false;
  for (const transient of Array.from(clone.querySelectorAll(".flow-criterion-description.is-target,.flow-criterion-info.is-description-active"))) {
    transient.classList.remove("is-target", "is-description-active");
  }
}
