import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const bodies=new Map();function visit(n){if(ts.isFunctionDeclaration(n)&&['treeTraversalEntries','focusTreeNode','selectTreeTraversal','toggleCriterionExpand','branchOrder','branchNeighbors','pinCards','navigatePinnedBranch','selectRoutesThroughNode','onWebviewMessage','markLeaves'].includes(n.name?.text))bodies.set(n.name.text,n.getText(source));ts.forEachChild(n,visit);}visit(source);

test('pinned markLeaves recomputes nodes and group outcomes once against current render geometry',()=>{
 const messages=[],v={gen:2,focusNodes:{current:true},panel:{webview:{postMessage:m=>messages.push(m)}}},traversal={id:'actual'},calls=[];
 const c=vm.createContext({state:{selection:undefined},focusedScenario:()=>undefined,
   pinnedCards:{traversal,payload:{pinKey:'leaf',marks:{yesKeys:[],noKeys:[],conditions:[]}}},
   segmentsFor:()=>({segmentIds:[]}),treeFocusPaint:(entries,key,nodes)=>{
     calls.push(nodes);assert.equal(entries[0],traversal);assert.equal(key,'leaf');assert.equal(nodes,v.focusNodes);
     return {nodeKeys:[String(v.gen)],groupKeys:['group-'+v.gen],groupOutcomes:[{key:'group-'+v.gen,result:'false'}]};
   }});
 vm.runInContext(transformSync(bodies.get('markLeaves'),{loader:'ts'}).code,c);
 for(const gen of [2,3]){v.gen=gen;v.focusNodes={gen};c.markLeaves(v,[],[]);const m=messages.at(-1);
   assert.equal(m.gen,gen);assert.deepEqual(Array.from(m.pinnedMarks.pathNodeKeys),[String(gen)]);
   assert.deepEqual(JSON.parse(JSON.stringify(m.pinnedMarks.pathGroupOutcomes)),[{key:'group-'+gen,result:'false'}]);
 }
 assert.equal(calls.length,2);
});

test('terminal traversal opens only its criteria before repaint, keeping selection and render focus identity',()=>{
 const calls=[],choice={caseId:'one',route:{terminalId:'result'}},focus={token:'focus',index:0,options:[choice]};
 const c=vm.createContext({unpinnedFocus:focus,selectingTreeFocus:false,scrollSuppressPane:'old',expandedGuardWhens:new Set(['manual']),crlStructure:[],conceptLayer:[],guardOutlines:new Map(),
  buildDefExprResolver:()=>{},answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},
  expandTraversalCriteria:(current,traversal)=>{assert.equal(traversal,choice);return new Set([...current,'criterion']);},
  renderPane:(...args)=>calls.push(['render',...args]),dispatch:e=>calls.push(['select',e.selection,c.scrollSuppressPane,c.selectingTreeFocus]),postTreeFocus:()=>calls.push(['paint'])});
 vm.runInContext(transformSync(bodies.get('selectTreeTraversal'),{loader:'ts'}).code,c);
 c.selectTreeTraversal();assert.deepEqual(calls.map(x=>x[0]),['render','select','paint']);assert.deepEqual(calls[0],['render','tree',undefined,'focus']);
 assert.equal(calls[1][2],'tree');assert.equal(calls[1][3],true);assert.equal(c.scrollSuppressPane,'old');assert.equal(c.selectingTreeFocus,false);
 assert.deepEqual(Array.from(c.expandedGuardWhens),['manual','criterion']);
 calls.length=0;c.selectTreeTraversal();assert.deepEqual(calls.map(x=>x[0]),['select','paint'],'no replacement when disclosure state is unchanged');
});

