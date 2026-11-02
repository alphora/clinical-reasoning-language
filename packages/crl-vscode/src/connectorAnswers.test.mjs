// REFACTOR:grounded: branch answers are read-only views, not new question or verdict identities.
import assert from 'node:assert/strict';
import { connectorAnswerContent, connectorAnswerMarkup, connectorAnswerExpression } from './connectorAnswers.ts';
import { screenCapturedDom } from './snapshotCapture.ts';
import { renderFlowPane } from './flowPaneHtml.ts';
const member=(code,display=code,system='urn:answers')=>({code,display,system});
const check={id:'first-check',label:'First check',expression:'"Treatment" in "First subset"',status:'simple',subjects:[{key:'q',label:'Which treatment?',matches:[member('a'),member('c','Uncertain')],nonmatches:[member('b'),member('d')]}]};
test('separate outgoing lists preserve the full question and existing identities',()=>{
  const n=(key,kind,children=[])=>({nodeKey:key,nodeId:key,kind,lib:'Demo',decision:'D',label:key,refKeys:kind==='when'?['check']:[],location:{},children});
  const result=renderFlowPane([{nodeKey:'root',lib:'Demo',decision:'D',location:{},children:[n('when','when',[n('met','action')]),n('otherwise','otherwise',[n('unmet','action')])]}],{concepts:[{nodeKey:'check',name:'First check',lib:'Demo',definitionRefs:[],conditionAnswers:check,location:{}}]});
  assert.equal((result.html.match(/<summary>View answers<\/summary>/g)||[]).length,2);
  assert.match(result.html,/>Uncertain<\/li>/); assert.match(result.html,/>b<\/li>/);
  assert.ok(!/Yes:|No:/.test(result.html));
  assert.deepEqual(Object.keys(result.anchors).sort(),['met','otherwise','root','unmet','when']);
});
test('compound connectors preserve quantification and known-value negation',()=>{
  const expr={kind:'and',children:[{kind:'check',check},{kind:'not',operand:{kind:'check',check}}]};
  const html=connectorAnswerContent(expr,false);
  assert.match(html,/At least one of these conditions does not match/);
  assert.match(html,/Negated condition/); assert.match(html,/>Uncertain<\/li>/);
  const aggregate={...check,status:'aggregate',availableValuesOnly:false};
  assert.match(connectorAnswerContent({kind:'check',check:aggregate},false),/required unanswered question/);
  assert.match(connectorAnswerContent({kind:'check',check:{...aggregate,availableValuesOnly:true}},false),/currently available answers/);
});
test('competing contributions and rejected conditions never claim deterministic answer partitions',()=>{
  for(const status of ['calculation','unsupported','opaque']){
    const html=connectorAnswerContent({kind:'check',check:{...check,status,note:'Unavailable'}},true);
    assert.match(html,/First subset/); assert.ok(!html.includes('<li'));
  }
});
test('same display, distinct coding and hostile display text remain distinguishable and escaped',()=>{
  const c={...check,subjects:[{...check.subjects[0],matches:[member('a','Same','urn:a'),member('b','Same','urn:b'),member('x','<img onerror="x">')]}]};
  const html=connectorAnswerContent({kind:'check',check:c},true);
  assert.match(html,/a; urn:a/);assert.match(html,/b; urn:b/);assert.ok(!html.includes('<img'));
  const opposite={...check,subjects:[{...check.subjects[0],matches:[member('a','Other','urn:a')],nonmatches:[member('b','Other','urn:b')]}]};
  assert.match(connectorAnswerContent({kind:'check',check:opposite},true),/a; urn:a/);
  assert.match(connectorAnswerContent({kind:'check',check:opposite},false),/b; urn:b/);
});
test('native inert disclosures survive snapshot screening while foreignObject injection is rejected',()=>{
  const markup=connectorAnswerMarkup('id','from','to',true,{kind:'check',check},20,30);
  assert.equal(screenCapturedDom(markup).ok,true);
  assert.equal(screenCapturedDom(markup.replace('data-connector-disclosure="id"','open="" data-connector-disclosure="id"')).ok,true);
  for(const injected of ['<script>alert(1)</script>','<iframe src="x"></iframe>','<a href="javascript:x">X</a>','<div style="color:red">X</div>','<p onclick="x">X</p>','<svg><animate></animate></svg>','<input value="x">'])
    assert.equal(screenCapturedDom(markup.replace('</details>',injected+'</details>')).ok,false,injected);
  assert.equal(screenCapturedDom('<foreignObject><div>Not an admitted connector</div></foreignObject>').ok,false);
});
test('a guard without prepared answer interpretation keeps its existing display',()=>{
  assert.equal(connectorAnswerExpression({kind:'when',nodeKey:'when',label:'Opaque',refKeys:['missing']},new Map()),undefined);
});

test('one criterion disclosure keeps distinct checks of the same question and their AND/OR groups',()=>{
 const second={...check,id:'second',label:'Second check',subjects:[{...check.subjects[0],matches:[member('b')],nonmatches:[member('a'),member('c'),member('d')]}]};
 const compound={kind:'group',label:'Treatment criterion',operand:{kind:'and',children:[{kind:'or',children:[{kind:'check',check},{kind:'check',check:second}]},{kind:'text',text:'Location check'}]}};
 const html=connectorAnswerContent(compound,true);
 assert.match(html,/Treatment criterion/);assert.match(html,/All of these conditions match/);assert.match(html,/At least one of these conditions matches/);
 assert.match(html,/First check/);assert.match(html,/Second check/);assert.equal((html.match(/Which treatment\?/g)||[]).length,2);
 assert.match(connectorAnswerContent(compound,false),/At least one of these conditions does not match/);
});
