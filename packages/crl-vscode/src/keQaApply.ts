// REFACTOR:grounded (MV/KE): explicit KE application writes only KE-owned content; MV status remains manual.
import { existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,cpSync,rmSync,readdirSync } from 'node:fs';
import { join,resolve,relative,dirname,basename,isAbsolute,sep } from 'node:path';
import {createHash} from 'node:crypto';
import { loadFlags,mvReviewStatus,mvFlagRevision,canonicalMvValue,qaEditFlagId,resolveImports,findProjectRoot,
  emitCrlTwoLane,writeTwoLane,definitionClosureDigest,resolveCelImports,resolveDefinedByTarget,tokenizeCEL,
  resolveCelSuite,emitCelSuite,writeEmitResult,produceResults,nativeResultsCurrent,
  type MvFlag,type QaEditRequest,type ProduceRequest,type ProduceOutcome } from '@smile-digital-health/crl';
import { planPresentationEdit,planTerminologyEdit,planAnswerClassificationEdit } from '@smile-digital-health/crl/language-services';
import { resolveWordingTarget } from './presentationProposal';
import { resolveAnswerTarget,previewAnswerChange,type AnswerTarget } from './answerEditing';
import { questionFlagTarget,answerSourceState } from './qaFlagEditing';
import { mvPublicationOptions,assertSingleLocalPolicy } from './mvDirectEdit';
import { readEditTree,editTreeIdentity,assertOrdinaryEditPath,MvEditTransaction,inspectMvEdits,type EditUnit,type EditTree,type EditBoundary } from './mvEditTransaction';
import {retainStaticQuestionDescriptions} from './keStaticPresentation';

