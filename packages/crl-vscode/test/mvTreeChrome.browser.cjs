// Actual shell CSS, toolbar renderer and complete webview runtime in an owned browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const repo=path.resolve(__dirname,'../../..'),out=process.env.CRL_MV_HEADER_OUT||path.join(repo,'tmp/mv-header-browser');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({stdin:{contents:`export {shellHtml} from './packages/crl-vscode/src/correspondenceCockpit';export {renderMvTreeChrome} from './packages/crl-vscode/src/mvTreeChrome';export {flowLegendChrome} from './packages/crl-vscode/src/flowPaneHtml';`,resolveDir:repo,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'fixture.cjs'),alias:{vscode:path.join(repo,'packages/crl-vscode/test/oracle/vscode-stub.ts')},logLevel:'error'});
const {shellHtml,renderMvTreeChrome,flowLegendChrome}=require(path.join(out,'fixture.cjs'));
const button=(label,attrs='')=>`<button class="fc-toggle-btn" ${attrs}>${label}</button>`;
const header=renderMvTreeChrome({status:'<div class="mv-progress">Reviewed 0/11</div><div class="mv-flags">⚑ 1 open flag</div>',highlighting:`<div class="fc-toggle"><span class="fc-toggle-label">Highlight:</span>${button('Expected-result blockers','data-fc-mode="blocking"')}${button('All unmet conditions','data-fc-mode="all"')}</div>`,explanation:`<div class="fc-toggle"><span class="fc-toggle-label">Explain outcome:</span>${button('Off','data-diverter-toggle="0"')}${button('On','data-diverter-toggle="1"')}</div>`,tools:`<div class="fc-toggle">${button('Review verdicts','data-review-verdicts')}${button('Export snapshot','data-export-snapshot')}</div>`,questionnaires:`<div class="fc-toggle">${button('CRL Questionnaire','data-questionnaire-pane="questionnaire"')}${button('FHIR Questionnaire','data-questionnaire-pane="fhirQuestionnaire"')}${button('Interactive FHIR Questionnaire','data-interactive-questionnaire')}</div>`,legend:flowLegendChrome('medical-validation'),documents:{complete:true,warnings:[],documents:[{group:'Source',relativePath:'policy.pdf'},{group:'Refined source',relativePath:'policy.docx'}]},documentToken:'browser-owned',history:false,recovery:false});
let html=shellHtml('tree','https://fixture.invalid',file=>file).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
html=html.replace('</head>',`<style>:root{--vscode-foreground:#ccc;--vscode-editorWidget-background:#252526;--vscode-panel-border:#454545;--vscode-descriptionForeground:#aaa;--vscode-font-family:Arial,sans-serif}body{background:#1e1e1e}</style><script>window.messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m),getState:()=>null,setState:()=>{}});</script></head>`).replace('<div id="fcChrome"></div>',`<div id="fcChrome">${header}</div>`);
fs.writeFileSync(path.join(out,'header.html'),html);
(async()=>{
 const {browserFixture}=await import('./browserHarness.mjs');const browser=await browserFixture(html);
 try{
  for(const width of [1600,900,360]){
   await browser.rpc('Emulation.setDeviceMetricsOverride',{width,height:760,deviceScaleFactor:1,mobile:false});
   const metrics=await browser.evaluate(`(()=>{const toolbar=document.querySelector('.mv-toolbar'),groups=[...toolbar.children].map(e=>{const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label'),x:r.x,y:r.y,right:r.right};});return {groups,overflow:toolbar.scrollWidth>toolbar.clientWidth,headingShadow:getComputedStyle(document.querySelector('.mv-toolbar-heading')).textShadow};})()`);
   assert.deepEqual(metrics.groups.map(g=>g.name),['Status','Actions','Legend']);assert.equal(metrics.overflow,false,'toolbar overflow at '+width);assert.notEqual(metrics.headingShadow,'none');
   if(width===1600)assert.equal(new Set(metrics.groups.map(g=>g.y)).size,1,'three horizontal groups');
   const shot=await browser.rpc('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`header-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await browser.evaluate(`document.querySelector('[data-source-document="1"]').click();document.querySelector('[data-fc-mode="all"]').click();document.querySelector('[data-diverter-toggle="1"]').click();document.querySelector('[data-interactive-questionnaire]').click()`);
  const messages=await browser.evaluate('window.messages');assert(messages.some(m=>m.type==='openToolbarSourceDocument'&&m.idx===1&&m.token==='browser-owned'));assert(messages.some(m=>m.type==='fcMode'&&m.mode==='all'));assert(messages.some(m=>m.type==='diverterToggle'&&m.on==='1'));assert(messages.some(m=>m.type==='openInteractiveQuestionnaire'));
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,widths:[1600,900,360],messages},null,2));console.log('MV header browser checks passed at 1600, 900 and 360px.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
