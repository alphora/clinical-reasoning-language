/// <reference lib="dom" />
/** Tree keyboard actions delegate activation to the same handlers as pointer clicks. */
export function installFlowKeyboardActions(root: HTMLElement) {
  const doc = root.ownerDocument, win = doc.defaultView!;
  const events = new win.AbortController();
  doc.addEventListener('pointerdown',()=>doc.body.classList.add('mv-pointer-interaction'),{capture:true,signal:events.signal});
  doc.addEventListener('keydown',e=>{if(e.key==='Tab'||e.key==='Enter'||e.key===' ')doc.body.classList.remove('mv-pointer-interaction');},{capture:true,signal:events.signal});
  root.addEventListener('pointerdown',()=>root.classList.add('flow-pointer-interaction'),{capture:true,signal:events.signal});
  root.addEventListener('keydown',()=>root.classList.remove('flow-pointer-interaction'),{capture:true,signal:events.signal});
  const nodeSelector = '[data-flow-key][tabindex="-1"]';
  const buttonSelector = "[data-flow-pin],.route-layout-toggle,.route-branch-nav,.route-verdict-badge,[data-criterion-verdict],[data-node-flag-gid],[data-toggle-crit],[data-flow-logic]";
  const visible = (n: Element) => win.getComputedStyle(n).display !== "none" && n.getClientRects().length > 0;
  const nodeOf = (n: Element) => n.closest<SVGGElement>(nodeSelector);
  const nativeControl = (n: Element) => !!n.closest('input,textarea,select,button,a,[contenteditable="true"]');
  // SVG controls own their focus destination. Do not let the browser first focus
  // and scroll a temporary badge (or its ancestor) on pointerdown.
  root.addEventListener('pointerdown',e=>{
    const target=e.target as Element;
    if(e.button===0 && target.closest?.('.flow-svg') && !target.closest('foreignObject') && !nativeControl(target))e.preventDefault();
  },{capture:true,signal:events.signal});
  const click = (n: Element) => n.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  root.addEventListener("click", e => {
    const target = e.target as Element;
    if (!target.closest || nativeControl(target) || target.closest(buttonSelector)) return;
    const node = nodeOf(target);
    if (node) node.focus({ preventScroll: true });
  }, { signal: events.signal });
  doc.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.altKey || e.metaKey) return;
    const target = e.target as Element;
    if (!root.contains(target) || !target.closest || nativeControl(target)) return;
    if (!target.closest(".flow-svg")) return;
    root.classList.remove("flow-pointer-interaction");
    const button = target.closest<SVGGElement>(buttonSelector);
    const current = button ?? nodeOf(target);
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === "f") {
        const owner = current && (nodeOf(current) ?? root.querySelector<SVGGElement>(".flow-pinned"));
        const focusedFlag=target.closest<SVGElement>('[data-node-flag-gid]');
        const flag = focusedFlag && visible(focusedFlag) ? focusedFlag : Array.from(owner?.querySelectorAll<SVGElement>('[data-node-flag-gid]')??[]).find(visible);
        if (flag && visible(flag)) { e.preventDefault(); e.stopPropagation(); click(flag); }
      }
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
  }, { signal: events.signal, capture: true });
  return { dispose() { events.abort(); } };
}
