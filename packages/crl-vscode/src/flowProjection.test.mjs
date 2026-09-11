// REFACTOR:grounded: fallbacks retain identity without visible labels or extra columns.
import assert from 'node:assert/strict';
import { projectFlowBranches, conditionTruthKeys } from './flowProjection.ts';
import { renderFlowPane } from './flowPaneHtml.ts';
const n=(key,kind,children=[],extra={})=>({nodeKey:key,nodeId:key,kind,children,label:key,lib:'L',decision:'D',refKeys:[],location:{},...extra});
const a=key=>n(key,'action',[],{actionKind:'recommend-activity'});

test('first projects true bodies and false continuations without mutating source identities',()=>{
 const input=[n('A','when',[a('Met')]),n('B','when',[a('OtherMet')]),n('fallback','otherwise',[a('Unmet')])];
 const before=JSON.stringify(input),p=projectFlowBranches(input,'first');
 assert.equal(JSON.stringify(input),before);
 assert.equal(p.length,1);assert.equal(p[0].nodeKey,'A');
 assert.deepEqual(p[0].children.map(c=>[c.nodeKey,c.incomingOutcome]),[['Met','Yes'],['B','No']]);
 assert.deepEqual(p[0].children[1].children.map(c=>[c.nodeKey,c.incomingOutcome]),[['OtherMet','Yes'],['fallback','No']]);
 assert.equal(p[0].children[1].children[1].label,'No');
});
test('all remains parallel; first without otherwise has no invented false outcome',()=>{
 const input=[n('A','when',[a('one')]),n('B','when',[a('two')])];
 assert.equal(projectFlowBranches(input,'all').length,2);
 const p=projectFlowBranches(input,'first');assert.equal(p[0].children[1].nodeKey,'B');assert.equal(p[0].children[1].children.length,1);
 assert.equal(projectFlowBranches(input).length,2,'No metadata means retain source layout; do not guess an ordering');
});
test('nested first and multi-action fallback preserve every occurrence and invisible fallback identity',()=>{
 const structure=[{nodeKey:'D',decision:'D',lib:'L',location:{},childrenQualifier:'first',children:[n('A','when',[n('B','when',[a('same-one')]),n('inner','otherwise',[a('same-two'),a('same-three')])],{childrenQualifier:'first'}),n('outer','otherwise',[a('other')])]}];
 const r=renderFlowPane(structure);
 for(const key of ['D','A','B','same-one','inner','same-two','same-three','outer','other'])assert.ok(r.anchors[key],key);
 assert.equal(Object.values(r.reveals).filter(x=>x.nodeKey==='inner').length,1);
 assert.equal((r.html.match(/class="flow-row flow-fallback"/g)||[]).length,2);
 assert.doesNotMatch(r.html,/>otherwise</);assert.doesNotMatch(r.html,/>Yes</);assert.doesNotMatch(r.html,/>No</);
 assert.match(r.html,/data-flow-from="B" data-flow-to="same-two"/);
 assert.match(r.html,/data-flow-outcome="No" data-flow-condition="B"/);
 assert.match(r.html,/data-flow-parent="A"/);
});
test('condition truth requires reached runtime evidence, including unknown and guarded-action nonproduction',()=>{
 const nodes=[n('A','when',[n('guarded','action',[],{evaluated:true,guardedOut:true})],{evaluated:true,condition:{satisfied:true}}),n('B','when',[],{evaluated:false,condition:{satisfied:false}}),n('C','when',[],{evaluated:true,condition:{satisfied:false}}),n('U','when',[],{evaluated:true,unknown:true,condition:{}}),n('E','when',[],{evaluated:true,invalidated:true,condition:{satisfied:false}})];
 assert.deepEqual(conditionTruthKeys(nodes,id=>id),[{key:'A',result:'true'},{key:'C',result:'false'},{key:'U',result:'unknown'}]);
 assert.deepEqual(conditionTruthKeys(nodes,()=>undefined),[],'Unresolved delegated identity never paints a different occurrence');
});

test('fallback destinations align with true siblings, and outside pins fit the canvas',()=>{
 const r=renderFlowPane([{nodeKey:'D',decision:'D',lib:'L',location:{},childrenQualifier:'first',children:[n('A','when',[a('Met')]),n('o','otherwise',[a('Unmet')])]}]);
 const rect=key=>{const id=r.anchors[key].scrollTo;const m=r.html.match(new RegExp('<g id="'+id+'"[^>]*><title>[^<]*</title><rect x="([0-9]+)" y="([0-9]+)" width="([0-9]+)" height="([0-9]+)"'));assert.ok(m,key);return m.slice(1).map(Number)};
 const yes=rect('Met'),no=rect('Unmet');assert.equal(yes[0],no[0]);
 const size=r.html.match(/viewBox="0 0 ([0-9]+) ([0-9]+)"/).slice(1).map(Number);
 for(const b of [yes,no]) {assert.ok(b[0]+b[2]+28<=size[0]);assert.ok(b[1]-18>=0);}
 assert.doesNotMatch(r.html,/flow-truth-ring|flow-outcome-label/);
});
test('a false without an authored continuation has a terminal indicator, never an invented activity',()=>{
 const r=renderFlowPane([{nodeKey:'D',decision:'D',lib:'L',location:{},childrenQualifier:'all',children:[n('A','when',[a('Met')]),n('B','when',[a('OtherMet')])]}]);
 assert.equal((r.html.match(/class="flow-false-stop"/g)||[]).length,2);
 assert.deepEqual(Object.keys(r.anchors).sort(),['A','B','D','Met','OtherMet']);
});
