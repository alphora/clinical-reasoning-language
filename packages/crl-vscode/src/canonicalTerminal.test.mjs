// REFACTOR:grounded: native raw bytes and actual source/CRE/table agree on local caller occurrences.
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {emitCrlBundle,emitCrlTwoLane,localCanonicalReview,localCanonicalHandoffs,resolveCelImports,buildCrlStructure,renderScenario,occurrencesOf} from '@smile-digital-health/crl';
import {nativeReviewRoutes,reviewCasesForRoute} from './interactiveReview.ts';
import {executionRoutes} from './executionRoutes.ts';
import {buildDecisionTable} from './decisionTableModel.ts';
import {collectDispositionLeafKeys,renderFlowPane} from './flowPaneHtml.ts';
import {readInteractiveResult,withLocalCanonicalResults} from './interactiveQuestionnaire.ts';
import {CANONICAL_TERMINAL_CRL,CANONICAL_TERMINAL_CEL} from '../../crl/src/authoring-kit/canonicalTerminalExample.ts';
const directory=new URL('../test/fixtures/canonical-terminal/',import.meta.url);
const policy=fileURLToPath(new URL('policy.crl',directory)),cel=fileURLToPath(new URL('cases.cel',directory));
const read=name=>JSON.parse(readFileSync(new URL(name,directory),'utf8'));
const evidence=read('evidence.json'),emitted=emitCrlBundle(policy,{date:'2026-11-22',sourceOrigins:true,localReview:true});
const graph=resolveCelImports(cel),structure=buildCrlStructure(graph),vm=renderScenario(graph);
const root=structure.find(d=>d.decision==='Root');
const target='https://example.org/rx-smoke/PlanDefinition/rx-smoke';
describe('canonical terminal source and native integration',()=>{
 // @kit canonical-decision-terminal:shared-native-example
 it('teaches the exact source and CEL bytes used by the native evidence',()=>{
  expect(CANONICAL_TERMINAL_CRL).toBe(readFileSync(policy,'utf8'));
  expect(CANONICAL_TERMINAL_CEL).toBe(readFileSync(cel,'utf8'));
 });
 it('matches preserved source/execution identities and exact native artifact bytes',()=>{
  expect(emitted.success,JSON.stringify(emitted.diagnostics)).toBe(true);
  expect(emitted.localReview.sourceDefinitionClosureSha256).toBe(evidence.sourceDefinitionClosureSha256);
  expect(emitted.localReview.executionDefinitionClosureSha256).toBe(evidence.executionDefinitionClosureSha256);
  for(const file of evidence.files)expect(createHash('sha256').update(readFileSync(new URL(file.file,directory))).digest('hex')).toBe(file.sha256);
 });
 it.each([['one',1],['both',2],['missing',0],['bad-value',0]])('joins %s native evidence to %i local handoffs', (name,count)=>{
  const native=read(name+'.json'),handoffs=localCanonicalHandoffs(native,'canonical-local',emitted.localReview);
  expect(handoffs).toHaveLength(count);
  const result=withLocalCanonicalResults({...readInteractiveResult(native),nativeResult:native},'canonical-local',emitted.localReview);
  expect(result.activities).toEqual(Array(count).fill(target));
  const routes=nativeReviewRoutes(native,'canonical-local',emitted.definitionOrigins,structure,emitted.localReview);
  expect(routes).toHaveLength(count);
  expect(routes.every(r=>r.keys&&!r.reason)).toBe(true);
  if(count){
   const scenario=vm.scenarios.find(s=>s.case.name===name);expect(scenario.status,JSON.stringify(scenario)).toBe('pass');
   const expected=executionRoutes(scenario,structure).filter(r=>r.terminalKind==='produced');
   expect(routes.map(r=>r.keys)).toEqual(expected.map(r=>r.nodeKeys));
  }
 });
 it('keeps caller paths separate in the table and verdict association',()=>{
  const entries=vm.scenarios.flatMap(s=>executionRoutes(s,structure).filter(r=>r.terminalKind==='produced').map(route=>({caseId:s.case.name,route})));
  const table=buildDecisionTable(structure,entries,{nodeKey:root.nodeKey});
  expect(table.totalRows).toBe(2n);const rows=table.rows();
  expect(rows[0].runtimeTerminalId).not.toBe(rows[1].runtimeTerminalId);
  expect(rows.every(r=>!r.error)).toBe(true);
  const routes=nativeReviewRoutes(read('both.json'),'canonical-local',emitted.definitionOrigins,structure,emitted.localReview);
  expect(routes[0].keys).not.toEqual(routes[1].keys);
  const oneOnly=entries.filter(e=>e.caseId==='one');
  expect(reviewCasesForRoute(routes[0].keys,oneOnly).caseIds).toEqual(['one']);
  expect(reviewCasesForRoute(routes[1].keys,oneOnly).caseIds).toEqual([]);
 });
 it('exposes a flaggable verdict leaf and no foreign navigation',()=>{
  const shared=structure.find(d=>d.decision==='Shared'),leaves=collectDispositionLeafKeys(structure);
  const refs=occurrencesOf(shared).filter(o=>o.isLeaf);expect(refs).toHaveLength(1);
  expect(refs[0].signature).toContain(target);expect(leaves.has(refs[0].nodeKey)).toBe(true);
  const rendered=renderFlowPane([shared]);expect(rendered.html).toContain('flow-pin');
  expect(rendered.html).not.toContain('data-flow-open-decision=');
 });
 it.each(['missing-condition','false-result','wrong-caller','wrong-reference-type','duplicate-group','error'])('refuses incomplete or ambiguous %s evidence', mode=>{
  const native=read('one.json');const resources=[];const visit=v=>{if(!v||typeof v!=='object')return;if(v.resourceType)resources.push(v);Object.values(v).forEach(visit);};visit(native);
  const group=resources.find(r=>r.resourceType==='RequestGroup'&&r.id==='canonical-local');
  if(mode==='missing-condition')delete group.action[0].condition;
  if(mode==='false-result')group.action[0].condition[0].extension[0].valueBoolean=false;
  if(mode==='wrong-caller')group.action[0].id='unknown';
  if(mode==='wrong-reference-type')group.action[0].resource.reference='Task/'+group.action[0].resource.reference;
  if(mode==='duplicate-group')native.parameter.push({resource:structuredClone(group)});
  if(mode==='error')native.parameter.push({resource:{resourceType:'OperationOutcome',issue:[{severity:'error',code:'exception'}]}});
  expect(localCanonicalHandoffs(native,'canonical-local',emitted.localReview)).toEqual([]);
 });
 it('changes no production canonical or ordinary local delegation when projecting',()=>{
  const two=emitCrlTwoLane(policy,{date:'2026-11-22'}),before=JSON.stringify(two.fhir.resources);
  const review=localCanonicalReview(two.fhir.resources,Object.fromEntries(two.cqlLibraries.map(c=>[c.outputFilename,c.cql])));
  expect(JSON.stringify(two.fhir.resources)).toBe(before);
  expect(before).toContain(target);expect(JSON.stringify(review.definitions)).not.toContain(target);
  for(const a of review.projection.actions.filter(a=>a.kind==='local-decision'))expect(JSON.stringify(review.definitions)).toContain(a.target);
 });
});
