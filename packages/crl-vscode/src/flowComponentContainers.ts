/// <reference lib="dom" />
// Neutral reusable boundaries retain their semantic control owners.
export function installFlowComponentContainers(root: HTMLElement) {
  let layer: SVGGElement | undefined;
  let undo: (() => void)[] = [];
  return () => {
    for (const restore of undo) restore(); undo = [];
    layer?.remove(); layer = undefined;
    const svg = root.querySelector<SVGSVGElement>('.flow-svg');
    const inverse = svg?.getScreenCTM()?.inverse();
    if (!svg || !inverse) return;
    const win = root.ownerDocument.defaultView!;
    const nodes = Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]'));
    const byKey = new Map(nodes.map(n => [n.dataset.flowKey!, n]));
    const visible = (n: Element) => !n.closest('.flow-focus-hidden') && win.getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
    const ancestors = new Map<SVGGElement,Set<SVGGElement>>();
    for (const node of nodes) {
      const path = new Set<SVGGElement>();let n: SVGGElement | undefined = node;
      while(n&&!path.has(n)){path.add(n);if(!n.dataset.flowOutline)break;n=byKey.get(n.dataset.flowParent!);}
      ancestors.set(node,path);
    }
    const belongs = (n: SVGGElement, owner: SVGGElement) => ancestors.get(n)?.has(owner) ?? false;
    type Box = { x: number; y: number; right: number; bottom: number };
    const box = (n: Element): Box => {
      const r = n.getBoundingClientRect();
      const a = new win.DOMPoint(r.left,r.top).matrixTransform(inverse), b = new win.DOMPoint(r.right,r.bottom).matrixTransform(inverse);
      return {x:a.x,y:a.y,right:b.x,bottom:b.y};
    };
    // Read geometry once, before any frame or badge writes. Nested bounds are then pure arithmetic.
    const visibleNodes = nodes.filter(visible);
    const bodies = new Map<SVGGElement,Box[]>();
    const badges = new Map<SVGGElement,{el:SVGGElement;box:Box;before:string|null}>();
    const verdicts = new Map<SVGGElement,{el:SVGGElement;box:Box;before:string|null}>();
    for (const n of visibleNodes) {
      const r=n.querySelector(':scope > rect');const boxes=r?[box(r)]:[];
      const choices=n.querySelector('[data-flow-choices-toggle]');if(choices&&visible(choices))boxes.push(box(choices));
      bodies.set(n,boxes);
      const flag=n.querySelector<SVGGElement>(':scope > .flow-flag-badge');
      if(flag&&visible(flag)){
        const control=Array.from(flag.querySelectorAll('circle,.flow-flag-authoring > rect')).find(visible)??flag;
        badges.set(n,{el:flag,box:box(control),before:flag.getAttribute('transform')});
      }
      const verdict=n.querySelector<SVGGElement>(':scope > .flow-crit-verdict');
      if(verdict&&visible(verdict))verdicts.set(n,{el:verdict,box:box(verdict.querySelector('circle')??verdict),before:verdict.getAttribute('transform')});
    }
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.route-card'))
      .filter(c=>!c.closest('.route-questionnaire')&&visible(c)).map(c=>({key:c.dataset.ownerKey,box:box(c)}));
    const components=visibleNodes.filter(n=>n.dataset.flowComponent==='expanded');
    components.sort((a,b)=>ancestors.get(b)!.size-ancestors.get(a)!.size);
    const frames = new Map<SVGGElement,Box>();
    for (const owner of components) {
      const members=visibleNodes.filter(n=>belongs(n,owner));const keys=new Set(members.map(n=>n.dataset.flowKey));
      const boxes=members.flatMap(n=>bodies.get(n)??[]);
      for(const [child,frame] of frames)if(belongs(child,owner))boxes.push(frame);
      for(const card of cards)if(keys.has(card.key))boxes.push(card.box);
      if(!boxes.length)continue;
      frames.set(owner,{x:Math.min(...boxes.map(b=>b.x))-8,y:Math.min(...boxes.map(b=>b.y))-4,right:Math.max(...boxes.map(b=>b.right))+8,bottom:Math.max(...boxes.map(b=>b.bottom))+12});
    }
    layer=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g');layer.setAttribute('class','flow-component-frames');layer.setAttribute('pointer-events','none');svg.prepend(layer);
    for(const [owner,bounds] of frames) {
      const rect=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect');
      for(const [k,v] of Object.entries({x:bounds.x,y:bounds.y,width:bounds.right-bounds.x,height:bounds.bottom-bounds.y,rx:7}))rect.setAttribute(k,String(v));
      rect.setAttribute('data-component-frame',owner.dataset.flowKey!);layer.prepend(rect);
      const flag=badges.get(owner);
      if(flag){const {el,box:r,before}=flag;el.setAttribute('transform',`${before??''} translate(${bounds.right-12-(r.x+r.right)/2} ${bounds.bottom-9-(r.y+r.bottom)/2})`);undo.push(()=>before===null?el.removeAttribute('transform'):el.setAttribute('transform',before));}
      const verdict=verdicts.get(owner);
      if(verdict){const {el,box:r,before}=verdict;el.setAttribute('transform',`${before??''} translate(${bounds.right-12-(r.x+r.right)/2} ${bounds.y+12-(r.y+r.bottom)/2})`);undo.push(()=>before===null?el.removeAttribute('transform'):el.setAttribute('transform',before));}
    }
  };
}
