/// <reference lib="dom" />
/** Focus-only controls; the host supplies the destinations for the current pin. */
export function installPinnedMove(root:HTMLElement,api:{postMessage(m:unknown):void},generation:()=>number){
  const doc=root.ownerDocument,ns='http://www.w3.org/2000/svg';
  let token='',key='',controls:SVGGElement|undefined,busy=false;
  const clear=()=>{controls?.remove();controls=undefined;};
  const row=(key:string)=>Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).find(n=>n.dataset.flowKey===key);
  const focus=(next:string)=>{clear();key=next;if(token&&key&&!busy)api.postMessage({type:'pinnedMoveFocus',gen:generation(),token,key});};
  root.addEventListener('focusin',e=>{
    const target=e.target as Element;if(target.closest?.('[data-pinned-move]'))return;
    const node=target.closest?.<SVGGElement>('[data-flow-key]');
    if(!node||target.closest('foreignObject,input,textarea,select,button')){clear();key='';return;}
    if(node.dataset.flowKey!==key)focus(node.dataset.flowKey!);
  });
  doc.addEventListener('focusin',e=>{if(!root.contains(e.target as Node)){clear();key='';}});
  const svg=(tag:string,attrs:Record<string,string>)=>{const n=doc.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  return {
    pin(next:string){token=next;key='';busy=false;clear();},
    reset(){token='';key='';busy=false;clear();},
    show(m:{token:string;key:string;up?:boolean;down?:boolean}){
      if(m.token!==token||m.key!==key||busy)return;clear();if(!m.up&&!m.down)return;
      const owner=row(key);if(!owner||owner.classList.contains('flow-focus-hidden'))return;
      const rect=Array.from(owner.children).find(n=>n.localName==='rect');if(!rect)return;
      const x=Number(rect.getAttribute('x'))+Number(rect.getAttribute('width'))-44,y=Number(rect.getAttribute('y'))-22;
      controls=svg('g',{'class':'pinned-move-controls'}) as SVGGElement;
      for(const [i,direction] of (['up','down'] as const).entries()){
        const enabled=!!m[direction],button=svg('g',{'data-pinned-move':direction,role:'button',tabindex:enabled?'0':'-1','aria-label':'Move '+direction+' on pinned branch','aria-disabled':String(!enabled),transform:'translate('+(x+i*23)+' '+y+')'});
        const title=svg('title',{});title.textContent=enabled?'Move '+direction+' on pinned branch':'No adjacent movable item on this pinned branch';button.append(title,svg('rect',{x:'0',y:'0',width:'20',height:'18',rx:'3'}),svg('path',{d:direction==='up'?'M10 14 V4 M5 9 L10 4 L15 9':'M10 4 V14 M5 9 L10 14 L15 9'}));
        const activate=(e:Event)=>{e.preventDefault();e.stopPropagation();if(!enabled||busy)return;busy=true;clear();api.postMessage({type:'pinnedMove',gen:generation(),token,key,dir:direction});};
        button.addEventListener('click',activate);button.addEventListener('keydown',e=>{const k=e as KeyboardEvent;if(k.key==='Enter'||k.key===' ')activate(e);});controls.append(button);
      }
      owner.append(controls);
    },
    restore(m:{token:string;key:string}){if(m.token!==token)return;busy=false;key='';const next=row(m.key);next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest',inline:'nearest'});},
    failed(){busy=false;if(key)focus(key);}
  };
}
export const PINNED_MOVE_STYLE=`.pinned-move-controls rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#999)}.pinned-move-controls path{fill:none;stroke:var(--vscode-foreground,#ddd);stroke-width:1.6;pointer-events:none}.pinned-move-controls [aria-disabled=true]{opacity:.3;cursor:default}.pinned-move-controls [aria-disabled=false]{cursor:pointer}.pinned-move-controls [aria-disabled=false]:hover rect,.pinned-move-controls [aria-disabled=false]:focus rect{stroke:var(--vscode-focusBorder,#3794ff);stroke-width:2}`;
