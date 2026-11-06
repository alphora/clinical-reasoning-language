/// <reference lib="dom" />

export interface BranchRuntime {
  setZoom(value: number): void;
  dispose(): void;
}

/** REFACTOR:grounded: static text replaces live foreignObject cards; the host's active-content gate remains strict. */
export function captureDecisionTable(table: HTMLElement, sanitizers: ((root: HTMLElement) => void)[]): string {
  const clone = table.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.current,.this-node,.node-focus,.flag-current').forEach(node => node.classList.remove('current','this-node','node-focus','flag-current'));
  clone.querySelectorAll('[data-table-controls],.flow-zoom,.tree-traversal-nav').forEach(node => node.remove());
  const originalRows = Array.from(table.querySelectorAll<HTMLElement>('.decision-table-row'));
  const clonedRows = Array.from(clone.querySelectorAll<HTMLElement>('.decision-table-row'));
  originalRows.forEach((row, index) => {
    const copy = clonedRows[index];
    const visibleCards = Array.from(row.querySelectorAll<HTMLElement>('foreignObject .route-card'))
      .filter(card => card.getClientRects().length > 0 && row.ownerDocument.defaultView!.getComputedStyle(card).display !== 'none');
    if (visibleCards.length) {
      const appendix = clone.ownerDocument.createElement('section');
      appendix.className = 'decision-table-static-cards';
      const title = clone.ownerDocument.createElement('p'); title.textContent = 'Visible question cards'; appendix.append(title);
      for (const card of visibleCards) {
        const text = clone.ownerDocument.createElement('p');
        const parts: string[] = [];
        const readVisible = (node: Node): void => {
          if (node.nodeType === 3) { parts.push(node.textContent ?? ''); return; }
          if (!(node instanceof row.ownerDocument.defaultView!.HTMLElement)) return;
          const style = row.ownerDocument.defaultView!.getComputedStyle(node);
          if (node.hidden || style.display === 'none' || style.visibility === 'hidden' || !node.getClientRects().length) return;
          if (['BUTTON','SCRIPT','STYLE'].includes(node.tagName)) return;
          if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
            parts.push((node as HTMLInputElement).value); return;
          }
          if (node.tagName === 'SELECT') {
            parts.push(Array.from((node as HTMLSelectElement).selectedOptions).map(option => option.textContent).join(', ')); return;
          }
          const block = /^(DIV|P|LABEL|LI|H[1-6]|DETAILS|SUMMARY|BR)$/.test(node.tagName);
          if (block) parts.push('\n');
          for (const child of Array.from(node.childNodes)) readVisible(child);
          if (block) parts.push('\n');
        };
        readVisible(card);
        text.textContent = parts.join('').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        appendix.append(text);
      }
      copy.append(appendix);
    }
    // Only known route-card objects get a static replacement. Unexpected active objects reach the strict gate.
    copy.querySelectorAll('foreignObject:has(.route-card)').forEach(node => node.remove());
  });
  for (const sanitize of sanitizers) sanitize(clone);
  return clone.innerHTML;
}

