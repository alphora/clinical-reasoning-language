/// <reference lib="dom" />
export interface InteractiveQuestionControl { linkId: string; reason?: string }

/** Attach review actions to exact rendered item identities, independent of wording and answers. */
export function installLformsReviewControls(mount: HTMLElement, questions: InteractiveQuestionControl[],
  action: (kind: 'focus' | 'edit' | 'flag', linkId: string) => void, enabled: () => boolean): () => void {
  const doc = mount.ownerDocument, win = doc.defaultView!;
  const owned = new Map<HTMLElement, HTMLElement>();
  const identities = new WeakMap<HTMLElement, string>();
  let stopped = false, pending = false;
  const paths = {
    focus: 'M3 9 V3 H9 M15 3 H21 V9 M21 15 V21 H15 M9 21 H3 V15 M8 12 H16 M12 8 V16',
    edit: 'M4 16 L16 4 L20 8 L8 20 L4 20 Z M13 7 L17 11',
    flag: 'M5 22 V3 M5 4 C10 0 14 8 20 4 V14 C14 18 10 10 5 14',
  };
  const labels = { focus: 'Focus question in tree', edit: 'Edit question', flag: 'Manage question flags' };
  const refresh = () => {
    pending = false;
    if (stopped) return;
    const items = Array.from(mount.querySelectorAll<HTMLElement>('lhc-item'));
    const matches = new Map(questions.map(q => {
      const prefix = 'item-' + q.linkId + '/';
      return [q.linkId, items.filter(n => n.id.startsWith(prefix) && /^\d+(\/\d+)*$/.test(n.id.slice(prefix.length)))] as const;
    }));
    for (const [node, toolbar] of owned) if (!mount.contains(node)) { toolbar.remove(); owned.delete(node); }
    for (const [node, toolbar] of owned) {
      const linkId = identities.get(toolbar), nodes = linkId === undefined ? undefined : matches.get(linkId);
      if (!nodes || nodes.length !== 1 || nodes[0] !== node) { toolbar.remove(); owned.delete(node); }
    }
    for (const q of questions) {
      const nodes = matches.get(q.linkId)!;
      // Repeated DOM occurrences cannot be addressed by linkId alone.
      if (nodes.length !== 1) continue;
      const node = nodes[0];
      const label = doc.getElementById('label-' + node.id.slice(5));
      const heading = label?.closest<HTMLElement>('lhc-item-question');
      if (!heading || heading.closest('lhc-item') !== node) continue;
      let toolbar = owned.get(node);
      if (!toolbar || !heading.contains(toolbar)) {
        toolbar?.remove();
        toolbar = doc.createElement('span'); toolbar.className = 'crl-question-review-tools';
        toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Question review controls');
        for (const kind of ['focus', 'edit', 'flag'] as const) {
          const button = doc.createElement('button'); button.type = 'button';
          button.dataset.questionReview = kind;
          button.setAttribute('aria-label', labels[kind]);
          const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('width', '15'); icon.setAttribute('height', '15'); icon.setAttribute('aria-hidden', 'true');
          const path = doc.createElementNS(icon.namespaceURI, 'path');
          path.setAttribute('d', paths[kind]); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '1.7'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
          icon.append(path); button.append(icon);
          button.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            const current = questions.find(item => item.linkId === identities.get(toolbar!));
            if (enabled() && current && !current.reason && !button.disabled) action(kind, current.linkId);
          });
          button.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat && !button.disabled) button.click();
          });
          toolbar.append(button);
        }
        heading.append(toolbar); owned.set(node, toolbar);
      }
      identities.set(toolbar, q.linkId);
      for (const button of Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))) {
        const disabled = !enabled() || !!q.reason;
        if (button.disabled !== disabled) button.disabled = disabled;
        button.title = q.reason ?? labels[button.dataset.questionReview as keyof typeof labels];
      }
    }
  };
  const schedule = () => { if (!pending && !stopped) { pending = true; win.queueMicrotask(refresh); } };
  const observer = new win.MutationObserver(schedule);
  observer.observe(mount, { subtree: true, childList: true, attributes: true, attributeFilter: ['id', 'inert', 'aria-busy'] });
  mount.addEventListener('crl-review-state', refresh);
  refresh();
  return () => { stopped = true; observer.disconnect(); mount.removeEventListener('crl-review-state', refresh); for (const toolbar of owned.values()) toolbar.remove(); owned.clear(); };
}

export const LFORMS_REVIEW_STYLE = `
lhc-item-question:has(>.crl-question-review-tools){position:relative;display:block;padding-right:78px;min-height:24px}
.crl-question-review-tools{position:absolute;right:0;top:0;display:inline-flex;gap:2px;align-items:center;width:auto!important}
.crl-question-review-tools button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:3px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer}
.crl-question-review-tools button:hover{border-color:currentColor}
.crl-question-review-tools button:focus-visible{outline:2px solid var(--vscode-focusBorder,#007fd4);outline-offset:1px}
.crl-question-review-tools button:disabled{opacity:.45;cursor:default}
.interactive-outcome{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.interactive-outcome button{font-size:12px;padding:3px 7px}
`;
