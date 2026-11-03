import assert from 'node:assert/strict';
import { test } from 'vitest';
import { projectFlowStructure } from './flowProjection.ts';
import { foldUncertaintyGuards, uncertaintyGuardCandidates, forcedUncertaintyVisibility, addUncertaintyDisclosureKeys, flaggedUncertaintyGuards } from './uncertaintyGuardDisplay.ts';
import { renderFlowPane } from './flowPaneHtml.ts';
import { renderFlowSnapshotDocument } from './flowSnapshotHtml.ts';

// REFACTOR:grounded: display shortcuts retain parent-edge truth and original source identity.
const node=(nodeKey,kind,children=[],extra={})=>({nodeKey,nodeId:nodeKey,kind,label:nodeKey,lib:'L',decision:'D',refKeys:[],children,location:{},...extra});
const leaf=(key,label=key)=>node(key,'action',[],{label,actionKind:'recommend-activity',refKeys:['activity:'+key]});
const guard=(key='u',passWhen=false)=>node(key,'when',[leaf(key+'-yes','not-certify.Unmet')],{refKeys:['uncertainty'],childrenQualifier:'first',uncertaintyGuard:{passWhen,target:{lib:'L',name:'Guard',kind:'concept'}}});
const decision=(children)=>({nodeKey:'D',lib:'L',decision:'D',location:{},childrenQualifier:'first',children});
const tree=(g=guard())=>[decision([g,node('fallback','otherwise',[leaf('u-no','certify.Met')])])];
const projected=()=>projectFlowStructure(tree());
const keys=structure=>{const result=[];const walk=n=>{result.push(n.nodeKey);n.children.forEach(walk);};structure.forEach(d=>d.children.forEach(walk));return result;};

test('opposite polarity shortcut retains the parent Yes edge and immutable source',()=>{
  const subtree=projected()[0].children[0];subtree.incomingOutcome='Yes';
  const full=[decision([node('a','when',[subtree],{refKeys:['a']})])],before=JSON.stringify(full);
  const folded=foldUncertaintyGuards(full,{}),promoted=folded.structure[0].children[0].children[0];
  assert.equal(promoted.nodeKey,'u-no');assert.equal(promoted.incomingOutcome,'Yes');
  assert.equal(JSON.stringify(full),before);assert.deepEqual([...folded.controls.keys()],['u-no']);
});
test('explicit polarity and labels stay independent, including negated occurrence metadata',()=>{
  const full=projectFlowStructure(tree(guard('u',true)));full[0].children[0].incomingOutcome='No';
  const folded=foldUncertaintyGuards(full,{});
  assert.equal(folded.structure[0].children[0].nodeKey,'u-yes');
  assert.equal(folded.structure[0].children[0].label,'not-certify.Unmet');
  assert.equal(folded.structure[0].children[0].incomingOutcome,'No');
});
test('user expansion and forced full evidence restore original branches without changing identities',()=>{
  const full=projected();
  for(const state of [{expanded:new Set(['u'])},{forced:new Map([['u','case']])},{forced:new Map([['u','flag']])}]){
    const result=foldUncertaintyGuards(full,state);
    assert.deepEqual(result.structure,full);assert.deepEqual(result.disclosures.u,keys(full));
    assert(result.controls.get('u').expanded);
  }
});

test('manual nonpass collapse retains its actual terminal and enabled U for either pass polarity', () => {
  for (const passWhen of [false, true]) {
    const full = projectFlowStructure(tree(guard('u', passWhen)));
    full[0].children[0].incomingOutcome = 'Yes';
    const before = JSON.stringify(full);
    const candidate = uncertaintyGuardCandidates(full).get('u');
    const state = { forced: new Map([['u', 'case']]), collapsed: new Set(['u']) };
    const compact = foldUncertaintyGuards(full, state);
    assert.equal(compact.structure[0].children[0].nodeKey, candidate.nonpassTerminalKey);
    assert.equal(compact.structure[0].children[0].incomingOutcome, 'Yes');
    assert.equal(JSON.stringify(full), before);
    const rendered = renderFlowPane(tree(guard('u', passWhen)), { uncertaintyDisplay: state });
    assert(rendered.anchors[candidate.nonpassTerminalKey]);
    assert(!rendered.anchors[candidate.passTerminalKey]);
    assert.match(rendered.html, /aria-expanded="false" aria-disabled="false"/);
    const reopened = foldUncertaintyGuards(full, { ...state, expanded: new Set(['u']), collapsed: new Set() });
    assert.deepEqual(reopened.structure, full);
    for (const reason of ['flag', 'evidence']) {
      assert.deepEqual(foldUncertaintyGuards(full, { ...state, forced: new Map([['u', reason]]) }).structure, full);
    }
  }
});

