// REFACTOR:grounded: manual FHIR Default replaces the retired saved pane; retained navigation contracts stay covered.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {COCKPIT_WEBVIEW_SCRIPT} from './correspondenceCockpit.ts';
import {PaneRevealCoordinator} from './paneRevealCoordinator.ts';
import {initialState,reduce} from './correspondenceEngine.ts';
import {uncertaintyGuardCandidates,uncertaintyGuardExpanded} from './uncertaintyGuardDisplay.ts';
import {projectFlowStructure} from './flowProjection.ts';
import {installLformsReviewControls} from './lformsReviewControls.ts';
import {browserExecutable,browserFixture} from '../test/browserHarness.mjs';

const raw=readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('host.ts',raw,ts.ScriptTarget.Latest,true);
const root=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerCorrespondenceCockpit');
const body=name=>root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);

// Run actual host transitions and the real reducer/coordinator; only external UI/model services are stubs.
function delayedNavigationHost(){
 const messages=[],failedOrigins=[],coord=new PaneRevealCoordinator(),index={version:1,anchorFilePath:'',steps:[],sourceCycleIds:[],crlNav:[],celNav:[{caseId:'case',label:'Case'}]};
 const view={gen:coord.startRender('tree'),indexVersion:1,acked:true,anchors:{root:{scrollTo:'render-root',segmentIds:['render-root']},terminal:{scrollTo:'render-terminal',segmentIds:['render-terminal']}},panel:{webview:{postMessage:m=>messages.push(m)}}};
 coord.ready('tree',view.gen,1);
 const c=vm.createContext({coord,indexVersion:1,views:new Map([['tree',view]]),crlMaps:{},mode:'medical-validation',scrollSuppressPane:undefined,disclosureFocus:undefined,
  state:{...initialState(),primary:'cel',paneVisibility:{tree:true},index,selection:{primary:'cel',caseId:'case',routeId:'route'}},reduce,
  selectingTreeFocus:false,clearTreeFocus(){},focusedCaseId:s=>s.selection?.primary==='cel'?s.selection.caseId:undefined,onNav:{fire(){}},reflectSelectionToTree(){},
  driveFailedCriteriaPeek:()=>failedOrigins.push(c.scrollSuppressPane),driveDiverters(){},driveLeafMarks(){},syncQuestionnaireDefaults(){},shouldRerenderQuestionnaire:()=>false,cockpitAgentBridge:{notifyChanged(){}},
  inspectedRoutes:()=>[{nodeKeys:['root','terminal']}],uncertaintyGuardCandidates:()=>new Map(),projectFlowStructure:()=>[],expandedUncertaintyGuards:new Set(),collapsedUncertaintyGuards:new Set(),forcedUncertaintyGuards:new Map(),
  unpinnedFocus:{token:'focus',options:[{caseId:'case',route:{terminalId:'route'}}],index:0},expandedGuardWhens:new Set(),expandTraversalCriteria:()=>new Set(['criterion']),crlStructure:[],conceptLayer:[],guardOutlines:new Map(),
  buildDefExprResolver(){},answerOptionsForDisplay(){},answersFromTerminologyForDisplay(){},postTreeFocus(){},conceptNodesForRow:()=>[],
  renderPane:()=>{view.gen=coord.startRender('tree');view.indexVersion=c.indexVersion;view.acked=false;},
  toIndex:()=>({...index,version:c.indexVersion}),toCelNav:()=>[],model:{},scenarios:{},caseIdByName:{},duplicateScenarioNames:new Set()});
 vm.runInContext(transformSync(['highlightRows','postReveal','applyReveal','dispatch','selectTreeTraversal'].map(body).join('\n'),{loader:'ts',target:'es2022'}).code,c);
 const rebuild=root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='rebuild');
 const selection=rebuild.body.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='dispatch'&&n.expression.arguments[0]?.getText(ast).includes('"setInputs"'));
 assertSelection(selection);
 const snapshot=rebuild.body.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='uncertaintyDisclosure'));
 const restore=rebuild.body.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='preserveUncertainty')||ts.isExpressionStatement(n)&&/^(expandedUncertaintyGuards|collapsedUncertaintyGuards|forcedUncertaintyGuards|indexVersion)\s*(=|\+=)/.test(n.getText(ast)));
 if(restore.length<4)throw Error('Missing actual rebuild uncertainty reset/index statements');
 return {c,view,messages,failedOrigins,refresh(preserve=true,nextStructure=c.crlStructure){c.preservePin=preserve;c.nextStructure=nextStructure;coord.clearPending('tree');vm.runInContext(transformSync(`(()=>{${snapshot?.getText(ast)||''} crlStructure=nextStructure;${restore.map(n=>n.getText(ast)).join('\n')}${selection.getText(ast)}})()`,{loader:'ts'}).code,c);c.renderPane('tree');},flush(){view.acked=true;const target=coord.ready('tree',view.gen,c.indexVersion);if(target)c.postReveal('tree',target);return target;}};
}
function assertSelection(node){if(!node)throw Error('Missing actual rebuild selection dispatch');}