test('pin reveals actual question INPUT before marking and sends cards against the replacement generation',()=>{
 const calls=[],sv={case:{name:'Case'},tree:[],conceptTruth:[]},route={terminalId:'result',nodeIds:['n'],nodeKeys:['root','leaf']};
 const tree={gen:1,leafConcepts:{old:true},panel:{webview:{postMessage:m=>calls.push(['post',m])}}},cards=[{id:'q'}];
 const c=vm.createContext({views:new Map([['tree',tree]]),scenarioByCaseId:new Map([['case',sv]]),routesForCase:()=>[route],mode:'medical-validation',
  clearTreeFocus:()=>calls.push(['clear']),whenKeyResolver:()=>id=>id,buildRouteQuestionnaire:()=>({questions:[]}),buildResolveValueTypes:()=>{},buildConceptShapeResolver:()=>{},buildDefExprResolver:()=>{},
  treeTraversalEntries:()=>[{caseId:'case',route}],treeTraversalSignature:()=> 'traversal',treeFocusPaint:()=>({nodeKeys:['root','leaf'],groupKeys:['group']}),expandTraversalCriteria:current=>current,
  buildRouteCards:()=>({cards,targets:new Map()}),definitionValueInputs:()=>{},conceptLayer:[],crlMaps:{conceptByKey:new Map()},wordingSources:new Map(),crlStructure:[],guardOutlines:new Map(),
  expandedGuardWhens:new Set(),expandQuestionInputs:(current,actual)=>{assert.equal(actual,cards);return new Set([...current,'input']);},answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},
  renderPane:(...args)=>{calls.push(['render',...args]);tree.gen++;tree.leafConcepts={fresh:true};},
  leafBucketsFromQuestionnaire:(_q,_r,_truth,leaves)=>{assert.equal(leaves,tree.leafConcepts);assert.ok(leaves.fresh);calls.push(['marks']);return {yesKeys:[],noKeys:[]};},
  conditionTruthKeys:()=>[],randomUUID:()=> 'pin-token',branchNeighbors:()=>({index:0,total:1}),caseIdsThroughReviewNode:()=>['case'],pinnedVerdict:()=>{},indexVersion:3,
  branchQuestionnaire:{isOpen:false},driveLeafMarks:()=>calls.push(['drive']),pinnedCards:undefined});
 vm.runInContext(transformSync(bodies.get('pinCards'),{loader:'ts'}).code,c);
 c.pinCards('case','result','initial-click',true);
 assert.deepEqual(calls.map(x=>x[0]),['clear','render','marks','post','drive']);assert.deepEqual(calls[1],['render','tree',undefined,undefined,'initial-click']);
 assert.equal(calls[3][1].gen,2);assert.equal(calls[3][1].focusRequest,'initial-click');assert.equal(calls[3][1].cards,cards);
 calls.length=0;c.pinCards('case','result','next',false);assert.ok(!calls.some(x=>x[0]==='render'),'already open inputs do not redraw');
 const alternate={caseId:'case',route,key:'explicit-terminal'};
 c.treeTraversalEntries=()=>[{caseId:'case',route},alternate];c.treeTraversalSignature=e=>e.key??'traversal';
 c.branchNeighbors=identity=>{assert.equal(identity.traversalKey,'explicit-terminal');return {index:1,total:2,previous:{}};};
 c.treeFocusPaint=entries=>{assert.equal(entries[0],alternate);return {nodeKeys:['root','all-operands','leaf'],groupKeys:['group'],groupOutcomes:[{key:'group',result:'false'}]};};
 c.pinCards('case','result','branch-navigation',false,'explicit-terminal');
 assert.equal(c.pinnedCards.traversal,alternate);assert.equal(c.pinnedCards.payload.navigation.current,2);
 assert.deepEqual(Array.from(c.pinnedCards.payload.pathNodeKeys),['root','all-operands','leaf']);
 assert.deepEqual(Array.from(c.pinnedCards.payload.pathGroupKeys),['group']);
 assert.deepEqual(JSON.parse(JSON.stringify(c.pinnedCards.payload.pathGroupOutcomes)),[{key:'group',result:'false'}]);
 calls.length=0;c.pinCards('case','result','stale',false,'missing-terminal');assert.equal(calls.length,0,'stale choice never falls back or clears existing pin');
});
test('disclosure and result navigation suppress selection pans before their final local focus',()=>{
 const calls=[],tree={gen:1};
 const c=vm.createContext({views:new Map([['tree',tree]]),expandedGuardWhens:new Set(),crlStructure:[],conceptLayer:[],guardOutlines:[],
  buildDefExprResolver:()=>{},answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},toggleCriterionExpansion:()=>new Set(['criterion']),
  renderPane:(pane,token)=>{tree.gen++;calls.push(['render',pane,token]);},disclosureFocus:undefined,
  state:{selection:{primary:'cel',caseId:'one'}},scrollSuppressPane:undefined,
  dispatch:()=>calls.push(['select',c.scrollSuppressPane]),
  pinnedCards:{token:'pin',epoch:1},indexVersion:1,mode:'medical-validation',branchOrder:()=>[],
  collectDispositionLeafKeys:()=>new Set(['first-leaf','second-leaf']),
  traversalRouteNeighbors:(_routes,_pin,order)=>{assert.deepEqual(Array.from(order),['first-leaf','second-leaf']);return {next:{caseId:'two',routeId:'leaf',traversalKey:'variant'}};},pinCards:(...args)=>calls.push(['pin',...args]),
 });
 for(const name of ['toggleCriterionExpand','branchNeighbors','navigatePinnedBranch'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts'}).code,c);
 c.toggleCriterionExpand('criterion','click');assert.deepEqual(calls,[['render','tree','click'],['select','tree']]);assert.equal(c.scrollSuppressPane,undefined);
 calls.length=0;c.navigatePinnedBranch('next','pin');assert.deepEqual(calls,[['select','tree'],['pin','two','leaf','branch-navigation',false,'variant']]);assert.equal(c.scrollSuppressPane,undefined);
});
test('RQ host round-trips each click identity and ignores stale route requests',()=>{
 const messages=[],pane={isOpen:false,open(){this.isOpen=true;},close(){this.isOpen=false;}};
 const tree={gen:2,panel:{webview:{postMessage:m=>messages.push(m)}}};
 const c=vm.createContext({views:new Map([['tree',tree]]),pinnedCards:{token:'route',epoch:1,payload:{}},indexVersion:1,mode:'medical-validation',branchQuestionnaire:pane});
 vm.runInContext(transformSync(bodies.get('onWebviewMessage'),{loader:'ts'}).code,c);
 for(const id of ['click1','click2'])c.onWebviewMessage('tree',{type:'toggleBranchQuestionnaire',gen:2,token:'route',requestId:id});
 assert.deepEqual(messages.map(m=>[m.open,m.focusToken,m.requestId]),[[true,'route','click1'],[false,'route','click2']]);
 c.onWebviewMessage('tree',{type:'toggleBranchQuestionnaire',gen:2,token:'old-route',requestId:'stale'});assert.equal(messages.length,2);
});
test('first-route pinning suppresses the selection pan before constructing its cards',async()=>{
 const calls=[],tree={gen:2};
 const c=vm.createContext({routeSelectionRequest:0,indexVersion:1,mode:'medical-validation',state:{primary:'cel',selection:undefined},views:new Map([['tree',tree]]),scrollSuppressPane:undefined,
  scenarioByCaseId:new Map([['case',{case:{name:'Case'}}]]),routesForCase:()=>[{nodeKeys:['leaf'],terminalId:'route',terminalKind:'Met'}],
  treeTraversalEntries:()=>[],
  dispatch:e=>{calls.push(c.scrollSuppressPane);c.state.selection=e.selection;},branchQuestionnaire:{close:()=>{}},pinCards:()=>calls.push('cards')});
 vm.runInContext(transformSync(bodies.get('selectRoutesThroughNode'),{loader:'ts'}).code,c);
 await c.selectRoutesThroughNode('leaf','pin',true);assert.deepEqual(calls,['tree','cards']);assert.equal(c.scrollSuppressPane,undefined);
});

test('counter and arrow dispatch share the same ordering helper',()=>{
 const calls=[];
 const walk=n=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='traversalRouteNeighbors')calls.push(n);ts.forEachChild(n,walk);};walk(source);
 assert.equal(calls.length,1,'no direct legacy-order call may bypass branchNeighbors');
 let owner=calls[0].parent;while(owner&&!ts.isFunctionDeclaration(owner))owner=owner.parent;
 assert.equal(owner?.name?.text,'branchNeighbors');
 for(const name of ['pinCards','navigatePinnedBranch'])assert.match(bodies.get(name),/branchNeighbors\(/,name+' uses shared ordering');
});

