// REFACTOR:grounded: the shipped native form preserves local edits until an explicit successful Default.
import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {interactiveQuestionnaireHtml} from './interactiveQuestionnaireHtml';
import {browserExecutable,browserFixture} from '../test/browserHarness.mjs';
it.skipIf(!browserExecutable)('real LForms Default is manual; availability and failures retain form/answers; success replaces it',async()=>{
 const nonce='test',html=interactiveQuestionnaireHtml(nonce,'file:',name=>pathToFileURL(resolve('packages/crl-vscode/media/lforms',name)).href)
  .replace('<script nonce="test" src=',`<script nonce="test">window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});</script><script nonce="test" src=`);
 const browser=await browserFixture(html);
 try{
  const send=m=>browser.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(m)}}))`);
  const q={resourceType:'Questionnaire',url:'urn:manual-default',status:'active',item:[{linkId:'one',type:'boolean',text:'Question one'}]};
  const response={resourceType:'QuestionnaireResponse',questionnaire:q.url,subject:{reference:'Patient/p'},item:[{linkId:'one',answer:[{valueBoolean:true}]}]};
  await send({type:'initial',token:1,states:[],defaults:{label:'First row'},initialStateError:'request-1/request-bundle.json: invalid bundle'});
  expect(await browser.evaluate(`document.querySelector('h1').textContent`)).toBe('FHIR Questionnaire');
  expect(await browser.evaluate(`document.getElementById('default').disabled`)).toBe(false);
  expect(await browser.evaluate(`document.getElementById('status').textContent`)).toContain('request-1/request-bundle.json: invalid bundle');
  await browser.evaluate(`document.getElementById('default').click()`);expect(await browser.evaluate(`sent.at(-1).type`)).toBe('default');
  await send({type:'result',token:1,evaluationId:'first',states:[{id:'row-default:first',label:'Empty assessment — First row'}],selectedId:'row-default:first',defaulted:true,defaultLabel:'First row',questionnaire:q,response,subject:'Patient/p',activities:['Met'],review:{questions:[{linkId:'one'}],outcomes:[]}});
  await browser.until(()=>browser.evaluate(`document.querySelectorAll('[data-question-review]').length===3 && !document.getElementById('continue').disabled`),'native form');
  expect(await browser.evaluate(`document.getElementById('assessment').textContent`)).toBe('Loaded row: First row');
  expect(await browser.evaluate(`document.getElementById('assessment').hidden`)).toBe(false);
  expect(await browser.evaluate(`document.getElementById('status').textContent`)).toContain('Selected row defaults loaded.');
  await browser.evaluate(`window.original=document.querySelector('wc-lhc-form');const radio=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()==='No');radio.click();`);
  await browser.until(()=>browser.evaluate(`LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form')).item[0].answer[0].valueBoolean===false`),'edited answer');
  await send({type:'defaults',token:1,label:'Second row'});
  expect(await browser.evaluate(`document.getElementById('assessment').textContent`)).toBe('Loaded row: First row');
  expect(await browser.evaluate(`original===document.querySelector('wc-lhc-form')`)).toBe(true);
  await browser.evaluate(`document.getElementById('default').click()`);await send({type:'error',token:1,message:'Failed candidate'});
  expect(await browser.evaluate(`original===document.querySelector('wc-lhc-form') && LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form')).item[0].answer[0].valueBoolean===false`)).toBe(true);
  expect(await browser.evaluate(`document.getElementById('continue').disabled`)).toBe(false);
  await browser.evaluate(`document.getElementById('default').click()`);await send({type:'result',token:1,evaluationId:'second',defaulted:true,defaultLabel:'Second row',questionnaire:q,response,subject:'Patient/p',activities:['Met']});
  await browser.until(()=>browser.evaluate(`original!==document.querySelector('wc-lhc-form') && !document.getElementById('continue').disabled`),'replacement form');
  expect(await browser.evaluate(`document.getElementById('assessment').textContent`)).toBe('Loaded row: Second row');
  await send({type:'reset',token:2,id:'row-default:first',subject:'Patient/p',label:'Empty assessment — First row',emptyAssessment:true});
  expect(await browser.evaluate(`document.getElementById('assessment').textContent`)).toBe('Empty assessment — First row');
  expect(await browser.evaluate(`document.getElementById('status').textContent`)).toContain('Ready for an empty assessment.');
  expect(await browser.evaluate(`document.getElementById('status').textContent`)).toContain('Default to load');
 }finally{await browser.close();}
},45000);