it('terminal expansion retains its tree-local no-scroll intent after delayed render acknowledgement',()=>{
 const h=delayedNavigationHost();h.c.selectTreeTraversal();expect(h.view.acked).toBe(false);expect(h.c.scrollSuppressPane).toBeUndefined();
 const target=h.flush();expect(target.preserveViewport).toBe(true);expect(h.messages.at(-1).scrollTo).toBeUndefined();expect(h.failedOrigins).toEqual(['tree']);
});
it('same-policy sidecar refresh replays selection without root navigation while fresh navigation can still scroll',()=>{
 const h=delayedNavigationHost();h.refresh();const target=h.flush();expect(target.preserveViewport).toBe(true);expect(h.messages.at(-1).scrollTo).toBeUndefined();expect(h.failedOrigins).toEqual(['tree']);
 expect(h.c.state.selection.routeId).toBeUndefined();
 h.c.dispatch({type:'select',selection:{primary:'cel',caseId:'case'}});expect(h.messages.at(-1).scrollTo).toBe('render-root');
 const fresh=delayedNavigationHost();fresh.refresh(false);fresh.flush();expect(fresh.messages.at(-1).scrollTo).toBe('render-root');
});
it('unchanged-structure refresh preserves Show and Hide choices through actual rebuild state resets and ACK',()=>{
 const h=delayedNavigationHost();
 const node=(nodeKey,kind,children=[],extra={})=>({nodeKey,nodeId:nodeKey,lib:'L',decision:'D',kind,label:nodeKey,refKeys:[],location:{},children,...extra});
 const terminal=key=>node(key,'action',[],{refKeys:['activity'],actionKind:'recommend-activity'});
 h.c.crlStructure=[{nodeKey:'D',lib:'L',decision:'D',location:{},children:[node('u','when',[terminal('met')],{uncertaintyGuard:{passWhen:true},refKeys:['guard']}),node('otherwise','otherwise',[terminal('unmet')])]}];
 Object.assign(h.c,{uncertaintyGuardCandidates,uncertaintyGuardExpanded,projectFlowStructure,
  reduce:(state,action)=>({...reduce(state,action),effects:[{pane:'tree',target:{kind:'crlNode',id:'u'}}]})});
 h.view.anchors.u={scrollTo:'guard-anchor',segmentIds:['guard-anchor']};
 expect(uncertaintyGuardCandidates(projectFlowStructure(h.c.crlStructure)).size).toBe(1);
 h.c.expandedUncertaintyGuards.add('u');h.c.forcedUncertaintyGuards.set('u','case');
 h.refresh();const first=h.flush();
 expect(first.expandUncertainty).toBe(false);expect(first.preserveViewport).toBe(true);
 expect(h.c.expandedUncertaintyGuards.has('u')).toBe(true);expect(h.c.forcedUncertaintyGuards.size).toBe(0);
 expect(h.messages.at(-1).segmentIds).toContain('guard-anchor');expect(h.messages.at(-1).scrollTo).toBeUndefined();
 h.c.expandedUncertaintyGuards.delete('u');h.c.collapsedUncertaintyGuards.add('u');h.refresh();h.flush();
 expect(h.c.expandedUncertaintyGuards.has('u')).toBe(false);expect(h.c.collapsedUncertaintyGuards.has('u')).toBe(true);
 h.c.applyReveal({pane:'tree',target:{kind:'crlNode',id:'u'}});h.flush();
 expect(h.c.expandedUncertaintyGuards.has('u')).toBe(true);expect(h.c.collapsedUncertaintyGuards.has('u')).toBe(false);
 h.refresh();h.flush();expect(h.c.expandedUncertaintyGuards.has('u')).toBe(true);expect(h.messages.at(-1).scrollTo).toBeUndefined();
 const changed=structuredClone(h.c.crlStructure);changed[0].children[0].uncertaintyGuard.passWhen=false;
 h.refresh(true,changed);h.flush();expect(h.c.expandedUncertaintyGuards.size).toBe(0);expect(h.c.collapsedUncertaintyGuards.size).toBe(0);
 h.c.expandedUncertaintyGuards.add('u');h.refresh(false);expect(h.c.expandedUncertaintyGuards.size).toBe(0);
 h.flush();expect(h.c.expandedUncertaintyGuards.has('u')).toBe(true);expect(h.view.acked).toBe(false);
 h.flush();expect(h.messages.at(-1).scrollTo).toBe('guard-anchor');
});
it('overlapping preserving refreshes reject stale ACK while the latest reveal retains disclosure and pan',()=>{
 const h=delayedNavigationHost();h.c.expandedUncertaintyGuards.add('u');
 h.refresh();const staleGen=h.view.gen,staleIndex=h.c.indexVersion;
 h.refresh();expect(h.c.coord.ready('tree',staleGen,staleIndex)).toBeUndefined();
 const target=h.flush();expect(target.preserveViewport).toBe(true);expect(h.c.expandedUncertaintyGuards.has('u')).toBe(true);expect(h.messages.at(-1).scrollTo).toBeUndefined();
});
it('passive tree preservation leaves observable CRL and source reveal scrolling unchanged',()=>{
 const h=delayedNavigationHost();
 h.c.unitsForRow=()=>['u'];
 for(const pane of ['crl','source']){
  const v={...h.view,gen:h.c.coord.startRender(pane),acked:false,anchors:{u:{scrollTo:'other-pane-anchor',segmentIds:['other-pane-anchor']}}};h.c.views.set(pane,v);h.c.scrollSuppressPane='tree';
  h.c.applyReveal({pane,target:{kind:'crlNode',id:'u'}},true);
  const target=h.c.coord.ready(pane,v.gen,1);expect(target.preserveViewport).toBe(false);h.c.postReveal(pane,target);expect(h.messages.at(-1).scrollTo).toBe('other-pane-anchor');
 }
});
it('actual replay preserves the viewport through immediate and queued coordinator delivery; direct reveals still navigate',()=>{
 const calls=[],view={gen:1,indexVersion:1,acked:true},coord=new PaneRevealCoordinator();coord.setPaneCapability('tree','renderable');coord.startRender('tree');coord.ready('tree',1,1);
 const c=vm.createContext({coord,indexVersion:1,views:new Map([['tree',view]]),crlMaps:{},mode:'medical-validation',scrollSuppressPane:undefined,disclosureFocus:undefined,conceptNodesForRow:()=>[],highlightRows:(v,keys,preserve)=>calls.push(preserve)});
 vm.runInContext(transformSync(body('postReveal')+'\n'+body('applyReveal'),{loader:'ts',target:'es2022'}).code,c);
 c.applyReveal({pane:'tree',target:{kind:'crlNode',id:'root'}},true);expect(calls).toEqual([true]);
 view.acked=false;coord.startRender('tree');c.applyReveal({pane:'tree',target:{kind:'crlNode',id:'root'}},true);const pending=coord.ready('tree',2,1);expect(pending.preserveViewport).toBe(true);c.postReveal('tree',pending);expect(calls).toEqual([true,true]);
 c.postReveal('tree',{kind:'crlNode',id:'question'});expect(calls.at(-1)).toBe(false);
});
it('actual dispatch also suppresses failed-criteria scrolling on passive replay and restores its caller origin',()=>{
 const seen=[],state={},c=vm.createContext({state,selectingTreeFocus:false,scrollSuppressPane:'source',mode:'medical-validation',views:new Map(),clearTreeFocus(){},focusedCaseId:()=>undefined,reduce:()=>({state,effects:[]}),onNav:{fire(){}},reflectSelectionToTree(){},driveFailedCriteriaPeek:()=>seen.push(c.scrollSuppressPane),driveDiverters(){},driveLeafMarks(){},syncQuestionnaireDefaults(){},shouldRerenderQuestionnaire:()=>false});
 vm.runInContext(transformSync(body('dispatch'),{loader:'ts',target:'es2022'}).code,c);
 c.dispatch({type:'select'},true);expect(seen).toEqual(['tree']);expect(c.scrollSuppressPane).toBe('source');
 c.dispatch({type:'select'},false);expect(seen).toEqual(['tree','source']);expect(c.scrollSuppressPane).toBe('source');
});
it('actual pin toggle keeps keyboard focus but does not request automatic centering',()=>{
 const line=raw.split('\n').find(l=>l.includes('const toggleFlowPin=k=>')),code=line.slice(line.indexOf('const toggleFlowPin='),line.lastIndexOf('`')),calls=[];
 const c=vm.createContext({gen:1,options:{},v:{postMessage:m=>calls.push(m)},pinFocusVersion:0,pendingPinFocus:'',pinnedFlowKey:'root',pinnedRouteKeys:[],routeCardUi:{reset(){}},applyFlowPin(){},applyZoom(){},focusPinLeaf:(key,reveal)=>calls.push({key,reveal})});
 vm.runInContext(code+';toggleFlowPin("root");',c);expect(calls).toContainEqual({key:'root',reveal:false});
});
const html=(head='',scripts='')=>`<!doctype html><html><head>${head}</head><body><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div>${scripts}<script>window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});${COCKPIT_WEBVIEW_SCRIPT.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
for(const action of ['terminal expansion','same-policy refresh'])it.skipIf(!browserExecutable)(`${action} preserves real browser pan through render, ACK and queued host highlight`,async()=>{
 const browser=await browserFixture(html()),h=delayedNavigationHost();
 try{
  const send=m=>browser.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(m)}}))`);
  const flow='<svg class="flow-svg" width="4000" height="3000" viewBox="0 0 4000 3000"><g id="render-root" class="flow-row" data-flow-key="root"><rect x="0" y="0" width="100" height="40"/></g><g id="render-terminal" class="flow-row" data-flow-key="terminal"><rect x="3000" y="2000" width="100" height="40"/></g></svg>';
  await send({type:'render',gen:1,indexVersion:1,mode:'medical-validation',viewportKey:'policy',html:flow});
  await browser.evaluate('window.scrollTo(350,400);window.savedPan=[scrollX,scrollY]');expect(await browser.evaluate('savedPan[0]>0&&savedPan[1]>0')).toBe(true);
  if(action==='terminal expansion')h.c.selectTreeTraversal();else h.refresh();
  await send({type:'render',gen:h.view.gen,indexVersion:h.c.indexVersion,mode:'medical-validation',viewportKey:'policy',html:flow});
  h.flush();for(const message of h.messages)await send(message);
  await browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  expect(await browser.evaluate('[scrollX,scrollY]')).toEqual(await browser.evaluate('savedPan'));
  await send({type:'highlight',gen:h.view.gen,segmentIds:['render-root'],scrollTo:'render-root'});
  expect(await browser.evaluate('[scrollX,scrollY]')).not.toEqual(await browser.evaluate('savedPan'));
 }finally{await browser.close();}
},30000);
it.skipIf(!browserExecutable)('toolbar removal matches complete slash-containing linkIds',async()=>{
 const browser=await browserFixture(`<!doctype html><div id="mount"><lhc-item id="item-a/1"><lhc-item-question><label id="label-a/1">A</label></lhc-item-question></lhc-item><lhc-item id="item-a/b/1"><lhc-item-question><label id="label-a/b/1">B</label></lhc-item-question></lhc-item></div><script>window.questions=[{linkId:'a'},{linkId:'a/b'}];window.actions=[];(${installLformsReviewControls.toString()})(document.getElementById('mount'),questions,(action,linkId)=>actions.push({action,linkId}),()=>true);</script>`);
 try{
  expect(await browser.evaluate(`document.querySelectorAll('[data-question-review]').length`)).toBe(6);
  await browser.evaluate(`questions.splice(1);document.getElementById('mount').dispatchEvent(new Event('crl-review-state'));`);
  expect(await browser.evaluate(`document.getElementById('item-a/1').querySelectorAll('button').length`)).toBe(3);
  expect(await browser.evaluate(`document.getElementById('item-a/b/1').querySelectorAll('button').length`)).toBe(0);
  await browser.evaluate(`document.getElementById('item-a/b/1').id='item-a/1/1';document.getElementById('label-a/b/1').id='label-a/1/1';questions.push({linkId:'a/1'});document.getElementById('mount').dispatchEvent(new Event('crl-review-state'));`);
  expect(await browser.evaluate(`document.getElementById('item-a/1/1').querySelectorAll('button').length`)).toBe(3);
  await browser.evaluate(`questions.splice(1);document.getElementById('mount').dispatchEvent(new Event('crl-review-state'));`);
  expect(await browser.evaluate(`document.getElementById('item-a/1/1').querySelectorAll('button').length`)).toBe(0);
  await browser.evaluate(`window.reused=document.getElementById('item-a/1');reused.id='item-first/1';document.getElementById('label-a/1').id='label-first/1';questions.splice(0,questions.length,{linkId:'first'},{linkId:'second'});document.getElementById('mount').dispatchEvent(new Event('crl-review-state'));`);
  await browser.evaluate(`reused.id='item-second/1';document.getElementById('label-first/1').id='label-second/1';`);
  await browser.until(()=>browser.evaluate(`reused.querySelectorAll('button').length===3`),'reused question controls');
  await browser.evaluate(`reused.querySelector('[data-question-review="flag"]').click()`);expect(await browser.evaluate(`actions.at(-1)`)).toEqual({action:'flag',linkId:'second'});
  await browser.evaluate(`const repeated=reused.cloneNode(true);repeated.id='item-second/2';repeated.querySelector('label').id='label-second/2';repeated.querySelector('.crl-question-review-tools').remove();document.getElementById('mount').append(repeated);`);
  await browser.until(()=>browser.evaluate(`document.querySelectorAll('[data-question-review]').length===0`),'ambiguous repeated question disables all tools');
 }finally{await browser.close();}
},30000);
it.skipIf(!browserExecutable)('tree pan is restored after retained criterion descriptions expand the new layout',async()=>{
 const browser=await browserFixture(html());
 try{
  const send=m=>browser.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(m)}}))`);
  const flow='<svg class="flow-svg" width="4000" height="3000" viewBox="0 0 4000 3000"><g data-flow-criterion="c"><g class="flow-criterion-info" data-criterion-info="occ"><rect x="10" y="10" width="20" height="20"/></g></g></svg><details class="flow-criterion-descriptions" hidden><summary>Descriptions</summary><div class="flow-criterion-description" data-criterion-description="c" style="height:2500px">Criterion</div></details>';
  await send({type:'render',gen:1,indexVersion:1,mode:'medical-validation',viewportKey:'policy',html:flow});
  await browser.evaluate(`document.querySelector('[data-criterion-info]').dispatchEvent(new MouseEvent('click',{bubbles:true}));window.scrollTo(350,1200);window.beforeDescriptionPan=[scrollX,scrollY];`);
  expect(await browser.evaluate(`document.querySelector('.flow-criterion-descriptions').open&&scrollY===1200`)).toBe(true);
  await send({type:'render',gen:2,indexVersion:1,mode:'medical-validation',viewportKey:'policy',preserveViewport:true,html:flow.replace('height="3000"','height="100"')});
  expect(await browser.evaluate(`[scrollX,scrollY]`)).toEqual(await browser.evaluate('beforeDescriptionPan'));
 }finally{await browser.close();}
},30000);

it.skipIf(!browserExecutable)('actual tree runtime retains pan across index/redraw and deliberate Focus cancels on manual interaction or a newer Focus',async()=>{
 const browser=await browserFixture(html());
 try{
  const send=m=>browser.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(m)}}))`);
  const flow='<svg class="flow-svg" width="4000" height="3000" viewBox="0 0 4000 3000"><g class="flow-row" data-flow-key="root"><rect x="0" y="0" width="100" height="40"/></g><g class="flow-row" data-flow-key="a"><rect x="3000" y="2000" width="100" height="40"/></g><g class="flow-row" data-flow-key="b"><rect x="2800" y="1800" width="100" height="40"/></g></svg>';
  await send({type:'render',gen:1,indexVersion:1,mode:'medical-validation',viewportKey:'policy',html:flow});
  await browser.evaluate(`window.scrollTo(350,400);window.panBefore=[scrollX,scrollY];`);expect(await browser.evaluate('panBefore[0]>0&&panBefore[1]>0')).toBe(true);
  await send({type:'render',gen:2,indexVersion:2,mode:'medical-validation',viewportKey:'policy',html:flow});expect(await browser.evaluate('[scrollX,scrollY]')).toEqual(await browser.evaluate('panBefore'));
  await browser.evaluate(`window.reveals=[];Element.prototype.scrollIntoView=function(){reveals.push(this.dataset.flowKey)};window.dispatchEvent(new MessageEvent('message',{data:{type:'armQuestionFocus',gen:2,key:'a',token:'cancel'}}));document.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));window.dispatchEvent(new MessageEvent('message',{data:{type:'focusQuestionNode',gen:2,key:'a',token:'cancel'}}));`);
  await browser.evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);expect(await browser.evaluate('reveals')).toEqual([]);
  expect(await browser.evaluate(`sent.some(m=>m.type==='questionFocusResult'&&m.token==='cancel'&&m.status==='cancelled'&&m.reason==='intent')`)).toBe(true);
  await send({type:'focusQuestionNode',gen:2,key:'a',token:'cancel'});expect(await browser.evaluate('reveals')).toEqual([]);
  await send({type:'armQuestionFocus',gen:2,key:'a',token:'other-row'});await browser.evaluate(`const other=document.createElement('button');other.textContent='Another row control';document.body.append(other);other.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));other.remove();`);
  await send({type:'focusQuestionNode',gen:2,key:'a',token:'other-row'});expect(await browser.evaluate(`sent.some(m=>m.type==='questionFocusResult'&&m.token==='other-row'&&m.status==='cancelled')&&reveals.length===0`)).toBe(true);
  await browser.evaluate(`for(const key of ['a','b'])for(const type of ['armQuestionFocus','focusQuestionNode'])window.dispatchEvent(new MessageEvent('message',{data:{type,gen:2,key,token:key}}));`);
  await browser.until(()=>browser.evaluate('reveals.length===1'),'latest question focus');expect(await browser.evaluate('reveals')).toEqual(['b']);expect(await browser.evaluate('document.activeElement.dataset.flowKey')).toBe('b');
  await browser.evaluate(`for(const message of ${JSON.stringify([{type:'render',gen:3,indexVersion:2,mode:'medical-validation',viewportKey:'policy',html:flow},{type:'armQuestionFocus',gen:3,key:'a',token:'before-ack'}])})window.dispatchEvent(new MessageEvent('message',{data:message}));`);
  expect(await browser.evaluate(`sent.some(m=>m.type==='questionFocusResult'&&m.token==='before-ack'&&m.status==='armed')&&!sent.some(m=>m.type==='questionFocusResult'&&m.token==='before-ack'&&m.status==='cancelled')`)).toBe(true);
 }finally{await browser.close();}
},30000);
