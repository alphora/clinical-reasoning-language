/// <reference lib="dom" />
/** Manual and route reading aids share one glow; neither changes evaluation. */
export function installFlowLogicHighlight(root: HTMLElement) {
  const active = new Set<string>(), parents = new Map<string,string>();
  type Outcome = {key:string;result:'true'|'false'};
  let treeRoute = new Map<string,Outcome['result']>(), pinnedRoute = new Map<string,Outcome['result']>();
  const route = (keys:string[],outcomes:Outcome[]) => new Map(outcomes.filter(o=>keys.includes(o.key)).map(o=>[o.key,o.result]));
  let restore: (()=>void)[] = [];
  const clearPaint = () => {for (const undo of restore) undo();restore=[];root.querySelectorAll('.flow-group-halo').forEach(n=>n.remove());};
  const update = () => {
    clearPaint();
    const groups = Array.from(root.querySelectorAll<SVGGElement>('[data-flow-logic]'));
    for (const g of groups) parents.set(g.dataset.flowLogic!,g.dataset.flowLogicParent ?? '');
    for (const g of groups) {
      const key=g.dataset.flowLogic!, manual=active.has(key), tree=treeRoute.has(key), pin=pinnedRoute.has(key);
      const outcome=pinnedRoute.get(key) ?? treeRoute.get(key);
      const on=manual||tree||pin;g.setAttribute('aria-pressed',String(manual));
      if (!on) continue;
      const color = g.dataset.flowLogicKind === 'any' ? 'teal' : 'orange';
      for (const edge of Array.from(root.querySelectorAll<SVGPathElement>('path.flow-def-edge[data-flow-from]'))) {
        if (edge.dataset.flowFrom !== g.dataset.flowLogic) continue;
        const hadClass=edge.classList.contains('flow-group-solid');
        edge.classList.add('flow-group-solid');restore.push(()=>{if(!hadClass)edge.classList.remove('flow-group-solid');});
        const treeOnly=tree&&!manual&&!pin;
        if(treeOnly){edge.setAttribute('data-flow-auto-tree','1');restore.push(()=>edge.removeAttribute('data-flow-auto-tree'));}
        if(root.ownerDocument.defaultView!.getComputedStyle(edge).display==='none' || !edge.getClientRects().length)continue;
        const halo = edge.cloneNode(false) as SVGPathElement;
        halo.removeAttribute('data-flow-from');halo.removeAttribute('data-flow-to');
        halo.setAttribute('class',`flow-group-halo ${outcome?'flow-condition-'+outcome:'flow-group-'+color}`);halo.setAttribute('aria-hidden','true');
        if(tree&&!pin){
          halo.setAttribute('data-flow-auto-tree','1');
          if(manual)halo.setAttribute('data-flow-manual-color',color);
        }
        edge.before(halo);
      }
    }
  };
  root.addEventListener('click', e=>{
    const g=(e.target as Element).closest?.<SVGGElement>('[data-flow-logic]');if(!g)return;
    e.preventDefault();e.stopPropagation();
    const key=g.dataset.flowLogic!;
    if(active.delete(key)) {
      for(const candidate of active) {
        const seen=new Set<string>();let p=parents.get(candidate);
        while(p&&!seen.has(p)){if(p===key){active.delete(candidate);break;}seen.add(p);p=parents.get(p);}
      }
    } else active.add(key);
    update();
  });
  return {update,
    treeRoute(keys:string[],outcomes:Outcome[]=[]){treeRoute=route(keys,outcomes);update();},
    pinnedRoute(keys:string[],outcomes:Outcome[]=[]){pinnedRoute=route(keys,outcomes);update();},
    reset(){clearPaint();active.clear();treeRoute.clear();pinnedRoute.clear();parents.clear();}
  };
}
export const FLOW_LOGIC_STYLE = `
.flow-logic-label:focus-visible{outline:1px solid var(--vscode-focusBorder,#3794ff);outline-offset:3px;}
.flow-pointer-interaction .flow-logic-label:focus{outline:none;}
.flow-def-edge.flow-group-solid{stroke:#fff;stroke-width:1.25;stroke-dasharray:none;}
.flow-group-halo{fill:none;stroke:#fff;stroke-width:1.25;stroke-dasharray:none;pointer-events:none;vector-effect:non-scaling-stroke;}
.flow-group-teal{color:#00d9c0}.flow-group-orange{color:#ff9f43}
.flow-group-halo.flow-group-teal{filter:drop-shadow(0 0 2px #00d9c0) drop-shadow(0 0 3px #00d9c0)}
.flow-group-halo.flow-group-orange{filter:drop-shadow(0 0 2px #ff9f43) drop-shadow(0 0 3px #ff9f43)}
.fc-group-colors{letter-spacing:.02em;font-size:11px}.fc-group-colors i{font-style:normal;}
`;
