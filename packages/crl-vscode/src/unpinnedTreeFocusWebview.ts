/// <reference lib="dom" />
import type { TreeFocusPaint } from './unpinnedTreeFocus';

export interface UnpinnedFocusMessage extends TreeFocusPaint {
  gen: number;
  token: string;
  navigation?: { current: number; total: number };
}

/** A tree-local reading focus. The pinned view retains its own controls and paint. */
export function installUnpinnedTreeFocus(root: HTMLElement, bridge: { postMessage(message: unknown): void }, generation: () => number, pinned: () => boolean, groupGlow: (keys: string[], outcomes: TreeFocusPaint['groupOutcomes']) => void = ()=>{}) {
  const doc = root.ownerDocument, win = doc.defaultView!;
  let selected: UnpinnedFocusMessage | undefined;
  let pendingFocus: {gen:number;token:string;key:string;dir?:string} | undefined;
  doc.addEventListener('focusin',()=>{pendingFocus=undefined;});
  const controls = '[data-flow-pin],[data-toggle-crit],[data-criterion-info],[data-criterion-verdict],[data-mv-flag-badge],[data-flow-open-decision],[data-flow-logic],input,textarea,select,button,a,summary';
  const strip = () => {
    root.querySelectorAll('.flow-edge.tree-focus-true,.flow-edge.tree-focus-false').forEach(edge=>edge.classList.remove('flow-condition-true','flow-condition-false'));
    root.querySelectorAll('.tree-focus-node,.tree-focus-selected,.tree-focus-operand,.tree-focus-true,.tree-focus-false,.tree-focus-unknown').forEach(node => node.classList.remove('tree-focus-node','tree-focus-selected','tree-focus-operand','tree-focus-true','tree-focus-false','tree-focus-unknown'));
    root.querySelectorAll('.tree-traversal-nav').forEach(node => node.remove());
    groupGlow([],[]);
  };
  const refresh = () => {
    const focusedArrow = (doc.activeElement as SVGElement | null)?.dataset?.treeTraversalNav;
    strip();
    root.classList.toggle('flow-unpinned-focus', !!selected && selected.gen===generation() && !pinned());
    if (!selected || selected.gen!==generation() || pinned()) return;
    // These navigation channels otherwise replay the selected case past a prefix boundary.
    root.querySelectorAll('.current,.diverter,.failed-criterion,.failed-criterion-preempt,.failed-criterion-pending,.flow-leaf-yes,.flow-leaf-no,.flow-condition-true,.flow-condition-false,.flow-condition-unknown').forEach(node => node.classList.remove('current','diverter','failed-criterion','failed-criterion-preempt','failed-criterion-pending','flow-leaf-yes','flow-leaf-no','flow-condition-true','flow-condition-false','flow-condition-unknown'));
    groupGlow(selected.groupKeys ?? [],selected.groupOutcomes ?? []);
    const nodes = new Map(Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).map(node => [node.dataset.flowKey!, node]));
    const keep = new Set(selected.nodeKeys);
    for (const key of keep) nodes.get(key)?.classList.add('tree-focus-node');
    nodes.get(selected.key)?.classList.add('tree-focus-selected');
    for (const operand of selected.operands) nodes.get(operand.key)?.classList.add('tree-focus-operand','tree-focus-'+operand.result);
    for (const mark of selected.conditions) {
      nodes.get(mark.key)?.classList.add('tree-focus-'+mark.result);
      for (const edge of Array.from(root.querySelectorAll<SVGPathElement>('.flow-edge[data-flow-condition]'))) {
        if (edge.dataset.flowCondition === mark.key && keep.has(edge.dataset.flowFrom!) && keep.has(edge.dataset.flowTo!) && edge.dataset.flowOutcome === (mark.result === 'true' ? 'Yes' : mark.result === 'false' ? 'No' : undefined)) edge.classList.add('tree-focus-'+mark.result,'flow-condition-'+mark.result);
      }
    }
    const terminal = nodes.get(selected.key), nav = selected.navigation;
    const rect = terminal?.querySelector<SVGRectElement>(':scope > rect');
    if (!terminal || !rect) return;
    if (!nav || nav.total<=1) {
      if (focusedArrow) terminal.focus({preventScroll:true});
      return;
    }
    const x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y')) - (terminal.querySelector(':scope > .flow-guard-tab') ? 40 : 30);
    const make = (name: string, attrs: Record<string, string>) => {
      const node = doc.createElementNS('http://www.w3.org/2000/svg',name);
      for (const [k, value] of Object.entries(attrs)) node.setAttribute(k,value);
      return node;
    };
    const group = make('g',{class:'tree-traversal-nav',transform:`translate(${x},${y})`});
    const count = make('text',{x:'60',y:'17','text-anchor':'middle','aria-live':'polite'});
    count.textContent = `${nav.current} of ${nav.total}`; group.append(count);
    for (const [dir, enabled, bx, glyph] of [['previous',nav.current>1,0,'←'],['next',nav.current<nav.total,100,'→']] as const) {
      const button = make('g',{'data-tree-traversal-nav':dir,role:'button',tabindex:enabled?'0':'-1','aria-label':dir==='previous'?'Previous traversal':'Next traversal','aria-disabled':String(!enabled)});
      const hit = make('rect',{x:String(bx),y:'0',width:'24',height:'24',rx:'4'}), text = make('text',{x:String(bx+12),y:'17','text-anchor':'middle'});
      text.textContent=glyph; button.append(hit,text); group.append(button);
    }
    terminal.append(group);
    if (focusedArrow) {
      const arrow = group.querySelector<SVGGElement>(`[data-tree-traversal-nav="${focusedArrow}"]`);
      if (arrow?.getAttribute('aria-disabled') === 'false') arrow.focus({preventScroll:true});
      else terminal.focus({preventScroll:true});
    }
  };
  root.addEventListener('click', event => {
    if (pinned() || doc.body.dataset.mode !== 'medical-validation') return;
    const target = event.target as Element;
    pendingFocus=undefined;
    const button = target.closest<SVGElement>('[data-tree-traversal-nav]');
    if (button) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (selected && button.getAttribute('aria-disabled') !== 'true') bridge.postMessage({type:'cycleTreeFocus',gen:generation(),key:selected.key,dir:button.dataset.treeTraversalNav,token:selected.token});
      return;
    }
    if (target.closest(controls)) return;
    const node = target.closest<SVGGElement>('[data-flow-key]');
    if (!node || !root.contains(node)) return;
    if (node.dataset.flowDecoration === 'choices') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    node.focus({preventScroll:true});
    bridge.postMessage({type:'treeFocus',gen:generation(),key:node.dataset.flowKey});
  });
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || doc.body.dataset.mode !== 'medical-validation' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['Enter',' '].includes(event.key) || pinned()) return;
    const target=event.target as Element;
    if (target.closest(controls) || !target.closest('[data-flow-key],[data-tree-traversal-nav]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    target.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
  },{capture:true});
  return {
    beforeRender(token?: string) {
      pendingFocus=undefined;
      const active=doc.activeElement as SVGElement|null, node=active?.closest<SVGGElement>('[data-flow-key]');
      if(token && node && root.contains(node))pendingFocus={gen:generation(),token,key:node.dataset.flowKey!,dir:active?.dataset.treeTraversalNav};
    },
    show(message: UnpinnedFocusMessage) {
      if(message.gen!==generation() || pinned())return;
      selected=message;refresh();
      const pending=pendingFocus;pendingFocus=undefined;
      if(pending?.gen===message.gen && pending.token===message.token && pending.key===message.key){
        const node=Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).find(n=>n.dataset.flowKey===pending.key);
        const arrow=pending.dir?node?.querySelector<SVGGElement>(`[data-tree-traversal-nav="${pending.dir}"]`):undefined;
        (arrow?.getAttribute('aria-disabled')==='false'?arrow:node)?.focus({preventScroll:true});
      }
    },
    refresh,
    reset() { selected=undefined;pendingFocus=undefined;strip();root.classList.remove('flow-unpinned-focus'); },
  };
}

