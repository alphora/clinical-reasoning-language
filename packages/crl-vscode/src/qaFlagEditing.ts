// REFACTOR:grounded (MV/KE workflow): requested state and manual review are MV-only writes.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { buildCRL, buildQaEditFlag, canonicalMvValue, qaEditFlagId, mvReviewStatus,
  loadFlags, saveFlag, removeFlag, transitionMvFlag, isQaSourcePath,
  type MvFlag, type QaEditRequest, type QuestionEditTarget, type AnswerEditTarget, type AnswerEditState } from '@smile-digital-health/crl';
import { planPresentationEdit, planTerminologyEdit } from '@smile-digital-health/crl/language-services';
import type { WordingTarget } from './presentationProposal';
import type { AnswerTarget, AnswerChange } from './answerEditing';
import type { RouteCard } from './routeCards';

const localSourceFile = (root: string, file: string):string|undefined => {
  const rel = relative(root, file).replace(/\\/g, '/');
  return isQaSourcePath(rel) && rel.startsWith('src/crl/') ? rel : undefined;
};
const sourceFile = (root:string,file:string) => {
  const local=localSourceFile(root,file);if(!local)throw new Error('The CRL owner is outside this artifact.');return local;
};
export function questionFlagTarget(root: string, target: WordingTarget): QuestionEditTarget {
  // Question text identifies the displayed question. Description insertion ownership may change when its value is removed.
  const scopes = target.owners.questionText?.contexts.map(c => ({kind:c.kind,ref:c.ref})) ?? [];
  return { kind:'question',file:sourceFile(root,target.filePath),library:target.library,concept:target.concept,
    presentationKey:canonicalMvValue(scopes),...(scopes.length && target.context ? {context:target.context}:{} ) };
}
export const answerFlagTarget = (root:string,target:AnswerTarget,system:string,code:string):AnswerEditTarget =>
  ({kind:'answer',file:sourceFile(root,target.filePath),library:target.library,terminology:target.terminology,system,code});
