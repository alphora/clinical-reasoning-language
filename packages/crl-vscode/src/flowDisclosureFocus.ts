/// <reference lib="dom" />
// Restore a clicked disclosure after its generation-specific DOM has been replaced.
export function installFlowDisclosureFocus(root: HTMLElement, generation: () => number = () => 0) {
  let next = 0;
  let pending: { token: string; key: string; left: number; top: number } | undefined;
  return {
    capture(control: Element): string | undefined {
      const key = control.closest<SVGGElement>('[data-flow-key]')?.dataset.flowKey;
      if (!key) return;
      const box = control.getBoundingClientRect();
      pending = { token: String(++next), key, left: box.left, top: box.top };
      return pending.token;
    },
    cancel() { pending = undefined; },
    restore(token: string) {
      const saved = pending;
      if (!saved || saved.token !== token) return;
      const acceptedGeneration = generation();
      root.ownerDocument.defaultView!.requestAnimationFrame(() => {
        if (pending !== saved || generation() !== acceptedGeneration) return;
        pending = undefined;
        const owner = Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).find(n => n.dataset.flowKey === saved.key);
        const control = owner?.querySelector<SVGElement>('[data-toggle-crit]');
        if (!control || control.getClientRects().length === 0) return;
        control.setAttribute('tabindex', '-1');
        control.focus({ preventScroll: true });
        const box = control.getBoundingClientRect();
        const scroller = root.ownerDocument.scrollingElement ?? root.ownerDocument.documentElement;
        scroller.scrollLeft += box.left - saved.left;
        scroller.scrollTop += box.top - saved.top;
      });
    },
  };
}
