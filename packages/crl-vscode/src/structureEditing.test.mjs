import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {join,relative} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {randomBytes,createHash} from 'node:crypto';
import {basename} from 'node:path';
import {qaFixture} from './qaFlagEditingFixture.mjs';
import {previewStructuralEdit,prepareStructuralSave,structuralEditsPending,setStructuralEditsPending} from './structureEditing.ts';
import {listStructureSites,planStructureEdit} from '@smile-digital-health/crl/language-services';
import {loadSidecar,saveSidecar} from './medicalValidationStore.ts';
import {structureEditorHtml} from './structureEditorPanel.ts';
import {runKeUpdates} from './keQaApply.ts';
import {produceResults,emitCrlTwoLane,emitCrlBundle,writeTwoLane,validateCRLImports,resolveCelSuite,emitCelSuite,buildProducerInputs,DEFAULT_BOUNDS,qaEditFlagId,loadFlags,mvFlagRevision} from '@smile-digital-health/crl';
import {applySession} from '@smile-digital-health/crl/session';
import {readInteractiveResult} from './interactiveQuestionnaire.ts';
import {resolveWordingTarget} from './presentationProposal.ts';
import {saveQuestionRequest,questionFlagTarget,overlayQaRequests} from './qaFlagEditing.ts';

function fixture(){
 const f=qaFixture(),extra=f.source.slice(f.source.indexOf('concept'),f.source.indexOf('presentation')).replace('concept "Q"','concept "R"').replace('`q`','`r`');
 const src=f.source.replace('library "L".','library "L".\ninclude "Terms".')+'\n'+extra+'\nactivity "Met":\n- request CPGTaskRequest.\nactivity "Unmet":\n- request CPGTaskRequest.\ndecision "D":\nfirst:\n- when "Q" then:\n    first:\n    - when "R" then recommend activity "Met".\n    - otherwise then recommend activity "Unmet".\n    end.\n- otherwise then recommend activity "Unmet".\npresentation for "R": - question text is "R?".\n';
 writeFileSync(f.policy,src);const celDir=join(f.root,'src/cel/mv');mkdirSync(celDir,{recursive:true});
 writeFileSync(join(celDir,'cases.cel'),'library "Cases". covers "L".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\nfact "A": - value is "yes". - date is "2026-10-09". - defined by "L"."Q".\nfact "B": - value is "yes". - date is "2026-10-09". - defined by "L"."R".\ncase "Both": - subject is "Patient". - fact is "A". - fact is "B". - result is "D" is "Met".\ncase "Unknown": - subject is "Patient". - result is "D" is pause.\n');
 const pkg=JSON.parse(readFileSync(join(f.root,'package.json'),'utf8'));pkg.crl.date='2026-10-09';writeFileSync(join(f.root,'package.json'),JSON.stringify(pkg));
 const emitted=emitCrlTwoLane(f.policy,{date:'2026-10-09',capability:'publishable'});assert.equal(emitted.success,true,JSON.stringify(emitted.diagnostics));writeTwoLane(emitted,join(f.root,'src'));
 const storageRoot=join(f.root,'..','structure-work-'+f.root.split(/[\\/]/).at(-1));
 const originalClose=f.close;f.close=()=>{originalClose();rmSync(storageRoot,{recursive:true,force:true});};
 return {...f,src,sidecar:join(f.root,'src/medical-validation/reviews.json'),services:{storageRoot,crlVersion:'6.4.42'}};
}
function snapshot(root){const result={};function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const file=join(dir,e.name);if(e.isDirectory())walk(file);else result[relative(root,file)]=readFileSync(file).toString('base64');}}walk(root);return result;}
async function nativeCase(f,caseName){
 const emitted=emitCrlBundle(f.policy,{date:'2026-10-09',capability:'publishable'});assert.equal(emitted.success,true);
 const suite=resolveCelSuite(f.root);assert.equal(suite.ok,true);const inputs=buildProducerInputs(emitCelSuite(suite.suite,new Date('2026-10-09T00:00:00Z')).result);assert.deepEqual(inputs.diagnostics,[]);
 const input=inputs.inputs.find(c=>c.caseName===caseName),pd=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.type?.coding?.some(c=>c.code==='workflow-definition'));
 const engine=process.env.CRL_STRUCTURE_JAR,request={schemaVersion:1,requestId:'structure-'+caseName,caseId:caseName,stepId:'step-'+Date.now(),planDefinitionId:pd.id,subjectReference:input.subjectReference,repositoryJson:JSON.stringify(emitted.bundle),requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:input.resources.map(r=>({resource:r.body}))}),...(engine?{engine:{path:engine,sha256:createHash('sha256').update(readFileSync(engine)).digest('hex')}}:{})};
 mkdirSync(f.services.storageRoot,{recursive:true});
 const result=await applySession(request,{outDir:join(f.services.storageRoot,'native-'+Date.now()),limits:{maxHeapMb:512,timeoutMs:120000}});assert.equal(result.ok,true,JSON.stringify(result));
 return readInteractiveResult(JSON.parse(readFileSync(result.artifacts['native-result.json'].path,'utf8')));
}
test('live source preview validates project, rejects missing new questions and does not write downstream',()=>{
 const f=fixture();try{
  const before=snapshot(f.root),p=previewStructuralEdit(f.root,f.policy,f.policy,f.src,{target:{decision:'D',nodeId:'when[0]'},operation:'down'});
  assert.match(p.candidateSource,/- when "R" then:/);assert.deepEqual(snapshot(f.root),before);
  assert.throws(()=>previewStructuralEdit(f.root,f.policy,f.policy,f.src,{target:{decision:'D',nodeId:'when[0]'},operation:'split',operator:'and',conditions:['"Missing"','"Q"']}),/does not validate/);
 }finally{f.close();}
},300000);
test.skipIf(process.env.CRL_STRUCTURE_NATIVE!=='1')('native split retains compound partial-input behavior for AND unknown/false and OR unknown/true',async()=>{
 for(const [operator,value,outcome] of [['and','no','Unmet'],['or','yes','Met']]){
  const f=fixture();try{
   const collapsed=planStructureEdit(f.src,{target:{decision:'D',nodeId:'when[0]'},operation:'combine',conditions:['"Q"']}).candidateSource;
   const split=previewStructuralEdit(f.root,f.policy,f.policy,collapsed,{target:{decision:'D',nodeId:'when[0]'},operation:'split',operator,conditions:['"Q"','"R"']});writeFileSync(f.policy,split.candidateSource);
   writeFileSync(join(f.root,'src/cel/mv/cases.cel'),'library "Cases". covers "L".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\nfact "R": - value is "'+value+'". - date is "2026-10-09". - defined by "L"."R".\ncase "Partial": - subject is "Patient". - fact is "R". - result is "D" is "'+outcome+'".\n');
   const native=await nativeCase(f,'Partial');assert.equal(native.activities.length,1);assert.match(native.activities[0],new RegExp(outcome));
  }finally{f.close();}
 }
},300000);
test('structural save persistently demotes approvals while preserving failed verdicts, notes and flags',()=>{
 const f=fixture();try{
  const sidecar={schemaVersion:2,byCaseId:{approved:'pass',failed:'fail'},notesByCaseId:{approved:[{id:'note',text:'Keep this',created:1}]},criterionVerdictsByKey:{c:{state:'pass',bodyHash:'same'}}};saveSidecar(f.sidecar,sidecar);
  const flag=join(f.flags,'unchanged.json');mkdirSync(f.flags,{recursive:true});writeFileSync(flag,'{"unchanged":true}');
  prepareStructuralSave(f.root,f.sidecar);const reopened=loadSidecar(f.sidecar).sidecar;
  assert.equal(reopened.byCaseId.approved,'pending');assert.equal(reopened.byCaseId.failed,'fail');assert.equal(reopened.criterionVerdictsByKey.c.state,'pending');assert.deepEqual(reopened.notesByCaseId,sidecar.notesByCaseId);assert.equal(readFileSync(flag,'utf8'),'{"unchanged":true}');assert.equal(structuralEditsPending(f.root),true);
  setStructuralEditsPending(f.root,false,f.policy);assert.equal(structuralEditsPending(f.root,f.policy),false);assert.equal(loadSidecar(f.sidecar).sidecar.byCaseId.approved,'pending');
  writeFileSync(f.policy,f.src+'\n// normal editor undo/save changes the source\n');assert.equal(structuralEditsPending(f.root,f.policy),true);
 }finally{f.close();}
});
test('actual editor host saves and undoes BOM CRL on disk, and rejects changed positional selection',async()=>{
 const f=fixture();try{
  writeFileSync(f.policy,'\uFEFF'+f.src);saveSidecar(f.sidecar,{schemaVersion:2,byCaseId:{approved:'pass'}});
  const src=ts.createSourceFile('panel.ts',readFileSync(new URL('./structureEditorPanel.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  const body=src.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openStructureEditor').getText(src).replace(/^export /,'');
  const messages=[];let listener,edited;
  const panel={webview:{postMessage:m=>messages.push(m),onDidReceiveMessage:fn=>{listener=fn;}}};
  class WorkspaceEdit{replace(_uri,_range,after){edited=after;}}
  const document={uri:{fsPath:f.policy},isDirty:false,getText:()=>readFileSync(f.policy,'utf8').replace(/^\uFEFF/,''),positionAt:offset=>offset,save:async()=>{writeFileSync(f.policy,'\uFEFF'+edited);return true;}};
  const context=vm.createContext({Error,Map,Set,Number,randomBytes,basename,readFileSync,listStructureSites,previewStructuralEdit,validateCRLImports,structureEditorHtml,vscode:{ViewColumn:{Beside:2},window:{createWebviewPanel:()=>panel},Uri:{file:fsPath=>({fsPath})},Range:class{},WorkspaceEdit,workspace:{openTextDocument:async()=>document,applyEdit:async()=>true}}});
  vm.runInContext(transformSync(body,{loader:'ts',format:'cjs'}).code,context);
  vm.runInContext('openStructureEditor',context)({root:f.root,policy:f.policy,files:[f.policy],active:()=>true,beforeSave:()=>prepareStructuralSave(f.root,f.sidecar),saved:async()=>{},runUpdates:async()=>{}});
  await listener({type:'ready'});await listener({type:'preview',index:0,operation:'down'});assert.ok(messages.some(m=>m.type==='preview'),JSON.stringify(messages));
  await listener({type:'save'});assert.match(readFileSync(f.policy,'utf8'),/^\uFEFF/);assert.match(readFileSync(f.policy,'utf8'),/- when "R" then:/);assert.equal(loadSidecar(f.sidecar).sidecar.byCaseId.approved,'pending');
  await listener({type:'undo'});assert.equal(readFileSync(f.policy,'utf8'),'\uFEFF'+f.src);
  await listener({type:'ready'});writeFileSync(f.policy,'\uFEFF'+f.src+'\n// changed after inventory\n');await listener({type:'preview',index:0,operation:'down'});assert.match(messages.findLast(m=>m.type==='error').message,/condition list was shown/);
 }finally{f.close();}
});
test('criterion detachment preserves pending question flag identity, overlay and KE applicability on untouched occurrences',async()=>{
 const f=fixture();try{
  const selector=f.src.slice(f.src.indexOf('concept "Q"'),f.src.indexOf('presentation for "Q"')).replace('concept "Q"','concept "Selector"').replace('`q`','`selector`');
  const source=f.src.slice(0,f.src.indexOf('decision "D"')).replace('presentation for "Q":','presentation for "Q":\n- in criterion "C".')+selector+'\ncriterion "C": - when ("Q" and "R").\ndecision "Entry":\nfirst:\n- when "Selector" then use decision "D".\n- otherwise then use decision "E".\n'+['D','E'].map(name=>'decision "'+name+'":\nfirst:\n- when "C" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\n').join('\n')+'presentation for "R": - question text is "R?".\npresentation for "Selector": - question text is "Choose D?".\n';
  const cel=join(f.root,'src/cel/mv/cases.cel');writeFileSync(cel,readFileSync(cel,'utf8').replace('case "Both":','fact "Selector": - value is "yes". - date is "2026-10-09". - defined by "L"."Selector".\ncase "Both":').replaceAll('- subject is "Patient".','- subject is "Patient". - fact is "Selector".'));
  writeFileSync(f.policy,source);const context={decision:'E',criteria:new Set(['C'])},before=resolveWordingTarget(f.policy,source,'Q',context);
  const flag=saveQuestionRequest(f.root,f.flags,before,'Requested Q?','Requested detail'),flagBytes=readFileSync(join(f.flags,flag.id+'.json'),'utf8');
  const edit=previewStructuralEdit(f.root,f.policy,f.policy,source,{target:{decision:'D',nodeId:'when[0]',operands:[0]},operation:'down'});writeFileSync(f.policy,edit.candidateSource);
  const after=resolveWordingTarget(f.policy,edit.candidateSource,'Q',context);assert.equal(qaEditFlagId(questionFlagTarget(f.root,after)),flag.id);assert.equal(readFileSync(join(f.flags,flag.id+'.json'),'utf8'),flagBytes);
  const card={id:'q',text:after.questionText,description:after.questionDescription,answerChoices:[]};overlayQaRequests(f.root,[card],new Map([['q',after]]),new Map(),loadFlags(f.flags).flags);assert.equal(card.questionRequest.id,flag.id);assert.equal(card.text,'Requested Q?');
  const emitted=emitCrlTwoLane(f.policy,{date:'2026-10-09',capability:'publishable'});assert.equal(emitted.success,true,JSON.stringify(emitted.hardErrors));
  const preview=await runKeUpdates({schemaVersion:1,operation:'preview',artifactRoot:f.root,requests:[{id:flag.id,revision:mvFlagRevision(flag)}]},f.services);assert.equal(preview.ok,true);assert.ok(preview.changes.some(c=>c.after.includes('Requested Q?')));
  if(process.env.CRL_STRUCTURE_NATIVE==='1'){
   const native=await nativeCase(f,'Unknown');const text=JSON.stringify(native.questionnaire);assert.match(text,/R\?/);assert.match(text,/Authored question\?/);assert.doesNotMatch(text,/Requested Q\?/);
  }
 }finally{f.close();}
},300000);
test('deferred rebuild runs without Q/A flags and preserves saved source and all live artifacts on native failure',async()=>{
 const f=fixture();try{
  const p=previewStructuralEdit(f.root,f.policy,f.policy,f.src,{target:{decision:'D',nodeId:'when[0]'},operation:'down'});writeFileSync(f.policy,p.candidateSource);
  const before=snapshot(f.root);let invoked=false;
  await assert.rejects(()=>runKeUpdates({schemaVersion:1,operation:'rebuild',artifactRoot:f.root},{...f.services,produce:async()=>{invoked=true;return {ok:false,reason:'Injected native failure'};}}),/Injected native failure/);
  assert.equal(invoked,true);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
test('editor offers four operations, explicit logic, preview-before-save and invalidation after changing a draft',()=>{
 const html=structureEditorHtml('nonce'),script=html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1],elements=new Map(),messages=[],listeners={};
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',replaceChildren(...children){this.children=children;this.value=children.find(x=>x.selected)?.value??children[0]?.value??'';}});return elements.get(id);};
 vm.runInNewContext(script,{acquireVsCodeApi:()=>({postMessage:m=>messages.push(m)}),document:{getElementById:get,createElement:()=>({})},window:{addEventListener:(event,fn)=>listeners[event]=fn}});
 const message=data=>listeners.message({data});message({type:'sites',sites:[{file:'policy.crl',label:'D',condition:'"Q"',kind:'test'}]});message({type:'idle'});
 get('operation').value='split';get('operation').onchange();assert.equal(get('conditionFields').hidden,false);assert.equal(get('secondFields').hidden,false);assert.equal(get('save').disabled,true);
 get('first').value='"First"';get('second').value='"Second"';get('operator').value='and';get('preview').onclick();assert.equal(messages.at(-1).type,'preview');assert.equal(messages.at(-1).operator,'and');
 message({type:'preview',before:'old',after:'<new>',message:'Preview'});message({type:'idle'});assert.equal(get('save').disabled,false);assert.equal(get('after').textContent,'<new>');
 get('first').oninput();assert.equal(get('save').disabled,true);
 assert.ok(html.includes('Delete test / operand'));assert.ok(html.includes('Combine with next'));assert.ok(html.includes('Move up'));assert.ok(html.includes('Move down'));assert.doesNotMatch(html,/Delete branch/);
});
test.skipIf(process.env.CRL_STRUCTURE_NATIVE!=='1')('actual native rebuild updates static questionnaires after a live edit without changing expectations',async()=>{
 const f=fixture();try{
  const cel=join(f.root,'src/cel/mv/cases.cel'),expectations=readFileSync(cel,'utf8');
  const p=previewStructuralEdit(f.root,f.policy,f.policy,f.src,{target:{decision:'D',nodeId:'when[0]'},operation:'down'});writeFileSync(f.policy,p.candidateSource);
  const result=await runKeUpdates({schemaVersion:1,operation:'rebuild',artifactRoot:f.root},{...f.services,produce:request=>produceResults({...request,jarPath:process.env.CRL_STRUCTURE_JAR,bounds:{...DEFAULT_BOUNDS,maxHeapMb:512,batchTimeoutMs:120000}})});
  assert.equal(result.ok,true);assert.ok(result.changedPaths.includes('tests/results'));assert.equal(readFileSync(cel,'utf8'),expectations);
  const manifest=JSON.parse(readFileSync(join(f.root,'tests/results/questionnaire-manifest-mv.json'),'utf8'));assert.equal(manifest.cases.length,2);assert.ok(manifest.cases.every(c=>['generated','no-questionnaire'].includes(c.state)));
  const unknown=manifest.cases.find(c=>c.caseName==='Unknown'),complete=manifest.cases.find(c=>c.caseName==='Both');
  const resource=(entry,type)=>JSON.parse(readFileSync(join(f.root,entry.artifacts.find(a=>a.resourceType===type).path),'utf8'));
  const leaves=items=>(items??[]).flatMap(i=>[...(i.type&&i.type!=='group'&&i.type!=='display'?[i]:[]),...leaves(i.item)]);
  assert.equal(leaves(resource(unknown,'Questionnaire').item)[0].text,'R?');
  const qr=resource(complete,'QuestionnaireResponse');const answers=items=>(items??[]).flatMap(i=>[...(i.answer??[]),...answers(i.item)]);assert.equal(answers(qr.item).filter(a=>a.valueCoding?.code==='yes').length,2);
  const native=await nativeCase(f,'Both');assert.equal(native.activities.length,1);assert.match(native.activities[0],/Met/);
 }finally{f.close();}
},300000);
