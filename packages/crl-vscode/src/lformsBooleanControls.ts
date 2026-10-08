// Browser-only presentation adapter for the pinned LForms native Boolean control.
// Keep this function self-contained: webviews serialize it with toString(). Clearing
// clicks LForms' own null label; it never writes answers or modifies the Questionnaire.
export function installBooleanAnswerClearControls(mount: HTMLElement, onClear?: () => void): () => void {
  const doc = mount.ownerDocument;
  const win = doc.defaultView!;
  const controls = new Map<HTMLElement, { button: HTMLButtonElement; empty: HTMLElement; oldStyle: string | null;
    oldHidden: boolean; oldAria: string | null; input: HTMLInputElement; oldTab: string | null }>();
  let stopped = false, pending = false;
  const refresh = () => {
    pending = false;
    if (stopped) return;
    for (const [node, control] of controls) if (!mount.contains(node)) {
      control.button.remove(); controls.delete(node);
    }
    for (const node of Array.from(mount.querySelectorAll<HTMLElement>('lhc-item-boolean'))) {
      const group = node.querySelector<HTMLElement>('nz-radio-group');
      const yesLabel = group?.querySelector<HTMLElement>('label[id$="|true"]');
      const noLabel = group?.querySelector<HTMLElement>('label[id$="|false"]');
      const empty = group?.querySelector<HTMLElement>('label[id$="|null"]');
      const yes = yesLabel?.querySelector<HTMLInputElement>('input[type="radio"]');
      const no = noLabel?.querySelector<HTMLInputElement>('input[type="radio"]');
      const input = empty?.querySelector<HTMLInputElement>('input[type="radio"]');
      // Leave an unfamiliar vendor shape intact rather than removing its only clear control.
      if (!group || !yes || !no || !empty || !input || group.querySelectorAll('input[type="radio"]').length !== 3) continue;
      let control = controls.get(node);
      if (!control) {
        const button = doc.createElement('button');
        button.type = 'button'; button.textContent = 'Clear answer';
        button.dataset.booleanClear = '';
        button.style.cssText = 'margin-left:8px;padding:2px 4px;font:inherit;font-size:0.9em;text-decoration:underline;background:transparent;color:inherit;border:0;cursor:pointer';
        const labels = (group.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => doc.getElementById(id)?.textContent?.trim()).filter(Boolean);
        button.setAttribute('aria-label', labels.length ? `Clear answer: ${labels.join(' ')}` : 'Clear answer');
        control = { button, empty, oldStyle: empty.getAttribute('style'), oldHidden: empty.hidden,
          oldAria: empty.getAttribute('aria-hidden'), input, oldTab: input.getAttribute('tabindex') };
        controls.set(node, control);
        button.addEventListener('click', () => {
          if (yes.disabled || no.disabled || input.disabled || mount.closest('[inert]') || node.closest('[inert]')) return;
          // The host restores this label's input if clearing prunes children and remounts.
          yes.focus({ preventScroll: true });
          empty.click();
          // The vendor cancels the native click. Do not depend on input/change firing.
          win.queueMicrotask(() => { if (!stopped) { refresh(); onClear?.(); } });
        });
        group.after(button);
        empty.hidden = true; empty.style.display = 'none'; empty.setAttribute('aria-hidden', 'true'); input.tabIndex = -1;
      }
      const hidden = !(yes.checked || no.checked) || yes.disabled || no.disabled || input.disabled;
      if (control.button.hidden !== hidden) control.button.hidden = hidden;
      const disabled = !!node.closest('[inert]');
      if (control.button.disabled !== disabled) control.button.disabled = disabled;
    }
  };
  const schedule = () => { if (!pending && !stopped) { pending = true; win.queueMicrotask(refresh); } };
  const navigate = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const active = event.target as HTMLInputElement;
    const node = active.closest?.('lhc-item-boolean') as HTMLElement | null;
    if (!node || !controls.has(node) || !active.matches('input[type="radio"]') || active.disabled || node.closest('[inert]')) return;
    const labels = Array.from(node.querySelectorAll<HTMLElement>('label[id$="|true"],label[id$="|false"]'));
    if (labels.length !== 2) return;
    const next = labels.find(label => !label.contains(active));
    if (!next) return;
    // Native radio arrows can bypass ng-zorro's click-only model handler. Use its
    // label handler so keyboard selection and the exported value stay in sync.
    event.preventDefault(); event.stopPropagation(); next.click(); schedule();
  };
  const observer = new win.MutationObserver(schedule);
  observer.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'inert', 'class'] });
  mount.addEventListener('input', schedule); mount.addEventListener('change', schedule);
  mount.addEventListener('click', schedule, true); // ng-zorro cancels bubbling clicks and native change.
  mount.addEventListener('keydown', navigate, true);
  refresh();
  return () => {
    stopped = true; observer.disconnect(); mount.removeEventListener('input', schedule); mount.removeEventListener('change', schedule); mount.removeEventListener('click', schedule, true);
    mount.removeEventListener('keydown', navigate, true);
    for (const control of controls.values()) {
      control.button.remove(); control.empty.hidden = control.oldHidden;
      if (control.oldStyle === null) control.empty.removeAttribute('style'); else control.empty.setAttribute('style', control.oldStyle);
      if (control.oldAria === null) control.empty.removeAttribute('aria-hidden'); else control.empty.setAttribute('aria-hidden', control.oldAria);
      if (control.oldTab === null) control.input.removeAttribute('tabindex'); else control.input.setAttribute('tabindex', control.oldTab);
    }
    controls.clear();
  };
}

