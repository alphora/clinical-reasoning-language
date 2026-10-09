// REFACTOR:grounded (MV/KE workflow): real request saves alter only MV flags; authored content stays reviewable.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadFlags,saveFlag,buildQaEditFlag,qaEditFlagId} from '@smile-digital-health/crl';
import {planPresentationEdit,planTerminologyEdit} from '@smile-digital-health/crl/language-services';
import {resolveWordingTarget} from './presentationProposal.ts';
import {resolveAnswerTarget} from './answerEditing.ts';
import {saveQuestionRequest,saveAnswerRequest,overlayQaRequests,questionFlagTarget,changeQaRequest} from './qaFlagEditing.ts';

import {qaFixture} from './qaFlagEditingFixture.mjs';

function snapshot(root){const files={};const walk=(dir,rel='')=>{for(const e of readdirSync(dir,{withFileTypes:true})){const name=rel+e.name;if(e.isDirectory())walk(join(dir,e.name),name+'/');else if(!name.startsWith('src/medical-validation/flags/'))files[name]=readFileSync(join(dir,e.name),'utf8');}};walk(root);return files;}
test('Q save previews, reuses one flag and reverts with every other artifact byte unchanged',()=>{
 const f=qaFixture();try{const before=snapshot(f.root),target=f.wording();
  const first=saveQuestionRequest(f.root,f.flags,target,'Requested question?','Requested detail');
  const second=saveQuestionRequest(f.root,f.flags,target,'Revised question?','Revised detail');assert.equal(first.id,second.id);assert.equal(loadFlags(f.flags).flags.length,1);
  const card=f.card();overlayQaRequests(f.root,[card],new Map([['q',target]]),new Map([['q',f.answer()]]),loadFlags(f.flags).flags);
  assert.equal(card.text,'Revised question?');assert.match(card.questionRequest.authored,/Authored question/);assert.match(card.questionRequest.requested,/Revised detail/);
  changeQaRequest(f.flags,second.id,'revert');assert.equal(loadFlags(f.flags).flags.length,0);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
test('default wording has one request across traversal contexts; actual scoped owners remain distinct',()=>{
 const f=qaFixture();try{const t=f.wording(),id=qaEditFlagId(questionFlagTarget(f.root,t));
  assert.equal(qaEditFlagId(questionFlagTarget(f.root,{...t,context:{decision:'D1',criteria:['A']}})),id);
  assert.equal(qaEditFlagId(questionFlagTarget(f.root,{...t,context:{decision:'D2',criteria:['B']}})),id);
  const scoped={...t,owners:{questionText:{contexts:[{kind:'criterion',ref:'C'}]},questionDescription:{contexts:[{kind:'criterion',ref:'C'}]}},context:{decision:'D1',criteria:['C']}};
  assert.notEqual(qaEditFlagId(questionFlagTarget(f.root,scoped)),id);
  assert.equal(qaEditFlagId(questionFlagTarget(f.root,{...scoped,context:{decision:'D2',criteria:['C','Extra']}})),qaEditFlagId(questionFlagTarget(f.root,scoped)));
 }finally{f.close();}
});
test('answer edit then delete stores only deletion and exposes it without touching selections',()=>{
 const f=qaFixture();try{const before=snapshot(f.root),target=f.answer();
  const edit=saveAnswerRequest(f.root,f.flags,target,{operation:'update',system:f.system,code:'yes',display:'Requested Yes',description:'Detail'});
  const card=f.card();overlayQaRequests(f.root,[card],new Map(),new Map([['q',target]]),loadFlags(f.flags).flags);assert.equal(card.value,'Requested Yes');
  const deleted=saveAnswerRequest(f.root,f.flags,target,{operation:'delete',system:f.system,code:'yes'});assert.equal(deleted.id,edit.id);assert.equal(deleted.editRequest.desired,null);assert.equal(deleted.editRequest.before.display,'Yes');
  const after=f.card();overlayQaRequests(f.root,[after],new Map(),new Map([['q',target]]),loadFlags(f.flags).flags);assert.equal(after.answerChoices.find(c=>c.code==='yes').pendingDelete,true);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
test('pending new answer remains a creation when edited and disappears when deleted',()=>{
 const f=qaFixture();try{const target=f.answer(),change={operation:'create',system:f.system,code:'maybe',display:'Maybe',description:'',qualifications:{'["L","Q"]':false}};
  const created=saveAnswerRequest(f.root,f.flags,target,change);assert.equal(created.editRequest.before,null);
  const updated=saveAnswerRequest(f.root,f.flags,target,{...change,operation:'update',display:'Revised Maybe'});assert.equal(updated.id,created.id);assert.equal(updated.editRequest.before,null);assert.equal(updated.editRequest.desired.qualifications['["L","Q"]'],false);
  const card=f.card();overlayQaRequests(f.root,[card],new Map(),new Map([['q',target]]),loadFlags(f.flags).flags);assert.equal(card.answerChoices.at(-1).display,'Revised Maybe');
  assert.equal(saveAnswerRequest(f.root,f.flags,target,{...change,operation:'delete'}),undefined);assert.equal(loadFlags(f.flags).flags.length,0);
 }finally{f.close();}
});
test('manual Fixed details retain authored mismatch; Approved renders subsequent authored source',()=>{
 const f=qaFixture();try{const target=f.wording(),flag=saveQuestionRequest(f.root,f.flags,target,'Requested?','Requested detail');changeQaRequest(f.flags,flag.id,'fixed');
  const fixed=f.card();overlayQaRequests(f.root,[fixed],new Map([['q',target]]),new Map(),loadFlags(f.flags).flags);assert.equal(fixed.text,'Requested?');assert.match(fixed.questionRequest.authored,/Authored detail/);
  assert.equal(saveQuestionRequest(f.root,f.flags,target,'Requested?','Requested detail').status,'fixed');changeQaRequest(f.flags,flag.id,'approved');
  writeFileSync(f.policy,f.source.replace('Authored question?','Later authored?'));const latest=f.wording(),approved=f.card();overlayQaRequests(f.root,[approved],new Map([['q',latest]]),new Map(),loadFlags(f.flags).flags);
  assert.equal(approved.text,'Later authored?');assert.equal(approved.questionRequest.status,'approved');assert.match(approved.questionRequest.authored,/Later authored/);
 }finally{f.close();}
});
test('missing create qualifications, final requested deletion and external answer edits are refused',()=>{
 const f=qaFixture();try{const target=f.answer();assert.throws(()=>saveAnswerRequest(f.root,f.flags,target,{operation:'create',system:f.system,code:'new',display:'New'}),/qualification/i);
  saveAnswerRequest(f.root,f.flags,target,{operation:'delete',system:f.system,code:'yes'});assert.throws(()=>saveAnswerRequest(f.root,f.flags,target,{operation:'delete',system:f.system,code:'no'}),/final answer/);
  assert.throws(()=>saveAnswerRequest(f.root,f.flags,{...target,editable:false,readOnlyReason:'Nonlocal owner'},{operation:'update',system:f.system,code:'yes',display:'Changed'}),/Nonlocal owner/);
 }finally{f.close();}
});
test('scoped question remains reviewable after its inherited description is removed by actual source application',()=>{
 const f=qaFixture();try{
  const source=f.source+'\nactivity "Act":\n- request CPGTaskRequest.\ndecision "D":\n- when "Q" then recommend activity "Act".\npresentation for "Q":\n- in decision "D".\n- question text is "Scoped?".\n';writeFileSync(f.policy,source);
  const context={decision:'D',criteria:new Set()},target=resolveWordingTarget(f.policy,source,'Q',context);assert.equal(target.questionDescription,'Authored detail');
  const flag=saveQuestionRequest(f.root,f.flags,target,'Scoped?','');
  writeFileSync(f.policy,planPresentationEdit(source,{library:'L',concept:'Q',context:target.context,questionText:'Scoped?',questionDescription:''}).candidateSource);
  const after=resolveWordingTarget(f.policy,readFileSync(f.policy,'utf8'),'Q',context);assert.equal(after.questionDescription,'');
  assert.equal(qaEditFlagId(questionFlagTarget(f.root,after)),flag.id);
  const card={...f.card(),text:after.questionText,description:after.questionDescription};overlayQaRequests(f.root,[card],new Map([['q',after]]),new Map(),loadFlags(f.flags).flags);assert.equal(card.questionRequest.id,flag.id);
  changeQaRequest(f.flags,flag.id,'fixed');changeQaRequest(f.flags,flag.id,'approved');assert.equal(loadFlags(f.flags).flags[0].status,'approved');
 }finally{f.close();}
});
test('applied local deletion still has review controls when only external members remain',()=>{
 const f=qaFixture();try{
  const source=f.term.replace('- code is `no` display is `No`.','- system is `urn:external`.\n- code is `no` display is `No`.');writeFileSync(f.terms,source);
  const target=f.answer(),flag=saveAnswerRequest(f.root,f.flags,target,{operation:'delete',system:f.system,code:'yes'});
  writeFileSync(f.terms,planTerminologyEdit(source,{operation:'delete',library:'Terms',terminology:'Options',canonicalBase:'http://example.org/qa',system:f.system,code:'yes'}).candidateSource);
  const after=f.answer();assert.equal(after.editable,false);const card=f.card();overlayQaRequests(f.root,[card],new Map(),new Map([['q',after]]),loadFlags(f.flags).flags);
  const deleted=card.answerChoices.find(c=>c.code==='yes');assert.equal(deleted.request.id,flag.id);assert.equal(deleted.pendingDelete,true);assert.equal(deleted.editable,false);
  changeQaRequest(f.flags,flag.id,'fixed');changeQaRequest(f.flags,flag.id,'approved');assert.equal(loadFlags(f.flags).flags[0].status,'approved');
 }finally{f.close();}
});
test('Approved historical creations/deletions do not change the current final-answer guard',()=>{
 for(const created of [true,false]){const f=qaFixture();try{
  const target=f.answer(),state={display:'No',description:'',qualifications:{'["L","Q"]':false}};
  const request={kind:'answer-crud',target:{kind:'answer',file:'src/crl/terms.crl',library:'Terms',terminology:'Options',system:f.system,code:'no'},before:created?null:state,desired:created?state:null};
  saveFlag(f.flags,{...buildQaEditFlag(request),status:'approved'});
  if(created)writeFileSync(f.terms,f.term.replace('- code is `no` display is `No`.',''));
  if(created)assert.throws(()=>saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'delete',system:f.system,code:'yes'}),/final answer/);
  else assert.equal(saveAnswerRequest(f.root,f.flags,target,{operation:'delete',system:f.system,code:'yes'}).editRequest.desired,null);
 }finally{f.close();}}
});
