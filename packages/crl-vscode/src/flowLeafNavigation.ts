/// <reference lib="dom" />
/** Tree navigation delegates activation to the same handlers as pointer clicks. */
export function installFlowLeafNavigation(root: HTMLElement) {
  const doc = root.ownerDocument, win = doc.defaultView!;
  const events = new win.AbortController();
  const nodeSelector = "[data-flow-navigation-node]";
  const buttonSelector = "[data-flow-pin],.route-layout-toggle,[data-node-flag-gid]";
  let rememberedKey = "", active = false;
  const visible = (n: Element) => win.getComputedStyle(n).display !== "none" && n.getClientRects().length > 0;
  const nodeOf = (n: Element) => n.closest<SVGGElement>(nodeSelector);
  const identity = (n: SVGElement) => JSON.stringify([
    nodeOf(n)?.dataset.flowKey ?? root.querySelector<SVGGElement>(".flow-pinned")?.dataset.flowKey ?? "",
    n.matches(nodeSelector) ? "node" : n.matches("[data-flow-pin]") ? "pin" : n.matches(".route-layout-toggle") ? "layout" : "flag",
  ]);
  const items = () => {
    const pinned = root.querySelector(".flow-pinned");
    const nodes = Array.from(root.querySelectorAll<SVGGElement>(pinned ? nodeSelector : "[data-flow-outcome-leaf]")).filter(visible);
    if (!pinned) return nodes;
    // Put each control next to its owner in the traversal, including the overlay layout toggle.
    return nodes.flatMap(n => [n, ...Array.from(n.querySelectorAll<SVGGElement>(buttonSelector)),
      ...(n === pinned ? Array.from(root.querySelectorAll<SVGGElement>(".route-layout-toggle")) : []),
    ].filter(visible));
  };
  const nativeControl = (n: Element) => !!n.closest('input,textarea,select,button,a,[contenteditable="true"],[data-toggle-crit]');
  const click = (n: Element) => n.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const focus = (n: SVGElement) => { n.focus({ preventScroll: true }); n.scrollIntoView({ block: "nearest", inline: "nearest" }); };
  root.addEventListener("click", e => {
    const target = e.target as Element;
    if (!target.closest || nativeControl(target) || target.closest(buttonSelector)) return;
    const node = nodeOf(target);
    if (node) node.focus({ preventScroll: true });
    else if (target.closest(".flow-svg")) root.querySelector<SVGSVGElement>(".flow-svg")?.focus({ preventScroll: true });
  }, { signal: events.signal });
  doc.addEventListener("focusin", e => {
    const target = e.target as Element;
    active = root.contains(target) && !!target.closest?.(".flow-svg") && !nativeControl(target);
    if (active) {
      const element = target.closest<SVGElement>(buttonSelector) ?? nodeOf(target);
      rememberedKey = element ? identity(element) : "";
    }
  }, { signal: events.signal });
  doc.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.altKey || e.metaKey) return;
    const target = e.target as Element;
    if ((!root.contains(target) && target !== doc.body) || !target.closest || nativeControl(target)) return;
    const tree = root.querySelector<SVGSVGElement>(".flow-svg");
    if (!tree || (target === doc.body && !active)) return;
    if (!target.closest(".flow-svg") && target !== doc.body && target !== root) return;
    const candidates = items();
    const button = target.closest<SVGGElement>(buttonSelector);
    const current = button ?? nodeOf(target) ?? candidates.find(n => identity(n) === rememberedKey);
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === "f") {
        const owner = current && (nodeOf(current) ?? root.querySelector<SVGGElement>(".flow-pinned"));
        const flag = owner?.querySelector<SVGGElement>("[data-node-flag-gid]");
        if (flag && visible(flag)) { e.preventDefault(); e.stopPropagation(); click(flag); }
      }
      return;
    }
    if (e.key === "Escape") {
      active = false; rememberedKey = "";
      const outside = Array.from(doc.querySelectorAll<HTMLElement>('button,a,input,select,[tabindex="0"]')).find(n => !n.closest(".flow-svg") && visible(n));
      if (outside) { e.preventDefault(); outside.focus(); }
      return;
    }
    if (e.key === "Enter" || (e.key === " " && button)) {
      if (e.shiftKey) return;
      const owner = root.querySelector<SVGGElement>(".flow-pinned") ?? current;
      const pin = owner?.querySelector<SVGGElement>("[data-flow-pin]");
      const action = button ?? (pin && visible(pin) ? pin : undefined);
      if (action) { e.preventDefault(); e.stopPropagation(); click(action); }
      return;
    }
    if (e.key !== "Tab" || !candidates.length) return;
    e.preventDefault(); e.stopPropagation();
    const index = current ? candidates.indexOf(current) : -1;
    const next = candidates[index < 0 ? (e.shiftKey ? candidates.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + candidates.length) % candidates.length];
    focus(next);
    if (next !== current && next.matches(nodeSelector)) click(next);
  }, { signal: events.signal, capture: true });
  return {
    rebind() {
      if (!active) return;
      const remembered = items().find(n => identity(n) === rememberedKey);
      if (remembered) focus(remembered);
      else { rememberedKey = ""; root.querySelector<SVGSVGElement>(".flow-svg")?.focus({ preventScroll: true }); }
    },
    dispose() { events.abort(); },
  };
}
