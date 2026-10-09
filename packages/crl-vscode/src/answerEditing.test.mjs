import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {emitCrlTwoLane,writeTwoLane} from '@smile-digital-health/crl';
import {resolveAnswerTarget,previewAnswerChange,AnswerCaseImpactError} from './answerEditing.ts';
import {planDirectAnswerEdit,mvPublicationOptions} from './mvDirectEdit.ts';
import {MvEditTransaction} from './mvEditTransaction.ts';
export function answerFixture(request='CPGServiceRequest',configured=false){
 const root=mkdtempSync(join(tmpdir(),'answer-crud-')),project=join(root,'policy'),dir=join(project,'src/crl');mkdirSync(dir,{recursive:true});
 const system='http://example.org/answers/CodeSystem/choices',policyPath=join(dir,'policy.crl'),terms=join(dir,'terms.crl'),other=join(dir,'other.crl'),sidecarPath=join(project,'src/medical-validation/policy.json');
 writeFileSync(join(project,'package.json'),JSON.stringify({name:'answer-policy',version:'1.0.0',crl:{canonicalBase:'http://example.org/answers',date:'2026-10-08',status:'draft',...(configured?{dispositions:{options:{certify:{Refer:{label:'Refer'}}}}}:{})}}));
 writeFileSync(terms,'library "Terms".\nterminology "Choices":\n- system is `'+system+'`.\n- code is `yes` display is `Yes` description is `Evidence supplied`.\n- code is `no` display is `No`.\n');
 const question=(name)=>`concept "${name}":\n- shape is Record.\n- type is Observation.\n- value type is CodeableConcept.\n- code is \`${name.toLowerCase()}\`.\n- value domain is answer options.\n- shape reduction is most recent.\n- value from is "Terms"."Choices":\n  - not qualifying is \`no\`.\npresentation for "${name}":\n- question text is "${name}?".\n`;
 writeFileSync(other,'library "Other".\n'+question('Second'));
 const activity=configured?'certify.Refer':'Refer';
 writeFileSync(policyPath,'library "Policy".\n'+question('Complaint')+`concept "Qualifies":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- shape reduction is most recent.\n- definition is "Complaint" in qualifying.\nactivity "${activity}":\n- request ${request}.\ndecision "Review":\n- when "Qualifies" then recommend activity "${activity}".\n`);
 mkdirSync(join(project,'src/medical-validation'),{recursive:true});writeFileSync(sidecarPath,JSON.stringify({schemaVersion:2,byCaseId:{a:'pass'},notesByCaseId:{a:[{id:'n',text:'Keep',created:1}]}}));
 const emission=emitCrlTwoLane(policyPath,mvPublicationOptions(project));assert.equal(emission.success,true,JSON.stringify(emission.fhir.errors));writeTwoLane(emission,join(project,'src'));
 return {root,project,policyPath,terms,other,system,sidecarPath,target:()=>resolveAnswerTarget(policyPath,'Policy','Complaint'),options:()=>({policyPath,target:resolveAnswerTarget(policyPath,'Policy','Complaint'),sidecarPath,id:randomUUID(),editedAt:'2026-10-08T00:00:00.000Z',scratchRoot:join(root,'scratch')}),close:()=>rmSync(root,{recursive:true,force:true})};
}
const publish=(f,change)=>{const plan=planDirectAnswerEdit({...f.options(),change}),tx=MvEditTransaction.prepare({artifactRoot:f.project,storageRoot:join(f.root,'recovery'),units:plan.units});tx.publish();return plan;};
for(const request of ['CPGTaskRequest','CPGCommunicationRequest','CPGServiceRequest','CPGMedicationRequest'])for(const configured of [false,true]){
 test(`direct answer CRUD preserves ${request}, configured=${configured}`,()=>{
  const f=answerFixture(request,configured);try{
   const before=emitCrlTwoLane(f.policyPath,mvPublicationOptions(f.project)).fhir.resources.filter(r=>r.resourceType==='ActivityDefinition').map(r=>({relativePath:r.relativePath,resource:r.resource}));
   const activities=readFileSync(f.policyPath,'utf8').split('activity ')[1];
   publish(f,{operation:'update',system:f.system,code:'yes',display:'Documented',description:'Evidence'});
   publish(f,{operation:'create',system:f.system,code:'other',display:'Other',qualifications:Object.fromEntries(f.target().consumers.map(c=>[c.key,false]))});
   publish(f,{operation:'delete',system:f.system,code:'other'});
   assert.equal(readFileSync(f.policyPath,'utf8').split('activity ')[1],activities);
   const after=emitCrlTwoLane(f.policyPath,mvPublicationOptions(f.project));assert.equal(after.success,true);
   assert.deepEqual(after.fhir.resources.filter(r=>r.resourceType==='ActivityDefinition').map(r=>({relativePath:r.relativePath,resource:r.resource})),before);
   assert.match(readFileSync(f.terms,'utf8'),/display is `Documented`/);
   assert.doesNotMatch(readFileSync(f.terms,'utf8'),/code is `other`/);
  }finally{f.close();}
 });
}
test('answer update directly publishes terminology, ValueSet compose/expansion and CodeSystem definition without changing coding',()=>{
 const f=answerFixture();try{
  const plan=publish(f,{operation:'update',system:f.system,code:'yes',display:'Documented',description:'Supporting evidence'});
  assert.match(readFileSync(f.terms,'utf8'),/code is `yes` display is `Documented` description is `Supporting evidence`/);assert.equal(plan.sidecar.byCaseId.a,'pending');assert.equal(plan.sidecar.notesByCaseId.a[0].text,'Keep');
  const e=emitCrlTwoLane(f.policyPath,mvPublicationOptions(f.project));const vs=e.fhir.resources.find(r=>r.resourceType==='ValueSet').resource,cs=e.fhir.resources.find(r=>r.resourceType==='CodeSystem' && r.resource.url===f.system).resource;
  assert.equal(vs.compose.include[0].concept[0].extension[0].valueString,'Supporting evidence');assert.equal(vs.expansion.contains[0].extension[0].valueString,'Supporting evidence');assert.equal(cs.concept.find(c=>c.code==='yes').definition,'Supporting evidence');
 }finally{f.close();}
});
test('create classifies each shared consumer independently and delete reconciles both local files',()=>{
 const f=answerFixture();try{
  const t=f.target();assert.equal(t.consumers.length,2);const qualifications=Object.fromEntries(t.consumers.map(c=>[c.key,c.concept==='Complaint']));
  publish(f,{operation:'create',system:f.system,code:'other',display:'Other',description:'Additional evidence',qualifications});
  assert.doesNotMatch(readFileSync(f.policyPath,'utf8'),/not qualifying is `other`/);assert.match(readFileSync(f.other,'utf8'),/not qualifying is `other`/);
  publish(f,{operation:'delete',system:f.system,code:'no'});assert.doesNotMatch(readFileSync(f.terms,'utf8'),/code is `no`/);assert.doesNotMatch(readFileSync(f.policyPath,'utf8'),/not qualifying is `no`/);assert.doesNotMatch(readFileSync(f.other,'utf8'),/not qualifying is `no`/);
  const e=emitCrlTwoLane(f.policyPath,mvPublicationOptions(f.project)),cs=e.fhir.resources.find(r=>r.resourceType==='CodeSystem' && r.resource.url===f.system).resource;assert.deepEqual(cs.concept.map(c=>c.code).sort(),['other','yes']);
 }finally{f.close();}
});
test('external CodeSystem answer is read-only on both sides and a forged Save writes nothing',()=>{
 const f=answerFixture();try{writeFileSync(f.terms,readFileSync(f.terms,'utf8').replaceAll(f.system,'urn:external'));const t=f.target(),before=readFileSync(f.terms,'utf8');assert.equal(t.editable,false);assert.match(t.readOnlyReason,/not locally owned/);assert.throws(()=>previewAnswerChange(f.policyPath,t,{operation:'update',system:'urn:external',code:'yes',display:'New'}),/read-only|not locally owned/);assert.equal(readFileSync(f.terms,'utf8'),before);}finally{f.close();}
});
test('installed terminology is read-only even when its codes use this package canonical base',()=>{
 const f=answerFixture();try{
  const packageDir=join(f.project,'node_modules/vocabulary');mkdirSync(packageDir,{recursive:true});writeFileSync(join(packageDir,'package.json'),JSON.stringify({name:'vocabulary',version:'1.0.0',crl:{libraries:['terms.crl']}}));writeFileSync(join(packageDir,'terms.crl'),readFileSync(f.terms,'utf8'));rmSync(f.terms);
  writeFileSync(f.policyPath,readFileSync(f.policyPath,'utf8').replace('library "Policy".','library "Policy".\ninclude "Terms".'));writeFileSync(f.other,readFileSync(f.other,'utf8').replace('library "Other".','library "Other".\ninclude "Terms".'));
  const target=f.target();assert.equal(target.editable,false);assert.match(target.readOnlyReason,/not locally owned/);const before=readFileSync(join(packageDir,'terms.crl'),'utf8');assert.throws(()=>previewAnswerChange(f.policyPath,target,{operation:'update',system:f.system,code:'yes',display:'New'}),/not locally owned/);assert.equal(readFileSync(join(packageDir,'terms.crl'),'utf8'),before);
 }finally{f.close();}
});
test('impact includes a source representation sharing the answer vocabulary',()=>{
 const f=answerFixture();try{
  writeFileSync(f.policyPath,readFileSync(f.policyPath,'utf8')+'concept "Supplied Request":\n- shape is Record.\n- type is Observation.\n- value type is CodeableConcept.\n- value domain is "Terms"."Choices".\n- shape reduction is most recent.\n- source representation:\n  - type is ServiceRequest.\n  - coded from "Terms"."Choices".\n');
  const target=f.target();assert.ok(target.uses.includes('Policy: Supplied Request'));const p=previewAnswerChange(f.policyPath,target,{operation:'create',system:f.system,code:'new',display:'New',qualifications:Object.fromEntries(target.consumers.map(c=>[c.key,true]))});assert.ok(p.answerReceipt.uses.includes('Policy: Supplied Request'));
 }finally{f.close();}
});
test('package/local question name collisions are refused rather than editing the local namesake',()=>{
 const f=answerFixture();try{
  const dir=join(f.project,'node_modules/installed-policy');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'package.json'),JSON.stringify({name:'installed-policy',version:'1.0.0',crl:{libraries:['policy.crl']}}));writeFileSync(join(dir,'policy.crl'),readFileSync(f.policyPath,'utf8'));writeFileSync(f.policyPath,readFileSync(f.policyPath,'utf8').replace('library "Policy".','library "Policy".\ninclude "Policy" as "InstalledPolicy".'));const before=readFileSync(f.terms,'utf8');assert.throws(()=>f.target(),/competing local and installed/);assert.equal(readFileSync(f.terms,'utf8'),before);
 }finally{f.close();}
});
test('impact includes unary and available-answer narrative terminology membership',()=>{
 const f=answerFixture();try{
  writeFileSync(f.policyPath,readFileSync(f.policyPath,'utf8')+'concept "Member":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- shape reduction is most recent.\n- definition is "Complaint" in "Terms"."Choices".\nconcept "Any Member":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- shape reduction is most recent.\n- definition is any available value of "Complaint" in "Terms"."Choices" using validity of "Complaint".\n');const target=f.target();assert.ok(target.uses.includes('Policy: Member'));assert.ok(target.uses.includes('Policy: Any Member'));
 }finally{f.close();}
});
test('deleting a used example answer requires concrete impact acknowledgement and preserves CEL bytes',()=>{
 const f=answerFixture();try{
  const dir=join(f.project,'src/cel/mv');mkdirSync(dir,{recursive:true});const cel=join(dir,'cases.cel'),source='library "Cases". covers "Policy".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\nfact "Answer": - value is "yes". - date is "2026-10-08". - defined by "Policy"."Complaint".\ncase "Example": - subject is "Patient". - fact is "Answer". - result is "Review" is "Refer".\n';writeFileSync(cel,source);
  const change={operation:'delete',system:f.system,code:'yes'};assert.throws(()=>previewAnswerChange(f.policyPath,f.target(),change),e=>e instanceof AnswerCaseImpactError && e.caseImpact.some(c=>c.file==='src/cel/mv/cases.cel'));
  let impact;try{previewAnswerChange(f.policyPath,f.target(),change);}catch(e){impact=e;}writeFileSync(cel,source+'\n// changed example inputs\n');assert.throws(()=>previewAnswerChange(f.policyPath,f.target(),{...change,acknowledgedCaseImpact:impact.caseImpactToken}),e=>e instanceof AnswerCaseImpactError && e.caseImpactToken!==impact.caseImpactToken);writeFileSync(cel,source);const plan=publish(f,{...change,acknowledgedCaseImpact:impact.caseImpactToken});assert.match(plan.reviewWarning,/unrunnable/);assert.equal(readFileSync(cel,'utf8'),source);const receipt=JSON.parse(readFileSync(plan.receiptPath,'utf8'));assert.equal(receipt.answers.resultsState,'stale-unrunnable');assert.ok(receipt.answers.caseImpact.length);
 }finally{f.close();}
});

test('Save refuses an installed question namesake introduced after pinning',()=>{
 const f=answerFixture();try{
  writeFileSync(f.policyPath,readFileSync(f.policyPath,'utf8').replace('library "Policy".','library "Policy".\ninclude "Other".'));
  const target=resolveAnswerTarget(f.policyPath,'Other','Second'),before=readFileSync(f.terms,'utf8');
  const dir=join(f.project,'node_modules/installed-other');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'package.json'),JSON.stringify({name:'installed-other',version:'1.0.0',crl:{libraries:['other.crl']}}));writeFileSync(join(dir,'other.crl'),'library "Other".\nconcept "Second":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `second`.\n- shape reduction is most recent.\n');
  assert.throws(()=>previewAnswerChange(f.policyPath,target,{operation:'update',system:f.system,code:'yes',display:'Changed'}),/competing local and installed/);assert.equal(readFileSync(f.terms,'utf8'),before);
 }finally{f.close();}
});
