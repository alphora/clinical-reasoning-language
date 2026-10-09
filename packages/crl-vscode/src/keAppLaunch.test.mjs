import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {qaFixture} from './qaFlagEditingFixture.mjs';
import {resolveKeLaunchTarget} from './keAppLaunch.ts';
import {keAppHtml} from './keAppHtml.ts';
// @kit mv-wording-patches:ke-app-launch
test('standalone entity-folder URI resolves its artifact even when absent, without a CEL or lock requirement',()=>{
 const f=qaFixture();try{assert.deepEqual(resolveKeLaunchTarget({scheme:'file',fsPath:join(f.root,'src/knowledge-engineering')}),{kind:'artifact',root:f.root});assert.deepEqual(resolveKeLaunchTarget(f.policy),{kind:'artifact',root:f.root});assert.equal(resolveKeLaunchTarget({scheme:'git',fsPath:f.policy}).kind,'error');assert.equal(resolveKeLaunchTarget('relative').kind,'error');assert.equal(resolveKeLaunchTarget({artifactRoot:f.root}).kind,'error');assert.equal(resolveKeLaunchTarget(null).kind,'none');}finally{f.close();}
});
test('managed launch takes shallowest artifact package, not a nested package, and refuses project-root miswiring',()=>{
 const f=qaFixture();try{writeFileSync(join(f.root,'kelp.project.json'),'{}');const artifact=join(f.root,'artifacts/A'),nested=join(artifact,'src/knowledge-engineering/nested');mkdirSync(nested,{recursive:true});writeFileSync(join(artifact,'package.json'),'{}');writeFileSync(join(nested,'package.json'),'{}');assert.deepEqual(resolveKeLaunchTarget({scheme:'file',fsPath:join(nested,'missing')}),{kind:'artifact',root:artifact});assert.equal(resolveKeLaunchTarget(f.root).kind,'error');}finally{f.close();}
});
test('KE webview script parses and authored values use textContent under a nonce CSP',()=>{
 const html=keAppHtml('nonce');const script=html.match(/<script nonce="nonce">([\s\S]+)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(script));assert.doesNotMatch(script,/innerHTML|outerHTML|eval\(/);assert.match(html,/script-src 'nonce-nonce'/);assert.match(html,/Original \(request baseline\)/);assert.match(script,/textContent/);
});
