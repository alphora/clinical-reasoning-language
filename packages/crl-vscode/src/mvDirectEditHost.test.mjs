import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {AnswerCaseImpactError} from './answerEditing.ts';

const source=ts.createSourceFile('cockpit.ts',readFileSync(fileURLToPath(new URL('./correspondenceCockpit.ts',import.meta.url)),'utf8'),ts.ScriptTarget.Latest,true),bodies=new Map();
function scan(n){if(ts.isFunctionDeclaration(n)&&n.name)bodies.set(n.name.text,n.getText(source));ts.forEachChild(n,scan);}scan(source);
function install(c,names){for(const name of names)vm.runInContext(transformSync(bodies.get(name),{loader:'ts',target:'es2022'}).code,c);}
function harness(){
 const root=path.resolve('synthetic-host-policy'),messages=[],errors=[],rebuilds=[];let finish,choose,saves=0,recoveries=0;
 const work=new Promise(resolve=>finish=()=>resolve({state:'saved'}));
 const view={gen:1,panel:{webview:{postMessage:m=>messages.push(m)}}};
 const c=vm.createContext({AnswerCaseImpactError,...path,randomUUID,createHash,isDeepStrictEqual,Error,process,console,mvRevision:1,reviewByCaseId:{a:"pass"},notesByCaseId:{},criterionVerdicts:{},definitionFreshness:{inputFiles:[]},mvEditBusy:false,mvDeferredRebuild:false,mvRecoveryBlock:undefined,
  currentCel:path.join(root,'src/cel/mv/review.cel'),mode:'medical-validation',indexVersion:1,mvSidecarPath:path.join(root,'src/medical-validation/policy.json'),
  pinnedCards:{epoch:1,token:'pin',targets:new Map([['question',{concept:'Q'}]])},views:new Map([['tree',view]]),reviewGridSnapshot:undefined,reviewGridDirty:false,
  context:{extensionPath:'/synthetic/extension',extensionMode:2},
  resolveCelSuite:()=>({ok:true,suite:{projectRoot:root,policySrc:path.join(root,'src'),policyPath:path.join(root,'src/crl/policy.crl')}}),
  findKelpProject:()=>'/synthetic/kelp.project.json',kelpArtifactRoot:()=>root,existsSync:()=>false,realpathSync:p=>p,
  resolveKelpEntry:()=>'/synthetic/cli.mjs',createKelpRunner:()=>()=>{},KelpEditScopes:class {},createDirectEditCompileCache:()=>({}),editStorage:()=>'/synthetic/recovery',
  coordinateDirectEdit:async()=>{saves++;return work;},DirectEditAppliedError:class extends Error{},
  branchQuestionnaire:{post:m=>messages.push(m)},renderTreeChrome:()=>{},rebuild:preserve=>rebuilds.push(preserve),
  inspectMvEdits:()=>({transactions:[],errors:[]}),inspectScopeOperations:()=>({operations:[{file:'/synthetic/scope.json',operation:{id:randomUUID(),phase:'locked',acquired:['fhir'],preExisting:['mv']}}],errors:[]}),
  reconcileScopeOperation:async()=>{recoveries++;},
  vscode:{ExtensionMode:{Development:2},extensions:{getExtension:()=>undefined},workspace:{textDocuments:[],getConfiguration:()=>({get:()=>undefined})},Uri:{file:fsPath=>({fsPath})},window:{
   showInformationMessage:m=>messages.push(m),showErrorMessage:m=>errors.push(m),showQuickPick:choices=>new Promise(resolve=>choose=()=>resolve(choices[0]))}},
 });install(c,['assertMvWriteAllowed','saveCard','recoverPolicyEdit','adoptPublishedReviewSidecar']);
 return {c,messages,errors,rebuilds,finish,choose:()=>choose(),saves:()=>saves,recoveries:()=>recoveries,payload:{token:'pin',key:'question',fields:{questionText:'New wording',questionDescription:'Details'}}};
}
test('a rejected overlapping Save cannot unlock the active coordinated Save',async()=>{
 const h=harness(),first=h.c.saveCard(h.payload);assert.equal(h.c.mvEditBusy,true);assert.equal(h.saves(),1);
 await h.c.saveCard(h.payload);assert.equal(h.c.mvEditBusy,true);assert.equal(h.saves(),1);
 assert.ok(h.messages.some(m=>m?.ok===false&&/in progress/.test(m.message)));
 h.finish();await first;assert.equal(h.c.mvEditBusy,false);
});
test('a recovery picker cannot acquire or release another Save ownership after its await',async()=>{
 const h=harness(),recovery=h.c.recoverPolicyEdit();const save=h.c.saveCard(h.payload);assert.equal(h.c.mvEditBusy,true);
 h.choose();await recovery;assert.equal(h.recoveries(),0);assert.equal(h.c.mvEditBusy,true);assert.ok(h.errors.some(m=>/in progress/.test(m)));
 h.finish();await save;assert.equal(h.c.mvEditBusy,false);
});
test('a queued preserving rebuild rechecks busy when it runs and drops retargeted work',()=>{
 let callback;const rebuilt=[];const c=vm.createContext({currentCel:'one',mvEditBusy:false,mvDeferredRebuild:false,debounce:undefined,setTimeout:f=>{callback=f;return 1;},clearTimeout:()=>{},rebuild:p=>rebuilt.push(p)});
 install(c,['scheduleRebuild']);c.scheduleRebuild();c.mvEditBusy=true;callback();assert.deepEqual(rebuilt,[]);assert.equal(c.mvDeferredRebuild,true);
 c.mvEditBusy=false;c.scheduleRebuild();callback();assert.deepEqual(rebuilt,[true]);
 c.scheduleRebuild();c.currentCel='two';callback();assert.deepEqual(rebuilt,[true]);
});
test('approval rechecks definitions and refuses a new revision until the reviewed model refreshes',()=>{
 let calls=0,scheduled=0,frozen=0;const root=path.resolve('synthetic-approval');
 const c=vm.createContext({...path,mode:'medical-validation',currentCel:'policy.cel',modelDefinitionDigest:'old',mvDefinitionRevision:{id:'edited'},currentDefinitions:{state:'current',digest:'old'},
  resolveCelSuite:()=>({ok:true,suite:{projectRoot:root,policyPath:'policy.crl'}}),vscode:{workspace:{textDocuments:[]}},
  definitionFreshness:{inputFiles:[],check:()=>{calls++;return {state:'current',digest:'new'};}},editStorage:()=>'/scratch',scheduleRebuild:()=>scheduled++,interactiveQuestionnaire:{definitionsChanged:()=>frozen++}});
 install(c,['verifyDefinitionsAtApproval']);assert.equal(c.verifyDefinitionsAtApproval(),false);assert.equal(calls,1);assert.equal(scheduled,1);assert.equal(frozen,1);assert.equal(c.currentDefinitions.state,'checking');
 c.modelDefinitionDigest='new';assert.equal(c.verifyDefinitionsAtApproval(),true);assert.equal(calls,2);
 c.vscode.workspace.textDocuments=[{isDirty:true,uri:{fsPath:path.join(root,'src/crl/policy.crl')}}];assert.equal(c.verifyDefinitionsAtApproval(),false);assert.equal(calls,2);
});
test('FHIR remount identity changes with effective stale status while native bytes stay unchanged',()=>{
 let body;function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='post'&&n.initializer?.getText(source).includes('effectiveStale'))body=n.getText(source);ts.forEachChild(n,find);}find(source);assert.ok(body);
 const messages=[],c=vm.createContext({createHash,v:{gen:1,panel:{webview:{postMessage:m=>messages.push(m)}}},gen:1,indexVersion:1,key:'case',label:'Case',currentDefinitions:{state:'current',digest:'same'},unrenderableQuestionnaireFeatures:()=>[]});
 vm.runInContext(transformSync("var "+body.replace("const definitionState=","var definitionState=")+";",{loader:'ts'}).code,c);const q={resourceType:'Questionnaire'};c.post(q,undefined,undefined,false);c.currentDefinitions.state='drift';c.post(q,undefined,undefined,false);
 assert.notEqual(messages[0].key,messages[1].key);assert.equal(messages[0].stale,false);assert.equal(messages[1].stale,true);
 c.currentDefinitions.state='checking';c.post(q,undefined,undefined,false);assert.equal(messages[2].stale,false);assert.equal(messages[2].definitionState,'checking');
 c.currentDefinitions.state='unknown';c.post(q,undefined,undefined,false);assert.equal(messages[3].stale,false);assert.equal(messages[3].definitionState,'unknown');
});

