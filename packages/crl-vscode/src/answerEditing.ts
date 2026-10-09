// REFACTOR:grounded: resolve answer vocabulary through the actual CRL source owner.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {isAbsolute,relative,resolve,join} from 'node:path';
import {resolveImports,validateCELFile,type RegistryEntry} from '@smile-digital-health/crl';
import {answerTerminologyResolver,readFiniteAnswerMembers,readPublicationMembership,readPublicationAnyMembership,sourceSha256,planTerminologyEdit,planAnswerClassificationEdit,previewCrlSourceEdits,type AnswerEditRequest} from '@smile-digital-health/crl/language-services';

export interface AnswerTarget {
  filePath:string; library:string; terminology:string; baseline:string; canonicalBase:string;
  questionOwner:{library:string;concept:string;filePath:string};
  editable:boolean; readOnlyReason?:string;
  members:{system:string;code:string;display:string;description?:string;editable:boolean;readOnlyReason?:string}[];
  systems:string[]; consumers:{key:string;library:string;concept:string;filePath:string;baseline:string}[];
  uses:string[];
}
export type AnswerChange = Pick<AnswerEditRequest,'operation'|'system'|'code'|'display'|'description'> & {qualifications?:Record<string,boolean>;acknowledgedCaseImpact?:string};
export class AnswerCaseImpactError extends Error {
  constructor(public readonly caseImpact:{file:string;message:string}[],public readonly caseImpactToken:string){super('These examples would become unrunnable. Review their listed errors before applying the answer change.');}
}
const inside=(root:string,file:string)=>{const r=relative(root,file);return r!=='' && !isAbsolute(r) && r!=='..' && !r.startsWith('..\\') && !r.startsWith('../');};
function inventory(policyPath:string) {
  const graph=resolveImports(policyPath),registry=graph.registry;
  if(!registry || !graph.projectRoot || graph.diagnostics.some(d=>d.severity==='error' || d.kind==='parse-failure' || d.kind==='package-resolution-failure'))throw new Error('Answer source ownership could not be resolved. Validate the owning CRL project.');
  const entries=[...registry.byNameLocal.values(),...registry.byNamePackage.values()];
  return {graph,registry,entries,root:graph.projectRoot};
}
function resolveQuestionOwner(registry:NonNullable<ReturnType<typeof resolveImports>['registry']>,library:string) {
  const localOwner=registry.byNameLocal.get(library),packageOwner=registry.byNamePackage.get(library);
  if(localOwner && packageOwner && localOwner.filePath!==packageOwner.filePath)throw new Error('This question has competing local and installed CRL owners. Editing CRL and FHIR is disabled until its source owner is unambiguous.');
  return localOwner ?? packageOwner;
}
export function resolveAnswerTarget(policyPath:string,library:string,concept:string):AnswerTarget|undefined {
  const {registry,entries,root}=inventory(policyPath),owner=resolveQuestionOwner(registry,library);
  const c=owner?.ast.statements.find(s=>s.type==='Concept' && s.name===concept);
  if(!owner || !c || c.type!=='Concept' || !c.valueFrom)return undefined;
  const term=answerTerminologyResolver(owner,registry)(c.valueFrom.terminologyName);
  if(!term)return undefined;
  const termOwner=entries.find(e=>e.ast.statements.includes(term));if(!termOwner)throw new Error('Answer terminology has no source owner.');
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8')),canonicalBase=pkg.crl?.canonicalBase;
  if(typeof canonicalBase!=='string' || !canonicalBase.trim())throw new Error('Answer editing needs the configured CRL canonical base.');
  const finite=readFiniteAnswerMembers(term),local=registry.byNameLocal.get(termOwner.ast.library.name)?.filePath===termOwner.filePath && inside(root,termOwner.filePath);
  const editable=local && finite.kind==='resolved';
  const readOnlyReason=!local?'Answer terminology is not locally owned. Edit CRL and FHIR in its owning workspace.':finite.kind==='error'?'This answer terminology is not an editable finite vocabulary: '+finite.message:undefined;
  const prefix=canonicalBase.replace(/\/$/,'')+'/CodeSystem/';
  const members=finite.kind==='resolved'?finite.members.map(m=>({...m,editable:editable && m.system.startsWith(prefix),readOnlyReason:readOnlyReason ?? (!m.system.startsWith(prefix)?'This answer belongs to an externally owned CodeSystem. Edit CRL and FHIR in its owning workspace.':undefined)})):[];
  const consumers:AnswerTarget['consumers']=[],uses=answerUses(entries,registry,term);
  for(const entry of entries) {
    const resolver=answerTerminologyResolver(entry,registry);
    for(const statement of entry.ast.statements) {
      if(statement.type==='Concept' && statement.valueFrom && resolver(statement.valueFrom.terminologyName)===term) consumers.push({key:JSON.stringify([entry.ast.library.name,statement.name]),library:entry.ast.library.name,concept:statement.name,filePath:entry.filePath,baseline:readFileSync(entry.filePath,'utf8')});
    }
  }
  return {questionOwner:{library,concept,filePath:owner.filePath},filePath:termOwner.filePath,library:termOwner.ast.library.name,terminology:term.name,baseline:readFileSync(termOwner.filePath,'utf8'),canonicalBase,editable:editable && members.some(m=>m.editable),readOnlyReason:readOnlyReason ?? (!members.some(m=>m.editable)?'Answer codes are not locally owned. Edit CRL and FHIR in their owning workspace.':undefined),members,systems:[...new Set(members.filter(m=>m.editable).map(m=>m.system))],consumers,uses};
}
function answerUses(entries:RegistryEntry[],registry:NonNullable<ReturnType<typeof resolveImports>['registry']>,term:unknown) {
  const uses:string[]=[];
  for(const entry of entries){const resolver=answerTerminologyResolver(entry,registry);for(const statement of entry.ast.statements){
    let used=false;
    const walk=(v:any)=>{if(!v || typeof v!=='object')return;for(const [key,value] of Object.entries(v)){if((key==='terminologyName' || key==='terminologyReference') && value && resolver(value as any)===term)used=true;else if(value && typeof value==='object')walk(value);}};walk(statement);
    if(statement.type==='Concept'){
      const membership=readPublicationMembership(statement);if(membership?.predicate.kind==='terminology' && resolver(membership.predicate.reference)===term)used=true;
      const aggregate=readPublicationAnyMembership(statement);if(aggregate && resolver(aggregate.terminology.value)===term)used=true;
    }
    if(used)uses.push(`${entry.ast.library.name}: ${statement.name}`);
  }}return uses;
}
export function previewAnswerChange(policyPath:string,target:AnswerTarget,change:AnswerChange) {
  const {registry,entries,root}=inventory(policyPath);
  if(!target.editable)throw new Error(target.readOnlyReason ?? 'Answer terminology is read-only.');
  const owner=registry.byNameLocal.get(target.library),term=owner?.ast.statements.find(s=>s.type==='Terminology' && s.name===target.terminology);
  if(!owner || resolve(owner.filePath)!==resolve(target.filePath) || readFileSync(target.filePath,'utf8')!==target.baseline || !term || term.type!=='Terminology')throw new Error('Answer terminology changed. Re-pin before saving.');
  const questionOwner=resolveQuestionOwner(registry,target.questionOwner.library),question=questionOwner?.ast.statements.find(s=>s.type==='Concept' && s.name===target.questionOwner.concept);
  if(!questionOwner || resolve(questionOwner.filePath)!==resolve(target.questionOwner.filePath) || !question || question.type!=='Concept' || !question.valueFrom || answerTerminologyResolver(questionOwner,registry)(question.valueFrom.terminologyName)!==term)throw new Error('The question or its answer terminology owner changed. Re-pin before saving.');
  // One CodeSystem coding may be declared by several ValueSets. Surface the owners rather than introducing conflicting definitions.
  if(change.operation==='update') {
    const duplicates:string[]=[];
    for(const entry of entries)for(const s of entry.ast.statements)if(s.type==='Terminology' && s!==term){let system:string|undefined;for(const l of s.body){if(l.type==='TerminologySystem')system=l.system;else if(l.type==='TerminologyCode' && system===change.system && l.code===change.code)duplicates.push(entry.ast.library.name+': '+s.name);}}
    if(duplicates.length)throw new Error('This coding is also authored in '+duplicates.join(', ')+'. Reconcile its shared wording in the owning CRL before editing it here.');
  }
  const resolvedConsumers:AnswerTarget['consumers']=[];
  for(const entry of entries)for(const c of entry.ast.statements)if(c.type==='Concept' && c.valueFrom && answerTerminologyResolver(entry,registry)(c.valueFrom.terminologyName)===term)resolvedConsumers.push({key:JSON.stringify([entry.ast.library.name,c.name]),library:entry.ast.library.name,concept:c.name,filePath:entry.filePath,baseline:readFileSync(entry.filePath,'utf8')});
  if(JSON.stringify(resolvedConsumers)!==JSON.stringify(target.consumers))throw new Error('Questions using this terminology changed. Re-pin before saving.');
  if(change.operation==='create' && (!change.qualifications || resolvedConsumers.some(c=>typeof change.qualifications![c.key]!=='boolean') || Object.keys(change.qualifications).some(k=>!resolvedConsumers.some(c=>c.key===k))))throw new Error('Choose whether the new answer qualifies for each listed question.');
  if(change.operation==='create' && resolvedConsumers.some(c=>change.qualifications![c.key]===false) && target.members.some(m=>m.code===change.code))throw new Error('Nonqualifying exceptions cannot distinguish this code across multiple systems. Choose a unique code.');
  if(change.operation==='create' && target.members.some(m=>m.code===change.code))throw new Error('Answer codes must be unique across this terminology so existing bare-code examples and exceptions stay unambiguous.');
  const edit=planTerminologyEdit(target.baseline,{...change,library:target.library,terminology:target.terminology,canonicalBase:target.canonicalBase});
  const candidates=new Map([[target.filePath,edit.candidateSource]]);
  if(change.operation!=='update')for(const consumer of resolvedConsumers) {
    if(registry.byNameLocal.get(consumer.library)?.filePath!==consumer.filePath || !inside(root,consumer.filePath))throw new Error('An affected question is not locally owned: '+consumer.library+': '+consumer.concept+'. Edit it in its owning workspace.');
    const source=candidates.get(consumer.filePath) ?? consumer.baseline;
    const result=planAnswerClassificationEdit(source,[consumer.concept],change.code,change.operation==='create' && !change.qualifications![consumer.key]);
    candidates.set(consumer.filePath,result.candidateSource);
  }
  const preview=previewCrlSourceEdits({projectRoot:root,filePath:target.filePath},candidates),caseImpact:{file:string;message:string}[]=[],caseInputs:{file:string;sha256:string}[]=[];
  const walkCases=(dir:string)=>{if(!existsSync(dir))return;for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('CEL preflight includes a linked path: '+file);if(entry.isDirectory())walkCases(file);else if(entry.isFile() && entry.name.endsWith('.cel')){
    caseInputs.push({file:relative(root,file).replace(/\\/g,'/'),sha256:sourceSha256(readFileSync(file,'utf8'))});
    const before=validateCELFile(file),after=validateCELFile(file,{overlays:preview.sourceOverlays});
    const known=new Set(before.errors.map(e=>JSON.stringify([e.kind,e.message])));
    for(const error of after.errors)if(!known.has(JSON.stringify([error.kind,error.message])))caseImpact.push({file:relative(root,file).replace(/\\/g,'/'),message:error.message});
  }}};
  if(change.operation!=='update')walkCases(join(root,'src/cel'));
  const caseFingerprint=sourceSha256(JSON.stringify({candidate:preview.afterSha256,inputs:caseInputs.sort((a,b)=>a.file.localeCompare(b.file)),caseImpact}));
  if(caseImpact.length && change.acknowledgedCaseImpact!==caseFingerprint)throw new AnswerCaseImpactError(caseImpact,caseFingerprint);
  return {...preview,caseFingerprint,answerReceipt:{terminology:target.terminology,operation:change.operation,before:edit.before,after:edit.after,qualifications:change.qualifications,uses:answerUses(entries,registry,term),caseImpact,caseFingerprint,resultsState:caseImpact.length?'stale-unrunnable':'stale',membersBefore:target.members.map(({system,code,display,description})=>({system,code,display,description}))}};
}
