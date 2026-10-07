import assert from 'node:assert/strict';
import { treeTraversal, treeTraversalSignature, terminalTraversals, treeFocusPaint } from './unpinnedTreeFocus.ts';
import { traversalRouteNeighbors } from './branchNavigation.ts';
import { renderFlowPane, toggleCriterionExpansion } from './flowPaneHtml.ts';
import { resolveCelSuite, buildSuiteExecutionModel, caseViewKey } from '@smile-digital-health/crl';
import { executionRoutes } from './executionRoutes.ts';
import { buildRuntimeRefIndex } from './failedCriterionPeek.ts';
import { resolveThisNode } from './thisNodeMarker.ts';
import { fileURLToPath } from 'node:url';

const ref = (name, satisfied) => ({op:'ref',concept:{name,libraryName:'L'},satisfied});
function evidence(caseId, a, b, facts = []) {
  const expr={op:'and',satisfied:a&&b,operands:[{...ref('A',a),facts},ref('B',b)]};
  const sv={decision:{libraryName:'L',name:'D'},tree:[{nodeId:'w',kind:'when',evaluated:true,condition:{expr,satisfied:a&&b},children:[{nodeId:'end',kind:'action',evaluated:true}]}]};
  const route={nodeIds:['w','end'],nodeKeys:['root','w','end'],terminalId:'end',gaps:[],terminalKind:'produced',label:'Unmet'};
  return treeTraversal(caseId,sv,route,id=>id);
}
const nodes={root:{parent:'',owner:'root'},w:{parent:'root',owner:'w'},end:{parent:'w',owner:'end',terminal:true},
  group:{parent:'w',owner:'w',outline:true,path:'0'},a:{parent:'group',owner:'w',outline:true,path:'0.0',concept:['L','A']},b:{parent:'group',owner:'w',outline:true,path:'0.1',concept:['L','B']},
  code:{parent:'a',owner:'w',outline:true,choice:true}};

test('renderer-backed criterion highlights nodes through logical parents, never operator labels',()=>{
 const concept=(name,extra={})=>({lib:'L',name,nodeKey:name,definitionRefs:[],...extra});
 const leaf=name=>({kind:'leaf',lib:'L',name,nodeKey:name,isSource:name!=='Helper',isInferred:name==='Helper'});
 const structure=[{lib:'L',decision:'D',nodeKey:'root',children:[{lib:'L',decision:'D',nodeKey:'w',kind:'when',label:'Criterion',refKeys:[],children:[]}]}];
 const expr={kind:'criterion',lib:'L',name:'Outer',bodyHash:'fixture',operand:{kind:'and',operands:[{kind:'not',operand:leaf('Helper')},leaf('A')]}};
 const opts={concepts:[concept('Helper',{definitionKind:'definition-is',definitionRefs:['A','B']}),concept('A',{hasLocalCode:true}),concept('B',{hasLocalCode:true})],guardOutlines:new Map([['w',{expr}]])};
 let expanded=toggleCriterionExpansion(new Set(),'w',structure,opts);
 const folded=renderFlowPane(structure,{...opts,expandedGuardWhens:expanded});
 for(const [key,n]of Object.entries(folded.focusNodes))if(n.path?.endsWith('.inputs'))expanded=toggleCriterionExpansion(expanded,key,structure,opts);
 const rendered=renderFlowPane(structure,{...opts,expandedGuardWhens:expanded});
 const paint=treeFocusPaint([],'w',rendered.focusNodes),all=Object.entries(rendered.focusNodes);
 const logic=all.filter(([,n])=>n.logic),inputs=all.filter(([,n])=>n.path?.endsWith('.inputs'));
 assert.equal(logic.length,2,'ALL OF and NOT exist in the actual renderer');assert.ok(inputs.length);
 for(const [key]of logic)assert.ok(!paint.nodeKeys.includes(key));
 for(const [key,n]of inputs){assert.ok(!n.logic);assert.ok(paint.nodeKeys.includes(key),'INPUT stays a highlighted node');}
 for(const name of ['A','B'])assert.ok(all.some(([key,n])=>n.concept?.[1]===name&&paint.nodeKeys.includes(key)),'question descendants remain connected through logic/INPUT');
});

