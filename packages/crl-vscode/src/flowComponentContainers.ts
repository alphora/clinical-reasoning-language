/// <reference lib="dom" />
// REFACTOR:grounded: docs/mv-component-view.md — neutral reusable boundaries retain semantic control owners.
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
    const belongs = (n: SVGGElement, owner: SVGGElement) => {
      const seen = new Set<SVGGElement>();
      while (n !== owner && n.dataset.flowOutline && !seen.has(n)) {
        seen.add(n); const parent = byKey.get(n.dataset.flowParent!); if (!parent) return false; n = parent;
      }
      return n === owner;
    };
    type Box = { x: number; y: number; right: number; bottom: number };
    const box = (n: Element): Box => {
      const r = n.getBoundingClientRect();
      const a = new win.DOMPoint(r.left,r.top).matrixTransform(inverse), b = new win.DOMPoint(r.right,r.bottom).matrixTransform(inverse);
      return {x:a.x,y:a.y,right:b.x,bottom:b.y};
    };
    const components = nodes.filter(n => n.dataset.flowComponent === 'expanded' && visible(n));
    // Descendants precede ancestors, so outer bounds include inner padding.
    components.sort((a,b) => belongs(a,b) ? -1 : belongs(b,a) ? 1 : 0);
    const frames = new Map<SVGGElement,Box>();
    layer = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g');
    layer.setAttribute('class','flow-component-frames'); layer.setAttribute('pointer-events','none'); svg.prepend(layer);
    for (const owner of components) {
      const members = nodes.filter(n => visible(n) && belongs(n,owner));
      const keys = new Set(members.map(n=>n.dataset.flowKey));
      const boxes = members.map(n=>n.querySelector(':scope > rect')).filter((n): n is Element=>!!n).map(box);
      for (const [child,frame] of frames) if (belongs(child,owner)) boxes.push(frame);
      for (const card of Array.from(root.querySelectorAll<HTMLElement>('.route-card'))) {
        if (!card.closest('.route-questionnaire') && keys.has(card.dataset.ownerKey) && visible(card)) boxes.push(box(card));
      }
      if (!boxes.length) continue;
      const bounds = {x:Math.min(...boxes.map(b=>b.x))-8,y:Math.min(...boxes.map(b=>b.y))-4,right:Math.max(...boxes.map(b=>b.right))+8,bottom:Math.max(...boxes.map(b=>b.bottom))+12};
      frames.set(owner,bounds);
      const rect = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect');
      for (const [k,v] of Object.entries({x:bounds.x,y:bounds.y,width:bounds.right-bounds.x,height:bounds.bottom-bounds.y,rx:7})) rect.setAttribute(k,String(v));
      rect.setAttribute('data-component-frame',owner.dataset.flowKey!); layer.prepend(rect);
      const flag = owner.querySelector<SVGGElement>(':scope > .flow-flag-badge');
      if (flag && visible(flag)) {
        const before = flag.getAttribute('transform'), r = box(flag);
        const delta = new win.DOMPoint(bounds.right-10-(r.x+r.right)/2,bounds.bottom-9-(r.y+r.bottom)/2);
        flag.setAttribute('transform',`${before ?? ''} translate(${delta.x} ${delta.y})`);
        undo.push(()=>before===null?flag.removeAttribute('transform'):flag.setAttribute('transform',before));
      }
    }
  };
}
