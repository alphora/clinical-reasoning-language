// REFACTOR:grounded: exercise the current cockpit Save/status functions with real MV request storage.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,relative,join} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {loadFlags,flagStoreDir} from '@smile-digital-health/crl';
import {planTerminologyEdit} from '@smile-digital-health/crl/language-services';
import {resolveAnswerTarget} from './answerEditing.ts';
import {saveQuestionRequest,saveAnswerRequest,changeQaRequest,overlayQaRequests} from './qaFlagEditing.ts';
import {qaFixture} from './qaFlagEditingFixture.mjs';
const source=ts.createSourceFile('cockpit.ts',readFileSync(fileURLToPath(new URL('./correspondenceCockpit.ts',import.meta.url)),'utf8'),ts.ScriptTarget.Latest,true),bodies=new Map();
function scan(n){if(ts.isFunctionDeclaration(n)&&n.name)bodies.set(n.name.text,n.getText(source));ts.forEachChild(n,scan);}scan(source);
function harness(f){
 const posts=[],errors=[],pin={epoch:1,token:'pin',caseId:'case',routeId:'route',traversalKey:'traversal',payload:{showQuestions:true,cards:[f.card()]},targets:new Map([['q',f.wording()]]),answerTargets:new Map([['q',f.answer()]])};
 const c=vm.createContext({Error,Map,JSON,relative,dirname,resolve,currentCel:'fixture.cel',mode:'medical-validation',indexVersion:1,pinnedCards:pin,
  views:new Map([['tree',{gen:1,panel:{webview:{postMessage:m=>posts.push(m)}}}]]),branchQuestionnaire:{post:m=>posts.push(m)},
  assertMvWriteAllowed:()=>{},resolveCelSuite:()=>({ok:true,suite:{projectRoot:f.root}}),flagStoreDir:()=>f.flags,saveQuestionRequest,saveAnswerRequest,changeQaRequest,
  reloadReviewFlags:()=>{},renderTreeChrome:()=>{},driveFlagBadges:()=>{},pinCards:()=>{},
  coordinateDirectEdit:()=>{throw Error('MV must not publish source');},
  vscode:{window:{showErrorMessage:m=>errors.push(m)}}});
 for(const name of ['saveCard','qaRequestAction'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts',target:'es2022'}).code,c);
 return{c,posts,errors,pin};
}
test('actual cockpit Q/A Save writes flags with no source publication or KELP dependency',async()=>{
 const f=qaFixture();try{const h=harness(f),before=[readFileSync(f.policy,'utf8'),readFileSync(f.terms,'utf8')];
  await h.c.saveCard({token:'pin',key:'q',fields:{questionText:'Requested question? ',questionDescription:'Requested detail'}});
  await h.c.saveCard({token:'pin',key:'q',answer:{operation:'update',system:f.system,code:'yes',display:'Requested Yes',description:'Requested description'}});
  assert.equal(loadFlags(f.flags).flags.length,2);assert.equal(h.errors.length,0);assert.ok(h.posts.some(m=>m.ok&&m.message==='Request saved for KE.'));
  assert.deepEqual([readFileSync(f.policy,'utf8'),readFileSync(f.terms,'utf8')],before);
 }finally{f.close();}
});
test('host rejects stale pin and arbitrary request id; current Q/A controls change manual status',async()=>{
 const f=qaFixture();try{const h=harness(f);await h.c.saveCard({token:'stale',key:'q',fields:{questionText:'Bad',questionDescription:''}});assert.equal(loadFlags(f.flags).flags.length,0);
  await h.c.saveCard({token:'pin',key:'q',fields:{questionText:'Requested?',questionDescription:''}});const flag=loadFlags(f.flags).flags[0];h.pin.payload.cards[0].questionRequest={id:flag.id};
  h.c.qaRequestAction({token:'pin',key:'q',requestId:'arbitrary',value:'fixed'});assert.equal(loadFlags(f.flags).flags[0].status,'open');
  h.c.qaRequestAction({token:'pin',key:'q',requestId:flag.id,value:'fixed'});assert.equal(loadFlags(f.flags).flags[0].status,'fixed');
  h.c.qaRequestAction({token:'pin',key:'q',requestId:flag.id,value:'approved'});assert.equal(loadFlags(f.flags).flags[0].status,'approved');
 }finally{f.close();}
});

test('actual pin construction retains deletion review controls after remaining vocabulary becomes read-only',()=>{
 const f=qaFixture();try{
  const source=f.term.replace('- code is `no` display is `No`.','- system is `urn:external`.\n- code is `no` display is `No`.');writeFileSync(f.terms,source);
  const flag=saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'delete',system:f.system,code:'yes'});
  writeFileSync(f.terms,planTerminologyEdit(source,{operation:'delete',library:'Terms',terminology:'Options',canonicalBase:'http://example.org/qa',system:f.system,code:'yes'}).candidateSource);
  const card=f.card(),posts=[],route={terminalId:'route',nodeIds:[],nodeKeys:['terminal']};
  card.answerChoices=card.answerChoices.filter(c=>c.code==='no');card.answerChoices[0].system='urn:external';
  const c=vm.createContext({randomUUID,JSON,Map,Set,mode:'medical-validation',pinnedCards:undefined,indexVersion:1,currentCel:'fixture.cel',wordingSources:new Map(),crlStructure:[],conceptLayer:[],guardOutlines:[],expandedGuardWhens:new Set(),crlMaps:undefined,flagsList:loadFlags(f.flags).flags,
   views:new Map([['tree',{gen:1,panel:{webview:{postMessage:m=>posts.push(m)}}}]]),scenarioByCaseId:new Map([['case',{case:{name:'Case'},tree:{}}]]),
   routesForCase:()=>[route],treeTraversalEntries:()=>[{caseId:'case',route}],treeTraversalSignature:()=> 'traversal',branchNeighbors:()=>({index:0,total:1}),clearTreeFocus:()=>{},
   whenKeyResolver:()=>()=>undefined,buildRouteQuestionnaire:()=>({questions:[]}),buildResolveValueTypes:()=>{},buildConceptShapeResolver:()=>{},buildDefExprResolver:()=>{},
   buildRouteCards:()=>({cards:[card],targets:new Map()}),definitionValueInputs:()=>{},resolveCelSuite:()=>({ok:true,suite:{projectRoot:f.root,policyPath:f.policy}}),resolveAnswerTarget,overlayQaRequests,
   answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},expandTraversalCriteria:s=>s,expandQuestionInputs:s=>s,
   leafBucketsFromQuestionnaire:()=>({yesKeys:[],noKeys:[]}),conditionTruthKeys:()=>[],caseIdsThroughReviewNode:()=>[],pinnedVerdict:()=> 'pending',treeFocusPaint:()=>({nodeKeys:[],groupKeys:[],groupOutcomes:[]}),
   branchQuestionnaire:{isOpen:false},driveLeafMarks:()=>{}});
  vm.runInContext(transformSync(bodies.get('pinCards'),{loader:'ts',target:'es2022'}).code,c);c.pinCards('case','route',undefined,true,'traversal');
  assert.equal(posts.length,1);const rendered=posts[0].cards[0];assert.equal(rendered.answerEditor.editable,false);
  const deleted=rendered.answerChoices.find(c=>c.code==='yes');assert.equal(deleted.request.id,flag.id);assert.equal(deleted.pendingDelete,true);assert.equal(deleted.editable,false);
  assert.equal(c.pinnedCards.answerTargets.get('q').editable,false);
 }finally{f.close();}
});