test('failed ALL operands group into one display route without rewriting answers',()=>{
  const options=terminalTraversals([evidence('A false',false,true),evidence('B false',true,false)],'end');
  assert.equal(options.length,1);assert.equal(options[0].caseId,'A false');
  assert.deepEqual(options[0].operands.map(o=>o.result),['false','true']);
});
test('raw code and case-name differences add no traversal options',()=>{
  const options=terminalTraversals([evidence('code1',true,true,['Coding 1']),evidence('code2',true,true,['Coding 2'])],'end');
  assert.equal(options.length,1);assert.equal(options[0].caseId,'code1');
});
test('reached action guard polarity and truth survive grouped failed explanations',()=>{
  const make=(id,a,b,code)=>{
    const {route}=evidence(id,true,true);route.terminalKind='blocked-guard';
    const sv={decision:{libraryName:'L',name:'D'},tree:[{nodeId:'end',kind:'action',evaluated:true,
      guard:{polarity:'only-when',concept:{libraryName:'L',name:'G'},evaluated:true,satisfied:false,
        explanation:{op:'and',satisfied:false,operands:[{...ref('A',a),facts:[code]},ref('B',b)]}},children:[]}]};
    return treeTraversal(id,sv,route,id=>id);
  };
  const first=make('A false',false,true,'one'),duplicate=make('code-only',false,true,'two'),second=make('B false',true,false,'one');
  assert.equal(terminalTraversals([first,duplicate,second],'end').length,1);
  assert.deepEqual(first.guards,[{key:'end',polarity:'only-when',result:'false'}]);
  assert.deepEqual(first.conditions,[]); // Guard evidence is not a Yes/No branch connector.
  assert.deepEqual(first.operands.map(o=>[o.concept[1],o.result]),[['G','false'],['A','false'],['B','true']]);
});
test('unknown and explicit false retain different traversal evidence',()=>{
  const unknown=evidence('unknown',undefined,true),negative=evidence('false',false,true);
  assert.equal(terminalTraversals([unknown,negative],'end').length,1);
  assert.equal(unknown.operands[0].result,'unknown');assert.equal(negative.operands[0].result,'false');
});
test('nonterminal focuses every prefix but stops at the node, not its definition or result',()=>{
  const paint=treeFocusPaint([evidence('one',false,true),evidence('two',true,false)],'w',nodes);
  assert.deepEqual(paint.nodeKeys,['root','w']);assert.deepEqual(paint.operands,[]);assert.equal(paint.conditions.length,1);
});
test('Yes and No owners select all route nodes, never answer codes',()=>{
  const paint=treeFocusPaint([evidence('one',false,true)],'end',nodes);
  assert.ok(paint.nodeKeys.includes('a') && paint.nodeKeys.includes('b') && paint.nodeKeys.includes('end'));
  assert.ok(!paint.nodeKeys.includes('code'));
  assert.deepEqual(paint.operands,[{key:'a',result:'false'},{key:'b',result:'true'}]);
  const other=treeFocusPaint([evidence('two',true,true)],'end',nodes);
  assert.ok(other.nodeKeys.includes('b')&&other.nodeKeys.includes('a'));
});
test('outline focus includes ancestors but excludes its sibling and downstream result',()=>{
  const paint=treeFocusPaint([evidence('one',true,true)],'a',nodes);
  assert.deepEqual(new Set(paint.nodeKeys),new Set(['root','w','group','a']));
  assert.ok(!paint.nodeKeys.includes('end') && !paint.nodeKeys.includes('b'));
});
test('nonterminal unions different paths reaching a shared node',()=>{
  const first=evidence('first',true,true),second=evidence('second',true,true);
  first.route.nodeKeys=['root','earlier1','w','end'];second.route.nodeKeys=['root','earlier2','w','end'];
  assert.deepEqual(new Set(treeFocusPaint([first,second],'w',nodes).nodeKeys),new Set(['root','earlier1','earlier2','w']));
});
test('disclosure changes project the same options without changing traversal identity',()=>{
  const entries=[evidence('one',true,false),evidence('two',true,true)],options=terminalTraversals(entries,'end');
  const collapsed=Object.fromEntries(Object.entries(nodes).filter(([,n])=>!n.outline));
  assert.equal(options.length,1);assert.deepEqual(treeFocusPaint([options[0]],'end',collapsed).nodeKeys,['root','w','end']);
  assert.deepEqual(treeFocusPaint([options[0]],'end',nodes).operands,[{key:'a',result:'true'},{key:'b',result:'false'}]);
  assert.equal(terminalTraversals(entries,'end')[0].caseId,'one');
});
test('no execution evidence focuses structural ancestors, no fabricated traversal',()=>{
  assert.deepEqual(treeFocusPaint([],'a',nodes).nodeKeys,['a','group','w','root']);
  assert.deepEqual(terminalTraversals([],'end'),[]);assert.deepEqual(treeFocusPaint([],'code',nodes).nodeKeys,[]);
});

