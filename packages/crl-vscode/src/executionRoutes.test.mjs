import assert from 'node:assert/strict';
import { executionRoutes, routeScenario } from './executionRoutes.ts';
import { buildQuestionnaire } from './questionnaireModel.ts';
// REFACTOR:grounded: route evidence must not inherit another branch's recommendation.

const action = (id, label, extra = {}) => ({ nodeId:id, kind:'action', label, evaluated:true, action:{ actionKind:'recommend-activity', produced:true, target:{name:label} }, ...extra });
const when = (id, name, value, children=[]) => ({ nodeId:id, kind:'when', label:name, evaluated:true,
  condition:{ satisfied:value, expr:{op:'ref',concept:{name,libraryName:'L'},satisfied:value} }, children });

test('an invalid prefix cannot be presented as a successful route',()=>{
  const {sv,structure}=fixture([{...when('w','A',true,[action('w/a','Met')]), invalidated:true}]);
  const [r]=executionRoutes(sv,structure); assert.equal(r.terminalKind,'error'); assert.equal(r.activity,undefined);
});
test('an unknown prefix cannot be presented as a successful route',()=>{
  const {sv,structure}=fixture([{...when('w','A',undefined,[action('w/a','Met')]), unknown:true}]);
  const [r]=executionRoutes(sv,structure); assert.equal(r.terminalKind,'paused'); assert.equal(r.activity,undefined);
});
function fixture(nodes, qualifier='all') {
  const shape = ns => ns.map(n => ({ ...n, nodeKey:'key:'+n.nodeId, lib:'L', decision:'D', children:shape(n.children??[]) }));
  return { sv:{status:'pass',tree:nodes,decision:{name:'D',libraryName:'L'},conceptTruth:[]},
    structure:[{lib:'L',decision:'D',nodeKey:'root',childrenQualifier:qualifier,children:shape(nodes)}] };
}
// @kit mv-case-authoring:parallel-routes
test('parallel terminal occurrences inspect separately without changing the original case',()=>{
  const {sv,structure}=fixture([when('when[0]','A',true,[action('when[0]/action[0]','X')]),when('when[1]','B',true,[action('when[1]/action[0]','Y')])]);
  const before=JSON.stringify(sv), routes=executionRoutes(sv,structure);
  assert.equal(routes.length,2);
  assert.deepEqual(routes.map(r=>r.nodeKeys),[['root','key:when[0]','key:when[0]/action[0]'],['root','key:when[1]','key:when[1]/action[0]']]);
  assert.deepEqual(routes.map(r=>buildQuestionnaire(routeScenario(sv,r),()=>['boolean'],'L').questions.map(q=>q.conceptName)),[['A'],['B']]);
  assert.equal(JSON.stringify(sv),before);
});
// @kit mv-case-authoring:prerequisites
test('first route retains earlier No prerequisites but omits skipped later data',()=>{
  const {sv,structure}=fixture([when('when[0]','A',false),when('when[1]','B',true,[action('when[1]/action[0]','X')]),{...when('when[2]','Extra',true),evaluated:false}],'first');
  sv.conceptTruth=[{libraryName:'L',name:'Extra',satisfied:true}];
  const routes=executionRoutes(sv,structure);
  assert.equal(routes.length,1);
  assert.deepEqual(buildQuestionnaire(routeScenario(sv,routes[0]),()=>['boolean'],'L').questions.map(q=>[q.conceptName,q.answer]),[['A','no'],['B','yes']]);
});
test('same activity at two occurrences has distinct route identity',()=>{
  const {sv,structure}=fixture([action('action[0]','X'),action('action[1]','X')]);
  assert.deepEqual(executionRoutes(sv,structure).map(r=>r.terminalId),['action[0]','action[1]']);
});
test('pause, invalidated prefix and guarded terminal do not become produced leaves',()=>{
  const unknown={...when('when[0]','Unknown',undefined),unknown:true};
  const invalid={...when('when[1]','Bad',false),invalidated:true};
  const blocked=action('action[2]','Y',{guardedOut:true,action:{produced:false},guard:{concept:{name:'Guard',libraryName:'L'},satisfied:false}});
  const {sv,structure}=fixture([unknown,invalid,blocked]);
  assert.deepEqual(executionRoutes(sv,structure).map(r=>r.terminalKind),['paused','error','blocked-guard']);
});
test('delegated occurrence retains only its reached caller and the target root',()=>{
  const child=action('action[1]/action[0]','X');
  const caller=id=>action(id,'Sub',{action:{actionKind:'use-decision',expanded:true,produced:false,target:{name:'Sub',libraryName:'Other'}},children:[{...child,nodeId:id+'/action[0]'}]});
  const {sv,structure}=fixture([{...caller('action[0]'),evaluated:false},caller('action[1]')]);
  structure[0].children.forEach(n=>n.children=[]);
  structure.push({lib:'Other',decision:'Sub',nodeKey:'subroot',children:[{nodeId:'action[0]',nodeKey:'subleaf',lib:'Other',decision:'Sub',children:[]}]});
  const [route]=executionRoutes(sv,structure);
  assert.deepEqual(route.nodeKeys,['root','key:action[1]','subroot','subleaf']);
  assert.deepEqual(route.gaps,[]);
});
test('missing structure mapping is a reported gap, never a fabricated path key',()=>{
  const {sv,structure}=fixture([action('action[0]','X')]);
  structure[0].children=[];
  const [route]=executionRoutes(sv,structure);
  assert.deepEqual(route.nodeKeys,['root']);assert.deepEqual(route.gaps,['action[0]']);
});

test('guarded-out deferred delegation retains its target root and guard route',()=>{
 const n=action('action[0]','Sub',{guardedOut:true,action:{actionKind:'use-decision',expanded:false,deferred:true,produced:false,target:{name:'Sub',libraryName:'Other'}}});
 const {sv,structure}=fixture([n]);
 structure.push({lib:'Other',decision:'Sub',nodeKey:'subroot',children:[]});
 const [route]=executionRoutes(sv,structure);
 assert.equal(route.terminalKind,'blocked-guard');
 assert.deepEqual(route.nodeKeys,['root','key:action[0]','subroot']);
 assert.deepEqual(route.gaps,[]);
});
