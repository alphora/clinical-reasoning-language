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
import {installLformsReviewControls} from './lformsReviewControls.ts';
import {browserExecutable,browserFixture} from '../test/browserHarness.mjs';

const raw=readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('host.ts',raw,ts.ScriptTarget.Latest,true);
const root=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerCorrespondenceCockpit');
const body=name=>root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);
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