test('nonterminal criterion includes all its owned contents, excluding answers and downstream branches',()=>{
  const criterionNodes={...nodes,w:{...nodes.w,criterion:true}};
  const paint=treeFocusPaint([evidence('one',false,true)],'w',criterionNodes);
  assert.deepEqual(new Set(paint.nodeKeys),new Set(['root','w','group','a','b']));
  assert.equal(paint.nodeKeys.includes('code'),false);assert.equal(paint.nodeKeys.includes('end'),false);
  assert.deepEqual(new Set(treeFocusPaint([],'w',criterionNodes).nodeKeys),new Set(['root','w','group','a','b']));
});

test('nested criterion includes only its own subtree, with every ancestor retained without evidence',()=>{
  const nested={...nodes,group:{...nodes.group,criterion:true},
    inner:{parent:'a',owner:'w',outline:true,criterion:true},detail:{parent:'inner',owner:'w',outline:true,concept:['L','Detail']},
    sibling:{parent:'w',owner:'w',outline:true,criterion:true},siblingLeaf:{parent:'sibling',owner:'w',outline:true}};
  const paint=treeFocusPaint([],'group',nested);
  assert.deepEqual(new Set(paint.nodeKeys),new Set(['root','w','group','a','inner','detail','b']));
  assert.ok(!paint.nodeKeys.includes('code')&&!paint.nodeKeys.includes('sibling')&&!paint.nodeKeys.includes('siblingLeaf'));
});
test('repeated criterion references are hydrated for traversal identity',()=>{
  const entry=evidence('one',true,true),sv={decision:{libraryName:'L',name:'D'},tree:[
    {nodeId:'first',kind:'when',evaluated:true,condition:{satisfied:true,expr:{op:'criterion',criterion:{name:'C',libraryName:'L'},satisfied:true,body:ref('A',true)}}},
    {nodeId:'w',kind:'when',evaluated:true,condition:{satisfied:true,expr:{op:'criterion',criterion:{name:'C',libraryName:'L'},satisfied:true,reference:true}},children:[{nodeId:'end',kind:'action',evaluated:true}]},
  ]};
  assert.equal(treeTraversal('one',sv,entry.route,id=>id).operands[0].concept[1],'A');
});

function expressionEvidence(expr) {
  const route=evidence('fixture',true,true).route;
  return treeTraversal('fixture',{decision:{libraryName:'L',name:'D'},tree:[{nodeId:'w',kind:'when',evaluated:true,
    condition:{expr,satisfied:expr.satisfied},children:[{nodeId:'end',kind:'action',evaluated:true}]}]},route,id=>id);
}

test('No ALL/ANY owners select nodes and red connectors; unknown nodes stay blue without invented polarity',()=>{
 const groupNodes={...nodes,group:{...nodes.group,logic:true},not:{parent:'group',owner:'w',outline:true,logic:true},
   missingTrace:{parent:'group',owner:'w',outline:true,concept:['L','Trace missing']}};
 for(const op of ['and','or','sem-and','sem-or']){
   for(const satisfied of [false,undefined]){
   const entry=expressionEvidence({op,satisfied,operands:[ref('A',false),ref('B',undefined)]});
   const paint=treeFocusPaint([entry],'end',groupNodes);
   assert.ok(['a','b','missingTrace'].every(k=>paint.nodeKeys.includes(k)));
   assert.ok(!paint.nodeKeys.includes('group')&&!paint.nodeKeys.includes('not')&&!paint.nodeKeys.includes('code'));
   assert.deepEqual(new Set(paint.groupKeys),new Set(satisfied===false?['group','not']:[])); // DOM glow ignores NOT.
   assert.deepEqual(paint.groupOutcomes,satisfied===false?[{key:'group',result:'false'},{key:'not',result:'false'}]:[]);
   assert.deepEqual(entry.operands.map(o=>o.result),['false','unknown']);
   }
 }
});

test('a Yes ANY owner selects every group node, even false, unknown and trace-missing alternatives',()=>{
 const entry=expressionEvidence({op:'or',satisfied:true,operands:[ref('A',true),ref('B',undefined)]});
 const topology={...nodes,group:{...nodes.group,logic:true},missing:{parent:'group',owner:'w',outline:true,concept:['L','Missing trace']}};
 const paint=treeFocusPaint([entry],'end',topology);
 assert.ok(['a','b','missing'].every(k=>paint.nodeKeys.includes(k)));assert.deepEqual(paint.groupKeys,['group']);
 assert.equal(entry.operands[1].result,'unknown');
});

