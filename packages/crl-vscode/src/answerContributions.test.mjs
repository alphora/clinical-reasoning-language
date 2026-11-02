// REFACTOR:grounded: known membership previews a contribution branch; it is never a one-answer verdict.
import assert from 'node:assert/strict';
import { buildAnswerContributions, contributionsForOccurrences, partitionAnswerChoices } from './answerContributions.ts';
import { renderFlowPane, toggleCriterionExpansion } from './flowPaneHtml.ts';
import { buildRouteCards, definitionValueInputs } from './routeCards.ts';
const options=['a','b','c','d'].map(code=>({system:'urn:choices',code,display:code==='c'?'Uncertain':code.toUpperCase()}));
const q={nodeKey:'q',name:'Treatment',lib:'L',hasLocalCode:true,definitionRefs:[],valueTypes:['CodeableConcept'],location:{},answerOptions:options};
const check=(id,yes)=>({id,label:id,expression:'Treatment in '+id,status:'simple',subjects:[{key:'q',label:'Which treatment?',matches:options.filter(v=>yes.includes(v.code)),nonmatches:options.filter(v=>!yes.includes(v.code))}]});
const first={nodeKey:'c1',name:'Treatment1',lib:'L',hasLocalCode:false,definitionKind:'definition-is',definitionRefs:['q'],location:{},conditionAnswers:check('Treatment1',['a','c'])};
const second={...first,nodeKey:'c2',name:'Treatment2',conditionAnswers:check('Treatment2',['b'])};
const n=(key,kind,label,refs=[],children=[],extra={})=>({nodeKey:key,nodeId:key,lib:'L',decision:'D',kind,label,refKeys:refs,location:{},children,...extra});
const terminal=(key,label='certify.Met')=>n(key,'action',label,['activity'],[],{actionKind:'recommend-activity'});
const tree=[{nodeKey:'root',lib:'L',decision:'D',location:{},children:[n('w','when','Treatment1',['c1'],[terminal('met')]),n('otherwise','otherwise','otherwise',[],[terminal('unmet','not-certify.Unmet')])]}];
const concepts=[q,first,second];
const leaf=(key,name)=>({kind:'leaf',nodeKey:key,lib:'L',name,isSource:false});
test('a known code uses the matching or nonmatching branch without assuming other answers',()=>{
 const rows=buildAnswerContributions(tree,concepts).get('w');
 assert.equal(rows.find(r=>r.code==='a').label,'Met');assert.equal(rows.find(r=>r.code==='a').branch,'left');
 assert.equal(rows.find(r=>r.code==='b').label,'Unmet');assert.equal(rows.find(r=>r.code==='b').branch,'right');
 assert.equal(rows.find(r=>r.code==='c').branch,'left','a coded Uncertain label remains a known coding');
 assert.ok(rows.every(r=>r.explanation.includes('Other checks may also apply')));
});
test('ANY and ALL preserve contribution labels rather than inventing Depends or predicting the criterion result',()=>{
 for(const kind of ['and','or']){
  const outlines=new Map([['w',{expr:{kind,operands:[leaf('c1','Treatment1'),leaf('c2','Treatment2')]}}]]);
  const rows=buildAnswerContributions(tree,concepts,outlines).get('w');
  assert.equal(rows.find(r=>r.checkId==='Treatment1'&&r.code==='a').label,'Met');
  assert.equal(rows.find(r=>r.checkId==='Treatment2'&&r.code==='a').label,'Unmet');
  assert.equal(rows.length,8);assert.ok(rows.every(r=>r.label!=='Depends'));
 }
});
test('NOT reverses contribution direction at its actual occurrence',()=>{
 const outlines=new Map([['w',{expr:{kind:'or',operands:[leaf('c1','Treatment1'),{kind:'not',operand:leaf('c1','Treatment1')}]}}]]);
 const rows=buildAnswerContributions(tree,concepts,outlines).get('w').filter(r=>r.code==='a');
 assert.deepEqual(rows.map(r=>r.branch),['left','right']);assert.deepEqual(rows.map(r=>r.negated),[false,true]);
});
test('preview follows only the actual immediate successor and preserves guarded or delegated work',()=>{
 const successor=(body)=>[{...tree[0],children:[n('w','when','Treatment1',['c1'],body)]}];
 for(const target of [n('other','when','Another check',['c2']),terminal('guarded'),n('delegate','action','Subdecision',['decision'],[],{actionKind:'use-decision'})]){
  if(target.nodeKey==='guarded')target.refKeys.push('guard');
  assert.equal(buildAnswerContributions(successor([target]),concepts).get('w').find(r=>r.code==='a').label,'Continue');
 }
 assert.equal(buildAnswerContributions(successor([]),concepts).get('w').find(r=>r.code==='a').label,'No next step');
 assert.equal(buildAnswerContributions(successor([terminal('a'),terminal('b')]),concepts).get('w').find(r=>r.code==='a').label,'Multiple next steps');
});
test('grouping retains complete choices and exact coding identity and refuses unsupported interpretation',()=>{
 const groups=partitionAnswerChoices(options,first.conditionAnswers,'q');
 assert.deepEqual(groups.map(g=>[g.branch,g.choices.map(v=>v.code)]),[['left',['a','c']],['right',['b','d']]]);
 assert.deepEqual(partitionAnswerChoices(options,first.conditionAnswers,'q',true).map(g=>g.choices.map(v=>v.code)),[['b','d'],['a','c']]);
 assert.equal(partitionAnswerChoices([{...options[0],system:'urn:other'}],first.conditionAnswers,'q'),undefined);
 assert.equal(partitionAnswerChoices(options,{...first.conditionAnswers,status:'calculation'},'q'),undefined);
});
test('actual helper occurrences show their own grouped full answers and keep source question ownership',()=>{
 const outlines=new Map([['w',{expr:{kind:'criterion',name:'C',lib:'L',bodyHash:'c',operand:{kind:'or',operands:[leaf('c1','Treatment1'),leaf('c2','Treatment2')]}}}]]);
 const opts={concepts,guardOutlines:outlines,answerOptionsByConcept:new Map([['q',options]])};
 let opened=toggleCriterionExpansion(new Set(),'w',tree,opts),r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});
 const keys=Object.values(r.reveals).filter(h=>h.criterionToggle?.endsWith('"opts"]')).map(h=>h.criterionToggle);
 assert.equal(keys.length,2);keys.forEach(k=>opened.add(k));r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});
 assert.equal((r.html.match(/data-flow-choice=/g)||[]).length,8);
 assert.equal((r.html.match(/flow-answer-group flow-answer-left/g)||[]).length,2);
 assert.equal((r.html.match(/flow-answer-group flow-answer-right/g)||[]).length,2);
 assert.match(r.html,/data-flow-label="Treatment1"/);assert.match(r.html,/data-flow-label="Treatment2"/);
 assert.equal(r.conceptOccurrences.filter(o=>o.name==='Treatment').length,2);
 assert.ok(!r.html.includes('foreignObject'));assert.ok(!r.html.includes('View answers'));
 assert.ok(Object.values(r.reveals).filter(h=>h.subQuestionLeafKey).length>=2);
});
test('a rejected named parent never borrows supported descendants as its own grouping',()=>{
 const parent={nodeKey:'parent',name:'Unsupported parent',lib:'L',hasLocalCode:false,definitionKind:'defined-as',definitionRefs:['c1','c2'],location:{},conditionAnswers:{...first.conditionAnswers,id:'parent',label:'Unsupported parent',status:'unsupported',subjects:[]}};
 const composite={kind:'or',operands:[leaf('c1','Treatment1'),leaf('c2','Treatment2')]};
 const outlines=new Map([['w',{expr:{kind:'criterion',name:'C',lib:'L',bodyHash:'c',operand:{...leaf('parent','Unsupported parent'),composite}}}]]);
 const opts={concepts:[...concepts,parent],guardOutlines:outlines,answerOptionsByConcept:new Map([['q',options]])};
 let opened=toggleCriterionExpansion(new Set(),'w',tree,opts);
 for(let pass=0;pass<3;pass++){const r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});for(const hit of Object.values(r.reveals))if(hit.criterionToggle)opened.add(hit.criterionToggle);}
 const r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});
 assert.ok(!r.html.includes('flow-answer-group'));assert.match(r.html,/Unsupported parent/);
 assert.equal((r.html.match(/data-flow-choice=/g)||[]).length,8,'full source answer domains remain visible');
});
test('a supported sibling cannot admit the same check beneath a rejected parent, including deduplicated card uses',()=>{
 const parent={nodeKey:'parent',name:'Unsupported parent',lib:'L',hasLocalCode:false,definitionKind:'defined-as',definitionRefs:['c1','c2'],location:{},conditionAnswers:{...first.conditionAnswers,id:'parent',label:'Unsupported parent',status:'unsupported',subjects:[]}};
 const rejected={...leaf('parent','Unsupported parent'),composite:{kind:'or',operands:[leaf('c1','Treatment1'),leaf('c2','Treatment2')]}};
 const expr={kind:'criterion',name:'C',lib:'L',bodyHash:'c',operand:{kind:'or',operands:[leaf('c1','Treatment1'),rejected]}};
 const outlines=new Map([['w',{expr}]]),all=[...concepts,parent],opts={concepts:all,guardOutlines:outlines,answerOptionsByConcept:new Map([['q',options]])};
 let opened=toggleCriterionExpansion(new Set(),'w',tree,opts);
 for(let pass=0;pass<4;pass++){const r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});for(const hit of Object.values(r.reveals))if(hit.criterionToggle)opened.add(hit.criterionToggle);}
 const r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});
 assert.equal((r.html.match(/flow-answer-group flow-answer-/g)||[]).length,2,'only supported occurrence is grouped');
 assert.equal((r.html.match(/data-flow-choice=/g)||[]).length,12,'all three full source domains retained');
 assert.ok(r.html.includes('data-answer-blocked="Unsupported parent"'));
 const convert=e=>e.kind==='criterion'?{...e,body:convert(e.operand)}:e.kind==='or'||e.kind==='and'?{...e,operands:e.operands.map(convert)}:e.kind==='leaf'?{...e,answer:'unknown',isInferred:true,...(e.composite?{composite:convert(e.composite)}:{})}:e;
 const built=buildRouteCards({questions:[{nodeId:'guard',conceptName:'Criterion',libraryName:'L',answer:'unknown',isInferred:true,expansion:convert(expr)}]}, {conceptTruth:[]},()=> 'w',(_lib,name)=>name==='Treatment'?{filePath:'source.crl',questionText:'Which treatment?',questionDescription:'',editable:false}:undefined,()=>options,definitionValueInputs(all),(_lib,name)=>name==='Treatment',()=>undefined,(_lib,name)=>all.find(n=>n.name===name)?.conditionAnswers);
 assert.equal(built.cards.length,1,'shared source question remains deduplicated');
 assert.deepEqual(built.cards[0].unclassifiedAnswerUses,[{ownerKey:'w',checkId:'parent',checkLabel:'Unsupported parent'}]);
 assert.equal(built.cards[0].answerChoices.length,4);
});
test('an admitted membership check uses its prepared subject interpretation even when the subject is not a direct guard',()=>{
 const source={...q,conditionAnswers:{id:'question',label:'Treatment',expression:'Treatment',status:'unsupported',subjects:[]}},all=[source,first,second];
 const expr={kind:'criterion',name:'C',lib:'L',bodyHash:'c',operand:{kind:'or',operands:[leaf('c1','Treatment1'),leaf('c2','Treatment2')]}},outlines=new Map([['w',{expr}]]);
 const opts={concepts:all,guardOutlines:outlines,answerOptionsByConcept:new Map([['q',options]])};
 let opened=toggleCriterionExpansion(new Set(),'w',tree,opts),r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});
 for(const hit of Object.values(r.reveals))if(hit.criterionToggle)opened.add(hit.criterionToggle);
 r=renderFlowPane(tree,{...opts,expandedGuardWhens:opened});
 assert.equal((r.html.match(/flow-answer-group flow-answer-/g)||[]).length,4);
 assert.ok(!r.html.includes('data-answer-blocked="Treatment"'));
 const convert=e=>e.kind==='criterion'?{...e,body:convert(e.operand)}:e.kind==='or'?{...e,operands:e.operands.map(convert)}:{...e,answer:'unknown',isInferred:true};
 const built=buildRouteCards({questions:[{nodeId:'guard',conceptName:'Criterion',libraryName:'L',answer:'unknown',isInferred:true,expansion:convert(expr)}]},{conceptTruth:[]},()=> 'w',(_lib,name)=>name==='Treatment'?{filePath:'source.crl',questionText:'Which treatment?',questionDescription:'',editable:false}:undefined,()=>options,definitionValueInputs(all),(_lib,name)=>name==='Treatment',()=>undefined,(_lib,name)=>all.find(n=>n.name===name)?.conditionAnswers);
 assert.equal(built.cards.length,1);assert.equal(built.cards[0].unclassifiedAnswerUses,undefined);
 assert.equal(built.cards[0].answerChoices.length,4);
});

test('scoped wording variants receive only their paired criterion contributions',()=>{
 const criterion=(name,operand)=>({kind:'criterion',name,lib:'L',bodyHash:name,operand});
 const expr=criterion('Root',{kind:'or',operands:[criterion('Scope1',leaf('c1','Treatment1')),criterion('Scope2',leaf('c2','Treatment2'))]});
 const index=buildAnswerContributions(tree,concepts,new Map([['w',{expr}]]));
 const path=name=>[{lib:'L',name:'Root'},{lib:'L',name}];
 const one=contributionsForOccurrences(index,[{ownerKey:'w',criterionPaths:[path('Scope1')]}],'q');
 const two=contributionsForOccurrences(index,[{ownerKey:'w',criterionPaths:[path('Scope2')]}],'q');
 assert.equal(one.length,4);assert.equal(two.length,4);
 assert.ok(one.every(r=>r.checkId==='Treatment1'));assert.ok(two.every(r=>r.checkId==='Treatment2'));
 assert.equal(contributionsForOccurrences(index,[{ownerKey:'w',criterionPaths:[[]]}],'q').length,0);
});
