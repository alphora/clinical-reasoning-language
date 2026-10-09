import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { emitCrlTwoLane, writeTwoLane } from '@smile-digital-health/crl';
import { resolveWordingTarget } from './presentationProposal.ts';
import { planDirectQuestionEdit, mvPublicationOptions, assertSingleLocalPolicy } from './mvDirectEdit.ts';
import { MvDefinitionFreshness } from './mvDefinitionFreshness.ts';
import { MvEditTransaction } from './mvEditTransaction.ts';

function fixture(artifactName="policy", request="CPGServiceRequest", configured=false){
 const root=mkdtempSync(join(tmpdir(),'mv-candidate-')),project=join(root,artifactName);mkdirSync(join(project,'src/crl'),{recursive:true});
 const policyPath=join(project,'src/crl/policy.crl'),owner=join(project,'src/crl/intake.crl'),sidecarPath=join(project,'src/medical-validation',artifactName+'.json');
 writeFileSync(join(project,'package.json'),JSON.stringify({name:'candidate-policy',version:'1.0.0',crl:{canonicalBase:'http://example.org/candidate',date:'2026-10-08',status:'draft',...(configured?{dispositions:{options:{certify:{Refer:{label:'Refer'}}}}}:{})}}));
 const activity=configured?'certify.Refer':'Refer';
 writeFileSync(policyPath,`library "Policy".\ninclude "Intake".\nactivity "${activity}":\n- request ${request}.\ndecision "Review":\n- when "Intake"."Complaint" then recommend activity "${activity}".\n`);
 const source='library "Intake".\nconcept "Complaint":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `complaint`.\n- shape reduction is most recent.\npresentation for "Complaint":\n- question text is "Complaint?".\n- question description is "Details".\n';writeFileSync(owner,source);
 const sidecar={schemaVersion:2,byCaseId:{a:'pass',b:'fail'},notesByCaseId:{a:[{id:'n',text:'Keep',created:1}]},criterionVerdictsByKey:{criterion:{state:'pass',bodyHash:'body'}}};
 mkdirSync(join(project,'src/medical-validation/flags'),{recursive:true});writeFileSync(sidecarPath,JSON.stringify(sidecar));writeFileSync(join(project,'src/medical-validation/flags/keep.json'),'operator flag');
 const emission=emitCrlTwoLane(policyPath,mvPublicationOptions(project));assert.equal(emission.success,true);writeTwoLane(emission,join(project,'src'));
 const options={policyPath,target:resolveWordingTarget(owner,source,'Complaint'),questionText:'Describe the complaint?',questionDescription:'More details',sidecarPath,sidecar,id:randomUUID(),editedAt:'2026-10-08T00:00:00.000Z',scratchRoot:join(root,'scratch')};
 return {root,project,owner,source,sidecarPath,options,close:()=>rmSync(root,{recursive:true,force:true})};
}
for(const request of ['CPGTaskRequest','CPGCommunicationRequest','CPGServiceRequest','CPGMedicationRequest'])for(const configured of [false,true]){
 test(`MV load and direct question save preserve ${request}, configured=${configured}`,()=>{
  const f=fixture('policy',request,configured);try{
   const source=readFileSync(f.options.policyPath,'utf8');
   const baseline=emitCrlTwoLane(f.options.policyPath,mvPublicationOptions(f.project));
   const checker=new MvDefinitionFreshness();assert.equal(checker.check(f.options.policyPath,join(f.root,'freshness')).state,'current');
   const plan=planDirectQuestionEdit(f.options);
   MvEditTransaction.prepare({artifactRoot:f.project,storageRoot:join(f.root,'recovery'),units:plan.units}).publish();
   assert.equal(readFileSync(f.options.policyPath,'utf8'),source);
   const after=emitCrlTwoLane(f.options.policyPath,mvPublicationOptions(f.project));assert.equal(after.success,true);
   assert.deepEqual(after.fhir.resources.filter(r=>r.resourceType==='ActivityDefinition'),baseline.fhir.resources.filter(r=>r.resourceType==='ActivityDefinition'));
   assert.deepEqual(after.cql.cqlByLibrary.map(r=>({libraryName:r.libraryName,cql:r.cql})),baseline.cql.cqlByLibrary.map(r=>({libraryName:r.libraryName,cql:r.cql})));
   assert.equal(checker.check(f.options.policyPath,join(f.root,'freshness')).state,'current');
  }finally{f.close();}
 });
}
test('candidate emits changed PD wording with preserved failures/history and zero live writes, then journal publishes it',()=>{
 const f=fixture();try{
  const before=readFileSync(f.sidecarPath,'utf8'),plan=planDirectQuestionEdit(f.options);
  assert.equal(readFileSync(f.owner,'utf8'),f.source);assert.equal(readFileSync(f.sidecarPath,'utf8'),before);
assert.equal(plan.sidecar.byCaseId.a,'pending');assert.equal(plan.sidecar.byCaseId.b,'fail');
  assert.equal(plan.sidecar.criterionVerdictsByKey.criterion.bodyHash,'body');assert.deepEqual(plan.sidecar.notesByCaseId,f.options.sidecar.notesByCaseId);
  const fhir=plan.units.find(u=>u.path===join(f.project,'src/fhir')).after;
  assert.ok([...fhir.files.values()].some(b=>Buffer.from(b).toString().includes('Describe the complaint?')));
  assert.ok([...fhir.files.values()].some(b=>Buffer.from(b).toString().includes('More details')));
  const receipt=JSON.parse(Buffer.from(plan.units.find(u=>u.path===plan.receiptPath).after.bytes).toString());
  assert.equal(receipt.wording.before.questionText,'Complaint?');assert.equal(receipt.wording.after.questionText,'Describe the complaint?');
  const tx=MvEditTransaction.prepare({artifactRoot:f.project,storageRoot:join(f.root,'recovery'),units:plan.units});tx.publish();
  assert.match(readFileSync(f.owner,'utf8'),/Describe the complaint/);assert.equal(readFileSync(join(f.project,'src/medical-validation/flags/keep.json'),'utf8'),'operator flag');
 }finally{f.close();}
});
test('no-op wording creates no receipt, edits or approval invalidation',()=>{
 const f=fixture();try{assert.throws(()=>planDirectQuestionEdit({...f.options,questionText:'Complaint?',questionDescription:'Details'}),/no wording changes/);
  assert.equal(JSON.parse(readFileSync(f.sidecarPath,'utf8')).byCaseId.a,'pass');
 }finally{f.close();}
});

