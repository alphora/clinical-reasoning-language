// REFACTOR:grounded: source paths, rather than test enumeration, define the table.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutionModel, resolveCelImports } from '@smile-digital-health/crl';
import { sharedDecisionSource } from '../../crl/src/authoring-kit/decisionExamples.ts';
import { buildDecisionTable } from './decisionTableModel.ts';
import { executionRoutes } from './executionRoutes.ts';

const node=(key,kind,children=[],extra={})=>({nodeKey:key,nodeId:key,lib:'L',decision:'D',kind,label:key,refKeys:[],location:{},children,...extra});
const leaf=key=>node(key,'action',[],{actionKind:'recommend-activity',refKeys:['activity:'+key]});
const dec=(key,children,extra={})=>({nodeKey:key,lib:'L',decision:key,location:{},children,...extra});
const reach=(caseId,terminalId,nodeKeys,extra={})=>({caseId,route:{terminalId,label:terminalId,nodeKeys,nodeIds:[],gaps:[],terminalKind:'produced',...extra}});
const simple=()=>[dec('D',[node('w','when',[leaf('yes')]),node('no','otherwise',[leaf('no-leaf')])],{childrenQualifier:'first'})];
const complete=()=>[reach('yes case','yes',['D','w','yes']),reach('no case','no-leaf',['D','w','no','no-leaf'])];

test('enumerates modeled missing branches and associates several cases without fabricated answers',()=>{
 const entries=complete(),model=buildDecisionTable(simple(),[entries[0],{...entries[0],caseId:'another'},reach('paused','no-leaf',['D','no-leaf'],{terminalKind:'paused'})],{nodeKey:'D'});
 assert.equal(model.totalRows,2n);assert.equal(model.uncoveredRows,1n);
 const [yes,no]=model.rows();assert.deepEqual(yes.cases.map(c=>c.caseId),['yes case','another']);assert.equal(yes.error,undefined);
 assert.match(no.error,/Coverage error/);assert.deepEqual(no.cases,[]);
 assert.deepEqual(model.rows(-1n),[]);assert.deepEqual(model.rows(2n),[]);
});

test('scope/depth navigation preserves exact terminal identity, and rejects stale context',()=>{
 const entries=complete(),model=buildDecisionTable(simple(),entries,{nodeKey:'w'});
 assert.equal(model.totalRows,2n);assert.equal(model.parent.nodeKey,'D');assert.deepEqual(model.children.map(c=>[c.scope.nodeKey,c.count]),[['yes',1n],['no-leaf',1n]]);
 const row=model.rows()[1],scope=model.scopeForCase(entries[1],'no-leaf'),terminal=buildDecisionTable(simple(),entries,scope);
 assert.equal(terminal.totalRows,1n);assert.equal(terminal.rows()[0].id,row.id);
 assert.equal(model.underlyingRow(row.id).id,row.id);assert.equal(model.underlyingRow('bad'),undefined);
 assert.match(buildDecisionTable(simple(),entries,{nodeKey:'w',rootKey:'D',path:['D','yes','w']}).error,/unavailable/);
});

test('gaps and runtime errors do not cover outcomes; valid traces can cover a failed expectation',()=>{
 for(const extra of [{terminalKind:'error'},{terminalKind:'blocked'},{gaps:['unmapped']}]){
  assert.equal(buildDecisionTable(simple(),[reach('bad','yes',['D','w','yes'],extra)],{nodeKey:'D'}).uncoveredRows,2n);
 }
 assert.equal(buildDecisionTable(simple(),[complete()[0]],{nodeKey:'yes'}).uncoveredRows,0n);
});

test('shared decision evidence respects the caller but can be inspected on the shared definition',()=>{
 const call=key=>node(key,'action',[],{actionKind:'use-decision',refKeys:['Shared']});
 const structure=[dec('D',[call('a'),call('b')],{childrenQualifier:'all'}),dec('Shared',[leaf('end')])];
 const entry=reach('one call','a/end',['D','a','Shared','end']);
 const model=buildDecisionTable(structure,[entry],{nodeKey:'D'});
 assert.equal(model.totalRows,2n);assert.equal(model.uncoveredRows,1n);assert.equal(model.rows()[0].cases[0],entry);assert.match(model.rows()[1].error,/Coverage/);
 assert.equal(buildDecisionTable(structure,[entry],{nodeKey:'Shared'}).uncoveredRows,0n);
 const b=buildDecisionTable(structure,[entry],{nodeKey:'Shared',rootKey:'D',path:['D','b','Shared']});
 assert.equal(b.totalRows,1n);assert.equal(b.rows()[0].runtimeTerminalId,'b/end');assert.equal(b.rows()[0].cases.length,0);
});