test('a note save cannot restore approvals from before a direct edit when sidecar refresh failed',()=>{
 const errors=[],writes=[];let scheduled=0;
 const disk={schemaVersion:2,byCaseId:{a:'pending'},definitionRevision:{id:'new'}};
 const c=vm.createContext({isDeepStrictEqual,Object,mvRevision:1,mvSidecarPath:'bleph-medical-validation.json',reviewByCaseId:{a:'pass'},notesByCaseId:{},criterionVerdicts:{},mvDefinitionRevision:undefined,
  assertMvWriteAllowed:()=>{},loadSidecar:()=>({sidecar:disk}),scheduleRebuild:()=>scheduled++,saveSidecar:(...args)=>writes.push(args),
  vscode:{window:{showErrorMessage:m=>errors.push(m)}},composeSidecar:()=>{throw Error('must refuse before composition');}});
 install(c,['persistMv','reloadPublishedReviewSidecar','adoptPublishedReviewSidecar']);assert.equal(c.persistMv(c.reviewByCaseId,{a:[{id:'note',text:'Keep this draft',created:1}]}),false);
 assert.deepEqual(writes,[]);assert.equal(disk.byCaseId.a,'pending');assert.equal(scheduled,1);assert.equal(c.reviewByCaseId.a,'pending');assert.equal(c.mvDefinitionRevision.id,'new');assert.match(errors[0],/Review state changed on disk/);
});