test('pinned ordering derives the tree traversal signature and excludes nonterminal/unmapped endpoints',()=>{
 const calls=[],sv={case:{name:'case'}},terminal={nodeKeys:['root','terminal'],terminalId:'result'},pause={nodeKeys:['root','when'],terminalId:'pause'},missing={nodeKeys:['missing'],terminalId:'missing'};
 const c=vm.createContext({views:new Map([['tree',{focusNodes:{terminal:{terminal:true},when:{terminal:false}}}]]),scenarioByCaseId:new Map([['case',sv]]),
 treeTraversalEntries:()=>[{caseId:'case',route:terminal},{caseId:'case',route:pause},{caseId:'case',route:missing}],treeTraversalSignature:e=>{calls.push(e);return 'same-tree-signature';}});
 vm.runInContext(transformSync(bodies.get('branchOrder'),{loader:'ts'}).code,c);
 assert.deepEqual(JSON.parse(JSON.stringify(c.branchOrder())),[{caseId:'case',routeId:'result',leafKey:'terminal',traversalKey:'same-tree-signature'}]);
 assert.equal(calls.length,1);assert.equal(calls[0].route,terminal);
});

test('one execution entry per case route is cached by model epoch without Boolean Cartesian expansion',()=>{
 const sv={},route={terminalId:'route',nodeKeys:['leaf']};let builds=0;
 const c=vm.createContext({traversalCache:undefined,indexVersion:1,scenarioByCaseId:new Map([['case',sv]]),routesForCase:()=>[route],whenKeyResolver:()=>{},
 treeTraversal:(caseId,actual,selected)=>{builds++;assert.equal(actual,sv);assert.equal(selected,route);return {caseId,route:selected};}});
 vm.runInContext(transformSync(bodies.get('treeTraversalEntries'),{loader:'ts'}).code,c);
 const first=c.treeTraversalEntries();assert.equal(first.length,1);assert.equal(first[0].caseId,'case');
 assert.equal(c.treeTraversalEntries(),first);assert.equal(builds,1);
 c.indexVersion=2;assert.notEqual(c.treeTraversalEntries(),first);assert.equal(builds,2);
});