export const UNPINNED_TREE_FOCUS_STYLE = `
.flow-has-pin [data-flow-key]:not(.pinned-traversal-node)>.flow-ring{display:none}
.flow-has-pin [data-flow-key].pinned-traversal-node>.flow-ring{display:inline}
.flow-has-pin .flow-greyborder:not(.pinned-traversal-node)>rect{stroke:var(--vscode-descriptionForeground,#888)}
.flow-has-pin .flow-ext.pinned-traversal-node>rect,.flow-has-pin .flow-more.pinned-traversal-node>rect{stroke:var(--vscode-focusBorder,#3794ff)}
.tree-traversal-nav text{fill:var(--vscode-foreground,#ddd);font:12px sans-serif}
[data-tree-traversal-nav]{cursor:pointer}[data-tree-traversal-nav]>rect{fill:var(--vscode-button-secondaryBackground,#333);stroke:var(--vscode-descriptionForeground,#888)}
[data-tree-traversal-nav][aria-disabled="true"]{opacity:.35;cursor:default}
.tree-focus-node>.flow-ring{display:inline}.tree-focus-node>rect{stroke-width:2.5}
.tree-focus-node.flow-ext>rect,.tree-focus-node.flow-more>rect{stroke:var(--vscode-focusBorder,#3794ff)}
.flow-unpinned-focus [data-flow-key]:not(.tree-focus-selected)>rect{filter:none!important}
.flow-unpinned-focus [data-flow-key].tree-focus-selected>rect{filter:drop-shadow(0 0 5px var(--flow-focus-color,#fff)) drop-shadow(0 0 2px var(--flow-focus-color,#fff))!important}
.flow-unpinned-focus .flow-input-row.tree-focus-selected>.flow-ring>rect{filter:drop-shadow(0 0 5px var(--flow-focus-color,#fff)) drop-shadow(0 0 2px var(--flow-focus-color,#fff))}
.flow-unpinned-focus .flow-row.this-node:not(.tree-focus-selected)>rect{stroke:var(--vscode-descriptionForeground,#888);stroke-width:1}
`;

