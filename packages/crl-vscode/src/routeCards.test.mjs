// REFACTOR:grounded: cards preserve typed answers and MV patches never mutate source content.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCRL, buildExecutionModel, resolveCelImports, nodeKey, conceptDeclRef } from '@smile-digital-health/crl';
import { buildRouteCards, definitionValueInputs, formatAnswer } from './routeCards.ts';
import { createPresentationProposal, resolveWordingTarget, savePresentationProposal, graphWordingSources, pendingPresentationProposals } from './presentationProposal.ts';
import { executionRoutes, buildRouteQuestionnaire } from './executionRoutes.ts';

const base = `library "L".\nconcept "Complaint":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is \`complaint\`.\n- shape reduction is most recent.\n`;
const presentation = `\npresentation for "Complaint":\n- question text is "Which complaint?".\n- question description is "Select one.".\n`;
test('wording proposal preserves baseline, validates new CRL, and writes only into MV', () => {
  const root = mkdtempSync(join(tmpdir(),'mv-cards-')), src=join(root,'src'), file=join(src,'crl','policy.crl');
  mkdirSync(join(src,'crl'),{recursive:true}); writeFileSync(file,base+presentation);
  try {
    const target=resolveWordingTarget(file,base+presentation,'Complaint'); assert.ok(target);
    const proposal=createPresentationProposal(target,'Tell us the complaint','New guidance',src,{caseId:'c',routeId:'r',unsavedBaseline:false});
    assert.equal(proposal.fields.length,2); assert.equal(buildCRL(proposal.proposedSource).success,true);
    assert.match(proposal.proposedSource,/Tell us the complaint/); assert.match(proposal.proposedSource,/New guidance/);
    const path=savePresentationProposal(src,proposal); assert.ok(path.startsWith(join(src,'medical-validation','crl-patches')));
    assert.equal(readFileSync(file,'utf8'),base+presentation); assert.deepEqual(readdirSync(src).sort(),['crl','medical-validation']);
    assert.throws(()=>savePresentationProposal(src,proposal),/exist/i);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('missing presentation creates a validated default proposal, without accepting blank/unrepresentable text',()=>{
  const src=resolve('test-policy/src'), target=resolveWordingTarget(join(src,'crl/policy.crl'),base,'Complaint'); assert.ok(target);
  const make=(t,d='')=>createPresentationProposal(target,t,d,src,{caseId:'c',routeId:'r',unsavedBaseline:true});
  assert.match(make('What is the complaint?').proposedSource,/presentation for "Complaint"/);
  assert.equal(make('A "quoted" question').baseline.unsaved,true);
  assert.throws(()=>make(''),/required/); assert.throws(()=>make('Back`tick'),/represented/);
  assert.throws(()=>make('Complaint'),/no wording changes/i);
  assert.equal(resolveWordingTarget('x.crl',base.replace('- code is `complaint`.',''),'Complaint'),undefined);
});
test('cards show a coded selected answer rather than qualification Boolean, without rewriting the case',()=>{
  const sv={decision:{libraryName:'L'},conceptTruth:[],conceptValues:[{libraryName:'L',name:'Complaint',answerValue:{type:'CodeableConcept',value:{coding:[{code:'visual',display:'Visual interference'}]}}}]};
  const before=JSON.stringify(sv);
  const q={questions:[{nodeId:'w',conceptName:'Complaint',libraryName:'L',answer:'yes',isInferred:false}]};
  const {cards}=buildRouteCards(q,sv,()=> 'node',()=>({questionText:'Complaint?',questionDescription:'',editable:false}));
  assert.equal(cards[0].value,'Visual interference'); assert.equal(cards[0].determination,'True'); assert.equal(JSON.stringify(sv),before);
  assert.equal(formatAnswer({type:'Quantity',value:{value:25,unit:'kg/m2'}}),'25 kg/m2');
});
test('scoped text and inherited description retain different owners in the patch',()=>{
  const src=resolve('test-policy/src');
  const source=base+presentation+`\nactivity "Met":\n- request CPGCommunicationRequest.\ndecision "D":\n- when "Complaint" then recommend activity "Met".\npresentation for "Complaint":\n- in decision "D".\n- question text is "Scoped complaint?".\n`;
  const target=resolveWordingTarget(join(src,'crl/policy.crl'),source,'Complaint',{decision:'D',criteria:new Set()});
  assert.ok(target); assert.equal(target.questionText,'Scoped complaint?'); assert.equal(target.questionDescription,'Select one.');
  assert.notDeepEqual(target.owners.questionText.location,target.owners.questionDescription.location);
  const p=createPresentationProposal(target,'New scoped question','New shared description',src,{caseId:'c',routeId:'r',unsavedBaseline:false});
  assert.equal(p.fields[0].declaration.contexts[0].kind,'decision'); assert.equal(p.fields[1].declaration.contexts.length,0);
});
test('real Bleph execution exposes selected coded publication values',()=>{
  const cm=buildExecutionModel(resolveCelImports(resolve('packages/crl/test/acceptance/bleph/src/cel/completed.cel')));
  assert.ok(cm.scenarios.scenarios.length,JSON.stringify(cm.scenarios.errors));
  const values=cm.scenarios.scenarios.flatMap(s=>s.conceptValues??[]).filter(v=>v.answerValue?.type==='CodeableConcept');
  assert.ok(values.length,'Bleph coded answers must be carried from actual CRE publication selection');
  assert.ok(values.some(v=>formatAnswer(v.answerValue)?.length));
});


test('imported presentation wording comes from the graph even when the owner is not editable',()=>{
  const root=mkdtempSync(join(tmpdir(),'mv-imported-')), file=join(root,'external.crl');
  try {
    writeFileSync(file,base+presentation);
    const entry={filePath:file,ast:buildCRL(base+presentation).result};
    const sources=graphWordingSources({crlRegistry:{byNameLocal:new Map(),byNamePackage:new Map([['L',entry]])},resolvedLibraryPaths:new Set([file])});
    const source=sources.get('L'); assert.ok(source);
    const target={...resolveWordingTarget(source.filePath,source.source,'Complaint'),editable:false};
    const q={questions:[{nodeId:'w',conceptName:'Complaint',libraryName:'L',answer:'yes',isInferred:false}]};
    const built=buildRouteCards(q,{decision:{libraryName:'L'}},()=> 'node',()=>target);
    assert.equal(built.cards[0].text,'Which complaint?'); assert.equal(built.cards[0].description,'Select one.');
    assert.equal(built.cards[0].editable,false); assert.equal(built.targets.size,0);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('an available value cannot disguise an invalidated unknown determination',()=>{
  const sv={status:'pass',decision:{libraryName:'L',name:'D'},conceptTruth:[],conceptValues:[{libraryName:'L',name:'Complaint',answerValue:{type:'boolean',value:true}}],
    tree:[{nodeId:'w',kind:'when',evaluated:true,invalidated:true,condition:{satisfied:true,expr:{op:'ref',concept:{name:'Complaint',libraryName:'L'},satisfied:true}},children:[]}]};
  const q=buildRouteQuestionnaire(sv,{nodeIds:['w'],nodeKeys:['key:w'],gaps:[],terminalKind:'error'},()=>['boolean'],'L');
  assert.equal(q.questions[0].answer,'unknown');
  const card=buildRouteCards(q,sv,()=> 'node',()=>({questionText:'Complaint?',questionDescription:'',editable:false})).cards[0];
  assert.equal(card.determination,'Unknown'); assert.match(card.value,/Determination: Unknown/); assert.match(card.value,/Available value: Yes/);
});
test('pending and malformed MV patches prevent completion, explicit dispositions clear the gate',()=>{
  const root=mkdtempSync(join(tmpdir(),'mv-pending-')), dir=join(root,'medical-validation','crl-patches'); mkdirSync(dir,{recursive:true});
  try {
    writeFileSync(join(dir,'a.crl.patch.json'),JSON.stringify({id:'a',schemaVersion:1,kind:'crl-presentation-patch',status:'proposed'}));
    writeFileSync(join(dir,'bad.crl.patch.json'),'{');
    assert.deepEqual(pendingPresentationProposals(root),{pending:1,unreadable:1});
    writeFileSync(join(dir,'a.crl.patch.json'),JSON.stringify({id:'a',schemaVersion:1,kind:'crl-presentation-patch',status:'rejected'}));
    assert.deepEqual(pendingPresentationProposals(root),{pending:0,unreadable:1});
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('adding a missing description stays in the existing scoped presentation',()=>{
  const src=resolve('test-policy/src');
  const source=base+presentation.replace('- question description is "Select one.".','')+`\nactivity "Met":\n- request CPGCommunicationRequest.\ndecision "D":\n- when "Complaint" then recommend activity "Met".\npresentation for "Complaint":\n- in decision "D".\n- question text is "Scoped complaint?".\n`;
  const target=resolveWordingTarget(join(src,'crl/policy.crl'),source,'Complaint',{decision:'D',criteria:new Set()}); assert.ok(target);
  const p=createPresentationProposal(target,'Scoped complaint?','New scoped guidance',src,{caseId:'c',routeId:'r',unsavedBaseline:false});
  assert.equal(p.fields[0].declaration.contexts[0].kind,'decision');
  assert.equal(buildCRL(p.proposedSource).result.presentations.length,2);
});

test('Bleph route includes coded supporting answers behind qualification helpers',()=>{
  const graph=resolveCelImports(resolve('packages/crl/test/acceptance/bleph/src/cel/completed.cel')), cm=buildExecutionModel(graph), sv=cm.scenarios.scenarios[0];
  const route=executionRoutes(sv,cm.crlStructure)[0];
  const key=(lib,name)=>nodeKey(conceptDeclRef(lib,name)), concepts=new Map(cm.conceptLayer.map(c=>[c.nodeKey,c]));
  const q=buildRouteQuestionnaire(sv,route,(lib,name)=>concepts.get(key(lib,name))?.valueTypes??[],sv.decision.libraryName,{conceptShape:(lib,name)=>cm.conceptShape.get(key(lib,name)),defExpr:(lib,name)=>cm.defExpr.get(key(lib,name))});
  const built=buildRouteCards(q,sv,()=> 'owner',()=>undefined,(lib,name)=>concepts.get(key(lib,name))?.answerOptions??[],definitionValueInputs(cm.conceptLayer),(lib,name)=>!!concepts.get(key(lib,name))?.hasLocalCode);
  assert.ok(built.cards.every(c=>concepts.get(key(c.library,c.concept))?.hasLocalCode),'only answerable Case Features');
  assert.equal(new Set(built.cards.map(c=>c.library+':'+c.concept)).size,built.cards.length,'no duplicate question on one owner');
  for(const name of ['Functional Or Reconstructive Surgical Indication','Documented Patient Complaint','Photographic Demonstration Submitted','Visual Field Demonstration Submitted']) {
    const card=built.cards.find(c=>c.concept===name);assert.ok(card,name);assert.ok(card.value.length);assert.notEqual(card.value,'Determination: True');assert.equal(card.determination,'');
  }
});
test('helper dependencies stop at coded answers and never follow representation projectors',()=>{
  const leaf={nodeKey:'q',name:'Question',lib:'L',hasLocalCode:true,definitionKind:'definition-is',definitionRefs:['unrelated']};
  const helper={nodeKey:'h',name:'Helper',lib:'L',hasLocalCode:false,definitionKind:'definition-is',hasValueProjection:true,definitionRefs:['q']};
  const inputs=definitionValueInputs([helper,leaf]);assert.deepEqual(inputs('L','Helper'),[]);assert.deepEqual(inputs('L','Question'),[]);
});

test('a coded inferred question retains its computed Quantity answer',()=>{
  const sv={decision:{libraryName:'L'},conceptValues:[{libraryName:'L',name:'BMI',answerValue:{type:'Quantity',value:{value:31.5,unit:'kg/m2'}}}]};
  const q={questions:[{nodeId:'w',conceptName:'BMI',libraryName:'L',answer:'yes',isInferred:true}]};
  const target={questionText:'What is the BMI?',questionDescription:'',editable:false};
  const card=buildRouteCards(q,sv,()=> 'node',()=>target).cards[0];assert.equal(card.value,'31.5 kg/m2');
});

test('question eligibility and raw values do not depend on a presentation target',()=>{
 const sv={decision:{libraryName:'L'},conceptValues:[{libraryName:'L',name:'BMI',answerValue:{type:'Quantity',value:{value:31.5,unit:'kg/m2'}}}]};
 const q={questions:[{nodeId:'w',conceptName:'BMI',libraryName:'L',answer:'yes',isInferred:true},{nodeId:'composite',conceptName:'Both',libraryName:'L',answer:'yes',isInferred:true}]};
 const built=buildRouteCards(q,sv,id=>id,()=>undefined,()=>[],()=>[],(lib,name)=>name==='BMI');
 assert.equal(built.cards.length,1);assert.equal(built.cards[0].value,'31.5 kg/m2');assert.equal(built.cards[0].text,'BMI');assert.equal(built.cards[0].editable,false);
});