test('one terminal stop ignores ANY witnesses, guard states and different executed prefixes',()=>{
 const a=expressionEvidence({op:'or',satisfied:true,operands:[ref('A',true),ref('B',false)]});
 const b=expressionEvidence({op:'or',satisfied:true,operands:[ref('A',false),ref('B',true)]});
 b.caseId='other';b.route={...b.route,nodeKeys:['root','different-prefix','w','end'],terminalKind:'blocked-guard'};
 b.guards=[{key:'end',polarity:'unless',result:'unknown'}];
 const options=terminalTraversals([a,b],'end');
 assert.equal(options.length,1);assert.equal(options[0],a);assert.equal(treeTraversalSignature(a),treeTraversalSignature(b));
 assert.deepEqual(b.operands.map(o=>o.result),['false','true']);assert.equal(b.guards[0].result,'unknown');
});

test('large nested ANY sets remain one terminal stop without Cartesian display enumeration',()=>{
 const expr={op:'and',satisfied:true,operands:Array.from({length:20},(_,i)=>({op:'or',satisfied:true,operands:[ref('A'+i,true),ref('B'+i,true)]}))};
 const entry=expressionEvidence(expr);assert.equal(entry.operands.length,40);
 assert.equal(terminalTraversals([entry],'end').length,1);
});

test('ALL, ANY, unknown groups and NOT retain full actual operand evidence',()=>{
 for(const [op,satisfied,a,b] of [['or',true,true,false],['or',false,false,false],['and',undefined,undefined,true]]){
   const entry=expressionEvidence({op,satisfied,operands:[ref('A',a),ref('B',b)]});
   const paint=treeFocusPaint([entry],'end',nodes);
   assert.ok(paint.nodeKeys.includes('a')&&paint.nodeKeys.includes('b'));
   assert.deepEqual(paint.operands.map(o=>o.result),[a===undefined?'unknown':String(a),b===undefined?'unknown':String(b)]);
 }
 const not=expressionEvidence({op:'not',satisfied:true,operand:ref('A',false)});
 assert.equal(not.operands[0].result,'false');
});

test('mixed Yes and No criterion owners keep blue nodes and distinct connector outcomes',()=>{
 const entry=evidence('later failure',true,true);entry.route.nodeKeys=['root','w','later','end'];
 entry.conditions.push({key:'later',result:'false'});
 const topology={...nodes,group:{...nodes.group,logic:true},later:{parent:'w',owner:'later',criterion:true},
   end:{...nodes.end,parent:'later'},laterGroup:{parent:'later',owner:'later',outline:true,logic:true},
   laterA:{parent:'laterGroup',owner:'later',outline:true},laterB:{parent:'laterGroup',owner:'later',outline:true}};
 const paint=treeFocusPaint([entry],'end',topology);
 assert.ok(['root','w','a','b','later','end'].every(k=>paint.nodeKeys.includes(k)));
 assert.ok(['laterA','laterB'].every(k=>paint.nodeKeys.includes(k)));assert.deepEqual(new Set(paint.groupKeys),new Set(['group','laterGroup']));
 assert.deepEqual(paint.groupOutcomes,[{key:'group',result:'true'},{key:'laterGroup',result:'false'}]);
});

test('repeated concept positions preserve their actual outcomes while both nodes are selected',()=>{
  const entry=expressionEvidence({op:'or',satisfied:true,operands:[ref('A',true),ref('A',false)]});
  const repeated={...nodes,b:{...nodes.b,concept:['L','A']}};
  const paint=treeFocusPaint([entry],'end',repeated);
  assert.ok(paint.nodeKeys.includes('a')&&paint.nodeKeys.includes('b'));
  assert.deepEqual(paint.operands,[{key:'a',result:'true'},{key:'b',result:'false'}]);
});

