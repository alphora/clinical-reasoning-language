/// <reference lib="dom" />
// Restore a clicked disclosure after its generation-specific DOM has been replaced.
export function installFlowDisclosureFocus(root: HTMLElement) {
  let next = 0;
  type Editor = { cardId?: string; ownerKey?: string; index: number; start: number | null; end: number | null };
  let pending: { token: string; key: string; left: number; top: number; focus: boolean; editor?: Editor } | undefined;
  const doc=root.ownerDocument;
  const interrupt=()=>{if(pending)pending.focus=false;};
  const unwatch=()=>{for(const type of ['pointerdown','keydown','wheel'])doc.removeEventListener(type,interrupt,true);};
  return {
    capture(control: Element): string | undefined {
      const key = control.closest<SVGGElement>('[data-flow-key]')?.dataset.flowKey;
      if (!key) return;
      const box = control.getBoundingClientRect();
      pending = { token: String(++next), key, left: box.left, top: box.top, focus: true };
      // The click itself chooses this control. Only an editor focused AFTER it
      // should supersede that intent while the host builds the replacement.
      const focusControl=control as SVGElement;
      if(!focusControl.hasAttribute('tabindex'))focusControl.setAttribute('tabindex','-1');
      focusControl.focus({preventScroll:true});
      for(const type of ['pointerdown','keydown','wheel'])doc.addEventListener(type,interrupt,true);
      return pending.token;
    },
    cancel() { pending = undefined;unwatch(); },
    beforeRender() {
      if(!pending)return;
      const owner=Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).find(n=>n.dataset.flowKey===pending!.key);
      const box=owner?.querySelector('[data-toggle-crit]')?.getBoundingClientRect();
      if(box){pending.left=box.left;pending.top=box.top;}
      const active=doc.activeElement as HTMLTextAreaElement | null,card=active?.closest<HTMLElement>('.route-card');
      if(active && card && root.contains(card) && active.tagName==='TEXTAREA'){
        pending.editor={cardId:card.dataset.cardId,ownerKey:card.dataset.ownerKey,index:Array.from(card.querySelectorAll('textarea')).indexOf(active),start:active.selectionStart,end:active.selectionEnd};
      }
    },
    restore(token: string) {
      const saved = pending;
      if (!saved || saved.token !== token) return;
      // Called inside the render transaction, after final tree/card geometry is
      // installed. No host acknowledgement or animation frame may paint first.
      pending = undefined;unwatch();
      const owner = Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).find(n => n.dataset.flowKey === saved.key);
      const control = owner?.querySelector<SVGElement>('[data-toggle-crit]');
      if (!control || control.getClientRects().length === 0) return;
      if(!control.hasAttribute('tabindex'))control.setAttribute('tabindex','-1');
      const active=doc.activeElement;
      const mayFocus=doc.hasFocus() && (!active || active===doc.body || active===doc.documentElement || active===control);
      if(mayFocus && saved.editor){
        const editor=saved.editor,card=Array.from(root.querySelectorAll<HTMLElement>('.route-card')).find(n=>n.dataset.cardId===editor.cardId && n.dataset.ownerKey===editor.ownerKey);
        const field=card?.querySelectorAll('textarea')[editor.index];
        if(field){field.focus({preventScroll:true});if(editor.start!==null && editor.end!==null)field.setSelectionRange(editor.start,editor.end);}
      }else if(mayFocus && saved.focus)control.focus({ preventScroll: true });
      const box = control.getBoundingClientRect();
      const scroller = root.ownerDocument.scrollingElement ?? root.ownerDocument.documentElement;
      scroller.scrollLeft += box.left - saved.left;
      scroller.scrollTop += box.top - saved.top;
    },
  };
}