test('a pull changing only review notes and judgments is reloaded rather than overwritten by the old host copy',()=>{
 const f=fixture();try{
  const newer={...f.options.sidecar,byCaseId:{a:'fail',b:'pass'},notesByCaseId:{a:[{id:'pulled',text:'New peer note',created:2}]}};
  writeFileSync(f.sidecarPath,JSON.stringify(newer));
  const plan=planDirectQuestionEdit(f.options);
  assert.equal(plan.sidecar.byCaseId.a,'fail');assert.equal(plan.sidecar.byCaseId.b,'pending');
  assert.deepEqual(plan.sidecar.notesByCaseId,newer.notesByCaseId);
  const receipt=JSON.parse(Buffer.from(plan.units.find(u=>u.path===plan.receiptPath).after.bytes).toString());
  assert.deepEqual(receipt.priorReview,newer);
 }finally{f.close();}
});

test('missing generated resource or entire lane requires explicit regeneration before a wording edit',()=>{
 const f=fixture();try{
  const emitted=emitCrlTwoLane(f.options.policyPath,mvPublicationOptions(f.project));
  const resource=emitted.fhir.resources[0],file=join(f.project,'src/fhir',resource.relativePath);
  rmSync(file);assert.throws(()=>planDirectQuestionEdit(f.options),/Generated definitions are missing/);
  writeTwoLane(emitted,join(f.project,'src'));rmSync(join(f.project,'src/fhir'),{recursive:true});
  assert.throws(()=>planDirectQuestionEdit(f.options),/Explicitly regenerate/);assert.equal(readFileSync(f.owner,'utf8'),f.source);
 }finally{f.close();}
});
test('a second uncovered independent policy or a broken local library refuses before source writes',()=>{
 const f=fixture();try{
  writeFileSync(join(f.project,'src/crl/second.crl'),'library "Second".\ninclude "Intake".\nactivity "Other":\n- request CPGServiceRequest.\ndecision "Other review":\n- when "Intake"."Complaint" then recommend activity "Other".\n');
  assert.throws(()=>planDirectQuestionEdit(f.options),/one independent policy owner/);assert.equal(readFileSync(f.owner,'utf8'),f.source);
  rmSync(join(f.project,'src/crl/second.crl'));writeFileSync(join(f.project,'src/crl/broken.crl'),'broken library');
  assert.throws(()=>planDirectQuestionEdit(f.options),e=>e.code==='project-validation' && e.message.includes('broken.crl'));assert.equal(readFileSync(f.owner,'utf8'),f.source);
 }finally{f.close();}
});
test('cross-library subdecision files are not counted as separate policy entries',()=>{
 const root=resolve(import.meta.dirname,'../../crl/src/fhir-emitter/tests/fixtures/cross-lib-decision');
 assert.doesNotThrow(()=>assertSingleLocalPolicy(root,join(root,'root.crl'),mvPublicationOptions(root)));
 if(process.platform==='win32'){
  const policy=join(root,'root.crl'),otherDriveCase=policy.replace(/^[A-Za-z]/,c=>c===c.toUpperCase()?c.toLowerCase():c.toUpperCase());
  assert.notEqual(otherDriveCase,policy);
  assert.doesNotThrow(()=>assertSingleLocalPolicy(root,otherDriveCase,mvPublicationOptions(root)));
  assert.doesNotThrow(()=>assertSingleLocalPolicy(root.toLowerCase(),policy,mvPublicationOptions(root)));
 }
});
test('live-only generated paths and publication-field drift refuse destructive regeneration',()=>{
 const f=fixture();try{
  const custom=join(f.project,'src/fhir/user.json');writeFileSync(custom,'{}');
  assert.throws(()=>planDirectQuestionEdit(f.options),/nothing will be deleted/);assert.equal(readFileSync(custom,'utf8'),'{}');rmSync(custom);
  const emitted=emitCrlTwoLane(f.options.policyPath,mvPublicationOptions(f.project)),resource=emitted.fhir.resources.find(r=>r.resource.date);
  const file=join(f.project,'src/fhir',resource.relativePath),changed={...resource.resource,date:'1999-01-01'};writeFileSync(file,JSON.stringify(changed));
  assert.throws(()=>planDirectQuestionEdit(f.options),/Publication fields differ/);assert.equal(readFileSync(f.owner,'utf8'),f.source);
 }finally{f.close();}
});
test('stale source, invalid metadata and invalid candidate wording leave all authored files unchanged',()=>{
 const f=fixture();try{
  assert.throws(()=>planDirectQuestionEdit({...f.options,questionText:''}),/empty/);
  assert.throws(()=>planDirectQuestionEdit({...f.options,questionText:'bad\\literal'}),/cannot be represented/);
  writeFileSync(f.owner,f.source+'\n');assert.throws(()=>planDirectQuestionEdit(f.options),/source changed/);writeFileSync(f.owner,f.source);
  const pkg=JSON.parse(readFileSync(join(f.project,'package.json'),'utf8'));delete pkg.crl.date;writeFileSync(join(f.project,'package.json'),JSON.stringify(pkg));
  assert.throws(()=>planDirectQuestionEdit(f.options),/configured crl.date/);assert.equal(readFileSync(f.owner,'utf8'),f.source);
 }finally{f.close();}
});


