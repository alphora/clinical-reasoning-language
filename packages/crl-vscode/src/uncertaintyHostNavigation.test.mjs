// REFACTOR:grounded: execute actual host dispatch/reveal/ACK and flag visibility paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { PaneRevealCoordinator } from './paneRevealCoordinator.ts';
import { uncertaintyGuardCandidates, uncertaintyGuardExpanded, forcedUncertaintyVisibility, flaggedUncertaintyGuards } from './uncertaintyGuardDisplay.ts';
import { projectFlowStructure } from './flowProjection.ts';
import { renderFlowPane } from './flowPaneHtml.ts';
import { computeFlagPlacement } from './flagPlacement.ts';
const source=ts.createSourceFile('host.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function host(name,context){let declaration;const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===name)declaration=n;else ts.forEachChild(n,visit);};visit(source);assert(declaration,name);const js=transformSync('const extracted = '+declaration.getText(source),{loader:'ts'}).code;return new Function('context','with(context){'+js+';return extracted;}')(context);}
const node=(key,kind,children=[],extra={})=>({nodeKey:key,nodeId:key,lib:'L',decision:'D',kind,label:key,refKeys:[],location:{},children,...extra});
const terminal=key=>node(key,'action',[],{refKeys:['activity'],actionKind:'recommend-activity'});
function readyHandler(context){let statement;const visit=n=>{if(ts.isIfStatement(n)&&n.expression.getText(source).startsWith('msg.type === \"ready\"'))statement=n.thenStatement;else ts.forEachChild(n,visit);};visit(source);assert(statement);const js=transformSync('const extracted = function(pane,msg,v) '+statement.getText(source),{loader:'ts'}).code;return new Function('context','with(context){'+js+';return extracted;}')(context);}
const tree=[{nodeKey:'D',lib:'L',decision:'D',location:{},children:[node('u','when',[terminal('met')],{uncertaintyGuard:{passWhen:true},refKeys:['guard']}),node('otherwise','otherwise',[terminal('unmet')])]}];
test('explicit source navigation unfolds once; replay after Hide stays hidden across the real host queue and ACK',()=>{
 const coord=new PaneRevealCoordinator(),view={gen:coord.startRender('tree'),acked:true,indexVersion:1},expanded=new Set(),messages=[];
 const context={coord,views:new Map([['tree',view]]),crlMaps:{},crlStructure:tree,indexVersion:1,mode:'medical-validation',expandedUncertaintyGuards:expanded,collapsedUncertaintyGuards:new Set(),forcedUncertaintyGuards:new Map(),uncertaintyGuardCandidates,uncertaintyGuardExpanded,projectFlowStructure,
   crlAnchorsForUnits:()=>['u'],conceptNodesForRow:()=>[],scrollSuppressPane:undefined,disclosureFocus:undefined,
   renderPane(){view.gen=coord.startRender('tree');view.acked=false;view.preserveTreeViewport=true;},
   branchQuestionnaire:{isOpen:false},pinnedCards:undefined,renderTreeChrome(){},driveDoneOverlay(){},driveFlagBadges(){},driveNodeFocus(){},postTreeFocus(){},driveThisNode(){},
   selectingTreeFocus:false,clearTreeFocus(){},state:{selection:{primary:'source',unitId:'source-unit'}},focusedCaseId:()=>undefined,
   reduce:(state)=>({state,effects:[{pane:'tree',target:{kind:'unit',id:'source-unit'}}]}),onNav:{fire(){}},reflectSelectionToTree(){},driveFailedCriteriaPeek(){},driveDiverters(){},driveLeafMarks(){},shouldRerenderQuestionnaire:()=>false};
 view.anchors={u:{scrollTo:'guard-anchor',segmentIds:['guard-anchor']}};view.panel={webview:{postMessage:m=>messages.push(m)}};context.highlightRows=host('highlightRows',context);
 context.postReveal=host('postReveal',context);context.applyReveal=host('applyReveal',context);const dispatch=host('dispatch',context);
 dispatch({type:'select',selection:context.state.selection});assert(expanded.has('u'));assert.equal(view.gen,2);
 assert.equal(coord.ready('tree',1,1),undefined,'superseded acknowledgement cannot flush the navigation');
 const ready=readyHandler(context);ready('tree',{gen:2,questionnaireOpen:false},view);assert.equal(messages.findLast(m=>m.type==='highlight').scrollTo,'guard-anchor','explicit offscreen navigation keeps its scroll after ACK');assert.equal(view.gen,2,'ACK never re-renders an already disclosed guard');
 expanded.delete('u');context.renderPane('tree');dispatch({type:'select',selection:context.state.selection},true);
 ready('tree',{gen:view.gen,questionnaireOpen:false},view);assert(!expanded.has('u'),'paint replay cannot undo Hide');assert.equal(messages.findLast(m=>m.type==='highlight').scrollTo,undefined,'paint replay preserves manual pan after ACK');
 context.state.selection={primary:'crl',nodeKey:'u'};context.reduce=state=>({state,effects:[{pane:'tree',target:{kind:'crlNode',id:'u'}}]});view.acked=true;
 dispatch({type:'select',selection:context.state.selection});assert(expanded.has('u'),'explicit CRL navigation also reveals original target');
});
test('actual placement on a non-anchor nested Criterion forces the original uncertainty guard visible',()=>{
 const inner={kind:'criterion',name:'Inner',lib:'L',bodyHash:'inner',operand:{kind:'leaf',name:'Question',lib:'L',nodeKey:'q',isSource:false}};
 const outlines=new Map([['u',{expr:{kind:'criterion',name:'Outer',lib:'L',bodyHash:'outer',operand:inner}}]]);
 const opts={guardOutlines:outlines,expandedGuardWhens:new Set(['u']),concepts:[{nodeKey:'q',lib:'L',name:'Question',location:{},definitionRefs:[],hasLocalCode:true,valueTypes:['boolean']}]};
 const full=renderFlowPane(tree,opts),nested=full.criterionOccurrences.find(o=>o.name==='Inner');assert(nested?.collapsed);assert(!full.anchors[nested.occurrenceKey]);
 const flags=[{id:'review',anchor:{scope:'concept',library:'L',name:'Question'}}];
 const placement=view=>computeFlagPlacement(flags,view,()=>[],()=>undefined,()=>({lib:'L',name:'Question'}));assert(placement(full).gids.includes(nested.gid));
 const context={crlStructure:tree,mode:'medical-validation',pinnedCards:undefined,indexVersion:1,focusedScenario:()=>undefined,flagStateError:undefined,flagsList:flags,
   uncertaintyGuardCandidates,projectFlowStructure,forcedUncertaintyVisibility,flaggedUncertaintyGuards,renderFlowPane,treeRenderOptions:()=>opts,flagPlacementFor:placement};
 const forced=host('computeForcedUncertainty',context)({gen:1});assert.equal(forced.get('u'),'flag');
 assert(!full.anchors[nested.occurrenceKey],'review visibility never invents a source anchor');
 const proxies={...full,conceptOccurrences:[{gid:'not-placed',flagGid:nested.gid,lib:'L',name:'Question'}],criterionOccurrences:[]};
 assert(placement(proxies).gids.includes(nested.gid));assert(flaggedUncertaintyGuards(uncertaintyGuardCandidates(projectFlowStructure(tree)),new Set(placement(proxies).gids),full.flagOwnerKeys).has('u'));
});

test('actual toggle handler collapses and reopens an inspected nonpass without accepting stale generations', () => {
  let branch;
  const find = node => {
    if (ts.isIfStatement(node) && node.expression.getText(source).startsWith("msg.type === 'toggleUncertaintyGuard'")) branch = node;
    else ts.forEachChild(node, find);
  };
  find(source);
  assert(branch);
  const script = transformSync(`const extracted = function(pane,msg,v) { if (${branch.expression.getText(source)}) ${branch.thenStatement.getText(source)} }`, { loader: 'ts' }).code;
  const expanded = new Set(), collapsed = new Set(), forced = new Map([['u', 'case']]);
  const view = { gen: 1 }, replays = [];
  let renders = 0;
  const context = {
    mode: 'medical-validation', crlStructure: tree, uncertaintyGuardCandidates, projectFlowStructure, uncertaintyGuardExpanded,
    expandedUncertaintyGuards: expanded, collapsedUncertaintyGuards: collapsed,
    computeForcedUncertainty: () => forced, scrollSuppressPane: undefined, state: { selection: { primary: 'cel', caseId: 'uncertain' } },
    renderPane() { renders++; view.gen++; }, dispatch(...args) { replays.push(args); },
  };
  const toggle = new Function('context', `with(context){${script};return extracted;}`)(context);
  const click = gen => toggle('tree', { type: 'toggleUncertaintyGuard', key: 'u', gen }, view);
  click(1);
  assert(collapsed.has('u')); assert(!expanded.has('u')); assert.equal(renders, 1);
  assert.equal(replays[0][1], true, 'paint replay does not request a new source disclosure');
  click(1); assert.equal(renders, 1, 'stale message ignored');
  click(2); assert(expanded.has('u')); assert(!collapsed.has('u')); assert.equal(renders, 2);
  for (const reason of ['flag', 'evidence']) {
    forced.set('u', reason); click(view.gen); assert.equal(renders, 2);
  }
});

test('explicit navigation to the hidden ordinary terminal reopens a manually collapsed nonpass guard', () => {
  const coord = new PaneRevealCoordinator(), view = { gen: coord.startRender('tree'), acked: true, anchors: {} };
  const expanded = new Set(), collapsed = new Set(['u']);
  const context = {
    coord, views: new Map([['tree', view]]), crlMaps: {}, crlStructure: tree, indexVersion: 1, mode: 'medical-validation',
    expandedUncertaintyGuards: expanded, collapsedUncertaintyGuards: collapsed, forcedUncertaintyGuards: new Map([['u', 'case']]),
    uncertaintyGuardCandidates, uncertaintyGuardExpanded, projectFlowStructure,
    renderPane() { view.gen = coord.startRender('tree'); },
  };
  host('postReveal', context)('tree', { kind: 'crlNode', id: 'met', expandUncertainty: true });
  assert(expanded.has('u')); assert(!collapsed.has('u'));
  assert.equal(view.gen, 2);
});
