/// <reference lib="dom" />
/** Deliberate questionnaire navigation; any later interaction in this tree pane cancels a deferred reveal, including another table row. */
export function installQuestionNodeFocus(root:HTMLElement,bridge:{postMessage(message:unknown):void},generation:()=>number){
  const doc=root.ownerDocument,win=doc.defaultView!,events=new win.AbortController();let intent=0;
  let armed:{gen:number;key:string;token:string}|undefined;
  const result=(message:{gen:number;token:string},status:string,ok?:boolean,reason?:'intent'|'render')=>bridge.postMessage({type:'questionFocusResult',gen:message.gen,token:message.token,status,ok,reason});
  const cancel=(reason:'intent'|'render'='render')=>{intent++;if(armed){result(armed,'cancelled',undefined,reason);armed=undefined;}};
  for(const type of ['pointerdown','keydown','wheel'])doc.addEventListener(type,()=>cancel('intent'),{capture:true,signal:events.signal});
  return {
    cancel,
    arm(message:{gen:number;key:string;token:string}){
      cancel('intent');
      if(message.gen!==generation()){result(message,'cancelled',undefined,'render');return;}
      armed=message;result(message,'armed');
    },
    show(message:{gen:number;key:string;token:string}){
      if(!armed||armed.token!==message.token||armed.gen!==message.gen)return;
      const mine=++intent;
      win.requestAnimationFrame(()=>{
        if(mine!==intent||message.gen!==generation())return;
        armed=undefined;
        const node=Array.from(root.querySelectorAll<SVGElement>('[data-flow-key]')).find(n=>n.dataset.flowKey===message.key);
        if(!node||!node.getClientRects().length){result(message,'done',false);return;}
        for(const old of Array.from(root.querySelectorAll('.question-node-focus')))old.classList.remove('question-node-focus');
        node.classList.add('question-node-focus');node.setAttribute('tabindex','-1');node.focus({preventScroll:true});
        node.scrollIntoView({block:'nearest',inline:'nearest'});
        result(message,'done',true);
      });
    },
    dispose(){cancel('intent');events.abort();},
  };
}