test('absorbed direct concept explanation starts at zero, selecting all owned nodes but no answer codes',()=>{
  const entry=expressionEvidence({...ref('G',true),explanation:{op:'or',satisfied:true,operands:[ref('A',true),ref('B',false)]}});
  const direct={...nodes,w:{...nodes.w,path:'0',concept:['L','G']},
    input:{parent:'a',owner:'w',outline:true,path:'0.0.inputs'},inputLeaf:{parent:'input',owner:'w',outline:true,path:'0.0.inputs.0'},
    inactive:{parent:'a',owner:'w',outline:true,path:'0.0.c'},code:{...nodes.code,path:'0.0.o0'}};
  assert.deepEqual(entry.operands.map(o=>o.path),['0','0.0','0.1']);
  const paint=treeFocusPaint([entry],'end',direct);
  assert.ok(paint.nodeKeys.includes('w')&&paint.nodeKeys.includes('a')&&paint.nodeKeys.includes('input')&&paint.nodeKeys.includes('inputLeaf'));
  assert.ok(paint.nodeKeys.includes('b')&&paint.nodeKeys.includes('inactive')&&!paint.nodeKeys.includes('code'));
});

test('absorbed root and all nested criterion boundaries on the structural route are selected',()=>{
  const criterion=(name,body,satisfied)=>({op:'criterion',criterion:{name,libraryName:'L'},body,satisfied});
  const entry=expressionEvidence(criterion('Root',{op:'or',satisfied:true,operands:[criterion('Left',ref('A',true),true),criterion('Right',ref('B',false),false)]},true));
  const collapsed={...nodes,w:{...nodes.w,criterion:true,path:'0'},
    left:{parent:'group',owner:'w',outline:true,criterion:true,path:'0.0'},right:{parent:'group',owner:'w',outline:true,criterion:true,path:'0.1'}};
  delete collapsed.a;delete collapsed.b;delete collapsed.code;
  const paint=treeFocusPaint([entry],'end',collapsed);
  assert.ok(paint.nodeKeys.includes('left')&&paint.nodeKeys.includes('right'));
  const expanded={...collapsed,a:{...nodes.a,parent:'left',path:'0.0.b'},b:{...nodes.b,parent:'right',path:'0.1.b'}};
  const open=treeFocusPaint([entry],'end',expanded);
  assert.ok(open.nodeKeys.includes('left')&&open.nodeKeys.includes('a')&&open.nodeKeys.includes('right')&&open.nodeKeys.includes('b'));
});
test('renderer exposes authoritative terminal topology',()=>{
  const structure=[{lib:'L',decision:'D',nodeKey:'root',children:[{lib:'L',decision:'D',nodeKey:'end',kind:'action',label:'Met',children:[],refKeys:[]}]}],rendered=renderFlowPane(structure);
  assert.equal(rendered.focusNodes.end.terminal,true);assert.equal(rendered.focusNodes.end.parent,'root');
  assert.match(rendered.html,/data-flow-terminal="1"/);assert.deepEqual(renderFlowPane([]).focusNodes,{});
});

