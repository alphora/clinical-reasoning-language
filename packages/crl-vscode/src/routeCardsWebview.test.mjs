// REFACTOR:grounded: exercise actual editor events and shared-question variants across all display modes.
import assert from 'node:assert/strict';
import {browserExecutable,browserFixture} from '../test/browserHarness.mjs';
import {installRouteCards,ROUTE_CARD_STYLE} from './routeCardsWebview.ts';

async function fixture(){
 const html=`<!doctype html><html><head><style>${ROUTE_CARD_STYLE}</style></head><body><button id="before">Before</button><div id="tree"></div><div id="pane"></div><script>
 const tree=document.getElementById('tree'),pane=document.getElementById('pane');
 tree.innerHTML='<svg class="flow-svg" viewBox="0 0 1500 700">'+[0,1,2].map(i=>'<g data-flow-key="w'+i+'" data-flow-when="w'+i+'"><rect x="'+(20+i*380)+'" y="20" width="168" height="44"/></g>'+[0,1,2].map(j=>'<g data-flow-key="q'+i+j+'" data-flow-when="w'+i+'" data-flow-parent="w'+i+'" data-flow-outline="1"><rect x="'+(30+i*380)+'" y="'+(100+j*110)+'" width="150" height="34"/></g>').join('')).join('')+'<g data-flow-key="end" class="flow-pinned"><rect x="1200" y="20" width="160" height="44"/></g></svg>';
 for(const n of tree.querySelectorAll('[data-flow-key]'))if(n.dataset.flowKey.startsWith('q'))n.dataset.flowQuestion=JSON.stringify(['L','Q'+n.dataset.flowKey.at(-1)]);
 const install=(${installRouteCards.toString()}),clone=x=>JSON.parse(JSON.stringify(x)),sent=[],panelSent=[];
 const ui=install(tree,{postMessage:m=>sent.push(m)},()=>1),panel=install(pane,{postMessage:m=>panelSent.push(m)},()=>1,()=>{},true);
 const payload={token:'pin',pinKey:'end',questionMode:'inline',authoritativeDrafts:true,label:'Shared inputs',cards:[0,1,2].map(j=>({id:'card'+j,questionNumber:j+1,ownerKey:'w0',occurrences:[0,1,2].map(i=>({ownerKey:'w'+i,criterionPaths:[[]]})),criterionPaths:[[]],library:'L',concept:'Q'+j,text:'Question '+j+'?',description:'Description',value:'Yes',determination:'True',editable:true,answerChoices:j===0?[{code:'yes',display:'Yes',selected:true}]:[]}))};
 function merge(m){if(m.type!=='routeCardDraft')return;const card=payload.cards.find(c=>c.id===m.key);for(const [key,value]of Object.entries(m.fields)){if(value===null)delete card[key];else card[key]=value;}}
 function mode(next){payload.questionMode=next;ui.show(clone(payload));ui.questionnaireState(next==='panel',undefined,undefined,next);if(next==='panel')panel.show(clone(payload));else panel.reset();}
 ui.show(clone(payload));panel.show(clone(payload));
 window.f={tree,pane,ui,panel,clone,sent,panelSent,payload,merge,mode};
 </script></body></html>`;
 return browserFixture(html);
}