test('a sidecar write after the last capture check never becomes a replacement baseline',()=>{
 const f=fixture();try{
  const newer={...f.options.sidecar,notesByCaseId:{a:[{id:'later',text:'Keep this concurrent note',created:3}]}};
  assert.throws(()=>planDirectQuestionEdit({...f.options,planningBoundary:()=>writeFileSync(f.sidecarPath,JSON.stringify(newer))}),/Destination changed during planning/);
  assert.deepEqual(JSON.parse(readFileSync(f.sidecarPath,'utf8')),newer);assert.equal(readFileSync(f.owner,'utf8'),f.source);
 }finally{f.close();}
});


test('load-time freshness detects source drift independently of any result manifest and refuses broken metadata',()=>{
 const f=fixture();try{
  const checker=new MvDefinitionFreshness(),scratch=join(f.root,'freshness');
  const initial=checker.check(f.options.policyPath,scratch);assert.equal(initial.state,'current');
  writeFileSync(f.owner,f.source.replace('Complaint?','Updated complaint?'));
  const drift=checker.check(f.options.policyPath,scratch);assert.equal(drift.state,'drift');assert.notEqual(drift.digest,initial.digest);
  const pkg=JSON.parse(readFileSync(join(f.project,'package.json'),'utf8'));delete pkg.crl.date;writeFileSync(join(f.project,'package.json'),JSON.stringify(pkg));
  const unknown=checker.check(f.options.policyPath,scratch);assert.equal(unknown.state,'unknown');assert.match(unknown.message,/configured crl.date/);
 }finally{f.close();}
});


test('direct Save refuses lossy notes, unknown stored fields and nested policy review layouts',()=>{
 const f=fixture();try{
  for(const extra of [{notesByCaseId:{a:[{id:'bad',text:'Keep',created:'2'}]}},{futureReviewMetadata:{keep:true}}]){
   writeFileSync(f.sidecarPath,JSON.stringify({...f.options.sidecar,...extra}));
   assert.throws(()=>planDirectQuestionEdit(f.options),/normalization would discard/);assert.equal(readFileSync(f.owner,'utf8'),f.source);
   assert.deepEqual(JSON.parse(readFileSync(f.sidecarPath,'utf8')),{...f.options.sidecar,...extra});
  }
  assert.throws(()=>planDirectQuestionEdit({...f.options,sidecarPath:join(f.project,'nested/src/medical-validation/policy.json')}),/Direct Save layout/);
 }finally{f.close();}
});


