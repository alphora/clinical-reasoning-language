// REFACTOR:grounded: execute actual host dispatch/reveal/ACK and flag visibility paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { PaneRevealCoordinator } from './paneRevealCoordinator.ts';
import { uncertaintyGuardCandidates, forcedUncertaintyVisibility, flaggedUncertaintyGuards } from './uncertaintyGuardDisplay.ts';
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
 const context={coord,views:new Map([['tree',view]]),crlMaps:{},crlStructure:tree,indexVersion:1,mode:'medical-validation',expandedUncertaintyGuards:expanded,forcedUncertaintyGuards:new Map(),uncertaintyGuardCandidates,projectFlowStructure,
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