/** Selected display route only; actual truth classes and explanatory cards stay intact. */
export function paintPinnedTraversal(root: HTMLElement, keys?: string[]) {
  const selected=new Set(keys ?? []);
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-flow-key]'))) {
    node.classList.toggle('pinned-traversal-node',selected.has(node.dataset.flowKey!));
  }
}

export function sanitizeUnpinnedTreeFocusSnapshot(root: HTMLElement) {
  root.querySelectorAll('.flow-edge.tree-focus-true,.flow-edge.tree-focus-false').forEach(edge=>edge.classList.remove('flow-condition-true','flow-condition-false'));
  root.classList.remove('flow-unpinned-focus');
  root.querySelectorAll('.tree-traversal-nav').forEach(node=>node.remove());
  root.querySelectorAll('.tree-focus-node,.tree-focus-selected,.tree-focus-operand,.tree-focus-true,.tree-focus-false,.tree-focus-unknown').forEach(node=>node.classList.remove('tree-focus-node','tree-focus-selected','tree-focus-operand','tree-focus-true','tree-focus-false','tree-focus-unknown'));
  root.querySelectorAll('.flow-group-halo[data-flow-auto-tree]').forEach(node=>{
    const manual=node.getAttribute('data-flow-manual-color');
    if(manual==='orange'||manual==='teal'){
      node.setAttribute('class','flow-group-halo flow-group-'+manual);
      node.removeAttribute('data-flow-auto-tree');node.removeAttribute('data-flow-manual-color');
    }else node.remove();
  });
  root.querySelectorAll('.flow-def-edge[data-flow-auto-tree]').forEach(node=>{node.classList.remove('flow-group-solid');node.removeAttribute('data-flow-auto-tree');});
}