test('a watcher reload stales verdict-grid picks while preserving unrelated drafts and notes-only picks',()=>{
 let disk={schemaVersion:2,byCaseId:{a:'pending'},notesByCaseId:{a:[{id:'note',text:'New note',created:1}]}};
 const draft={text:'Unsaved flag'},grid={revision:4};
 const c=vm.createContext({isDeepStrictEqual,mvSidecarPath:'policy.json',loadSidecar:()=>({sidecar:disk}),reviewByCaseId:{a:'pass'},notesByCaseId:{},criterionVerdicts:{},mvRevision:4,flagDraft:draft,reviewGridSnapshot:grid});
 install(c,['reloadPublishedReviewSidecar','adoptPublishedReviewSidecar']);c.reloadPublishedReviewSidecar();assert.equal(c.mvRevision,5);assert.equal(c.flagDraft,draft);assert.equal(c.reviewGridSnapshot,grid);
 disk={...disk,notesByCaseId:{}};c.reloadPublishedReviewSidecar();assert.equal(c.mvRevision,5);
});

test('legacy reviews remain available when direct-edit layout and pinned-date comparison are unavailable',()=>{
 const c=vm.createContext({mode:'medical-validation',currentCel:'legacy.cel',mvDefinitionRevision:undefined});
 install(c,['verifyDefinitionsAtApproval']);assert.equal(c.verifyDefinitionsAtApproval(),true);
});