test('direct edits publish the review sidecar for the actual artifact name',()=>{
 const f=fixture('bleph-medical-validation');try{
  const plan=planDirectQuestionEdit(f.options),tx=MvEditTransaction.prepare({artifactRoot:f.project,storageRoot:join(f.root,'recovery'),units:plan.units});tx.publish();
  assert.equal(JSON.parse(readFileSync(f.sidecarPath,'utf8')).byCaseId.a,'pending');
  assert.match(readFileSync(f.owner,'utf8'),/Describe the complaint/);
 }finally{f.close();}
});

test('freshness keeps known dependency watches when a later owner lookup fails',()=>{
 const f=fixture();try{
  const service=new MvDefinitionFreshness();assert.equal(service.check(f.options.policyPath,join(f.root,'freshness')).state,'current');
  const inputs=[...service.inputFiles],roots=[...service.watchRoots];assert.ok(inputs.includes(f.owner));
  const missing=join(parse(f.project).root,'missing-mv-freshness-owner','policy.crl');
  assert.equal(service.check(missing,join(f.root,'freshness')).state,'unknown');
  assert.deepEqual(service.inputFiles,inputs);assert.deepEqual(service.watchRoots,roots);
 }finally{f.close();}
});

test('scaffolding placeholders preserve load freshness, publication and rollback without entering definition drift',()=>{
 const f=fixture();try{
  const placeholders=new Map();
  for(const lane of ['cql','fhir'])for(const member of ['.gitkeep','scaffold/nested/.gitkeep']){
   const file=join(f.project,'src',lane,member);mkdirSync(join(file,'..'),{recursive:true});
   const bytes=Buffer.from(member==='.gitkeep'?'':`scaffold ${lane} ${member}\n`);writeFileSync(file,bytes);placeholders.set(file,bytes);
  }
  const checker=new MvDefinitionFreshness(),scratch=join(f.root,'freshness');
  const initial=checker.check(f.options.policyPath,scratch);assert.equal(initial.state,'current');
  const first=[...placeholders.keys()][0];writeFileSync(first,'updated placeholder\n');placeholders.set(first,Buffer.from('updated placeholder\n'));
  const updated=checker.check(f.options.policyPath,scratch);assert.equal(updated.state,'current');assert.equal(updated.digest,initial.digest);
  const plan=planDirectQuestionEdit(f.options);
  assert.ok([...placeholders.keys()].every(file=>!plan.changedPaths.includes(file)));assert.deepEqual(plan.contentDrift,[]);
  const interrupted=MvEditTransaction.prepare({artifactRoot:f.project,storageRoot:join(f.root,'recovery'),units:plan.units,
   boundary:(point,ordinal)=>{if(point==='after-publish'&&plan.units[ordinal].path===join(f.project,'src/fhir'))throw new Error('injected publication failure');}});
  assert.throws(()=>interrupted.publish(),/injected publication failure/);
  assert.equal(interrupted.state.phase,'rolled-back');
  assert.equal(readFileSync(f.owner,'utf8'),f.source);
  for(const [file,bytes] of placeholders)assert.deepEqual(readFileSync(file),bytes);
  assert.equal(checker.check(f.options.policyPath,scratch).state,'current');
  const tx=MvEditTransaction.prepare({artifactRoot:f.project,storageRoot:join(f.root,'recovery'),units:plan.units});tx.publish();
  for(const [file,bytes] of placeholders)assert.deepEqual(readFileSync(file),bytes);
  assert.match(readFileSync(f.owner,'utf8'),/Describe the complaint/);
  assert.equal(checker.check(f.options.policyPath,scratch).state,'current');
 }finally{f.close();}
});

test('ordinary and hidden foreign generated artifacts still block load and save even alongside placeholders',()=>{
 const f=fixture();try{
  writeFileSync(join(f.project,'src/cql/.gitkeep'),'');
  for(const [lane,member] of [['cql','foreign.cql'],['cql','.foreign.cql'],['fhir','foreign.json'],['fhir','.foreign.json']]){
   const file=join(f.project,'src',lane,member);writeFileSync(file,'foreign artifact');
   const state=new MvDefinitionFreshness().check(f.options.policyPath,join(f.root,'freshness'));
   assert.equal(state.state,'unknown');assert.ok(state.message.includes(file));assert.ok(!state.message.includes('.gitkeep'));
   assert.throws(()=>planDirectQuestionEdit(f.options),error=>error.message.includes(file)&&!error.message.includes('.gitkeep'));
   assert.equal(readFileSync(file,'utf8'),'foreign artifact');assert.equal(readFileSync(f.owner,'utf8'),f.source);rmSync(file);
  }
 }finally{f.close();}
});