test('uncertainty folds only covered paths, preserves IDs and forces hidden coverage errors visible',()=>{
 const structure=[dec('D',[node('u','when',[leaf('uncertain')],{uncertaintyGuard:{passWhen:false},refKeys:['uncertainty']}),node('otherwise','otherwise',[leaf('met')])],{childrenQualifier:'first'})];
 const entries=[reach('u','uncertain',['D','u','uncertain']),reach('m','met',['D','u','otherwise','met'])];
 const folded=buildDecisionTable(structure,entries,{nodeKey:'D'}),expanded=buildDecisionTable(structure,entries,{nodeKey:'D'},{expanded:new Set(['u'])});
 assert.equal(folded.underlyingRows,2n);assert.equal(folded.totalRows,1n);assert.equal(expanded.totalRows,2n);
 assert.equal(folded.rows()[0].id,expanded.rows()[1].id);assert.equal(folded.underlyingRow(expanded.rows()[0].id).cases[0].caseId,'u');
 assert.deepEqual(folded.children.map(c=>[c.scope.nodeKey,c.count]),[['met',1n]]);
 assert.equal(buildDecisionTable(structure,entries,folded.children[0].scope).rows()[0].id,folded.rows()[0].id);
 const expandedGuard=buildDecisionTable(structure,entries,expanded.children[0].scope,{expanded:new Set(['u'])});
 assert.deepEqual(expandedGuard.children.map(c=>[c.scope.nodeKey,c.count]),[['uncertain',1n],['met',1n]]);
 const missing=buildDecisionTable(structure,[entries[1]],{nodeKey:'D'});
 assert.equal(missing.totalRows,2n);assert.equal(missing.uncoveredRows,1n);assert.deepEqual(missing.forcedGuards,['u']);assert.match(missing.rows()[0].error,/Coverage/);
 assert.equal(buildDecisionTable(structure,entries,{nodeKey:'uncertain'}).totalRows,1n);
});

test('parallel sibling activities count separately; unsupported nested actions and cycles are explicit errors',()=>{
 const structure=[dec('D',[leaf('a'),leaf('b')],{childrenQualifier:'all'})];
 assert.equal(buildDecisionTable(structure,[],{nodeKey:'D'}).totalRows,2n);
 const unsupported=buildDecisionTable([dec('D',[{...leaf('a'),children:[leaf('b')]}])],[],{nodeKey:'D'});
 assert.match(unsupported.rows()[0].error,/nested source/);
 const cycle=[dec('D',[node('call','action',[],{actionKind:'use-decision',refKeys:['D']})])];
 assert.match(buildDecisionTable(cycle,[],{nodeKey:'D'}).error,/Circular/);
 const missing=[dec('D',[node('call','action',[],{actionKind:'use-decision',refKeys:['missing']})])];
 assert.match(buildDecisionTable(missing,[],{nodeKey:'D'}).rows()[0].error,/delegated decision/);
});

test('real Bleph has seven covered underlying paths and six compact rows, with exact deeper counts',()=>{
 const file=fileURLToPath(new URL('../../../examples/bleph-medical-validation/src/cel/mv/medical-validation.cel',import.meta.url));
 const cm=buildExecutionModel(resolveCelImports(file));assert.equal(cm.scenarios.scenarios.length,18);
 const entries=cm.scenarios.scenarios.flatMap(s=>executionRoutes(s,cm.crlStructure).map(route=>({caseId:s.case.name,route})));
 const root=cm.crlStructure.find(d=>d.decision.includes('Blepharoplasty And'))??cm.crlStructure[0];
 const before=JSON.stringify(cm.crlStructure),model=buildDecisionTable(cm.crlStructure,entries,{nodeKey:root.nodeKey});
 assert.equal(model.error,undefined);assert.equal(model.underlyingRows,7n);assert.equal(model.totalRows,6n);assert.equal(model.uncoveredRows,0n);assert.equal(model.rows().length,6);
 const counts=new Map();const walk=n=>{counts.set(n.label,buildDecisionTable(cm.crlStructure,entries,{nodeKey:n.nodeKey}).totalRows);n.children.forEach(walk);};root.children.forEach(walk);
 assert.equal(counts.get('when Cosmetic Surgical Purpose'),6n);assert.equal(counts.get('when Upper Blepharoplasty Under Review'),4n);
 assert.equal(counts.get('when Functional Necessity Documented'),5n);assert.equal(counts.get('when Upper Blepharoplasty Evidence'),2n);
 assert.equal(JSON.stringify(cm.crlStructure),before);
});

test('depth24 authored DAG counts over fifty million paths and retrieves bounded distant pages',()=>{
 const root=mkdtempSync(join(tmpdir(),'crl-decision-table-'));
 try{
  mkdirSync(join(root,'src/crl'),{recursive:true});const source=join(root,'src/crl/policy.crl');writeFileSync(source,sharedDecisionSource(24));
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'decision-table-fixture',version:'1.0.0',crl:{canonicalBase:'https://example.org/decision-table'}}));
  const cel=join(root,'cases.cel');writeFileSync(cel,'library "Cases".\ncovers "Shared".\n');
  // Build the canonical structure through the same resolver used by the viewer.
  const cm=buildExecutionModel(resolveCelImports(cel));
  assert.equal(cm.crlStructure.length,25);
  const model=buildDecisionTable(cm.crlStructure,[],{nodeKey:cm.crlStructure[0].nodeKey});
  assert.equal(model.totalRows,3n*2n**24n-1n);assert.equal(model.uncoveredRows,model.totalRows);
  assert.equal(model.rows(0n,100).length,20);const last=model.rows(model.totalRows-1n);assert.equal(last.length,1);
  assert.notEqual(last[0].id,model.rows()[0].id);assert.equal(model.underlyingRow(last[0].id).id,last[0].id);
 }finally{rmSync(root,{recursive:true,force:true});}
});