function pinFixture(detached){
 const target={filePath:'/artifact/src/crl/input.crl',library:'L',concept:'B',context:{decision:'Review',criteria:[]}};
 const old={id:'old-B',library:'L',concept:'B',ownerKey:'B-owner',text:'B?',description:'Details',editing:true,editingOwner:'B-owner',draftText:'Unsaved B',draftDescription:'Retain this'};
 const preserved={caseId:'case',routeId:'route',payload:{cards:[old]},targets:new Map([['old-B',target]])};
 const fresh={...old,id:'new-B'};for(const k of ['editing','editingOwner','draftText','draftDescription'])delete fresh[k];
 const attached=[],other=[],route={terminalId:'route',nodeIds:[],nodeKeys:['terminal'],activity:'Refer'};
 const c=vm.createContext({randomUUID,JSON,mode:'medical-validation',pinnedCards:undefined,indexVersion:2,currentCel:undefined,wordingSources:new Map(),crlStructure:[],conceptLayer:[],guardOutlines:[],expandedGuardWhens:new Set(),crlMaps:undefined,
  views:new Map([['tree',{gen:2,panel:{webview:{postMessage:m=>attached.push(m)}}}]]),scenarioByCaseId:new Map([['case',{case:{name:'Case'},tree:{}}]]),
  routesForCase:()=>[route],treeTraversalEntries:()=>[{caseId:'case',route}],treeTraversalSignature:()=> 'traversal',branchNeighbors:()=>({index:0,total:1}),clearTreeFocus:()=>{},
  whenKeyResolver:()=>()=>undefined,buildRouteQuestionnaire:()=>({questions:[]}),buildResolveValueTypes:()=>{},buildConceptShapeResolver:()=>{},buildDefExprResolver:()=>{},
  buildRouteCards:()=>({cards:[fresh],targets:new Map([['new-B',target]])}),definitionValueInputs:()=>{},answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},expandTraversalCriteria:s=>s,expandQuestionInputs:s=>s,
  leafBucketsFromQuestionnaire:()=>({yesKeys:[],noKeys:[]}),conditionTruthKeys:()=>[],caseIdsThroughReviewNode:()=>[],pinnedVerdict:()=> 'pending',treeFocusPaint:()=>({nodeKeys:[],groupKeys:[],groupOutcomes:[]}),
  branchQuestionnaire:{isOpen:detached,update:p=>other.push(p)},driveLeafMarks:()=>{}});
 install(c,['pinCards']);return {c,preserved,fresh,target,attached,other};
}
for(const detached of [false,true])test(`preserving refresh sends an unsaved question draft to the ${detached?'detached':'attached'} questionnaire`,()=>{
 const f=pinFixture(detached);f.c.pinCards('case','route',undefined,true,'traversal',f.preserved);
 assert.equal(f.c.pinnedCards.payload.cards[0].draftText,'Unsaved B');assert.equal(f.attached[0].cards[0].draftDescription,'Retain this');
 if(detached)assert.equal(f.other[0].cards[0].draftText,'Unsaved B');
});
test('changed wording or scope does not transplant an old draft into a different question',()=>{
 const f=pinFixture(true);f.fresh.text='New baseline B?';f.c.pinCards('case','route',undefined,true,'traversal',f.preserved);assert.equal(f.c.pinnedCards.payload.cards[0].draftText,undefined);
 const g=pinFixture(true);g.target.context={decision:'Other',criteria:[]};g.preserved.targets.set('old-B',{...g.target,context:{decision:'Review',criteria:[]}});
 g.c.pinCards('case','route',undefined,true,'traversal',g.preserved);assert.equal(g.c.pinnedCards.payload.cards[0].draftText,undefined);
});

test('a cosmetic refresh failure does not stop coordinated KELP Save after local publication',async()=>{
 const h=harness();let saved=false;const warnings=[];
 Object.assign(h.c,{definitionFreshness:{inputFiles:[],invalidate:()=>{}},reloadPublishedReviewSidecar:()=>{},clearReviewGridState:()=>{throw Error('synthetic UI refresh failure');},snapshotCapture:{settleEmpty:()=>{}},interactiveQuestionnaire:{definitionsChanged:()=>{}}});
 h.c.vscode.window.showWarningMessage=m=>warnings.push(m);
 h.c.coordinateDirectEdit=async options=>{await options.onLocalApplied({sidecar:{schemaVersion:2,byCaseId:{a:'pending'},definitionRevision:{id:'new'}}});saved=true;return {state:'saved'};};
 await h.c.saveCard(h.payload);assert.equal(saved,true);assert.match(warnings[0],/reopen Medical Review/);assert.equal(h.c.mvEditBusy,false);assert.equal(h.c.currentDefinitions.state,'unknown');
});

test('a preserving viewport request is consumed and does not suppress a later model change',()=>{
 const text=bodies.get('renderPane'),start=text.indexOf('v.preserveTreeViewport ='),end=text.indexOf('v.preserveNextTreeViewport = false;',start)+'v.preserveNextTreeViewport = false;'.length;
 assert.ok(start>=0);const c=vm.createContext({pane:'tree',indexVersion:2,v:{gen:1,indexVersion:1,preserveNextTreeViewport:true}});
 const code=transformSync(text.slice(start,end),{loader:'ts'}).code;vm.runInContext(code,c);assert.equal(c.v.preserveTreeViewport,true);assert.equal(c.v.preserveNextTreeViewport,false);
 c.indexVersion=3;vm.runInContext(code,c);assert.equal(c.v.preserveTreeViewport,false);
});