test('MV navigator spacing clears the previous result and the selected guard tab; default layout is unchanged',()=>{
  const structure=[{lib:'L',decision:'D',nodeKey:'root',children:[
    {lib:'L',decision:'D',nodeKey:'first',kind:'action',label:'Met',children:[],refKeys:[]},
    {lib:'L',decision:'D',nodeKey:'second',kind:'action',label:'Unmet',children:[],refKeys:['act:Unmet','c:G']},
  ]}],concepts=[{lib:'L',name:'G',nodeKey:'c:G',hasLocalCode:true}];
  const defaults=renderFlowPane(structure,{concepts}),spaced=renderFlowPane(structure,{concepts,traversalNavigation:true});
  assert.equal(defaults.html,renderFlowPane(structure,{concepts,traversalNavigation:false}).html);
  const box=(rendered,key)=>{
    const start=rendered.html.indexOf('id="'+rendered.anchors[key].scrollTo+'"');
    const rect=rendered.html.slice(start).match(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/);assert.ok(rect);
    return {x:Number(rect[1]),y:Number(rect[2]),width:Number(rect[3]),height:Number(rect[4])};
  };
  const first=box(spaced,'first'),second=box(spaced,'second');
  assert.ok(second.y-40>=first.y+first.height+14);
  assert.ok(second.y-40+24<second.y-9); // Navigator bottom clears guard-tab top.
  assert.match(spaced.html,/class="flow-guard-tab/);
  assert.ok(box(spaced,'first').y>=30);
});

test('a direct question includes only its owned input outlines, never downstream branches',()=>{
  const direct={root:{parent:'',owner:'root'},w:{parent:'root',owner:'w',concept:['L','A']},
    input:{parent:'w',owner:'w',outline:true,concept:['L','Input']},nestedInput:{parent:'input',owner:'w',outline:true,concept:['L','Nested Input']},code:{parent:'input',owner:'w',outline:true,choice:true},
    later:{parent:'w',owner:'later'},end:{parent:'later',owner:'end',terminal:true},
    other:{parent:'w',owner:'other'},otherEnd:{parent:'other',owner:'otherEnd',terminal:true}};
  const entry=evidence('first',true,true);entry.route.nodeKeys=['root','w','later','end'];
  const terminal=treeFocusPaint([entry],'end',direct);
  assert.ok(terminal.nodeKeys.includes('input')&&terminal.nodeKeys.includes('nestedInput'));
  assert.ok(!terminal.nodeKeys.includes('other')&&!terminal.nodeKeys.includes('otherEnd')&&!terminal.nodeKeys.includes('code'));
  const prefix=treeFocusPaint([entry],'later',direct);
  assert.ok(prefix.nodeKeys.includes('w')&&prefix.nodeKeys.includes('input')&&prefix.nodeKeys.includes('later'));
  assert.ok(!prefix.nodeKeys.includes('end')&&!prefix.nodeKeys.includes('other')&&!prefix.nodeKeys.includes('otherEnd'));
});

test('real Bleph terminals and nonterminal prefixes exclude every off-route structural node',()=>{
  const selected=resolveCelSuite(fileURLToPath(new URL('../../../examples/bleph-medical-validation/src/cel/mv/medical-validation.cel',import.meta.url)));
  assert.equal(selected.ok,true);const cm=buildSuiteExecutionModel(selected.suite);assert.ok(cm);
  const rendered=renderFlowPane(cm.crlStructure,{concepts:cm.conceptLayer,guardOutlines:cm.guardOutlines});
  const index=buildRuntimeRefIndex(cm.crlStructure);
  const entries=cm.scenarios.scenarios.flatMap(sv=>executionRoutes(sv,cm.crlStructure).map(route=>treeTraversal(cm.caseIdByName[caseViewKey(sv.case)],sv,route,
    id=>resolveThisNode(id,{lib:sv.decision?.libraryName??'',decision:sv.decision?.name??''},sv.tree,index,undefined).nodeKey)));
  const terminalKeys=Object.entries(rendered.focusNodes).filter(([,n])=>n.terminal).map(([key])=>key);
  assert.ok(terminalKeys.length>=6);
  const pinnedRoutes=entries.filter(e=>rendered.focusNodes[e.route.nodeKeys.at(-1)]?.terminal).map(e=>({caseId:e.caseId,routeId:e.route.terminalId,leafKey:e.route.nodeKeys.at(-1),traversalKey:treeTraversalSignature(e)}));
  const expected=terminalKeys.flatMap(key=>terminalTraversals(entries,key));
  assert.equal(cm.scenarios.scenarios.length,16);assert.equal(expected.length,6);
  for(const entry of entries){
    const current={caseId:entry.caseId,routeId:entry.route.terminalId},neighbors=traversalRouteNeighbors(pinnedRoutes,current,terminalKeys);
    assert.equal(neighbors.total,expected.length);
    const selected=expected[neighbors.index];assert.ok(selected);
    assert.equal(treeTraversalSignature(selected),treeTraversalSignature(entry));
    if(neighbors.next)assert.deepEqual([neighbors.next.caseId,neighbors.next.routeId],[expected[neighbors.index+1].caseId,expected[neighbors.index+1].route.terminalId]);
    if(neighbors.previous)assert.deepEqual([neighbors.previous.caseId,neighbors.previous.routeId],[expected[neighbors.index-1].caseId,expected[neighbors.index-1].route.terminalId]);
  }
  for(const key of terminalKeys){
    const options=terminalTraversals(entries,key);assert.ok(options.length>0);
    for(const option of options){
      const paint=treeFocusPaint([option],key,rendered.focusNodes);
      assert.ok(paint.nodeKeys.includes(key));
      for(const focused of paint.nodeKeys)if(!rendered.focusNodes[focused]?.outline)
        assert.ok(option.route.nodeKeys.includes(focused),`Off-route ${focused} focused for ${key}`);
      for(const other of terminalKeys)assert.equal(paint.nodeKeys.includes(other),other===key);
    }
  }
  const target=Object.entries(rendered.focusNodes).find(([key,n])=>!n.outline&&!n.terminal&&entries.some(e=>e.route.nodeKeys.indexOf(key)>1));
  assert.ok(target);const paint=treeFocusPaint(entries,target[0],rendered.focusNodes);
  for(const terminal of terminalKeys)assert.ok(!paint.nodeKeys.includes(terminal));
});
