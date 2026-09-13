import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let body;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='pinnedVerdictMenu')body=n.getText(source);ts.forEachChild(n,visit);}visit(source);
test('QR verdict saves refresh paint without route selection or tree reconstruction',async()=>{
 const calls=[],tree={gen:1,panel:{webview:{postMessage:message=>calls.push(['focus',message.type])}}},pin={token:'pin',epoch:1,verdictCaseIds:['a','b']};
 const context=vm.createContext({pinnedCards:pin,views:new Map([['tree',tree]]),mvSidecarPath:'mv.json',mvRevision:0,indexVersion:1,mode:'medical-validation',reviewByCaseId:{},notesByCaseId:{},
  pinnedVerdict:()=>({state:'unreviewed'}),REVIEW_ORDER:['pass'],REVIEW_LABEL:{pass:'Pass'},
  vscode:{window:{showQuickPick:async()=>({state:'pass'})}},setAllReviewState:(_map,ids,state)=>({map:Object.fromEntries(ids.map(id=>[id,state])),changed:true}),
  persistMv:map=>{calls.push(['save',map]);return true;},renderPane:pane=>calls.push(['render',pane]),renderTreeChrome:()=>calls.push(['chrome']),driveDoneOverlay:()=>calls.push(['overlay']),cockpitAgentBridge:{notifyChanged:()=>calls.push(['notify'])},
  dispatch:()=>{throw Error('Route selection must not change after verdict');},
 });
 vm.runInContext(transformSync(body,{loader:'ts',target:'es2022'}).code,context);await context.pinnedVerdictMenu('pin');
 assert.deepEqual(calls,[['focus','routeVerdictFocus'],['save',{a:'pass',b:'pass'}],['render','worklist'],['chrome'],['overlay'],['notify']]);
});
