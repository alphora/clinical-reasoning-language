import {describe,it,expect} from 'vitest';
import {buildCRL,decisionSpine,emitCrlBundle,resolveCelImports,assembleConceptProjections,buildCrlStructure,buildGuardOutlines,nodeKey,conceptDeclRef} from '@smile-digital-health/crl';
import {collectGuardDefines} from '../../crl/src/ast/guardDefines.ts';
import {questionReviewOwners,nativeReviewRoutes,reviewCasesForRoute} from './interactiveReview.ts';
import {resolve} from 'node:path';
import {expandQuestionInputs,renderFlowPane} from './flowPaneHtml.ts';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {enumerateInteractiveNative,readInteractiveResult} from './interactiveQuestionnaire.ts';

const resultUrl='http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-action-condition-result';
function fixture(body='first:\n- when "A" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".',extra=''){
 const source=`library "L".\nconcept "A": - value type is boolean.\nconcept "B": - value type is boolean.\n${extra}\nactivity "Met": - request CPGTaskRequest. - with \`MET\`.\nactivity "Unmet": - request CPGTaskRequest. - with \`UNMET\`.\ndecision "D":\n${body}\n`;
 const parsed=buildCRL(source);expect(parsed.success).toBe(true);
 const decisions=parsed.result.statements.filter(s=>s.type==='Decision');
 const structure=decisions.map(d=>{
  const spine=decisionSpine(d),shape=n=>({lib:'L',decision:d.name,nodeId:n.nodeId,nodeKey:'L/'+d.name+'/'+n.nodeId,kind:n.kind,label:n.kind==='action'?n.node.action.type==='UseDecision'?n.node.action.decisionName:n.node.action.activityName:n.kind,actionKind:n.kind==='action'?n.node.action.type==='UseDecision'?'use-decision':'recommend-activity':undefined,childrenQualifier:n.node.body?.qualifier,location:{range:{startLine:n.node.location.start.line-1,startCol:n.node.location.start.column}},children:[]});
  const rows=new Map(spine.map(n=>[n.nodeId,shape(n)])),roots=[];
  for(const [id,row] of rows){const parent=id.includes('/')?rows.get(id.slice(0,id.lastIndexOf('/'))):undefined;(parent?.children??roots).push(row);}
  return{lib:'L',decision:d.name,nodeKey:'L/'+d.name,childrenQualifier:d.body.qualifier,children:roots};
 });
 const origins=decisions.map(d=>({canonical:'urn:plan:'+d.name,library:'L',name:d.name,kind:'Decision',decision:d,conditions:collectGuardDefines(d)}));
 for(const name of ['Met','Unmet'])origins.push({canonical:'urn:activity:'+name,library:'L',name,kind:'Activity'});
 const condition=(value=false,index=0,dec='D')=>origins.find(o=>o.name===dec).conditions.filter(g=>g.planCondition?.carrier==='branch'&&g.planCondition.negated===value)[index].name;
 const native=(expressions,activity='Met')=>({resourceType:'Bundle',entry:[{resource:{resourceType:'RequestGroup',id:'root',instantiatesCanonical:['urn:plan:D'],action:[{condition:expressions.map(expression=>({kind:'applicability',expression:{expression},extension:[{url:resultUrl,valueBoolean:true}]})),resource:{reference:'Task/out'}}]}},{resource:{resourceType:'Task',id:'out',instantiatesCanonical:'urn:activity:'+activity}}]});
 return{origins,structure,condition,native};
}
describe('interactive review source joins',()=>{
 it('uses profile origin even without population expressions and preserves library and version',()=>{
  const origins=[{canonical:'urn:profile',version:'1',kind:'CaseFeature',library:'Foreign',name:'A'}];
  const q={item:[{linkId:'1',type:'boolean',definition:'urn:profile|1#Observation.value[x]'}]};
  expect(questionReviewOwners(q,origins).get('1')).toEqual({library:'Foreign',concept:'A'});
  expect(questionReviewOwners(q,[{...origins[0],version:'2'}]).size).toBe(0);
  expect(questionReviewOwners(q,[...origins,{...origins[0],library:'Other'}]).size).toBe(0);
 });
 it('refuses duplicate linkIds and repeated descendants',()=>{
  const origins=[{canonical:'urn:p',kind:'CaseFeature',library:'L',name:'A'}],q={linkId:'a',type:'boolean',definition:'urn:p#Observation.value[x]'};
  expect(questionReviewOwners({item:[q,q]},origins).size).toBe(0);
  expect(questionReviewOwners({item:[{linkId:'g',type:'group',repeats:true,item:[q]}]},origins).size).toBe(0);
  expect(questionReviewOwners({item:[{...q,linkId:'1'},{...q,linkId:'1/1'}]},origins).size).toBe(0);
 });
 it('the real Bleph emission supplies direct identities independently of display text',()=>{
  const emitted=emitCrlBundle(resolve('examples/bleph-medical-validation/src/crl/blepharoplasty-blepharoptosis-repair.crl'),{date:'2026-10-08',sourceOrigins:true});
  expect(emitted.success).toBe(true);
  const feature=emitted.definitionOrigins.find(o=>o.kind==='CaseFeature');expect(feature).toBeDefined();
  expect(questionReviewOwners({item:[{linkId:'q',type:'boolean',definition:feature.canonical+'#Observation.value[x]',text:'Different wording'}]},emitted.definitionOrigins).get('q')).toEqual({library:feature.library,concept:feature.name});
  expect(emitted.definitionOrigins.filter(o=>o.kind==='Decision').every(o=>o.decision&&o.conditions)).toBe(true);
 });
 it('focus expansion exposes the real Bleph question inside its collapsed INPUT group',()=>{
  const graph=resolveCelImports(resolve('examples/bleph-medical-validation/src/cel/mv/medical-validation.cel'));
  const {conceptLayer,defExpr}=assembleConceptProjections(graph),structure=buildCrlStructure(graph);
  const opts={concepts:conceptLayer,defExpr:(lib,name)=>defExpr.get(nodeKey(conceptDeclRef(lib,name))),guardOutlines:buildGuardOutlines(graph,defExpr)};
  const owner={library:'Blepharoplasty And Blepharoptosis Repair',concept:'Procedure Under Review'};
  const expanded=expandQuestionInputs(new Set(),[],structure,opts,owner);expect(expanded.size).toBeGreaterThan(0);
  expect(expandQuestionInputs(new Set(),[],structure,opts,{...owner,ownerKeys:[]}).size).toBe(0);
  const rendered=renderFlowPane(structure,{...opts,expandedGuardWhens:expanded});
  expect(rendered.conceptOccurrences.some(o=>o.lib===owner.library&&o.name===owner.concept)).toBe(true);
 });
});
describe('native condition evidence to existing structural routes',()=>{
 it('joins original native output bytes to current source provenance without evaluating',()=>{
  const directory=new URL('../test/fixtures/interactive-review-native/',import.meta.url),emitted=emitCrlBundle(fileURLToPath(new URL('policy.crl',directory)),{sourceOrigins:true});
  expect(emitted.success).toBe(true);
  const structure=buildCrlStructure(resolveCelImports(fileURLToPath(new URL('cases.cel',directory)))),decision=structure.find(d=>d.decision==='Assessment');
  const when=decision.children.find(n=>n.kind==='when'),otherwise=decision.children.find(n=>n.kind==='otherwise');
  for(const [file,hash,tail]of [['meets.json','1c48098030976742780bdfeea19fb54a9511abd7d3434ac03857b42d989957a9','when[0]/action[0]'],['unmet.json','154bd480e5f426513b41326c4feaa12c77fa4d24ba12f88a380c64f171670bed','otherwise/action[0]']]){
   const bytes=readFileSync(new URL(file,directory));expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
   const native=JSON.parse(bytes),routes=nativeReviewRoutes(native,'question-unit-native',emitted.definitionOrigins,structure);
   expect(routes).toHaveLength(1);expect(routes[0].keys).toEqual(file==='meets.json'?[decision.nodeKey,when.nodeKey,when.children[0].nodeKey]:[decision.nodeKey,when.nodeKey,otherwise.nodeKey,otherwise.children[0].nodeKey]);
   expect(readInteractiveResult(native).activities).toEqual(enumerateInteractiveNative(native).outcomes.map(o=>o.label));
  }
 });
 it('positive and negative routes preserve first-block prerequisites',()=>{
  const f=fixture();expect(nativeReviewRoutes(f.native([f.condition()]),'root',f.origins,f.structure)[0].keys).toEqual(['L/D','L/D/when[0]','L/D/when[0]/action[0]']);
  expect(nativeReviewRoutes(f.native([f.condition(true)],'Unmet'),'root',f.origins,f.structure)[0].keys).toEqual(['L/D','L/D/when[0]','L/D/otherwise','L/D/otherwise/action[0]']);
 });
 it('uses whole compound and criterion inventory carriers without assuming Ref names',()=>{
  for(const [guard,extra] of [['"A" and "B"',''],['"C"','criterion "C": - when ("A" and "B").']]){
   const f=fixture(`first:\n- when ${guard} then recommend activity "Met".\n- otherwise then recommend activity "Unmet".`,extra);
   expect(nativeReviewRoutes(f.native([f.condition()]),'root',f.origins,f.structure)[0].keys?.at(-1)).toBe('L/D/when[0]/action[0]');
  }
 });
 it('keeps an unknown action-unless distinct from a false branch',()=>{
  const f=fixture('first:\n- when "A" then:\n  all:\n  - recommend activity "Met" unless "B".\n  end.\n- otherwise then recommend activity "Unmet".');
  const carrier=f.origins[0].conditions.find(g=>g.planCondition?.carrier==='action'&&g.planCondition.negated).name;
  expect(nativeReviewRoutes(f.native([f.condition(),carrier]),'root',f.origins,f.structure)[0].keys?.at(-1)).toBe('L/D/when[0]/action[0]');
 });
 it('refuses missing, unknown, unrecognized and conflicting carriers',()=>{
  const f=fixture();for(const names of [[],['unrecognized'],[f.condition(),f.condition(true)]])expect(nativeReviewRoutes(f.native(names),'root',f.origins,f.structure)[0].reason).toBeTruthy();
  const native=f.native([f.condition()]);delete native.entry[0].resource.action[0].condition[0].extension[0].valueBoolean;
  expect(nativeReviewRoutes(native,'root',f.origins,f.structure)[0].reason).toBeTruthy();
 });
 it('keeps the caller path when a shared decision produces the determination',()=>{
  const f=fixture('first:\n- when "B" then use decision "Shared".\n- otherwise then recommend activity "Unmet".','decision "Shared": first:\n- when "A" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".');
  const native=f.native([f.condition(false,0,'D')]);
  native.entry[0].resource.action[0].resource.reference='RequestGroup/shared';
  native.entry.push({resource:{resourceType:'RequestGroup',id:'shared',instantiatesCanonical:['urn:plan:Shared'],action:[{condition:[{kind:'applicability',expression:{expression:f.condition(false,0,'Shared')},extension:[{url:resultUrl,valueBoolean:true}]}],resource:{reference:'Task/out'}}]}});
  expect(nativeReviewRoutes(native,'root',f.origins,f.structure)[0].keys).toEqual(['L/D','L/D/when[0]','L/D/when[0]/action[0]','L/Shared','L/Shared/when[0]','L/Shared/when[0]/action[0]']);
 });
 it('refuses duplicate unconditional terminal occurrences',()=>{
  const f=fixture('all:\n- when "A" then:\n  all:\n  - recommend activity "Met".\n  - recommend activity "Met".\n  end.');
  expect(nativeReviewRoutes(f.native([f.condition()]),'root',f.origins,f.structure)[0].reason).toBeTruthy();
 });
 it('requires a resolved unique native terminal even with exact recommendation provenance',()=>{
  const f=fixture(),native=f.native([f.condition()]);
  const recommendation={resourceType:'RequestGroup',id:'rec',instantiatesCanonical:['urn:rec:Met'],action:[{resource:{reference:'Task/out'}}]};
  native.entry[0].resource.action[0].resource.reference='RequestGroup/rec';native.entry.push({resource:recommendation});
  f.origins.push({canonical:'urn:rec:Met',library:'L',name:'Met',kind:'Recommendation'});
  delete native.entry[1].resource.instantiatesCanonical;
  expect(nativeReviewRoutes(native,'root',f.origins,f.structure)[0].keys).toBeTruthy();
  const terminal=native.entry.splice(1,1)[0];expect(nativeReviewRoutes(native,'root',f.origins,f.structure)[0].reason).toMatch(/missing or ambiguous/);
  native.entry.push(terminal,structuredClone(terminal));expect(nativeReviewRoutes(native,'root',f.origins,f.structure)[0].reason).toMatch(/missing or ambiguous/);
 });
 it('does not let a missing parallel branch prove a unique route',()=>{
  const f=fixture('all:\n- when "A" then recommend activity "Met".\n- when "B" then recommend activity "Met".');
  expect(nativeReviewRoutes(f.native([f.condition()]),'root',f.origins,f.structure)[0].reason).toBeTruthy();
 });
 it('a missing unrelated parallel branch does not erase a proven source route',()=>{
  const f=fixture('all:\n- when "A" then recommend activity "Met".\n- when "B" then recommend activity "Unmet".');
  expect(nativeReviewRoutes(f.native([f.condition()]),'root',f.origins,f.structure)[0].keys?.at(-1)).toBe('L/D/when[0]/action[0]');
 });
});
describe('route verdict write scope',()=>{
 const entry=(caseId,keys,kind='produced')=>({caseId,route:{nodeKeys:keys,terminalKind:kind}});
 it('updates all and only saved cases on the exact route',()=>{
  expect(reviewCasesForRoute(['a'],[entry('one',['a']),entry('two',['a']),entry('other',['b'])])).toEqual({caseIds:['one','two'],reason:undefined});
  expect(reviewCasesForRoute(['uncovered'],[entry('one',['a'])]).reason).toMatch(/No saved/);
 });
 it.each(['produced','paused','blocked','error'])('refuses collateral %s routes without mutating entries',kind=>{
  const entries=[entry('one',['a']),entry('one',['b'],kind)],before=JSON.stringify(entries);
  expect(reviewCasesForRoute(['a'],entries).caseIds).toEqual([]);expect(JSON.stringify(entries)).toBe(before);
 });
});