/** REFACTOR:grounded: sibling roots reuse the existing runtime without sharing row state or a second flag drawer. */
export function installDecisionTableWebview(
  outerRoot: HTMLElement,
  bridge: { postMessage(message: unknown): void },
  install: (options: any) => BranchRuntime,
  capture: typeof captureDecisionTable,
  sanitizers: ((root: HTMLElement) => void)[],
) {
  const doc = outerRoot.ownerDocument, win = doc.defaultView!;
  const events = new win.AbortController();
  const table = doc.createElement('section'); table.id = 'crlDecisionTable'; table.hidden = true;
  // This must be a sibling, never a descendant: outer helpers may query all of outerRoot.
  outerRoot.after(table);
  const controls = doc.createElement('div'); controls.className = 'decision-table-controls'; controls.dataset.tableControls = '';
  const caption = doc.createElement('span'); controls.append(caption);
  const rowsRoot = doc.createElement('div'); rowsRoot.className = 'decision-table-rows'; table.append(controls, rowsRoot);
  const resume = doc.createElement('button');resume.type='button';resume.textContent='Return to Decision Table';resume.hidden=true;table.after(resume);
  resume.addEventListener('click',()=>send('resume'),{signal:events.signal});
  let epoch: unknown, active = false, zoom = 1, layout: any, focusVersion = 0;
  // A reply to row navigation must not steal focus after a later interaction in any row.
  for (const type of ['pointerdown','keydown','focusin']) win.addEventListener(type, () => { focusVersion++; }, { capture:true, signal:events.signal });
  const rows = new Map<string, { element: HTMLElement; label: HTMLElement; caseLabel: HTMLElement; error: HTMLElement; cases: HTMLButtonElement; channel: EventTarget; runtime: BranchRuntime }>();
  const send = (action: string, rowId?: string) => bridge.postMessage({ type: 'decisionTableAction', epoch, action, ...(rowId ? { rowId } : {}) });
  const button = (label: string, action: string) => {
    const element = doc.createElement('button'); element.type = 'button'; element.textContent = label;
    element.addEventListener('click', () => send(action), { signal: events.signal }); controls.append(element); return element;
  };
  const shallower = button('Shallower', 'shallower'), deeper = button('Deeper', 'deeper');
  const previous = button('Previous rows', 'previousPage'), next = button('Next rows', 'nextPage');
  button('Close table', 'unpin');
  const zoomLabel = doc.createElement('span'); zoomLabel.className = 'decision-table-zoom-label';
  const setZoom = (value: number) => {
    zoom = Math.min(3, Math.max(.25, value)); zoomLabel.textContent = Math.round(zoom * 100) + '%';
    for (const row of rows.values()) row.runtime.setZoom(zoom);
  };
  for (const [label, factor] of [['−', 1 / 1.1], ['+', 1.1]] as const) {
    const element = doc.createElement('button'); element.type = 'button'; element.textContent = label;
    element.setAttribute('aria-label', factor < 1 ? 'Zoom out' : 'Zoom in');
    element.addEventListener('click', () => setZoom(zoom * factor), { signal: events.signal }); controls.append(element);
  }
  controls.append(zoomLabel); setZoom(1);
  const clear = () => { for (const row of rows.values()) row.runtime.dispose(); rows.clear(); rowsRoot.replaceChildren(); };
  const reconcile = (message: any) => {
    if (!Array.isArray(message.rows)) return;
    if (epoch !== message.epoch) clear();
    epoch = message.epoch; layout = message; active = true;resume.hidden=true; table.hidden = false; outerRoot.hidden = true;
    const keep = new Set(message.rows.map((row: any) => row.id));
    for (const [id, row] of rows) if (!keep.has(id)) { row.runtime.dispose(); row.element.remove(); rows.delete(id); }
    caption.textContent = `${message.label ?? 'Decision Table'} — ${message.range ?? ''} of ${message.total ?? ''} branches${message.uncovered && message.uncovered !== '0' ? `; ${message.uncovered} coverage errors` : ''}`;
    shallower.disabled = !message.shallower; deeper.disabled = !message.deeper;
    previous.disabled = !message.previousPage; next.disabled = !message.nextPage;
    for (const [index, description] of message.rows.entries()) {
      if (typeof description.id !== 'string') continue;
      let row = rows.get(description.id);
      if (!row) {
        const element = doc.createElement('section'); element.className = 'decision-table-row';
        const header = doc.createElement('div'); header.className = 'decision-table-row-label'; header.hidden = true;
        const label = doc.createElement('span'), caseLabel=doc.createElement('span'), selection=doc.createElement('span'), cases = doc.createElement('button'); cases.type = 'button'; cases.textContent = 'Choose case';
        // REFACTOR:grounded: retain the picker and evidence, hide only its row UI.
        selection.dataset.tableCaseSelection='';selection.hidden=true;selection.append(caseLabel,cases);
        const rowEvents = new win.AbortController();
        cases.dataset.tableControls = ''; cases.addEventListener('click', () => send('case', description.id), { signal: rowEvents.signal }); header.append(label, selection);
        const error = doc.createElement('p'); error.className = 'decision-table-error'; error.setAttribute('role', 'alert');
        const chrome = doc.createElement('div'), root = doc.createElement('div'); root.className = 'cockpit-root';
        element.append(header, error, chrome, root); rowsRoot.append(element);
        const channel = new win.EventTarget(), localEpoch = epoch;
        let mounted = true;
        const installed = install({ root, chrome, drawer: doc.createElement('div'), channel, tableRow:true,
          bridge: { postMessage: (payload: unknown) => { if (mounted) bridge.postMessage({ type: 'decisionTableRow', epoch: localEpoch, rowId: description.id, message: payload && typeof payload === 'object' && ['navigatePinnedBranch','toggleUncertaintyGuard'].includes((payload as any).type) ? {...payload,tableFocusVersion:focusVersion} : payload }); } }, onZoom: setZoom });
        const runtime = { setZoom: installed.setZoom, dispose() { mounted = false; rowEvents.abort(); installed.dispose(); } };
        runtime.setZoom(zoom); row = { element, label, caseLabel, error, cases, channel, runtime }; rows.set(description.id, row);
      }
      row.label.textContent = description.label;row.caseLabel.textContent=description.caseLabel?` — ${description.caseLabel} `:'';
      (row.element.querySelector('.cockpit-root') as HTMLElement).dataset.flowScopeKey = description.scopeKey ?? '';
      row.error.textContent = description.error ?? ''; row.error.hidden = !description.error;
      row.cases.hidden = !(description.caseCount > 1);
      if (rowsRoot.children[index] !== row.element) rowsRoot.insertBefore(row.element, rowsRoot.children[index] ?? null);
    }
  };
  win.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'decisionTable') {
      event.stopImmediatePropagation();
      if (message.active === false) { clear(); active = false; table.hidden = true; outerRoot.hidden = false; resume.hidden=message.preserve!==true;epoch=message.preserve===true?message.epoch:undefined;layout=undefined; }
      else reconcile(message);
    } else if (message?.type === 'decisionTableFocus') {
      event.stopImmediatePropagation();
      if(active && message.epoch === epoch && message.focusVersion === focusVersion){
        const controlIn = (row: typeof rows extends Map<string,infer R> ? R : never) => Array.from(row.element.querySelectorAll<SVGElement>('[data-flow-uncertainty-toggle]'))
          .find(control => control.dataset.flowUncertaintyToggle === message.key && control.getClientRects().length > 0);
        const origin = rows.get(message.rowId), control = (origin && controlIn(origin)) || Array.from(rows.values()).map(controlIn).find(Boolean);
        control?.focus({preventScroll:true});
      }
    } else if (message?.type === 'decisionTableRow') {
      event.stopImmediatePropagation();
      if (active && message.epoch === epoch) {
        const payload = message.message;
        const data = payload?.focusRequest === 'branch-navigation' && payload.tableFocusVersion !== focusVersion ? {...payload,focusRequest:undefined} : payload;
        rows.get(message.rowId)?.channel.dispatchEvent(new win.MessageEvent('message', { data }));
      }
    } else if (active && message?.type === 'requestSnapshot') {
      event.stopImmediatePropagation(); bridge.postMessage({ type: 'snapshotDom', token: message.token, html: capture(table, sanitizers) });
    }
  }, { capture: true, signal: events.signal });
  return { get active() { return active; }, get layout() { return layout; }, dispose() { events.abort(); clear(); table.remove(); resume.remove(); outerRoot.hidden = false; } };
}

export const DECISION_TABLE_STYLE = `
#crlDecisionTable[hidden],.cockpit-root[hidden],#root[hidden]{display:none!important}
.decision-table-controls{display:flex;align-items:center;gap:8px;position:sticky;left:0;top:0;background:var(--vscode-editor-background,#1e1e1e);padding:8px 0;z-index:5;white-space:normal;flex-wrap:wrap}
.decision-table-row{border-bottom:1px solid var(--vscode-panel-border,#454545);padding:12px 0 20px;white-space:normal;width:max-content;min-width:100%;box-sizing:border-box}
.decision-table-row-label{display:flex;gap:12px;align-items:center;padding-bottom:8px;position:sticky;left:0;width:fit-content}.decision-table-row-label[hidden]{display:none}
.decision-table-error{color:var(--vscode-errorForeground,#f48771);white-space:pre-wrap;margin:6px 0}
.decision-table-row .flow-zoom{display:none}.decision-table-static-cards{max-width:800px;white-space:pre-wrap}
`;
