/// <reference lib="dom" />
import type {installLformsReviewControls,InteractiveQuestionControl} from './lformsReviewControls';
export interface SavedQuestionReviewMessage {gen:number;reviewToken?:string;questions?:InteractiveQuestionControl[]}
/** Rebind transport metadata without replacing toolbars, focus, or the mounted form. */
export function installSavedQuestionnaireReview(root:HTMLElement,bridge:{postMessage(message:unknown):void},install:typeof installLformsReviewControls){
  let current:SavedQuestionReviewMessage|undefined,mount:HTMLElement|undefined,dispose:(()=>void)|undefined;
  const questions:InteractiveQuestionControl[]=[];
  const clear=()=>{dispose?.();dispose=undefined;mount=undefined;current=undefined;questions.splice(0);root.querySelector('[data-question-review-error]')?.remove();};
  return {
    clear,dispose:clear,
    update(message:SavedQuestionReviewMessage){
      current=message;questions.splice(0,questions.length,...message.questions??[]);
      const next=root.querySelector<HTMLElement>('#aqMount');
      if(next!==mount){dispose?.();mount=next??undefined;dispose=mount?install(mount,questions,(action,linkId)=>{
        if(current?.reviewToken){root.querySelector('[data-question-review-error]')?.remove();bridge.postMessage({type:'savedQuestionReviewAction',gen:current.gen,token:current.reviewToken,action,linkId});}
      },()=>!!current?.reviewToken):undefined;}
      mount?.dispatchEvent(new root.ownerDocument.defaultView!.Event('crl-review-state'));
    },
    error(message:{token?:string;message:string}){
      if(!current||message.token!==current.reviewToken)return;
      let status=root.querySelector<HTMLElement>('[data-question-review-error]');
      if(!status){status=root.ownerDocument.createElement('p');status.dataset.questionReviewError='';status.setAttribute('role','status');root.prepend(status);}
      status.textContent=message.message;
    },
  };
}