test.skipIf(!browserExecutable)('real question editor events survive inline/panel/off cycles, cancel and disclosure restoration',async()=>{
 const b=await fixture();try{
  const result=await b.evaluate(`(()=>{const {tree,pane,ui,panel,sent,panelSent,payload,merge,mode}=f;
   tree.querySelector('.route-description-toggle').click();tree.querySelector('.route-choices-toggle').click();
   tree.querySelector('.route-card-edit').click();let field=tree.querySelector('.route-card-editor:not([hidden]) textarea');field.value='Typed inline';field.dispatchEvent(new Event('input',{bubbles:true}));sent.forEach(merge);
   mode('panel');const transfer=pane.querySelector('.route-card-editor:not([hidden]) textarea').value==='Typed inline';
   field=pane.querySelector('.route-card-editor:not([hidden]) textarea');field.value='Typed in panel';field.dispatchEvent(new Event('input',{bubbles:true}));panelSent.forEach(merge);
   mode('inline');const returned=tree.querySelector('.route-card-editor:not([hidden]) textarea').value==='Typed in panel';
   const disclosure=!!tree.querySelector('.route-card-description')&&tree.querySelector('.route-choices-toggle').getAttribute('aria-expanded')==='true';
   mode('off');mode('panel');const reopened=pane.querySelector('.route-card-editor:not([hidden]) textarea').value==='Typed in panel';
   [...pane.querySelectorAll('.route-card-editor button')].find(n=>n.textContent==='Cancel').click();merge(panelSent.at(-1));mode('inline');
   const cancelled=!tree.querySelector('.route-card-editor:not([hidden])')&&!('draftText' in payload.cards[0])&&!('draftDescription' in payload.cards[0]);
   mode('panel');pane.querySelector('.route-card-edit').click();merge(panelSent.at(-1));field=pane.querySelector('.route-card-editor:not([hidden]) textarea');field.value='Saved wording';field.dispatchEvent(new Event('input',{bubbles:true}));merge(panelSent.at(-1));[...pane.querySelectorAll('.route-card-editor button')].find(n=>n.textContent==='Save change').click();
   const save=panelSent.at(-1);panel.result({token:'pin',key:'card0',ok:true,message:'Saved'});const saved=pane.querySelector('.route-card-status').textContent==='Saved';
   ui.reset();panel.reset();return{transfer,returned,disclosure,reopened,cancelled,saved,save};})()`);
  for(const key of ['transfer','returned','disclosure','reopened','cancelled','saved'])assert.equal(result[key],true,key);
  assert.equal(result.save.type,'routeCardSave');assert.equal(result.save.key,'card0');assert.equal(result.save.fields.questionText,'Saved wording');
 }finally{await b.close();}
});

test.skipIf(!browserExecutable)('shared questions stay deduplicated with wording variants, targeted saves and stale results',async()=>{
 const b=await fixture();try{
  const result=await b.evaluate(`(()=>{const {tree,pane,ui,panel,panelSent,payload,clone}=f;const initial={tree:tree.querySelectorAll('.route-card').length,panel:pane.querySelectorAll('.route-card').length,numbers:[...pane.querySelectorAll('.route-card-caption')].map(n=>n.textContent),noSelector:!pane.querySelector('select')};
   const variants=clone(payload);variants.token='variants';variants.cards=[{...variants.cards[0],scopeLabel:'Criterion A',determination:''},{...variants.cards[0],id:'variant',scopeLabel:'Criterion B',text:'Alternate wording?',value:'Determination: Unknown',determination:'Unknown'}];panel.show(variants);
   const dedup=pane.querySelectorAll('.route-card').length===1,unknown=pane.querySelector('.route-determination-note').textContent.includes('Unknown'),labels=[...pane.querySelectorAll('option')].some(n=>n.textContent.includes('Determination: Unknown'));
   function select(id){const s=pane.querySelector('select');s.value=id;s.dispatchEvent(new Event('change'));}select('variant');pane.querySelector('.route-card-edit').click();[...pane.querySelectorAll('.route-card-editor button')].find(n=>n.textContent==='Save change').click();const target=panelSent.at(-1).key;
   select('card0');panel.result({token:'variants',key:'variant',ok:false,message:'Synthetic failure'});select('variant');const failure=pane.querySelector('.route-card-status').textContent==='Synthetic failure';
   select('card0');panel.result({token:'variants',key:'variant',ok:true,message:'Saved variant'});select('variant');const success=pane.querySelector('.route-card-status').textContent==='Saved variant';
   panel.show({...clone(payload),token:'new'});panel.result({token:'variants',key:'card0',ok:false,message:'Stale'});const stale=![...pane.querySelectorAll('.route-card-status')].some(n=>n.textContent==='Stale');
   ui.reset();panel.reset();return{initial,dedup,unknown,labels,target,failure,success,stale};})()`);
  assert.deepEqual(result.initial,{tree:9,panel:3,numbers:['1','2','3'],noSelector:true});assert.equal(result.target,'variant');for(const k of ['dedup','unknown','labels','failure','success','stale'])assert.equal(result[k],true,k);
 }finally{await b.close();}
});
