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
test('nested first and multi-action fallback preserve every occurrence and selectable No label',()=>{
 const structure=[{nodeKey:'D',decision:'D',lib:'L',location:{},childrenQualifier:'first',children:[n('A','when',[n('B','when',[a('same-one')]),n('inner','otherwise',[a('same-two'),a('same-three')])],{childrenQualifier:'first'}),n('outer','otherwise',[a('other')])]}];
 const r=renderFlowPane(structure);
 for(const key of ['D','A','B','same-one','inner','same-two','same-three','outer','other'])assert.ok(r.anchors[key],key);
 assert.equal(Object.values(r.reveals).filter(x=>x.nodeKey==='inner').length,1);
 assert.equal((r.html.match(/class="flow-row flow-fallback"/g)||[]).length,2);
 assert.doesNotMatch(r.html,/>otherwise</);assert.match(r.html,/>Yes</);assert.match(r.html,/>No</);
 assert.match(r.html,/data-flow-parent="A"/);
});
test('condition truth requires reached runtime evidence, including unknown and guarded-action nonproduction',()=>{
 const nodes=[n('A','when',[n('guarded','action',[],{evaluated:true,guardedOut:true})],{evaluated:true,condition:{satisfied:true}}),n('B','when',[],{evaluated:false,condition:{satisfied:false}}),n('C','when',[],{evaluated:true,condition:{satisfied:false}}),n('U','when',[],{evaluated:true,unknown:true,condition:{}}),n('E','when',[],{evaluated:true,invalidated:true,condition:{satisfied:false}})];
 assert.deepEqual(conditionTruthKeys(nodes,id=>id),[{key:'A',result:'true'},{key:'C',result:'false'},{key:'U',result:'unknown'}]);
 assert.deepEqual(conditionTruthKeys(nodes,()=>undefined),[],'Unresolved delegated identity never paints a different occurrence');
});
