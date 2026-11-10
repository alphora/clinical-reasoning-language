// Synthetic fixture verifier: independent of producer parsing/classification and clinical oracles.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const objects=x=>!x||typeof x!=='object'?[]:[x,...Object.values(x).flatMap(v=>Array.isArray(v)?v.flatMap(objects):objects(v))];
const identity=c=>JSON.stringify([c.sourceFile,c.caseId,c.caseName,c.compartmentDir,c.inputSha256]);
function parseRaw(bytes){const text=bytes.toString('utf8'),start=text.indexOf('{');assert(start>=0,'raw JSON missing');const value=JSON.parse(text.slice(start));assert.equal(value.resourceType,'Parameters');return value;}
function verify(root,index,manifest,engineSha){
 root=fs.realpathSync(root);assert.equal(index.state,'finished');assert.equal(index.complete,true);assert.equal(index.runtime.engineJarSha256,engineSha);
 assert.deepEqual(index.cases.map(identity),manifest.cases.map(identity),'exact case inventory');assert.equal(index.cases.length,2);assert.equal(new Set(index.cases.map(c=>c.captureId)).size,2);
 const payload=f=>{const file=path.resolve(root,f.path);assert(file.startsWith(root+path.sep));assert(fs.lstatSync(file).isFile());assert(fs.realpathSync(file).startsWith(root+path.sep));const bytes=fs.readFileSync(file);assert.equal(bytes.length,f.bytes);assert.equal(hash(bytes),f.sha256);return bytes;};
 for(const file of Object.values(index.files))payload(file);
 for(const c of index.cases){
  assert.equal(c.captureState,'complete');assert.equal(c.native.statusKind,'worker-request');assert.equal(c.native.status,0);assert(Number.isSafeInteger(c.native.workerPid)&&c.native.workerPid>0);assert(c.streams.stdout.complete&&c.streams.stderr.complete);
  for(const file of Object.values(c.files))payload(file);
  const raw=parseRaw(payload(c.files.stdout)),derived=JSON.parse(payload(c.files.parameters));assert.deepEqual(raw,derived,'raw carrier differs from derived Parameters');
  const all=objects(raw),tasks=all.filter(x=>x.resourceType==='Task');
  const errors=all.filter(x=>x.resourceType==='OperationOutcome').flatMap(x=>x.issue||[]).filter(x=>['error','fatal'].includes(x.severity));assert.equal(errors.length,0,'native errors');
  assert(['Answered','Unanswered'].includes(c.caseName));assert.deepEqual(tasks.map(t=>t.description),c.caseName==='Answered'?['Synthetic met']:[],'exact native Task outcomes');
  for(const t of tasks){assert.deepEqual(t.code,{coding:[{system:'http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-activity-type-cs',code:'send-message'}]});assert.equal(t.intent,'proposal');}
  const qs=all.filter(x=>x.resourceType==='Questionnaire'),qrs=all.filter(x=>x.resourceType==='QuestionnaireResponse');assert.equal(qs.length,1);assert.equal(qrs.length,1);assert.equal(qrs[0].questionnaire,qs[0].version?qs[0].url+'|'+qs[0].version:qs[0].url,'raw QR binds the returned Questionnaire version');
  const items=objects(qs[0]).filter(x=>x.linkId&&x.type&&!['group','display'].includes(x.type));assert.equal(items.length,1);assert.equal(items[0].type,'boolean');
  const answers=objects(qrs[0]).filter(x=>x.linkId===items[0].linkId&&x.definition===items[0].definition);assert.equal(answers.length,1);
  if(c.caseName==='Answered')assert.deepEqual(answers[0].answer,[{valueBoolean:true}]);else assert(!answers[0].answer?.length,'Unanswered raw QR must remain unanswered');
  const input=JSON.parse(payload(c.files.input)),request=JSON.parse(payload(c.files.request));assert.equal(request.dataBundle,null);assert.equal(request.dataLocation,'repository');assert.equal(request.subjectReference,input.subjectReference);assert.equal(JSON.parse(payload(c.files.repository)).resourceType,'Bundle');assert.equal(hash(JSON.stringify({input,planDefinitionId:index.planDefinitionId})),c.inputSha256);
 }
 const defs=JSON.parse(payload(index.files.definitions)),cql=JSON.parse(payload(index.files.cql));assert.equal(hash(JSON.stringify({defs,cql:Object.entries(cql).sort(([a],[b])=>a.localeCompare(b))})),index.definitionClosureSha256);
 assert.equal(hash(JSON.stringify({runtime:index.runtime.fingerprintSha256,crlVersion:index.producerVersion,jar:index.runtime.engineJarSha256})),index.runtimeSha256);
 return {fullRawAndDerivedEqual:true,exactTaskMultiplicityAndCodes:true,rawAnsweredAndUnansweredVerified:true,exactManifestInventory:true,allPayloadHashesVerified:true,definitionInputRuntimeBindingsVerified:true,nestedRuntimeContext:'opaque fingerprint; separately trusted historical context required'};
}
function negativeControls(root,index,manifest,engineSha,out){
 const results=[];
 for(const name of ['raw-derived-mismatch','contradictory-task','wrong-case','duplicate-case','missing-raw','unanswered-populated']){
  const dir=path.join(out,name);fs.cpSync(root,dir,{recursive:true});const x=structuredClone(index),answered=x.cases.find(c=>c.caseName==='Answered'),unanswered=x.cases.find(c=>c.caseName==='Unanswered');
  const write=(row,key,bytes)=>{const file=row.files[key];fs.writeFileSync(path.join(dir,file.path),bytes);file.bytes=bytes.length;file.sha256=hash(bytes);};
  const mutate=(row,fn,both=true)=>{const value=parseRaw(fs.readFileSync(path.join(dir,row.files.stdout.path)));fn(value);const b=Buffer.from(JSON.stringify(value));if(both)write(row,'stdout',b);write(row,'parameters',b);};
  if(name==='raw-derived-mismatch')mutate(answered,v=>{v.id='mismatched-derived';},false);
  if(name==='contradictory-task')mutate(answered,v=>{const t=structuredClone(objects(v).find(o=>o.resourceType==='Task'));t.id='contradictory';t.description='Synthetic unmet';v.parameter.push({name:'unexpected',resource:t});});
  if(name==='wrong-case')answered.caseId='foreign-case';
  if(name==='duplicate-case')x.cases[1]=structuredClone(x.cases[0]);
  if(name==='missing-raw')fs.unlinkSync(path.join(dir,answered.files.stdout.path));
  if(name==='unanswered-populated')mutate(unanswered,v=>{const q=objects(v).find(o=>o.resourceType==='Questionnaire'),item=objects(q).find(o=>o.linkId&&o.type==='boolean'),qr=objects(v).find(o=>o.resourceType==='QuestionnaireResponse'),answer=objects(qr).find(o=>o.linkId===item.linkId&&o.definition===item.definition);answer.answer=[{valueBoolean:true}];});
  let error;try{verify(dir,x,manifest,engineSha);}catch(e){error=String(e);}assert(error,'mutation was not rejected: '+name);results.push({name,rejected:true,error});
 }
 return results;
}
module.exports={verifyBatchEvidence:verify,negativeControls};
