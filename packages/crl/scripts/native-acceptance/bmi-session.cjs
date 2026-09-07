'use strict';
// REFACTOR:grounded (#320, plan591): client-owned edited singleton responses; not full QR acceptance.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const pkg=path.resolve(__dirname,'../..'),workspace=path.resolve(pkg,'../..');
const {hasEngineError,objects,hash}=require('./check.cjs');
const {classDir,helperReady,checkOrigins,single}=require('./session-check.cjs');
const read=p=>{assert.ok(fs.statSync(p).size<=32*1024*1024,'Oversized evidence');return JSON.parse(fs.readFileSync(p));};
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const profile=k=>'http://example.org/bmi/StructureDefinition/bmi-publication-'+k;
const definition=k=>profile(k)+'#Observation.value[x]';
const quantity=(value,unit)=>({value,unit,system:'http://unitsofmeasure.org',code:unit});
const steps=[
 {name:'initial',values:[null,36.3,null],activity:null},
 {name:'height-answer',key:'height',value:1.1,values:[30,36.3,1.1],activity:'approve'},
 {name:'weight-answer',key:'weight',value:40,values:[33.05785123,40,1.1],activity:'approve'},
 {name:'height-change',key:'height',value:2,values:[10,40,2],activity:'deny'},
 {name:'invalid-height',key:'height',value:0,error:'publication-bmi-nonpositive'},
 {name:'rollback-read',values:[10,40,2],activity:'deny'},
 {name:'bmi-override',key:'bmi',value:35,values:[35,40,2],activity:'approve'},
 {name:'height-after-override',key:'height',value:1.1,values:[35,40,1.1],activity:'approve'},
 {name:'weight-after-override',key:'weight',value:20,values:[16.52892561,20,1.1],activity:'deny'},
 {name:'bmi-clear',key:'bmi',value:null,values:[null,20,1.1],activity:null},
 {name:'clear-read',values:[null,20,1.1],activity:null},
];
function edited(qr,step,index){
 const out=structuredClone(qr),matches=objects(out,x=>x.definition===definition(step.key));assert.equal(matches.length,1);
 const target=matches[0];
 if(step.value===null)delete target.answer;
 else target.answer=[{valueQuantity:quantity(step.value,{height:'m',weight:'kg',bmi:'kg/m2'}[step.key])}];
 out.authored=`2026-09-07T12:${String(index).padStart(2,'0')}:00Z`;
 const retain=items=>items.flatMap(item=>{if(item===target)return[item];const children=retain(item.item||[]);return children.length?[{...item,item:children}]:[];});
 out.item=retain(out.item||[]);assert.equal(objects(out,x=>x.definition?.endsWith('#Observation.value[x]')).length,1);return out;
}
function answer(qr,key,expected){
 const a=objects(qr,x=>x.definition===definition(key));assert.equal(a.length,1,key+' answer slot');
 const values=a[0].answer||[];assert.ok(Array.isArray(values));
 if(expected===null){assert.equal(values.length,0,key+' must be unanswered');return null;}
 assert.equal(values.length,1,key+' must have exactly one answer');
 assert.deepEqual(Object.keys(values[0]),['valueQuantity'],'Answer must be Quantity only');
 const v=values[0].valueQuantity;assert.equal(typeof v?.value,'number');assert.equal(v.value,expected);
 assert.equal(v.code||v.unit,{bmi:'kg/m2',weight:'kg',height:'m'}[key]);
 if(v.system!==undefined)assert.equal(v.system,'http://unitsofmeasure.org');
 assert.equal(v.comparator,undefined,'Quantity must be exact');return v;
}
function checkExtractedValue(resource,value,unit){
 const keys=Object.keys(resource).filter(k=>k.startsWith('value'));
 assert.deepEqual(keys,value===null?[]:['valueQuantity'],'Extracted value[x] fields');
 if(value!==null)assert.deepEqual(resource.valueQuantity,quantity(value,unit));
}
function checkErrors(issues,log,expected) {
 const errors=issues.filter(x=>['error','fatal'].includes(x.severity));
 if(!expected){assert.deepEqual(errors,[]);assert.equal(hasEngineError(log),false,'Engine error');return;}
 assert.equal(expected,'publication-bmi-nonpositive');
 const message='publication-bmi-nonpositive: BMI measurements must be positive';
 const condition='FHIRHelpers.ToBoolean(("BmiPublicationInterface"."Obese").value as FHIR.boolean)';
 const expectedDiagnostics=[...['','not '].map(prefix=>'Condition expression '+prefix+condition+' encountered exception: '+message+'\nnull'),
  'Error encountered evaluating expression (BMI) for item (1): '+message+'\nnull'];
 assert.deepEqual(errors.map(x=>({severity:x.severity,code:x.code,diagnostics:x.diagnostics})),expectedDiagnostics.map(diagnostics=>({severity:'error',code:'exception',diagnostics})),'Expected diagnostic only');
 const expectedLines=[
  ...Array(3).fill('[main] ERROR MessageEvaluator - '+message),
  ...Array(2).fill('[main] ERROR CqlEngine - Exception for Library: expression, Message: '+message),
  '[main] ERROR CqlEngine - Exception for Library: BmiPublicationInferences, Message: '+message,
  ...['','not '].map(prefix=>'[main] ERROR org.opencds.cqf.fhir.cr.plandefinition.apply.ProcessAction - Condition expression '+prefix+condition+' encountered exception: '+message),
  '[main] ERROR org.opencds.cqf.fhir.cr.questionnaire.populate.ItemProcessor - Error encountered evaluating expression (BMI) for item (1): '+message,
 ];
 assert.deepEqual(log.split(/\r?\n/).map(x=>x.trim()).filter(hasEngineError).sort(),expectedLines.sort(),'Unexpected/missing engine errors');
}
function treeHashes(dir){
 return Object.fromEntries(fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?Object.entries(treeHashes(path.join(dir,e.name))).map(([k,v])=>[e.name+'/'+k,v]):[[e.name,hash(fs.readFileSync(path.join(dir,e.name)))]]));
}
function options(args){
 const o={},seen=new Set();
 for(let i=0;i<args.length;i+=2){
  const key={'--engine-jar':'jar','--out':'out','--java':'java'}[args[i]];
  assert.ok(key&&args[i+1]&&!args[i+1].startsWith('--'),'Usage: --engine-jar PATH --out NEW_DIRECTORY [--java PATH]');
  assert.ok(!seen.has(key),'Duplicate option');seen.add(key);o[key]=args[i+1];
 }
 assert.ok(o.jar&&o.out,'Explicit engine jar and new output directory required');o.jar=fs.realpathSync(o.jar);
 const target=path.resolve(o.out);o.out=path.join(fs.realpathSync(path.dirname(target)),path.basename(target));
 const rel=path.relative(fs.realpathSync(workspace),o.out).replaceAll('\\','/');
 assert.ok(path.isAbsolute(rel)||rel.startsWith('../')||/^tmp\//i.test(rel),'Output must be outside workspace or under tmp/');
 assert.ok(!fs.existsSync(o.out),'Output directory must be new');
 assert.ok(!classDir.includes(','),'Spring loader path cannot contain commas');return o;
}
async function main(args){
 const o=options(args);
 const root=o.out;fs.mkdirSync(root);
 const rows=[],controller=new AbortController(),interrupt=()=>controller.abort();
 process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 let failure,initialHashes;
 try {
 // Fixed command only: rebuild before loading any emitter modules. Save the build log as evidence.
 const buildStarted=new Date().toISOString();
 let buildLog;
 try {buildLog=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['run','build','--workspace','@smile-digital-health/crl'],{cwd:workspace,shell:process.platform==='win32',windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:root,TMP:root,TMPDIR:root}});}
 catch(e){fs.writeFileSync(path.join(root,'build.log'),String(e.stdout||'')+String(e.stderr||''));throw e;}
 fs.writeFileSync(path.join(root,'build.log'),buildLog);
 const {runBounded,childEnvironment}=require('./process.cjs');
 const {ENGINE_JAR_SOURCE}=require('../../dist/results/spawn');
 const jar=o.jar,helper=helperReady();assert.equal(hash(fs.readFileSync(jar)),ENGINE_JAR_SOURCE.sha256);assert.equal(helper.engineSha256,ENGINE_JAR_SOURCE.sha256);
 const fixture=path.join(pkg,'src/emit/tests/fixtures/publication-bmi.crl');
 const snapshot=()=>({dist:treeHashes(path.join(pkg,'dist')),harness:treeHashes(__dirname),fixture:hash(fs.readFileSync(fixture)),engine:hash(fs.readFileSync(jar))});
 initialHashes=snapshot();
 const project=path.join(root,'project');fs.mkdirSync(project);
 write(path.join(project,'package.json'),{name:'bmi-publication',version:'0.0.0',crl:{canonicalBase:'http://example.org/bmi',date:'2026-09-07'}});
 fs.copyFileSync(fixture,path.join(project,'policy.crl'));
 const {emitCQLImports}=require('../../dist/imports/emit'),{emitFhirDefFromPath}=require('../../dist/fhir-emitter/closureOrchestrator'),{buildEngineRepoBundle}=require('../../dist/results/repoBundle');
 const emission={cql:emitCQLImports(path.join(project,'policy.crl')),fhir:emitFhirDefFromPath(path.join(project,'policy.crl'))};
 assert.equal(emission.cql.success,true);assert.equal(emission.fhir.success,true);write(path.join(root,'emission.json'),emission);
 const data=[{resourceType:'Patient',id:'p'},{resourceType:'Observation',id:'weight',status:'final',subject:{reference:'Patient/p'},code:{coding:[{system:'http://loinc.org',code:'29463-7'}]},effectiveDateTime:'2026-09-01',valueQuantity:{value:36.3,unit:'kg'}}];
 const built=buildEngineRepoBundle({definitions:emission.fhir.resources.map(x=>x.resource),cqlByLibraryFile:Object.fromEntries(emission.cql.cqlByLibrary.map(x=>[x.outputFilename,x.cql])),caseInput:{caseName:'missing-height',resources:data.map(body=>({resourceType:body.resourceType,id:body.id,body}))}});
 assert.deepEqual(built.missingCql,[]);const base=built.bundle,baseHash=hash(JSON.stringify(base));
 const git=(...a)=>execFileSync('git',a,{cwd:workspace,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
 write(path.join(root,'manifest.json'),{schemaVersion:1,sourceHead:git('rev-parse','HEAD'),sourceStatus:git('status','--porcelain'),build:{started:buildStarted,success:true,command:'npm run build --workspace @smile-digital-health/crl'},helper,hashes:initialHashes,baseSha256:baseHash,scope:'Cumulative client-owned edited singleton response; original4.7; no full-response, rendered-client or persistence acceptance',steps});
 let q,qr;const state=new Map();
 for(const [index,step]of steps.entries()){
  const dir=path.join(root,String(index).padStart(2,'0')+'-'+step.name);fs.mkdirSync(dir);
  const before=structuredClone([...state]),repo=structuredClone(base),request={resourceType:'Bundle',type:'collection',entry:[]};
  const retained=[...state].filter(([k])=>k!==step.key).map(([,v])=>structuredClone(v));
  request.entry.push(...retained.map(resource=>({resource})));
  let submitted;
  if(step.key){submitted=edited(qr,step,index);repo.entry.push({resource:structuredClone(q)});request.entry.push({resource:structuredClone(q)},{resource:submitted});}
  write(path.join(dir,'state-before.json'),before);write(path.join(dir,'repo.json'),repo);write(path.join(dir,'request.json'),request);
  const prefix=path.join(dir,'apply'),args=['-Xmx768m','-XX:ActiveProcessorCount=2','-Duser.timezone=UTC','-Djava.io.tmpdir='+dir,'-Dloader.main=ApplySessionDriver','-Dloader.path='+classDir,'-cp',jar,'org.springframework.boot.loader.launch.PropertiesLauncher',path.join(dir,'repo.json'),path.join(dir,'request.json'),'bmi-publication-d','Patient/p',prefix];
  const start=Date.now(),p=await runBounded(o.java||'java',args,{signal:controller.signal,cwd:dir,env:childEnvironment(dir),timeoutMs:120000,maxBytes:8*1024*1024});
  write(path.join(dir,'process.json'),p);assert.ok(!p.failure&&p.exitCode===0,'Process '+step.name);checkOrigins(fs.readFileSync(prefix+'-origins.txt','utf8'),jar);
  const result=read(prefix+'-result.json'),after=read(prefix+'-request-after.json');
  const observations=objects(after,x=>x.resourceType==='Observation'),retainedIds=new Set(retained.map(r=>r.id));
  for(const r of retained)assert.deepEqual(observations.filter(o=>o.id===r.id),[r],'Retained observation mutated/duplicated');
  const extracted=observations.filter(o=>!retainedIds.has(o.id));assert.equal(extracted.length,step.key?1:0,'Extraction count');
  assert.equal(observations.length,new Set(observations.map(r=>r.id)).size,'Duplicate IDs');
  if(step.key){const [r]=extracted;assert.match(r.id,/^[A-Za-z0-9\-.]{1,64}$/);assert.deepEqual(r.meta.profile,[profile(step.key)+'|0.0.0']);assert.equal(r.subject.reference,'Patient/p');assert.equal(r.effectiveDateTime,submitted.authored);assert.equal(r.status,'final');assert.deepEqual(r.code.coding,[{system:'http://example.org/bmi/CodeSystem/bmi-publication-local',code:step.key}]);checkExtractedValue(r,step.value,{height:'m',weight:'kg',bmi:'kg/m2'}[step.key]);}
  assert.deepEqual(read(prefix+'-repository-bundle-before.json'),read(prefix+'-repository-bundle-after.json'),'Repository mutated');
  assert.deepEqual(read(prefix+'-stored-observations-before.json'),read(prefix+'-stored-observations-after.json'),'Persistent Observations changed');
  const issues=objects(result,x=>x.resourceType==='OperationOutcome').flatMap(r=>r.issue||[]),log=p.stdout+'\n'+p.stderr;
  checkErrors(issues,log,step.error);
  const activities=objects(result,x=>x.resourceType==='CommunicationRequest').map(x=>x.id);let values;
  if(step.error){assert.deepEqual(activities,[]);assert.deepEqual([...state],before,'Failed edit changed committed state');}
  else{
   const nextQ=single(result,'Questionnaire'),nextQr=single(result,'QuestionnaireResponse');
   assert.deepEqual(activities,step.activity?['bmi-publication-'+step.activity]:[]);
   values=['bmi','weight','height'].map((k,i)=>answer(nextQr,k,step.values[i]));
   if(!step.activity){assert.match(log,/Condition expression FHIRHelpers\.ToBoolean\(\("BmiPublicationInterface"\."Obese"\)\.value as FHIR\.boolean\) returned null/);assert.match(log,/Condition expression not FHIRHelpers\.ToBoolean\(\("BmiPublicationInterface"\."Obese"\)\.value as FHIR\.boolean\) returned null/);}
   if(step.key)state.set(step.key,structuredClone(extracted[0]));q=nextQ;qr=nextQr;
  }
  for(const [key,resource]of before)if(key!==step.key||step.error)assert.deepEqual(state.get(key),resource,'Unedited committed state changed');
  assert.equal(hash(JSON.stringify(base)),baseHash);
  write(path.join(dir,'state-after.json'),[...state]);
  const row={name:step.name,passed:true,activity:activities,values,expectedError:step.error,extracted,retainedCount:retained.length,stateCount:state.size,durationMs:Date.now()-start};rows.push(row);write(path.join(dir,'verdict.json'),row);write(path.join(root,'summary.json'),{passed:false,complete:false,rows});console.log(JSON.stringify({name:row.name,passed:true,values:values?.map(q=>q?.value??null),ms:row.durationMs}));
 }
 assert.deepEqual(snapshot(),initialHashes,'Inputs changed during run');
 }catch(e){failure=e.stack||String(e);console.error(failure);}
 finally {
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  const passed=!failure&&rows.length===steps.length;
  write(path.join(root,'summary.json'),{passed,complete:true,scope:'Edited singleton client strategy only',rows,failure});
  if(!passed)process.exitCode=1;
 }
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={checkErrors,edited,steps,answer,checkExtractedValue,options};