test('a failed first-edit sidecar reload withholds completion and freezes the old interactive form while KELP Save proceeds',async()=>{
 const h=harness();let saved=false,frozen=0;
 Object.assign(h.c,{mvDefinitionRevision:undefined,currentDefinitions:{state:'current',digest:'old'},modelDefinitionDigest:'old',definitionFreshness:{inputFiles:[],invalidate:()=>{}},reloadPublishedReviewSidecar:()=>{throw Error('Unreadable sidecar');},interactiveQuestionnaire:{definitionsChanged:()=>frozen++}});
 h.c.vscode.window.showWarningMessage=()=>{};install(h.c,['reviewDefinitionsCurrent']);assert.equal(h.c.reviewDefinitionsCurrent(),true);
 h.c.coordinateDirectEdit=async options=>{await options.onLocalApplied({sidecar:{schemaVersion:2,byCaseId:{a:'pending'},definitionRevision:{id:'first-edit'}}});saved=true;return {state:'saved'};};
 await h.c.saveCard(h.payload);assert.equal(saved,true);assert.equal(h.c.mvDefinitionRevision.id,'first-edit');assert.equal(frozen,1);assert.equal(h.c.reviewDefinitionsCurrent(),false);
});

test('failed reload followed by a deferred rebuild never restores the pre-edit Pass maps',async()=>{
 const h=harness();let saved=false;
 Object.assign(h.c,{mvDefinitionRevision:undefined,currentDefinitions:{state:'current',digest:'old'},modelDefinitionDigest:'old',definitionFreshness:{inputFiles:[],invalidate:()=>{}},reloadPublishedReviewSidecar:()=>{throw Error('Unreadable sidecar');},interactiveQuestionnaire:{definitionsChanged:()=>{}},mvDeferredRebuild:true,
  rebuild:()=>{h.c.currentDefinitions={state:'current',digest:'new'};h.c.modelDefinitionDigest='new';}});
 h.c.vscode.window.showWarningMessage=()=>{};
 h.c.coordinateDirectEdit=async options=>{await options.onLocalApplied({sidecar:{schemaVersion:2,byCaseId:{a:'pending'},definitionRevision:{id:'edit'}}});saved=true;return {state:'saved'};};
 await h.c.saveCard(h.payload);assert.equal(saved,true);assert.equal(h.c.currentDefinitions.state,'current');assert.equal(h.c.reviewByCaseId.a,'pending');assert.ok(!Object.values(h.c.reviewByCaseId).every(s=>s==='pass'));
});

test('definition banner preserves legacy review and explains a changed reviewed-model digest',()=>{
 const c=vm.createContext({mvDefinitionRevision:undefined,mvEditBusy:false,mvRecoveryBlock:undefined,mvSaveNotice:undefined,currentDefinitions:{state:'unknown',message:'Direct editing metadata unavailable'},modelDefinitionDigest:'old'});
 install(c,['reviewDefinitionsCurrent','definitionStatusMessage']);assert.equal(c.definitionStatusMessage(),undefined);
 c.mvDefinitionRevision={id:'edit'};assert.match(c.definitionStatusMessage(),/metadata unavailable/);
 c.currentDefinitions={state:'current',digest:'new'};assert.match(c.definitionStatusMessage(),/refresh the reviewed tree/);
});

test('direct Save refuses unsaved imported definition inputs before compiling or acquiring scopes',async()=>{
 const h=harness(),foreign=path.resolve('foreign-package/input.crl');h.c.definitionFreshness.inputFiles=[foreign];h.c.vscode.workspace.textDocuments=[{isDirty:true,uri:{fsPath:foreign}}];
 await h.c.saveCard(h.payload);assert.equal(h.saves(),0);assert.ok(h.errors.some(m=>m.includes(foreign)));assert.equal(h.c.mvEditBusy,false);
});

test('successful recovery still refreshes the compiler and model when review sidecar reload reports an error',async()=>{
 const h=harness(),warnings=[];let invalidated=0;
 Object.assign(h.c,{loadEditRecovery:()=>{},reloadPublishedReviewSidecar:()=>{throw Error('Unreadable review state');},snapshotCapture:{settleEmpty:()=>{}},definitionFreshness:{invalidate:()=>invalidated++}});
 h.c.vscode.commands={executeCommand:async()=>invalidated++};h.c.vscode.window.showWarningMessage=m=>warnings.push(m);
 const recovery=h.c.recoverPolicyEdit();h.choose();await recovery;assert.equal(h.recoveries(),1);assert.equal(invalidated,2);assert.deepEqual(h.rebuilds,[true]);assert.equal(h.c.mvEditBusy,false);assert.match(warnings[0],/recovery completed/);
});

