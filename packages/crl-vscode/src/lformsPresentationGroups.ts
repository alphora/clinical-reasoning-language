// Browser-only adapter for CRL presentation protocol 1 and shipped LForms 43.1.0.
// Serialized into webviews: keep dependencies inside this function. Values always
// go through the native Boolean labels; no answer or Questionnaire rewriting.
export function installPresentationChoiceGroups(mount: HTMLElement, questionnaire: any, onEdit?: () => void): () => void {
  const doc = mount.ownerDocument, win = doc.defaultView!;
  const url = 'http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-choice-group';
  const originals = new Map<HTMLElement, string | null>();
  const proxies = new Map<HTMLElement, { row: HTMLElement; group: HTMLElement; style: string | null; aria: string | null;
    box: HTMLInputElement; clear: HTMLButtonElement; state: HTMLElement; yes: HTMLInputElement; no: HTMLInputElement;
    empty: HTMLInputElement; label?: HTMLLabelElement; oldFor?: string | null; readOnly: boolean }>();
  let stopped = false, pending = false;
  const ownership = () => mount.dispatchEvent(new win.Event('crl-boolean-ownership'));
  const style = (node: HTMLElement, values: Record<string, string>) => {
    if (!originals.has(node)) originals.set(node, node.getAttribute('style'));
    for (const [key, value] of Object.entries(values)) if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
  };
  const restore = (node: HTMLElement, value: string | null) => value === null ? node.removeAttribute('style') : node.setAttribute('style', value);
  const release = (node: HTMLElement) => {
    const p = proxies.get(node); if (!p) return;
    p.row.remove(); restore(p.group, p.style);
    if (p.aria === null) p.group.removeAttribute('aria-hidden'); else p.group.setAttribute('aria-hidden', p.aria);
    if (p.label) { if (p.oldFor == null) p.label.removeAttribute('for'); else p.label.setAttribute('for', p.oldFor); }
    node.removeAttribute('data-crl-choice-proxy'); proxies.delete(node); ownership();
  };
  const allQuestions = (items: any[]): any[] => (items ?? []).flatMap(i => [i, ...allQuestions(i.item)]);
  const panels: { q: any; columns: number; checkbox: boolean; readOnly: boolean }[] = [];
  const walk = (items: any[], inheritedReadOnly: boolean, repeated: boolean) => {
    for (const q of items ?? []) {
      const fields = q.extension?.find((e: any) => e.url === url)?.extension;
      const value = (name: string, type: string) => fields?.find((e: any) => e.url === name)?.[type];
      if (fields && !repeated && !q.repeats && q.type === 'group' && !q.definition && value('protocol', 'valueInteger') === 1) {
        const columns = value('columns', 'valueInteger'), control = value('control', 'valueCode');
        if (Number.isInteger(columns) && columns > 0 && ['radio', 'checkbox'].includes(control)) panels.push({ q, columns, checkbox: control === 'checkbox', readOnly: inheritedReadOnly || !!q.readOnly });
      }
      walk(q.item, inheritedReadOnly || !!q.readOnly, repeated || !!q.repeats);
    }
  };
  walk(questionnaire?.item, false, false);
  // Exact linkId + numeric instance suffix, never question text or broad ancestors.
  const domFor = (id: string): HTMLElement | undefined => {
    const prefix = 'item-' + id + '/';
    const matches = Array.from(mount.querySelectorAll<HTMLElement>('lhc-item')).filter(n => n.id.startsWith(prefix) && /^\d+(\/\d+)*$/.test(n.id.slice(prefix.length)));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const resizeNodes = new Set<HTMLElement>();
  const resized = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => schedule()) : undefined;
  const refresh = () => {
    pending = false; if (stopped) return;
    for (const node of proxies.keys()) if (!mount.contains(node)) release(node);
    for (const panel of panels) {
      const wrapper = domFor(panel.q.linkId); if (!wrapper) continue;
      const members = (panel.q.item ?? []).filter((q: any) => q.type !== 'display');
      const nodes = members.map((q: any) => domFor(q.linkId)) as (HTMLElement | undefined)[];
      if (!nodes.length || nodes.some(n => !n || !wrapper.contains(n))) continue;
      const parent = nodes[0]!.parentElement!;
      if (!parent || nodes.some(n => n!.parentElement !== parent)) continue;
      if (!resizeNodes.has(wrapper)) { resizeNodes.add(wrapper); resized?.observe(wrapper); }
      const columns = Math.max(1, Math.min(panel.columns, Math.floor(wrapper.getBoundingClientRect().width / 230)));
      style(parent, { display: 'grid', 'grid-template-columns': `repeat(${columns},minmax(0,1fr))`, gap: '12px', 'min-width': '0' });
      // Display/help siblings occupy the full row. Member sizing is scoped to this panel.
      for (const child of Array.from(parent.children)) if (child instanceof win.HTMLElement && !nodes.includes(child as HTMLElement)) style(child as HTMLElement, { 'grid-column': '1 / -1' });
      for (const [index, node] of nodes.entries()) {
        style(node!, { 'min-width': '0', padding: '8px', border: '1px solid #ccc', 'border-radius': '4px' });
        for (const content of Array.from(node!.querySelectorAll<HTMLElement>('.lhc-de-input-unit-content,.lhc-de-input-unit,.lhc-de'))) {
          style(content, { width: '100%', 'max-width': '100%', 'min-width': '0', 'box-sizing': 'border-box' });
        }
        for (const inner of Array.from(node!.querySelectorAll<HTMLElement>('lhc-item-question'))) {
          style(inner, { display: 'flex', 'flex-direction': 'column', 'align-items': 'stretch', 'min-width': '0' });
          for (const child of Array.from(inner.children)) if (child instanceof win.HTMLElement) style(child as HTMLElement, { width: '100%', flex: '0 0 auto', 'min-width': '0' });
        }
        if (!panel.checkbox) continue;
        const leaves = allQuestions([members[index]]).filter(q => q.type === 'boolean');
        if (leaves.length !== 1) continue;
        const leafDom = domFor(leaves[0].linkId);
        const native = leafDom?.querySelector<HTMLElement>('lhc-item-boolean');
        const group = native?.querySelector<HTMLElement>('nz-radio-group');
        const yesLabel = group?.querySelector<HTMLLabelElement>('label[id$="|true"]'), noLabel = group?.querySelector<HTMLLabelElement>('label[id$="|false"]'), emptyLabel = group?.querySelector<HTMLLabelElement>('label[id$="|null"]');
        const yes = yesLabel?.querySelector<HTMLInputElement>('input[type=radio]'), no = noLabel?.querySelector<HTMLInputElement>('input[type=radio]'), empty = emptyLabel?.querySelector<HTMLInputElement>('input[type=radio]');
        if (!native || !group || !yes || !no || !empty || group.querySelectorAll('input[type=radio]').length !== 3) continue;
        let p = proxies.get(native);
        if (!p) {
          native.setAttribute('data-crl-choice-proxy', ''); ownership();
          const row = doc.createElement('div'), box = doc.createElement('input'), clear = doc.createElement('button'), state = doc.createElement('span');
          box.type = 'checkbox'; box.id = 'crl-choice-' + leaves[0].linkId;
          state.id = box.id + '-state'; state.style.margin = '0 8px';
          clear.type = 'button'; clear.textContent = 'Clear answer';
          clear.style.cssText = 'font:inherit;color:inherit;background:transparent;border:0;text-decoration:underline;cursor:pointer';
          const label = doc.getElementById('label-' + leafDom!.id.slice(5)) as HTMLLabelElement | null;
          clear.setAttribute('aria-label', 'Clear answer: ' + (label?.textContent?.trim() || leaves[0].text || members[index].text || 'Answer'));
          if (label && mount.contains(label)) box.setAttribute('aria-labelledby', label.id);
          else box.setAttribute('aria-label', leaves[0].text ?? members[index].text ?? 'Answer');
          box.setAttribute('aria-describedby', state.id);
          const readOnly = panel.readOnly || allQuestions([members[index]]).some(q => q.readOnly);
          p = { row, group, style: group.getAttribute('style'), aria: group.getAttribute('aria-hidden'), box, clear, state, yes, no, empty,
            ...(label ? { label, oldFor: label.getAttribute('for') } : {}), readOnly };
          proxies.set(native, p); if (label) label.htmlFor = box.id;
          const disabled = () => readOnly || yes.disabled || no.disabled || empty.disabled || !!native.closest('[inert]');
          box.addEventListener('click', event => {
            event.preventDefault();
            if (!disabled()) (yes.checked ? noLabel! : yesLabel!).click();
            // Restore from the model after checkbox default cancellation and Zone's
            // event microtasks. Mouse, associated label and Space share this path.
            win.setTimeout(() => { refresh(); if (!stopped && !disabled()) onEdit?.(); }, 0);
          });
          clear.addEventListener('click', () => {
            if (disabled()) return;
            box.focus({ preventScroll: true }); emptyLabel!.click();
            win.queueMicrotask(() => { refresh(); if (!stopped) onEdit?.(); });
          });
          row.append(box, state, clear); group.after(row);
          group.style.display = 'none'; group.setAttribute('aria-hidden', 'true');
        }
        const unknown = !(yes.checked || no.checked), disabled = p.readOnly || yes.disabled || no.disabled || empty.disabled || !!native.closest('[inert]');
        p.box.checked = yes.checked; p.box.indeterminate = unknown; p.box.setAttribute('aria-checked', unknown ? 'mixed' : String(yes.checked));
        if (p.box.disabled !== disabled) p.box.disabled = disabled;
        if (p.clear.disabled !== disabled) p.clear.disabled = disabled;
        p.clear.hidden = unknown;
        const state = unknown ? 'Not answered' : yes.checked ? 'Yes' : 'No'; if (p.state.textContent !== state) p.state.textContent = state;
      }
    }
  };
  const schedule = () => { if (!pending && !stopped) { pending = true; win.queueMicrotask(refresh); } };
  // Zone.js can flush a capture listener's microtask before checkbox change.
  // Proxy handlers refresh after the native vendor click has updated its model.
  const onEvent = (event: Event) => {
    if ((event.target as HTMLElement)?.closest?.('[data-crl-choice-proxy]')) return;
    schedule();
  };
  const observer = new win.MutationObserver(schedule);
  observer.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'inert', 'class'] });
  mount.addEventListener('click', onEvent, true); mount.addEventListener('change', onEvent); mount.addEventListener('input', onEvent);
  refresh();
  return () => {
    stopped = true; observer.disconnect(); resized?.disconnect();
    mount.removeEventListener('click', onEvent, true); mount.removeEventListener('change', onEvent); mount.removeEventListener('input', onEvent);
    for (const node of proxies.keys()) release(node);
    for (const [node, value] of originals) restore(node, value);
    originals.clear(); resizeNodes.clear();
  };
}