test('nonpass collapse cannot omit a flag on the opposite ordinary terminal', () => {
  const candidates = uncertaintyGuardCandidates(projected());
  const retained = new Map([['u', candidates.get('u').nonpassTerminalKey]]);
  const owners = { ordinary: 'u-no', nonpass: 'u-yes' };
  assert(flaggedUncertaintyGuards(candidates, new Set(['ordinary']), owners, retained).has('u'));
  assert(!flaggedUncertaintyGuards(candidates, new Set(['nonpass']), owners, retained).has('u'));
});
test('unsupported, unmarked and ambiguous topologies remain complete',()=>{
  const cases=[];
  const unmarked=projected();delete unmarked[0].children[0].uncertaintyGuard;cases.push(unmarked);
  const additional=projected();additional[0].children[0].children.push(leaf('extra'));cases.push(additional);
  const guarded=projected();guarded[0].children[0].children[0].refKeys.push('additional-condition');cases.push(guarded);
  const delegation=projected();delegation[0].children[0].children[0].actionKind='use-decision';cases.push(delegation);
  const repeated=projected();repeated[0].children[0].children[0].nodeKey='u-no';cases.push(repeated);
  const nested=projected();nested[0].children[0].children[0].children=[leaf('later')];cases.push(nested);
  for(const full of cases){assert.equal(uncertaintyGuardCandidates(full).size,0);assert.deepEqual(foldUncertaintyGuards(full,{}).structure,full);}
});
test('two independent guards can disclose independently',()=>{
  const full=[...projected(),...projectFlowStructure([({...decision([guard('v'),node('fallback-v','otherwise',[leaf('v-no')])]),nodeKey:'E',decision:'E'})])];
  const result=foldUncertaintyGuards(full,{expanded:new Set(['u'])});
  assert(result.controls.get('u').expanded);assert.equal(result.controls.get('v-no').expanded,false);
  assert.deepEqual(Object.keys(result.disclosures),['u']);
});

const evidence=(extra={})=>({nodeId:'u',kind:'when',label:'u',source:{},evaluated:true,condition:{satisfied:false},...extra});
test('visibility distinguishes actual passing, unreached and nonpassing conditions',()=>{
  const candidates=uncertaintyGuardCandidates(projected());
  assert.equal(forcedUncertaintyVisibility(candidates).size,0);
  const context=tree=>({tree,status:'pass',resolve:id=>id});
  assert.equal(forcedUncertaintyVisibility(candidates,context([evidence()])).size,0);
  assert.equal(forcedUncertaintyVisibility(candidates,context([evidence({evaluated:false,condition:undefined})])).size,0);
  assert.equal(forcedUncertaintyVisibility(candidates,context([evidence({condition:{satisfied:true}})])).get('u'),'case');
});
test('unknown, invalidated, publication errors and evaluated-unavailable evidence all force full disclosure',()=>{
  const candidates=uncertaintyGuardCandidates(projected());
  for(const extra of [{unknown:true},{invalidated:true},{publicationErrors:[{code:'bad-input'}]},{condition:undefined}]){
    assert.equal(forcedUncertaintyVisibility(candidates,{tree:[evidence(extra)],status:'pass',resolve:id=>id}).get('u'),'evidence');
  }
  assert.equal(forcedUncertaintyVisibility(candidates,{tree:[],status:'error',resolve:id=>id}).get('u'),'evidence');
  for(const extra of [{publicationErrors:[{}]},{unknown:true},{condition:undefined},{}])assert.equal(forcedUncertaintyVisibility(candidates,{tree:[evidence(extra)],status:'pass',resolve:()=>undefined}).get('u'),'evidence');
});
test('route scoping excludes other executions; conflicting reached values remain visible',()=>{
  const candidates=uncertaintyGuardCandidates(projected()),tree=[evidence(),evidence({nodeId:'other',condition:{satisfied:true}})];
  assert.equal(forcedUncertaintyVisibility(candidates,{tree,status:'pass',resolve:()=> 'u',routeNodeIds:new Set(['u'])}).size,0);
  assert.equal(forcedUncertaintyVisibility(candidates,{tree,status:'pass',resolve:()=> 'u'}).get('u'),'evidence');
  assert.equal(forcedUncertaintyVisibility(candidates,{tree:[...tree].reverse(),status:'pass',resolve:()=> 'u'}).get('u'),'evidence');
  for (const extra of [{ unknown: true }, { invalidated: true }, { publicationErrors: [{}] }]) {
    const unavailable = evidence(extra), nonpass = evidence({ condition: { satisfied: true } });
    for (const order of [[unavailable, nonpass], [nonpass, unavailable]]) {
      assert.equal(forcedUncertaintyVisibility(candidates, { tree: order, status: 'pass', resolve: () => 'u' }).get('u'), 'evidence');
    }
  }
});
test('pin disclosure visibility does not modify the executed pin and ignores off-route guards',()=>{
  const pinned=['a','u','u-no'],before=[...pinned],visible=new Set(pinned);
  addUncertaintyDisclosureKeys(visible,pinned,{u:['u','fallback','u-yes','u-no'],offroute:['offroute','other']});
  assert(visible.has('u-yes'));assert(!visible.has('offroute'));assert.deepEqual(pinned,before);
});
test('renderer defaults remain full, explicit opt-in folds, and snapshot describes actual omission',()=>{
  const original=renderFlowPane(tree());assert(original.anchors.u);assert(original.anchors['u-yes']);
  const compact=renderFlowPane(tree(),{uncertaintyDisplay:{}});assert(!compact.anchors.u);assert(compact.anchors['u-no']);
  assert.match(compact.html,/data-flow-uncertainty-collapsed="1"/);assert.match(compact.html,/Show uncertainty check/);
  const expanded=renderFlowPane(tree(),{uncertaintyDisplay:{expanded:new Set(['u'])}});assert(expanded.anchors.u);assert(expanded.anchors['u-yes']);
  const exported=html=>renderFlowSnapshotDocument({flowHtml:html,styleCss:'',title:'Example'});
  assert.match(exported(compact.html),/Uncertainty checks are hidden in this snapshot/);
  assert(!exported(expanded.html).includes('Uncertainty checks are hidden in this snapshot'));
});