test('actual pin handles local requests alongside imported read-only question and answer owners',()=>{
 const f=qaFixture();try{
  const dir=join(f.root,'node_modules/imported');mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'package.json'),JSON.stringify({name:'imported',version:'1.0.0',crl:{libraries:['remote.crl']}}));
  const remote='library "Remote".\nterminology "Remote Options":\n- system is `urn:external`.\n- code is `remote` display is `Remote answer`.\nconcept "Remote Q":\n- shape is Record.\n- type is Observation.\n- value type is CodeableConcept.\n- code is `remote-q`.\n- value domain is answer options.\n- shape reduction is most recent.\n- value from is "Remote Options".\npresentation for "Remote Q":\n- question text is "Imported question?".\n';
  writeFileSync(join(dir,'remote.crl'),remote);writeFileSync(f.policy,f.source.replace('library "L".','library "L".\ninclude "Remote".'));
  const local=f.card(),flag=saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'update',system:f.system,code:'yes',display:'Requested Yes',description:''});
  const imported=resolveAnswerTarget(f.policy,'Remote','Remote Q');assert.equal(imported.editable,false);
  const remoteCard={id:'remote',library:'Remote',concept:'Remote Q',text:'Imported question?',description:'',value:'Remote answer',answerChoices:imported.members.map(m=>({...m,selected:true}))};
  const h=harness(f),route={terminalId:'route',nodeIds:[],nodeKeys:['terminal']};
  Object.assign(h.c,{randomUUID,Set,pinnedCards:undefined,wordingSources:new Map(),crlStructure:[],conceptLayer:[],guardOutlines:[],expandedGuardWhens:new Set(),crlMaps:undefined,flagsList:loadFlags(f.flags).flags,
   scenarioByCaseId:new Map([['case',{case:{name:'Case'},tree:{}}]]),routesForCase:()=>[route],treeTraversalEntries:()=>[{caseId:'case',route}],treeTraversalSignature:()=> 'traversal',branchNeighbors:()=>({index:0,total:1}),clearTreeFocus:()=>{},
   whenKeyResolver:()=>()=>undefined,buildRouteQuestionnaire:()=>({questions:[]}),buildResolveValueTypes:()=>{},buildConceptShapeResolver:()=>{},buildDefExprResolver:()=>{},
   buildRouteCards:()=>({cards:[local,remoteCard],targets:new Map([['remote',{filePath:join(dir,'remote.crl'),library:'Remote',concept:'Remote Q',owners:{},editable:false}]])}),definitionValueInputs:()=>{},resolveCelSuite:()=>({ok:true,suite:{projectRoot:f.root,policyPath:f.policy}}),resolveAnswerTarget,overlayQaRequests,
   answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},expandTraversalCriteria:s=>s,expandQuestionInputs:s=>s,
   leafBucketsFromQuestionnaire:()=>({yesKeys:[],noKeys:[]}),conditionTruthKeys:()=>[],caseIdsThroughReviewNode:()=>[],pinnedVerdict:()=> 'pending',treeFocusPaint:()=>({nodeKeys:[],groupKeys:[],groupOutcomes:[]}),
   branchQuestionnaire:{isOpen:false},driveLeafMarks:()=>{}});
  vm.runInContext(transformSync(bodies.get('pinCards'),{loader:'ts',target:'es2022'}).code,h.c);h.c.pinCards('case','route',undefined,true,'traversal');
  assert.equal(h.posts.length,1);const cards=h.posts[0].cards;assert.equal(cards[0].answerChoices[0].request.id,flag.id);assert.equal(cards[1].answerEditor.editable,false);assert.equal(cards[1].questionRequest,undefined);assert.equal(cards[1].answerChoices[0].display,'Remote answer');
 }finally{f.close();}
});
