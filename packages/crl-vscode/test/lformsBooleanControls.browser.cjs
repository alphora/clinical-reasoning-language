// Real vendored LForms + shipped webview bootstraps. Run with PLAYWRIGHT_MODULE_PATH
// pointing to an installed playwright-core and CRL_BOOLEAN_BROWSER_EXE to Edge/Chrome.
// No native engine or installed VS Code host is claimed by this browser test.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const root = path.resolve(__dirname, '../../..');
const out = path.resolve(process.env.CRL_BOOLEAN_BROWSER_OUT || path.join(root, 'tmp/boolean-clear-browser'));
fs.mkdirSync(out, {recursive: true});
esbuild.buildSync({stdin: {contents: `export * from './packages/crl-vscode/src/interactiveQuestionnaireHtml'; export * from './packages/crl-vscode/src/applyQuestionnairePaneHtml'; export * from './packages/crl-vscode/src/lformsBooleanControls';`, resolveDir: root, loader: 'ts'}, bundle:true, platform:'node', format:'cjs', outfile:path.join(out,'render.cjs')});
const {interactiveQuestionnaireHtml, renderApplyQuestionnairePane, installBooleanAnswerClearControls, APPLY_Q_CONTAINER_ID} = require(path.join(out,'render.cjs'));
const q = {resourceType:'Questionnaire',url:'urn:test:boolean',status:'active',item:[
  {linkId:'a',text:'Parent question',type:'boolean'},
  {linkId:'locked',text:'Read only question',type:'boolean',readOnly:true,initial:[{valueBoolean:true}]},
  {linkId:'coded',text:'Coded question',type:'choice',answerOption:[{valueCoding:{system:'urn:test',code:'null',display:'Not Answered'}}], extension:[{url:'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',valueCodeableConcept:{coding:[{system:'http://hl7.org/fhir/questionnaire-item-control',code:'radio-button'}]}}]},
]};
let mode = 'interactive';
const asset = name => '/'+name;
const server = http.createServer((req,res) => {
  if(req.url === '/') {
    res.setHeader('Content-Type','text/html');
    const html = mode === 'interactive' ? interactiveQuestionnaireHtml('test','http://127.0.0.1:*',asset)
      : '<!doctype html><html><head><meta charset="utf-8"></head><body>'+renderApplyQuestionnairePane({questionnaire:q,questionnaireResponse:null,nonce:'test',styleNonce:'test',assets:{zoneJs:asset('zone.min.js'),lhcFormsJs:asset('lhc-forms.js'),lformsFhirR4Js:asset('lformsFHIR.min.js'),stylesCss:asset('styles.css')}}).html+'</body></html>';
    res.end(html); return;
  }
  const file = path.join(root,'packages/crl-vscode/media/lforms',path.basename(req.url));
  if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png');
  res.end(fs.readFileSync(file));
});
const item = async page => page.evaluate(id=>LForms.Util.getFormFHIRData('QuestionnaireResponse','R4', document.querySelector('#form,#'+id)).item ?? [],APPLY_Q_CONTAINER_ID);
const question = page => page.locator('lhc-item-boolean').first();
(async () => {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({executablePath:process.env.CRL_BOOLEAN_BROWSER_EXE,headless:true});
  const errors=[];
  try {
    const page = await browser.newPage({viewport:{width:850,height:700}});
    await page.addInitScript(()=>{window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});});
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>window.LForms?.FHIR?.R4);
    const send = m => page.evaluate(m=>window.postMessage(m,'*'),m);
    await send({type:'initial',token:1,subject:'Patient/p',states:[{id:'one',label:'one'}]});
    await send({type:'result',token:1,questionnaire:q,response:{resourceType:'QuestionnaireResponse',status:'in-progress'},subject:'Patient/p',activities:[]});
    await question(page).locator('input').first().waitFor();
    const clear = question(page).locator('[data-boolean-clear]');
    assert.equal(await question(page).getByText('Not Answered',{exact:true}).isVisible(),false);
    assert.equal(await clear.isVisible(),false);
    assert.equal(await question(page).locator('input:visible:checked').count(),0);
    // Tab and arrows must never select the hidden third radio.
    await page.locator('#reset').focus(); await page.keyboard.press('Tab');
    assert.equal(await question(page).locator('input').first().evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Space'); await clear.waitFor({state:'visible'});
    assert.equal((await item(page)).find(i=>i.linkId==='a').answer[0].valueBoolean,true);
    await page.keyboard.press('ArrowRight');
    assert.equal((await item(page)).find(i=>i.linkId==='a').answer[0].valueBoolean,false);
    await page.keyboard.press('ArrowRight');
    assert.equal((await item(page)).find(i=>i.linkId==='a').answer[0].valueBoolean,true);
    await clear.focus(); await page.keyboard.press('Enter');
    await clear.waitFor({state:'hidden'});
    assert(!((await item(page)).find(i=>i.linkId==='a')?.answer?.length));
    assert.equal(await question(page).locator('input').first().evaluate(e=>e===document.activeElement),true);
    assert.equal(await page.locator('lhc-item-boolean').nth(1).locator('[data-boolean-clear]').isVisible(),false);
    assert.equal(await page.getByText('Not Answered',{exact:true}).last().isVisible(),true); // coded null untouched
    // Clear an answered parent with nested answers and immediately Continue.
    const nested=structuredClone(q);nested.item[0].item=[{linkId:'child',type:'string',text:'Detail'}];
    await send({type:'result',token:1,questionnaire:nested,response:{resourceType:'QuestionnaireResponse',status:'in-progress',item:[{linkId:'a',answer:[{valueBoolean:true,item:[{linkId:'child',answer:[{valueString:'detail'}]}]}]}]},subject:'Patient/p',activities:['Met']});
    await clear.waitFor({state:'visible'});
    await clear.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(()=>!document.querySelector('#form input[type=text]'));
    assert.equal(await question(page).locator('input').first().evaluate(e=>e===document.activeElement),true);
    await page.locator('#continue').click();
    const posted=await page.evaluate(()=>sent.filter(m=>m.type==='continue').at(-1));
    assert(!posted.response.item.find(i=>i.linkId==='a').answer);
    assert(!posted.questionnaire.item[0].item);
    assert.equal(await question(page).locator('[data-boolean-clear]').count(),1);
    // Repeated group occurrences are adapted independently.
    const grouped={resourceType:'Questionnaire',url:q.url,status:'active',item:[{linkId:'g',type:'group',text:'Related questions',repeats:true,item:[{linkId:'x',type:'boolean',text:'First'},{linkId:'y',type:'boolean',text:'Second'}]}]};
    await send({type:'result',token:1,questionnaire:grouped,response:{resourceType:'QuestionnaireResponse',status:'in-progress',item:[{linkId:'g',item:[{linkId:'x',answer:[{valueBoolean:true}]},{linkId:'y',answer:[{valueBoolean:false}]}]},{linkId:'g',item:[{linkId:'x',answer:[{valueBoolean:false}]},{linkId:'y',answer:[{valueBoolean:true}]}]}]},subject:'Patient/p',activities:[]});
    await page.waitForFunction(()=>document.querySelectorAll('[data-boolean-clear]').length===4);
    assert.equal(await page.locator('[data-boolean-clear]:visible').count(),4);
    assert.equal(await page.locator('[data-boolean-clear]').first().getAttribute('type'),'button');
    await page.locator('[data-boolean-clear]').first().click();
    await page.locator('[data-boolean-clear]').first().waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-boolean-clear]:visible').count(),3);
    // Remount a fresh result and confirm no duplicate adapter controls.
    await send({type:'result',token:1,questionnaire:q,response:{resourceType:'QuestionnaireResponse',status:'in-progress',item:[{linkId:'a',answer:[{valueBoolean:false}]}]},subject:'Patient/p',activities:[]});
    await clear.waitFor({state:'visible'});assert.equal(await clear.count(),1);
    await page.screenshot({path:path.join(out,'yes-no-clear.png')});
    // The saved-form bootstrap installs the same behavior without host edits.
    mode='saved';await page.goto('http://127.0.0.1:'+server.address().port);
    await question(page).locator('input').first().waitFor();
    await question(page).locator('label[id$="|false"]').click();
    await clear.waitFor({state:'visible'});await clear.click();await clear.waitFor({state:'hidden'});
    assert(!((await item(page)).find(i=>i.linkId==='a')?.answer?.length));
    // LForms horizontal layout uses the same Boolean adapter, one clear per cell.
    await page.evaluate(async id=>{
      const mount=document.getElementById(id);mount.replaceChildren();
      const f=LForms.Util.convertFHIRQuestionnaireToLForms({resourceType:'Questionnaire',status:'active',item:[{linkId:'row',type:'group',text:'Horizontal group',item:[{linkId:'left',type:'boolean',text:'Left'},{linkId:'right',type:'boolean',text:'Right'}]}]},'R4');
      f.items[0].displayControl={...f.items[0].displayControl,questionLayout:'horizontal'};
      await LForms.Util.addFormToPage(f,id,{prepopulate:false});
    },APPLY_Q_CONTAINER_ID);
    await page.waitForFunction(()=>document.querySelectorAll('[data-boolean-clear]').length===2);
    for (const control of await page.locator('lhc-item-boolean').all()) {
      assert.equal(await control.evaluate(node=>!!node.closest('td')),true);
      await control.locator('label[id$="|true"]').click();
      assert.equal(await control.locator('[data-boolean-clear]').isVisible(),true);
      const box=await control.boundingBox();assert(box.x>=0 && box.x+box.width<=850);
    }
    await page.waitForTimeout(350); // allow the vendor's radio-dot animation to settle for visual QA
    await page.screenshot({path:path.join(out,'horizontal-clear.png')});
    // Unrecognized shape fails safe; disposal restores vendor controls and is idempotent.
    const synthetic=await page.evaluate(async source=>{
      const mount=document.createElement('div');document.body.append(mount);
      mount.innerHTML='<lhc-item-boolean><nz-radio-group><label id="odd|null"><input type="radio">Original null</label></nz-radio-group></lhc-item-boolean>';
      const install=eval('('+source+')');const dispose=install(mount);
      const intact=!mount.querySelector('label').hidden&&!mount.querySelector('button');dispose();dispose();mount.remove();
      const recognized=document.createElement('div');document.body.append(recognized);
      recognized.innerHTML='<lhc-item-boolean><nz-radio-group><label id="fixture|true"><input type="radio"></label><label id="fixture|false"><input type="radio"></label><label id="fixture|null" style="color:red" aria-hidden="false"><input type="radio" tabindex="2"></label></nz-radio-group></lhc-item-boolean>';
      recognized.querySelector('input').checked=true;
      const empty=recognized.querySelector('label[id$="|null"]');const before=empty.outerHTML;
      const remove=install(recognized);
      const adapted=empty.hidden&&recognized.querySelector('button').type==='button'&&!recognized.querySelector('button').hidden;
      // Queue a refresh, then dispose before it runs.
      recognized.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));remove();remove();
      await new Promise(resolve=>queueMicrotask(resolve));
      const restored=empty.outerHTML===before&&!recognized.querySelector('button');recognized.remove();
      return intact&&adapted&&restored;
    },installBooleanAnswerClearControls.toString());assert(synthetic);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks:['blank','Yes','No','keyboard','clear','readOnly','coded-null','nested-pruning','immediate-Continue','repeated-groups','remount','saved-bootstrap','horizontal-layout','fail-safe','adapted-disposal'],errors},null,2));
    console.log('Boolean controls browser checks passed');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});




