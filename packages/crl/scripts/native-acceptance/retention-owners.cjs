// REFACTOR:grounded - native returned-wire retention in Root and Interface owners.
// The supplied answer is kept stable. No client answer reconstruction or extraction cache.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pkg=path.resolve(process.env.CRL_RETENTION_CORE_ROOT||path.join(__dirname,'../..'));
const core=require(path.join(pkg,'dist/index.js'));
const {applySession,shutdownNativeRuntime}=require(path.join(pkg,'dist/results/session.js'));
const source=path.resolve(__dirname,'../../test/acceptance/retention-owners');
const out=path.resolve(process.argv[2]||'tmp/retention-owners-native');
assert.ok(!fs.existsSync(out),'Use a new output directory, preserving original evidence');fs.mkdirSync(out,{recursive:true});
const flat=items=>(items||[]).flatMap(item=>[item,...flat(item.item),...(item.answer||[]).flatMap(answer=>flat(answer.item))]);
const rows=[];let sequence=0;
async function test(split){
  const project=path.join(out,split?'source-interface':'source-root');fs.cpSync(source,project,{recursive:true});
  const file=path.join(project,'src/crl/policy.crl');
  if(split)fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('library "Policy".','library "Policy".\nconcept "Local": - shape is Record. - type is Observation. - value type is boolean. - code is `local`. - shape reduction is most recent.'));
  const emitted=core.emitCrlBundle(file);assert.ok(emitted.success,JSON.stringify(emitted.diagnostics));
  const defs=emitted.bundle.entry.map(entry=>entry.resource);
  const plan=defs.find(resource=>resource.resourceType==='PlanDefinition'&&resource.id==='retention-owners');assert.ok(plan);
  const library=defs.find(resource=>resource.resourceType==='Library'&&resource.url===plan.library[0]);assert.ok(library);
  assert.equal(library.name.endsWith('Interface'),split);
  const profile=defs.find(resource=>resource.resourceType==='StructureDefinition'&&resource.id.endsWith('-a'));
  const coding=profile.differential.element.find(element=>element.path==='Observation.code').patternCodeableConcept.coding[0];
  const supplied={resourceType:'Observation',id:'stable-supplied-a',status:'final',subject:{reference:'Patient/p'},code:{coding:[coding]},valueCodeableConcept:{coding:[{system:'urn:retention:answers',code:'uncertain'}]}};
  const base=[{resourceType:'Patient',id:'p'},supplied];
  async function run(label,previous){
    const request={schemaVersion:1,requestId:`${split}-${label}`,caseId:split?'interface':'root',stepId:label,planDefinitionId:'retention-owners',subjectReference:'Patient/p',
      repositoryJson:JSON.stringify({...emitted.bundle,entry:[...emitted.bundle.entry,...previous?.q?[{resource:previous.q}]:[]]}),
      requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:[...base,...previous?.qr?[previous.qr]:[]].map(resource=>({resource}))})};
    const dir=path.join(out,`${++sequence}-${split?'interface':'root'}-${label}`);fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir,'original-request.json'),JSON.stringify(request,null,2));
    const result=await applySession(request,{outDir:path.join(dir,'native')});fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(result,null,2));
    assert.ok(result.ok,JSON.stringify(result.error));assert.ok(result.cleanupConfirmed);
    const all=[];function walk(value){if(!value||typeof value!=='object')return;if(value.resourceType)all.push(value);Object.values(value).forEach(walk);}walk(JSON.parse(fs.readFileSync(result.artifacts['native-result.json'].path)));
    const resources=[...new Map(all.map(resource=>[JSON.stringify(resource),resource])).values()];
    const groups=resources.filter(resource=>resource.resourceType==='RequestGroup'),ids=new Set(groups.map(resource=>resource.id)),activities=[];
    function actions(items){for(const item of items||[]){if(item.resource?.reference&&!ids.has(item.resource.reference.replace(/^#/,'').split('/').pop()))activities.push(item.title);actions(item.action);}}groups.forEach(group=>actions(group.action));
    const qs=resources.filter(resource=>resource.resourceType==='Questionnaire'),qrs=resources.filter(resource=>resource.resourceType==='QuestionnaireResponse');assert.equal(qs.length,1);assert.equal(qrs.length,1);
    const state={q:qs[0],qr:qrs[0]};assert.deepEqual(flat(state.q.item).map(item=>item.text),['A?']);
    const item=flat(state.qr.item).find(item=>item.linkId===state.q.item[0].linkId);assert.ok(item);
    const code=item.answer?.[0]?.valueCoding?.code;
    rows.push({owner:library.name,label,activities,answer:code??null,runtime:result.runtime});console.log(JSON.stringify(rows.at(-1)));
    return {state,activities,code};
  }
  let step=await run('supplied-uncertainty');assert.deepEqual(step.activities,['Unmet']);assert.equal(step.code,'uncertain');
  step=await run('unchanged-resubmit',step.state);assert.deepEqual(step.activities,['Unmet']);assert.equal(step.code,'uncertain');
  const clear=structuredClone(step.state);clear.qr.authored=new Date().toISOString();delete flat(clear.qr.item).find(item=>item.linkId===clear.q.item[0].linkId).answer;
  step=await run('clear-over-older-supplied',clear);assert.deepEqual(step.activities,['Met']);assert.equal(step.code,undefined);
  step=await run('unchanged-cleared-resubmit',step.state);assert.deepEqual(step.activities,['Met']);assert.equal(step.code,undefined);
}
(async()=>{try{await test(false);await test(true);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({passed:true,rows},null,2));}finally{await shutdownNativeRuntime();}})().catch(error=>{fs.writeFileSync(path.join(out,'failure.txt'),error.stack);console.error(error);process.exitCode=1;});
