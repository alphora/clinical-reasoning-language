// REFACTOR:grounded: instance ownership and focus-only pins follow the confirmed stacked-branch contract.
/// <reference lib="dom" />
/** Focus alone exposes tree pins; a table exposes only its dynamic scope anchor. */
export function installFlowPinVisibility(root: HTMLElement, tableRow = false) {
  const doc=root.ownerDocument,events=new doc.defaultView!.AbortController();
  const update = () => {
    const active=doc.activeElement,focused=active&&root.contains(active)?active.closest('[data-flow-key]'):undefined;
    const scope=root.dataset.flowScopeKey;
    for(const node of Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]'))){
      const rect=node.querySelector<SVGRectElement>(':scope > rect');
      if(!rect||Number(rect.getAttribute('width'))<=0||node.dataset.flowDecoration==='choices')continue;
      let pin=node.querySelector<SVGGElement>(':scope > [data-flow-pin]');
      if(!pin){
        const x=Number(rect.getAttribute('x'))+Number(rect.getAttribute('width')),y=Number(rect.getAttribute('y'));
        pin=doc.createElementNS('http://www.w3.org/2000/svg','g');pin.setAttribute('class','flow-pin');pin.dataset.flowPin=node.dataset.flowKey;
        pin.setAttribute('role','button');pin.setAttribute('tabindex','0');
        const title=doc.createElementNS('http://www.w3.org/2000/svg','title'),hit=doc.createElementNS('http://www.w3.org/2000/svg','rect'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');
        for(const [key,value]of Object.entries({x:x+6,y:y-18,width:22,height:22,rx:4}))hit.setAttribute(key,String(value));
        path.setAttribute('d',`M${x+12} ${y-13} h10 l-2 6 l3 3 h-12 l3-3 z M${x+17} ${y-4} v5`);
        pin.append(title,hit,path);node.append(pin);
      }
      node.classList.toggle('flow-pin-focus',!tableRow&&node===focused);
      node.classList.toggle('flow-scope-anchor',tableRow&&!!scope&&scope===node.dataset.flowKey);
      const label=scope===node.dataset.flowKey?'Close Decision Table':'Open Decision Table from this node';
      pin.setAttribute('aria-label',label);const title=pin.querySelector('title');if(title)title.textContent=label;
    }
  };
  root.addEventListener('focusin',update,{signal:events.signal});
  root.addEventListener('focusout',()=>queueMicrotask(()=>{if(!events.signal.aborted)update();}),{signal:events.signal});
  update();
  return {update, dispose() {events.abort();}};
}