export function answerSourceState(target:AnswerTarget,system:string,code:string):AnswerEditState|null {
  const member=target.members.find(m=>m.system===system && m.code===code);
  if(!member)return null;
  const qualifications:Record<string,boolean>={};
  for(const consumer of target.consumers){
    const ast=buildCRL(consumer.baseline).result;
    const c=ast?.statements.find(s=>s.type==='Concept' && s.name===consumer.concept);
    if(!c || c.type!=='Concept' || !c.valueFrom)throw new Error('A consuming question is unavailable. Re-pin before saving.');
    qualifications[consumer.key]=!c.valueFrom.notQualifying?.some(x=>x.code===code);
  }
  return {display:member.display,description:member.description??'',qualifications};
}
function currentFlags(dir:string){const loaded=loadFlags(dir);if(loaded.warning)throw new Error(loaded.warning);return loaded.flags;}
function persistRequest(dir:string,request:QaEditRequest,authored:unknown=request.before):MvFlag|undefined {
  const current=currentFlags(dir).find(f=>f.id===qaEditFlagId(request.target));
  const applied=!!current?.editRequest && canonicalMvValue(current.editRequest.desired)===canonicalMvValue(authored);
  const next=buildQaEditFlag(request,current,undefined,applied);
  if(next)saveFlag(dir,next);else if(current)removeFlag(dir,current.id);
  return next;
}
export function saveQuestionRequest(root:string,dir:string,target:WordingTarget,text:string,description:string){
  if(target.editable===false)throw new Error(target.readOnlyReason??'Question wording is read-only.');
  if(readFileSync(target.filePath,'utf8')!==target.baseline)throw new Error('Question wording changed. Re-pin before saving.');
  const identity=questionFlagTarget(root,target),before={text:target.questionText,description:target.questionDescription};
  if(text!==before.text || description!==before.description)planPresentationEdit(target.baseline,
    {library:target.library,concept:target.concept,context:identity.context,questionText:text,questionDescription:description});
  return persistRequest(dir,{kind:'question-edit',target:identity,before,desired:{text,description}});
}
export function saveAnswerRequest(root:string,dir:string,target:AnswerTarget,change:AnswerChange){
  if(!target.editable)throw new Error(target.readOnlyReason??'Answer terminology is read-only.');
  if(readFileSync(target.filePath,'utf8')!==target.baseline || target.consumers.some(c=>readFileSync(c.filePath,'utf8')!==c.baseline))
    throw new Error('Answer terminology or its consuming questions changed. Re-pin before saving.');
  const identity=answerFlagTarget(root,target,change.system,change.code),flags=currentFlags(dir),current=flags.find(f=>f.id===qaEditFlagId(identity));
  const before=answerSourceState(target,change.system,change.code),existing=current?.editRequest?.kind==='answer-crud'?current.editRequest:undefined;
  if(before && !target.members.find(m=>m.system===change.system && m.code===change.code)?.editable)throw new Error('This answer is externally owned and read-only.');
  if(!target.systems.includes(change.system))throw new Error('Choose an existing locally owned answer system.');
  if(!['create','update','delete'].includes(change.operation))throw new Error('Unknown answer operation.');
  if(change.operation==='create' && (before || existing?.desired))throw new Error('This answer code already exists.');
  if(change.operation!=='create' && !before && !existing?.desired && !existing?.before)throw new Error('The answer no longer exists.');
  const qualifications=before?.qualifications ?? (existing?.desired ?? existing?.before)?.qualifications ?? change.qualifications;
  if(!qualifications || target.consumers.some(c=>typeof qualifications[c.key]!=='boolean') ||
    Object.keys(qualifications).some(k=>!target.consumers.some(c=>c.key===k)))throw new Error('Choose qualification for every consuming question.');
  const desired=change.operation==='delete'?null:{display:change.display??'',description:change.description??'',qualifications};
  // Validate only source representation in memory; submitting a request never executes or publishes definitions.
  if(change.operation!=='delete' && (!before || canonicalMvValue(desired)!==canonicalMvValue(before))){
    if(!before && target.members.some(m=>m.code===change.code))throw new Error('Answer codes must be unique within this terminology.');
    planTerminologyEdit(target.baseline,{...change,operation:before?'update':'create',library:target.library,terminology:target.terminology,canonicalBase:target.canonicalBase});
  }
  if(change.operation==='delete'){
    const members=new Set(target.members.map(m=>JSON.stringify([m.system,m.code])));
    for(const f of flags)if(f.editRequest?.kind==='answer-crud' && mvReviewStatus(f)!=='approved' && f.editRequest.target.file===identity.file && f.editRequest.target.terminology===identity.terminology){
      const key=JSON.stringify([f.editRequest.target.system,f.editRequest.target.code]);if(f.editRequest.desired)members.add(key);else members.delete(key);
    }
    members.delete(JSON.stringify([change.system,change.code]));if(!members.size)throw new Error('Add a replacement before deleting the final answer.');
  }
  const inputBefore=before ?? (change.operation==='delete' ? existing?.before??existing?.desired??null : null);
  return persistRequest(dir,{kind:'answer-crud',target:identity,before:inputBefore,desired},before);
}
export interface QaFlagView { id:string; status:'pending-fix'|'fixed'|'approved'; authored:string; requested:string }
const view=(flag:MvFlag,authored:string,requested:string):QaFlagView=>({id:flag.id,status:mvReviewStatus(flag),authored,requested});
export function overlayQaRequests(root:string,cards:RouteCard[],wording:Map<string,WordingTarget>,answers:Map<string,AnswerTarget>,flags:MvFlag[]){
  for(const card of cards){
    const q=wording.get(card.id),a=answers.get(card.id);
    const qflag=q && localSourceFile(root,q.filePath) ? flags.find(f=>f.id===qaEditFlagId(questionFlagTarget(root,q))) : undefined;
    if(qflag?.editRequest?.kind==='question-edit'){
      const request=qflag.editRequest;card.questionRequest=view(qflag,card.text+'\n'+card.description,request.desired.text+'\n'+request.desired.description);
      if(mvReviewStatus(qflag)!=='approved'){card.text=request.desired.text;card.description=request.desired.description;}
    }
    const answerFile=a && localSourceFile(root,a.filePath);if(!a || !answerFile)continue;
    for(const flag of flags){const request=flag.editRequest;
      if(request?.kind!=='answer-crud' || request.target.file!==answerFile || request.target.library!==a.library || request.target.terminology!==a.terminology)continue;
      const authored=a.members.find(m=>m.system===request.target.system && m.code===request.target.code);
      const choice=card.answerChoices.find(c=>c.system===request.target.system && c.code===request.target.code);
      const info=view(flag,authored?authored.display+'\n'+(authored.description??''):'Not in authored terminology',request.desired?request.desired.display+'\n'+request.desired.description:'Delete answer');
      if(mvReviewStatus(flag)==='approved'){if(choice)choice.request=info;continue;}
      if(choice){
        choice.request=info;
        if(!request.desired)choice.pendingDelete=true;
        else {const old=choice.display;choice.display=request.desired.display;choice.description=request.desired.description;if(choice.selected && card.value===old)card.value=choice.display;}
      }else card.answerChoices.push({system:request.target.system,code:request.target.code,display:request.desired?.display??request.before!.display,
        description:request.desired?.description??request.before?.description,selected:false,editable:a.editable,request:info,pendingDelete:!request.desired});
    }
  }
}
/** Called only with an identity resolved from the host's current Q/A snapshot, never an arbitrary webview id. */
export function changeQaRequest(dir:string,id:string,action:'revert'|'fixed'|'approved'|'open'){
  const current=currentFlags(dir).find(f=>f.id===id);if(!current?.editRequest)throw new Error('The request changed. Re-pin before continuing.');
  if(action==='revert'){if(mvReviewStatus(current)!=='pending-fix')throw new Error('Reopen the request before reverting it.');removeFlag(dir,id);}
  else saveFlag(dir,transitionMvFlag(current,action));
}