test('unrelated dirty notes and documentation do not block direct Save',async()=>{
 const h=harness(),root=h.c.resolveCelSuite().suite.projectRoot;h.c.vscode.workspace.textDocuments=[{isDirty:true,uri:{fsPath:path.join(root,'README.md')}},{isDirty:true,uri:{fsPath:path.join(root,'tests/scratch.cel')}}];
 const save=h.c.saveCard(h.payload);assert.equal(h.saves(),1);h.finish();await save;assert.deepEqual(h.errors,[]);
});

test('legacy interactive publication preserves defaults on malformed configured dates and warns; edited policies require repair',()=>{
 const warnings=[],c=vm.createContext({join:path.join,mvDefinitionRevision:undefined,resolveCelSuite:()=>({ok:true,suite:{projectRoot:'/artifact'}}),readFileSync:()=>JSON.stringify({crl:{date:'2026-13-45'}}),mvPublicationOptions:()=>{throw Error('Invalid date');},vscode:{window:{showWarningMessage:m=>warnings.push(m)}}});
 install(c,['interactivePublication']);assert.equal(Object.keys(c.interactivePublication('policy.cel')).length,0);assert.match(warnings[0],/legacy publication defaults/);
 c.mvDefinitionRevision={id:'edit'};assert.throws(()=>c.interactivePublication('policy.cel'),/Invalid date/);
});

for(const missing of ['project','cli','invalid-config','invalid-cli'])test(`host Save remains successful with KELP ${missing}`,async()=>{
 const h=harness();if(missing==='project')h.c.findKelpProject=()=>undefined;
 if(missing==='cli')h.c.resolveKelpEntry=()=>undefined;
 if(missing==='invalid-config')h.c.findKelpProject=()=>{throw Error('Invalid config');};
 if(missing==='invalid-cli')h.c.resolveKelpEntry=()=>{throw Error('Invalid CLI');};
 const promise=h.c.saveCard(h.payload);assert.equal(h.saves(),1);h.finish();await promise;
 assert.ok(h.messages.some(m=>m?.ok===true&&m.message==='Question saved to CRL and FHIR.'));assert.equal(h.errors.length,0);
});

test('completed local Save does not offer already released scopes as retained locks',async()=>{
 const h=harness();let picked=false;h.c.inspectScopeOperations=()=>({errors:[],operations:[{file:'/synthetic/completed.json',operation:{id:randomUUID(),phase:'saved',localComplete:true,acquired:['fhir'],released:['fhir'],preExisting:['mv']}}]});h.c.loadEditRecovery=()=>{};
 h.c.vscode.window.showQuickPick=()=>{picked=true;return undefined;};await h.c.recoverPolicyEdit();
 assert.equal(picked,false);assert.equal(h.errors.length,0);assert.ok(h.messages.some(m=>typeof m==='string'&&/No interrupted edit/.test(m)));
});

test('failed optional unlock remains visible as retained scopes after local Save',async()=>{
 const h=harness();let picked;
 h.c.inspectScopeOperations=()=>({errors:[],operations:[{file:'/synthetic/completed.json',operation:{id:randomUUID(),phase:'save-failed',localComplete:true,acquired:['fhir'],preExisting:['mv']}}]});h.c.loadEditRecovery=()=>{};
 h.c.vscode.window.showQuickPick=choices=>{picked=choices;return undefined;};await h.c.recoverPolicyEdit();
 assert.equal(picked.length,1);assert.equal(picked[0].label,'View edit scope status');assert.equal(picked[0].locks,true);assert.equal(h.errors.length,0);
});

test('ambiguous lock attempts remain visible without blocking completed local Save',async()=>{
 const h=harness();let picked;h.c.inspectScopeOperations=()=>({errors:[],operations:[{file:'/synthetic/attempt.json',operation:{id:randomUUID(),phase:'local-applied',localComplete:true,acquired:[],attempted:['fhir'],preExisting:[],detail:'KELP lock: timeout'}}]});h.c.vscode.window.showQuickPick=choices=>{picked=choices;return undefined;};await h.c.recoverPolicyEdit();assert.equal(picked.length,1);assert.match(picked[0].detail,/fhir.*timeout/);assert.equal(h.errors.length,0);
});