export interface KeUpdateSelection {id:string;revision:string}
export interface KeUpdateInput {schemaVersion:1;operation:'discover'|'preview'|'apply'|'recover';artifactRoot:string;requests?:KeUpdateSelection[]}
export interface KeApplyServices {storageRoot:string;crlVersion:string;produce?:(request:ProduceRequest)=>Promise<ProduceOutcome>;boundary?:EditBoundary}
const scopes=['crl','cql','fhir','cel','tests'];
const equal=(a:unknown,b:unknown)=>canonicalMvValue(a)===canonicalMvValue(b);
const inside=(root:string,file:string)=>{const r=relative(root,file);return r!=='' && !isAbsolute(r) && r!=='..' && !r.startsWith('..'+sep);};
const store=(root:string)=>join(root,'src/medical-validation/flags');
const flags=(root:string)=>{const v=loadFlags(store(root));if(v.warning)throw Error(v.warning);return v.flags;};
const pending=(f:MvFlag)=>f.category==='validation' && !!f.editRequest && mvReviewStatus(f)==='pending-fix';
function hasFiles(dir:string,extension:string):boolean {return existsSync(dir) && readdirSync(dir,{withFileTypes:true}).some(e=>e.isFile()?e.name.endsWith(extension):e.isDirectory() && hasFiles(join(dir,e.name),extension));}
export function discoverKeUpdates(root:string){
  const list=flags(root);
  return {schemaVersion:1,artifactRoot:root,hasCrl:hasFiles(join(root,'src/crl'),'.crl'),hasFhir:hasFiles(join(root,'src/fhir'),'.json'),hasCql:hasFiles(join(root,'src/cql'),'.cql'),
    pendingFindings:list.filter(f=>!f.editRequest && (f.category==='validation'?mvReviewStatus(f)==='pending-fix':f.status==='open')).map(f=>({id:f.id,category:f.category,gist:f.gist})),
    requests:list.filter(pending).map(f=>({id:f.id,revision:mvFlagRevision(f),gist:f.gist,editRequest:f.editRequest})),requiredScopes:scopes};
}
function selectedRequests(root:string,selection:KeUpdateSelection[]|undefined):MvFlag[]{
  if(!Array.isArray(selection) || !selection.length || new Set(selection.map(s=>s.id)).size!==selection.length)throw Error('Select at least one distinct pending Q/A request.');
  const list=flags(root);return selection.map(s=>{const f=list.find(f=>f.id===s.id);if(!f || !pending(f) || mvFlagRevision(f)!==s.revision)throw Error('A selected request changed. Refresh KE Updates before applying.');return f;});
}
function copySources(root:string,stage:string,policyPath:string){
  mkdirSync(stage,{recursive:true});cpSync(join(root,'package.json'),join(stage,'package.json'));
  for(const lane of ['crl','cel'])if(existsSync(join(root,'src',lane))){readEditTree(join(root,'src',lane));cpSync(join(root,'src',lane),join(stage,'src',lane),{recursive:true});}
  const graph=resolveImports(policyPath);if(graph.diagnostics.some(d=>d.severity==='error'))throw Error('Policy source ownership could not be resolved.');
  const copied=new Set<string>();
  for(const entry of graph.registry?.byNamePackage.values()??[]){
    const owner=findProjectRoot(entry.filePath);if(!owner)throw Error('An installed source has no package owner.');
    const pkg=JSON.parse(readFileSync(join(owner,'package.json'),'utf8')),target=resolve(stage,'node_modules',pkg.name);
    if(typeof pkg.name!=='string' || !inside(join(stage,'node_modules'),target))throw Error('Invalid installed source package identity.');
    if(copied.has(target))continue;copied.add(target);mkdirSync(target,{recursive:true});cpSync(join(owner,'package.json'),join(target,'package.json'));
    for(const file of pkg.crl?.libraries??[]){const from=resolve(owner,file),to=resolve(target,file);if(!inside(owner,from)||!inside(target,to))throw Error('Installed library escapes its package.');mkdirSync(dirname(to),{recursive:true});cpSync(from,to);}
  }
}
interface DeletedOption {system:string;code:string;consumers:AnswerTarget['consumers']}
function answerTarget(policy:string,request:Extract<QaEditRequest,{kind:'answer-crud'}>):AnswerTarget {
  const consumer=Object.keys((request.before??request.desired)!.qualifications)[0];if(!consumer)throw Error('The request has no consuming question.');
  const [library,concept]=JSON.parse(consumer),target=resolveAnswerTarget(policy,library,concept);
  if(!target || target.library!==request.target.library || target.terminology!==request.target.terminology)throw Error('The requested answer owner no longer matches its question.');
  return target;
}
function applySourceRequests(root:string,policy:string,selected:MvFlag[]){
  const deleted:DeletedOption[]=[],changes:{file:string;before:string;after:string}[]=[];
  // Replacement answers must exist before an old final answer is removed.
  const ordered=[...selected].sort((a,b)=>Number(a.editRequest!.kind==='answer-crud' && a.editRequest!.desired===null)-Number(b.editRequest!.kind==='answer-crud' && b.editRequest!.desired===null));
  for(const f of ordered){const r=f.editRequest!,file=resolve(root,r.target.file),source=readFileSync(file,'utf8');
    if(!inside(join(root,'src/crl'),file))throw Error('The requested source is outside this artifact.');
    if(r.kind==='question-edit'){
      const target=resolveWordingTarget(file,source,r.target.concept,r.target.context?{decision:r.target.context.decision,criteria:new Set(r.target.context.criteria)}:undefined);
      if(!target || target.library!==r.target.library || qaEditFlagId(questionFlagTarget(root,target))!==f.id)throw Error('The requested question scope changed.');
      const authored={text:target.questionText,description:target.questionDescription};if(equal(authored,r.desired))continue;
      if(!equal(authored,r.before))throw Error('Question wording differs from both the baseline and requested state.');
      const next=planPresentationEdit(source,{library:r.target.library,concept:r.target.concept,context:r.target.context,questionText:r.desired.text,questionDescription:r.desired.description}).candidateSource;
      writeFileSync(file,next);changes.push({file:r.target.file,before:source,after:next});
    }else{
      const target=answerTarget(policy,r);if(relative(resolve(target.filePath),file)!=='')throw Error('The answer source owner changed.');
      const authored=answerSourceState(target,r.target.system,r.target.code);if(equal(authored,r.desired)){if(r.desired===null)deleted.push({system:r.target.system,code:r.target.code,consumers:target.consumers});continue;}
      if(!equal(authored,r.before))throw Error('Answer content differs from both the baseline and requested state.');
      if(!target.editable || !target.systems.includes(r.target.system))throw Error(target.readOnlyReason??'This answer is not locally owned.');
      if(authored && !target.members.find(m=>m.system===r.target.system && m.code===r.target.code)?.editable)throw Error('The requested answer is externally owned.');
      const operation=r.desired===null?'delete':authored===null?'create':'update';
      if(operation==='update')previewAnswerChange(policy,target,{operation,system:r.target.system,code:r.target.code,display:r.desired!.display,description:r.desired!.description});
      const next=planTerminologyEdit(source,{library:r.target.library,terminology:r.target.terminology,canonicalBase:target.canonicalBase,operation,system:r.target.system,code:r.target.code,display:r.desired?.display,description:r.desired?.description}).candidateSource;
      writeFileSync(file,next);changes.push({file:r.target.file,before:source,after:next});
      for(const c of target.consumers){
        if(!inside(join(root,'src/crl'),c.filePath))throw Error('An affected question is externally owned.');
        const before=readFileSync(c.filePath,'utf8'),qualifies=r.desired?.qualifications[c.key];
        if(r.desired && typeof qualifies!=='boolean')throw Error('Qualification is missing for a consuming question.');
        const after=planAnswerClassificationEdit(before,[c.concept],r.target.code,operation!=='delete' && !qualifies).candidateSource;
        if(before!==after){writeFileSync(c.filePath,after);changes.push({file:relative(root,c.filePath).replace(/\\/g,'/'),before,after});}
      }
      if(operation==='delete')deleted.push({system:r.target.system,code:r.target.code,consumers:target.consumers});
    }
  }
  return {deleted,changes};
}
function filesUnder(dir:string,extension:string):string[]{if(!existsSync(dir))return[];return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesUnder(join(dir,e.name),extension):e.isFile()&&e.name.endsWith(extension)?[join(dir,e.name)]:[]);}
function clearDeletedSelections(root:string,deleted:DeletedOption[]){
  const cleared:{file:string;caseName:string;factName:string}[]=[];
  for(const file of filesUnder(join(root,'src/cel'),'.cel')){
    const graph=resolveCelImports(file);if(!graph.cel || graph.diagnostics.some(d=>d.severity==='error'))throw Error('CEL source ownership could not be resolved.');
    const source=readFileSync(file,'utf8'),edits:{start:number;end:number}[]=[],lines=source.split('\n'),tokens=tokenizeCEL(source).result;
    if(!tokens)throw Error('CEL selection fields could not be tokenized.');
    const offset=(p:{line:number;column:number})=>lines.slice(0,p.line-1).reduce((n,s)=>n+s.length+1,0)+p.column;
    for(const fact of graph.cel.statements)if(fact.type==='CELFact'){
      const db=fact.body.find(b=>b.type==='CELDefinedByField'),value=fact.body.find(b=>b.type==='CELValueField');if(!db || db.type!=='CELDefinedByField' || !value || value.type!=='CELValueField' || value.value.kind!=='string')continue;
      const target=resolveDefinedByTarget(db.ref,graph);if(!target || target.kind!=='concept')continue;
      if(!deleted.some(d=>(value.value.value===d.code || value.value.value===d.system+'|'+d.code) && d.consumers.some(c=>c.library===target.lib && c.concept===target.name && relative(resolve(c.filePath),resolve(target.sourceIdentity))==='')))continue;
      const index=tokens.findIndex(t=>t.line===value.location.start.line && t.column===value.location.start.column),dash=tokens[index-1];
      const dot=tokens.slice(index).find(t=>t.type==='DOT' && offset(t)>=offset(value.location.end));
      if(dash?.type!=='DASH' || !dot)throw Error('CEL answer field boundaries could not be resolved.');
      edits.push({start:offset(dash),end:offset(dot)+dot.text.length});
      for(const c of graph.cel.statements)if(c.type==='CELCase' && c.body.some(b=>b.type==='CELFactRefField' && b.factName===fact.name))cleared.push({file:relative(root,file).replace(/\\/g,'/'),caseName:c.name,factName:fact.name});
    }
    if(edits.length){let next=source;for(const e of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,e.start)+next.slice(e.end);writeFileSync(file,next);}
  }
  return cleared;
}
function preservePlaceholders(before:EditTree,after:EditTree):EditTree {
  if(after.kind!=='directory')return after;const files=new Map(after.files);
  if(before.kind==='directory')for(const [name,bytes] of before.files)if(basename(name)==='.gitkeep')files.set(name,bytes);
  return {...after,files};
}
export async function runKeUpdates(input:KeUpdateInput,services:KeApplyServices){
  const root=resolve(input.artifactRoot);if(input.schemaVersion!==1 || !['discover','preview','apply','recover'].includes(input.operation))throw Error('Unsupported KE Updates request.');
  assertOrdinaryEditPath(root);if(!existsSync(join(root,'package.json')))throw Error('Select the owning artifact package.');
  assertOrdinaryEditPath(services.storageRoot);
  if(inside(root,resolve(services.storageRoot)) || relative(root,resolve(services.storageRoot))==='')throw Error('KE temporary storage must be outside the artifact.');
  const recoveryRoot=join(services.storageRoot,'recovery',createHash('sha256').update(process.platform==='win32'?root.toLowerCase():root).digest('hex'));
  const recovery=inspectMvEdits(recoveryRoot,root,true),incomplete=recovery.transactions.filter(t=>['prepared','publishing','recovery-required'].includes(t.state.phase));
  if(input.operation==='discover')return {ok:true,...discoverKeUpdates(root),recoveryRequired:incomplete.length>0 || recovery.errors.length>0};
  if(input.operation==='recover'){
    if(recovery.errors.length)throw Error('KE recovery could not be read: '+recovery.errors.map(e=>e.message).join('; '));
    const changedPaths=[...new Set(incomplete.flatMap(t=>t.state.units.map(u=>relative(root,u.path).replace(/\\/g,'/'))))];
    for(const transaction of incomplete)transaction.recover();
    return {ok:true,schemaVersion:1,state:'recovered',requiredScopes:scopes,changedPaths};
  }
  if(incomplete.length || recovery.errors.length)throw Error('An interrupted KE update needs recovery. Invoke recover before applying another update.');
  const selected=selectedRequests(root,input.requests),suite=resolveCelSuite(root);if(!suite.ok || !suite.suite.policyPath)throw Error('The artifact has no unique policy and MV case suite.');
  const policy=suite.suite.policyPath,publication=mvPublicationOptions(root);assertSingleLocalPolicy(root,policy,publication);
  mkdirSync(services.storageRoot,{recursive:true});
  const scratch=mkdtempSync(join(services.storageRoot,'ke-updates-')),stage=join(scratch,basename(root));
  try {
    copySources(root,stage,policy);const stagedPolicy=join(stage,relative(root,policy));
    const sourcePlan=applySourceRequests(stage,stagedPolicy,selected),cleared=clearDeletedSelections(stage,sourcePlan.deleted);
    const emitted=emitCrlTwoLane(stagedPolicy,publication);if(!emitted.success)throw Error('The requested policy definitions did not emit successfully.');
    writeTwoLane(emitted,join(stage,'src'));const digest=definitionClosureDigest(emitted)!,pd=emitted.fhir.resources.find(r=>r.resourceType==='PlanDefinition' && (r.resource.type as any)?.coding?.some((c:any)=>c.code==='workflow-definition'))?.resource.id;
    if(typeof pd!=='string')throw Error('The candidate has no unique workflow definition.');
    const sourceFiles=[...new Set(sourcePlan.changes.map(c=>c.file).concat(filesUnder(join(stage,'src/cel'),'.cel').map(f=>relative(stage,f).replace(/\\/g,'/'))))];
    const units:EditUnit[]=sourceFiles.map(file=>({path:join(root,file),after:readEditTree(join(stage,file))}));
    for(const lane of ['cql','fhir'])units.push({path:join(root,'src',lane),after:preservePlaceholders(readEditTree(join(root,'src',lane)),readEditTree(join(stage,'src',lane)))});
    const changed=()=>units.filter(u=>!equal(editTreeIdentity(readEditTree(u.path)),editTreeIdentity(u.after)));
    if(input.operation==='preview'){
      const changes=changed();
      const sourceChanges=changes.filter(u=>/^(?:src[\\/]crl|src[\\/]cel)[\\/]/.test(relative(root,u.path))).map(u=>({
        file:relative(root,u.path).replace(/\\/g,'/'),before:readFileSync(u.path,'utf8'),after:u.after.kind==='file'?Buffer.from(u.after.bytes).toString('utf8'):''
      }));
      const basis=createHash('sha256').update(canonicalMvValue({
        inputs:['package.json','src/crl','src/cel'].map(file=>({file,identity:editTreeIdentity(readEditTree(join(root,file)))})),
        units:units.map(u=>({file:relative(root,u.path).replace(/\\/g,'/'),before:editTreeIdentity(readEditTree(u.path)),after:editTreeIdentity(u.after)}))
      })).digest('hex');
      return {ok:true,schemaVersion:1,state:'preview',requiredScopes:scopes,requests:input.requests,changes:sourceChanges,clearedCases:cleared,
        changedPaths:changes.map(u=>relative(root,u.path).replace(/\\/g,'/')),basis,
        refreshedFolders:['tests/results',...(cleared.length?['tests/data/fhir']:[])]};
    }
    if(!changed().length && nativeResultsCurrent(root,digest,pd,services.crlVersion)){
      readEditTree(join(root,'tests/results'));cpSync(join(root,'tests/results'),join(stage,'tests/results'),{recursive:true});
      const manifestPath=join(stage,'tests/results/questionnaire-manifest-mv.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
      retainStaticQuestionDescriptions(stage,emitted.fhir.resources.map(r=>r.resource),{manifest,manifestPath});
    }else{
      const result=await (services.produce??produceResults)({celPath:stage,crlPath:stagedPolicy,definitionOptions:publication,useCase:'prior-auth',outRoot:stage,crlVersion:services.crlVersion});
      if(!result.ok || result.failed!==0)throw Error(result.ok?'Native static questionnaire generation has failed or degraded cases.':result.reason+(result.detail?.length?': '+result.detail.join('; '):''));
      retainStaticQuestionDescriptions(stage,emitted.fhir.resources.map(r=>r.resource),result);
      if(cleared.length){const stagedSuite=resolveCelSuite(stage),clock=result.manifest.provenance.inputClock;if(!stagedSuite.ok || typeof clock!=='string')throw Error('The candidate case suite or native replay clock is unavailable.');const data=emitCelSuite(stagedSuite.suite,new Date(clock));writeEmitResult(data.result,join(stage,'tests/data/fhir'));units.push({path:join(root,'tests/data/fhir'),after:preservePlaceholders(readEditTree(join(root,'tests/data/fhir')),readEditTree(join(stage,'tests/data/fhir')))});}
    }
    units.push({path:join(root,'tests/results'),after:preservePlaceholders(readEditTree(join(root,'tests/results')),readEditTree(join(stage,'tests/results')))});
    // KELP locks the scopes; this checks the selected intent remains the one the KE explicitly invoked.
    selectedRequests(root,input.requests);
    const changes=changed();if(changes.some(u=>!/^(?:src\/(?:crl|cel|cql|fhir)(?:\/|$)|tests\/)/.test(relative(root,u.path).replace(/\\/g,'/'))))throw Error('The candidate contains a non-KE write.');
    if(changes.length)MvEditTransaction.prepare({artifactRoot:root,storageRoot:recoveryRoot,units:changes,boundary:services.boundary}).publish();
    return {ok:true,schemaVersion:1,state:changes.length?'changed':'no-op',requiredScopes:scopes,changedPaths:changes.map(u=>relative(root,u.path).replace(/\\/g,'/')),clearedCases:cleared,...(cleared.length?{message:'Deleted selections were cleared. Review the listed cases and their unchanged expected outcomes.'}:{})};
  }finally{assertOrdinaryEditPath(scratch);rmSync(scratch,{recursive:true,force:true});}
}
