import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {isAuthoringFlag} from './flagWorkflow.ts';
import {performKeFlagAction,keFlagRevision,isKeAnswerSavedError} from './flagWorkflowStore.ts';
import {summarizeFlagBadges} from './flagPlacement.ts';
import {renderFlagActionDrawer} from './flagActionDrawerHtml.ts';
import {flagCloseEligibility} from './flagCloseEligibility.ts';
import {HOST_FLAG_CORRELATION_FIELDS, flagDisplayNameOf, flagFieldRulesOf, validateFlagFields, isQaEditFlag, mvReviewStatus, transitionMvFlag, renewMvFlag} from '@smile-digital-health/crl';

// Execute the actual private host handlers with controlled disk reads and modal completion.
// VS Code refuses native modal dialogs in extension-test hosts.
const source=ts.createSourceFile('cockpit.ts',readFileSync(fileURLToPath(new URL('./correspondenceCockpit.ts',import.meta.url)),'utf8'),ts.ScriptTarget.Latest,true);
const names=['writeFlagStatus','saveFlagEdit','deleteFlagFromDrawer','nodeFlagAction','openNodeFlags','reloadReviewFlags','flagPlacementFor','gidsForFlag','flagActionToggle','refreshFlagActionDrawer','commitFlagDraft','flagActionViewModel','assertMvWriteAllowed'];const bodies=new Map();
function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))bodies.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}visit(source);
function submissionHarness(options={}) {
 const draft={cel:'policy.cel',target:{kind:'concept',name:'Q',lib:'L',label:'Q',key:'node~signature'}},saved=[],notes=[],built=[];
 let unblock;
 const document={getText:()=> 'saved CRL'};
 const pending=options.deferred?new Promise(resolve=>unblock=()=>resolve(document)):Promise.resolve(document);
 const context=vm.createContext({mvEditBusy:!!options.busy,mvRecoveryBlock:options.recovery,HOST_FLAG_CORRELATION_FIELDS,flagDraft:draft,flagCommitting:false,mode:'medical-validation',currentCel:'policy.cel',
  flagNote:note=>notes.push(note),closeFlagDrawer:()=>context.flagDraft=undefined,findDeclaration:()=>({filePath:'policy.crl'}),
  hasForbiddenGistChars:text=>/[`;]/.test(text),flagStoreDir:()=>'/flags',loadStoredFlags:()=>({flags:[],warning:options.warning}),
  vscode:{workspace:{openTextDocument:()=>pending}},validateAndBuildMvFlagDraft:(_text,_target,args)=>{built.push(args);return {ok:true,flag:{...args,id:'new'}};},
  saveFlag:(_dir,flag)=>{if(options.failSave)throw Error('disk full');saved.push(flag);},reloadReviewFlags:()=>{},renderTreeChrome:()=>{},driveFlagBadges:()=>{},
  githubToken:()=>{throw Error('unexpected GitHub auth');},createGithubIssue:()=>{throw Error('unexpected issue creation');}
 });
 vm.runInContext(transformSync(bodies.get('assertMvWriteAllowed'),{loader:'ts'}).code,context);
 vm.runInContext(transformSync(bodies.get('commitFlagDraft'),{loader:'ts',target:'es2022'}).code,context);
 return {context,draft,saved,notes,built,unblock};
}
test('actual submission persists locally, strips forged links/correlation, and clears the draft',async()=>{
 const h=submissionHarness();const result=await h.context.commitFlagDraft({tag:'other',summary:'Review',stub:'Description',
  fields:{ref:'#99',key:'forged','ke-flag':'fake','ke-question-revision':'fake','mv-answer':'fake',kind:'keep'}});
 assert.equal(result.ok,true);assert.equal(h.saved.length,1);assert.equal(h.context.flagDraft,undefined);assert.equal(h.context.flagCommitting,false);
 assert.deepEqual({...h.built[0].fields},{kind:'keep',key:'node~signature'});assert.equal(h.saved[0].description,'Description');
});
test('local submission failure preserves the draft and permits retry',async()=>{
 const h=submissionHarness({failSave:true});const result=await h.context.commitFlagDraft({tag:'other',summary:'Review',stub:'Keep draft'});
 assert.equal(result.ok,false);assert.match(result.note,/disk full/);assert.equal(h.context.flagDraft,h.draft);assert.equal(h.context.flagCommitting,false);assert.equal(h.saved.length,0);
});
test('post-save refresh failure reports persistence success and cannot invite duplicate submission',async()=>{
 const h=submissionHarness();h.context.reloadReviewFlags=()=>{throw Error('refresh failed');};
 const result=await h.context.commitFlagDraft({tag:'other',summary:'Review',stub:'Text'});
 assert.equal(result.ok,true);assert.match(result.note,/flag saved.*could not refresh/);assert.equal(h.saved.length,1);assert.equal(h.context.flagDraft,undefined);
 assert.equal((await h.context.commitFlagDraft({tag:'other',summary:'Review',stub:'Text'})).ok,false);assert.equal(h.saved.length,1);
});
test('pending submission refuses policy changes and replacement drawers; busy clicks cannot duplicate',async()=>{
 for(const change of ['policy','drawer']) {
  const h=submissionHarness({deferred:true}),payload={tag:'other',summary:'Review',stub:'Text'};
  const work=h.context.commitFlagDraft(payload);assert.equal(h.context.flagCommitting,true);
  const busy=await h.context.commitFlagDraft(payload);assert.equal(busy.ok,false);
  if(change==='policy')h.context.currentCel='another.cel';else h.context.flagDraft={...h.draft};
  const remaining=h.context.flagDraft;h.unblock();const result=await work;
  assert.equal(result.ok,false);assert.match(result.note,/policy changed/);assert.equal(h.saved.length,0);assert.equal(h.built.length,0);
  assert.equal(h.context.flagDraft,remaining);assert.equal(h.context.flagCommitting,false);
 }
});
function harness(category,confirm,options={}){
 let current={schemaVersion:1,id:'f',category,tag:'customer-confirmable',gist:'Flag',description:'Full description',status:'open',fields:{assumption:'Preserve this',ref:'docs/source.md'},dedupKey:'source-hash',anchor:{scope:'concept',library:'L',name:'Q',label:'Q',entityId:'q-id'},createdAt:'2026-09-12'};
 const captured=structuredClone(current),warnings=[],counts={save:0,remove:0,confirm:0},notes=[],answers=[],opened=[],edited=[];
 const noop=()=>{};
 const context=vm.createContext({mvEditBusy:!!options.busy,mvRecoveryBlock:options.recovery,HOST_FLAG_CORRELATION_FIELDS,Error,isAuthoringFlag,isQaEditFlag,mvReviewStatus,transitionMvFlag,renewMvFlag,keFlagRevision,isKeAnswerSavedError,flagCloseEligibility,indexVersion:1,currentCel:'policy.cel',mode:'medical-validation',flagActionBusy:false,flagStoreWarning:!!options.warning,
  flagActionView:{flag:captured,ver:1,cel:'policy.cel'},flagEditDraft:{flag:captured,cel:'policy.cel',descriptionOnly:true},flagsList:[captured],flagEditDirty:false,
  flagStoreDir:()=>'/memory',loadStoredFlags:()=>({flags:current?[structuredClone(current)]:[],warning:options.warning}),
  applyKeFlagAction:(_dir,flag,action)=>performKeFlagAction({load:()=>({flags:current?[structuredClone(current),...answers]:[],warning:options.warning}),create:answer=>{if(options.createError)throw Error('create failed');answers.push(answer);},save:updated=>{if(options.writeError)throw Error('disk full');counts.save++;current=updated;}},flag,action),
  saveFlag:(_dir,flag)=>{if(options.writeError)throw Error('disk full');counts.save++;current=flag;},removeFlag:()=>{counts.remove++;current=undefined;},flagNote:m=>notes.push(m),
  reloadReviewFlags:()=>{context.flagsList=current?[structuredClone(current)]:[];},renderTreeChrome:noop,driveFlagBadges:noop,postFlagDrawer:noop,openFlagActionView:(f,ver,cel)=>{opened.push(f);context.flagActionView={flag:f,ver,cel};},openFlagEditDraft:()=>edited.push(context.flagActionView.flag),closeFlagActionView:noop,
  flagDisplayNameOf,flagFieldRulesOf,validateFlagFields,issueRefOf:()=>undefined,vscode:{workspace:{isTrusted:false},window:{showWarningMessage:async(message)=>{warnings.push(message);counts.confirm++;confirm?.(()=>{current={...current,category:'extraction'};});return 'Delete flag';}}},
 });
 vm.runInContext(transformSync(bodies.get('assertMvWriteAllowed'),{loader:'ts'}).code,context);
 vm.runInContext(source.text.match(/const EDIT_PRESERVED_FIELDS = new Set\([^;]+;/)[0],context);
 for(const name of [...names.slice(0,5),'flagActionToggle','refreshFlagActionDrawer'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts',target:'es2022'}).code,context);
 return {context,counts,notes,warnings,answers,opened,edited,get:()=>current,setCategory:value=>{current={...current,category:value};},set:value=>{current=value;}};
}
test('host rejects forged edit and delete against authoring records',async()=>{
 for(const action of ['edit','delete']){
  const h=harness('extraction');
  if(action==='edit')await h.context.saveFlagEdit({stub:'New description'});
  if(action==='delete')await h.context.deleteFlagFromDrawer();
  assert.deepEqual(h.counts,{save:0,remove:0,confirm:0});assert.ok(h.notes.some(n=>n.includes('read only')));
 }
});
test('policy publication and unresolved recovery block every flag writer without losing drafts',async()=>{
 for(const options of [{busy:true},{recovery:'Recorded edit needs reconciliation'}]){
  const submission=submissionHarness(options),result=await submission.context.commitFlagDraft({tag:'other',summary:'Review',stub:'Keep this draft'});
  assert.equal(result.ok,false);assert.equal(submission.saved.length,0);assert.equal(submission.context.flagDraft,submission.draft);
  for(const action of ['status','edit','delete','answer','ignore']){
   const h=harness(action==='answer'||action==='ignore'?'extraction':'validation',undefined,options);
   if(action==='status')await h.context.writeFlagStatus(h.get(),'resolved',1,'policy.cel');
   if(action==='edit')await h.context.saveFlagEdit({stub:'New text'});
   if(action==='delete')await h.context.deleteFlagFromDrawer();
   if(action==='answer'||action==='ignore')await h.context.flagActionToggle(action);
   assert.equal(h.counts.save,0);assert.equal(h.counts.remove,0);assert.equal(h.answers.length,0);
   assert.ok(h.notes.some(n=>/in progress|reconciliation/.test(n)));
  }
 }
});
test('Ignore closes KE without conversion and Reopen restores its review actions',async()=>{
 const h=harness('extraction'),before=structuredClone(h.get());
 await h.context.flagActionToggle('ignore');assert.equal(h.get().status,'resolved');assert.equal(h.get().category,'extraction');
 assert.equal(h.context.flagActionView.flag.status,'resolved');
 await h.context.flagActionToggle();assert.equal(h.get().status,'open');
 const {editedAt,...after}=h.get();assert.deepEqual(after,before);assert.equal(h.counts.save,2);
});

test('Answer resolves KE, opens a new MV answer and enters its full edit flow',async()=>{
 const h=harness('extraction'),before=structuredClone(h.get());
 await h.context.flagActionToggle('answer');
 const {editedAt,fields,...after}=h.get();
 const {fields:oldFields,...old}=before;assert.deepEqual(after,{...old,status:'resolved'}); // fields verified separately below
 assert.equal(fields.assumption,before.fields.assumption);assert.equal(fields.ref,before.fields.ref);
 assert.equal(h.answers.length,1);const answer=h.answers[0];assert.equal(fields['mv-answer'],answer.id);
 assert.equal(answer.category,'validation');assert.equal(answer.tag,'other');assert.equal(answer.status,'open');
 assert.equal(answer.description,`Question:\n${before.description}\n\nAnswer:\n`);
 assert.equal(h.opened[0].id,answer.id);assert.equal(h.edited[0].id,answer.id);assert.equal(h.context.flagActionBusy,false);
 const summary=summarizeFlagBadges(new Map([['node',[h.get(),answer]]]))[0];
 assert.equal(summary.authoringOpen,0);assert.equal(summary.authoringResolved,1);assert.equal(summary.open,1);
});
test('Answer refuses a changed question rather than resolving unseen content',async()=>{
 const h=harness('extraction');h.set({...h.get(),description:'Changed'});
 await h.context.flagActionToggle('answer');assert.equal(h.answers.length,0);assert.equal(h.counts.save,0);assert.match(h.notes.at(-1),/changed on disk/);
});
test('resolution failure retains KE drawer and saved MV answer without entering edit',async()=>{
 const h=harness('extraction',undefined,{writeError:true});await h.context.flagActionToggle('answer');
 assert.equal(h.answers.length,1);assert.equal(h.get().status,'open');assert.equal(h.edited.length,0);
 assert.equal(h.context.flagActionView.flag.id,'f');assert.match(h.notes.at(-1),/Answer flag saved, but KE could not resolve/);
 assert.match(h.warnings.at(-1),/Answer flag saved, but KE could not resolve/);
});
test('refresh failure preserves the partial-answer retry after a same-policy rebuild',async()=>{
 const options={writeError:true},h=harness('extraction',undefined,options);let release;
 h.context.reloadReviewFlags=()=>{throw Error('refresh failure');};
 h.context.vscode.window.showWarningMessage=()=>new Promise(resolve=>release=resolve);
 const work=h.context.flagActionToggle('answer');assert.equal(h.answers.length,1);assert.equal(typeof release,'function');
 h.context.indexVersion=2;h.context.flagActionView={...h.context.flagActionView,ver:2};options.writeError=false;
 release('Retry Answer');await work;assert.equal(h.get().status,'resolved');assert.equal(h.answers.length,1);
});

test('persistent Retry Answer is bound to the original question revision',async()=>{
 for(const changed of [false,true]) {
  const options={writeError:true},h=harness('extraction',undefined,options);let release;
  h.context.vscode.window.showWarningMessage=()=>new Promise(resolve=>release=resolve);
  const work=h.context.flagActionToggle('answer');
  assert.equal(h.answers.length,1);assert.equal(h.get().status,'open');
  if(changed){h.set({...h.get(),description:'New KE question'});h.context.reloadReviewFlags();h.context.refreshFlagActionDrawer();}
  options.writeError=false;release('Retry Answer');await work;
  assert.equal(h.answers.length,1);assert.equal(h.get().status,changed?'open':'resolved');
  assert.equal(h.counts.save,changed?0:1);assert.equal(h.edited.length,changed?0:1);
  if(changed)assert.match(h.notes.at(-1),/question changed/);
 }
});

test('KE dispositions refuse stale ownership, status, policy, missing data, and unreadable stores',async()=>{
 for(const action of ['answer','ignore']){
  for(const defect of ['category','status','policy','missing','warning','write']){
   const h=harness('extraction',undefined,{warning:defect==='warning',writeError:defect==='write'});
   if(defect==='category')h.setCategory('validation');
   if(defect==='status')h.set({...h.get(),status:'resolved'});
   if(defect==='policy')h.context.currentCel='other.cel';
   if(defect==='missing')h.set(undefined);
   const before=structuredClone(h.get());
   await h.context.flagActionToggle(action);
   assert.equal(h.counts.save,0,action+':'+defect);assert.deepEqual(h.get(),before);assert.equal(h.context.flagActionBusy,false);assert.ok(h.notes.length);
  }
 }
});

test('generic Resolve cannot bypass KE answer/ignore and busy actions cannot overlap',async()=>{
 const h=harness('extraction');await h.context.flagActionToggle();assert.equal(h.counts.save,0);
 h.context.flagActionBusy=true;await h.context.flagActionToggle('answer');assert.equal(h.counts.save,0);
});

test('fresh record category protects edits and delete confirmation races',async()=>{
 const edit=harness('validation');edit.setCategory('extraction');await edit.context.saveFlagEdit({stub:'Must not save'});assert.equal(edit.counts.save,0);
 const del=harness('validation',change=>change());await del.context.deleteFlagFromDrawer();assert.deepEqual(del.counts,{save:0,remove:0,confirm:1});assert.equal(del.get().category,'extraction');
});
// @kit review-flags:manual-mv-review
test('validation records require manual Fixed then Approved and meaningful description edits renew Pending',async()=>{
 const status=harness('validation');await status.context.writeFlagStatus(status.get(),'resolved',1,'policy.cel');assert.equal(status.get().status,'open');assert.equal(status.counts.save,0);
 await status.context.writeFlagStatus(status.get(),'fixed',1,'policy.cel');assert.equal(status.get().status,'fixed');
 await status.context.writeFlagStatus(status.get(),'approved',1,'policy.cel');assert.equal(status.get().status,'approved');
 const edit=harness('validation');edit.set({...edit.get(),status:'approved'});await edit.context.saveFlagEdit({stub:'Updated description'});assert.equal(edit.get().description,'Updated description');assert.equal(edit.get().status,'open');
 const del=harness('validation');await del.context.deleteFlagFromDrawer();assert.deepEqual(del.counts,{save:0,remove:1,confirm:1});
});

test('full answer editing preserves real host correlation despite forged form fields',async()=>{
 const h=harness('validation');
 h.set({...h.get(),tag:'other',fields:{'ke-flag':'ke','ke-question-revision':'revision'}});
 h.context.flagEditDraft={flag:h.get(),cel:'policy.cel',descriptionOnly:false};
 await h.context.saveFlagEdit({tag:'other',summary:'Changed answer',stub:'My answer',fields:{'ke-flag':'forged','ke-question-revision':'fake'}});
 assert.equal(h.counts.save,1);assert.equal(h.get().fields['ke-flag'],'ke');assert.equal(h.get().fields['ke-question-revision'],'revision');
 assert.equal(h.get().description,'My answer');
});

test('deleting an MV answer names the consequence for its original KE question',async()=>{
 const h=harness('validation');h.set({...h.get(),fields:{'ke-flag':'ke'}});
 await h.context.deleteFlagFromDrawer();assert.equal(h.counts.remove,1);
 assert.match(h.warnings[0],/original KE question stays resolved/);
});

test('actual view model hides correlation fields while retaining reviewer content',()=>{
 const h=harness('validation');h.context.gidsForFlag=()=>['node'];
 vm.runInContext(source.text.match(/const FLAG_VIEW_PLUMBING = new Set\([^;]+;/)[0],h.context);
 vm.runInContext(transformSync(bodies.get('flagActionViewModel'),{loader:'ts'}).code,h.context);
 const model=h.context.flagActionViewModel({...h.get(),fields:{'ke-flag':'ke','ke-question-revision':'rev','mv-answer':'answer',detail:'Visible'}});
 assert.equal(model.fields[0].value,'Visible');assert.ok(model.fields.some(f=>f.key==='MV answer'));assert.ok(model.fields.some(f=>f.key==='KE question'));
 assert.ok(model.fields.every(f=>!['ke-flag','ke-question-revision','mv-answer'].includes(f.key)));
});

test('relationship rows retain reverse answer history and distinguish unreadable partners',()=>{
 const h=harness('extraction');h.context.gidsForFlag=()=>[];
 vm.runInContext(source.text.match(/const FLAG_VIEW_PLUMBING = new Set\([^;]+;/)[0],h.context);
 vm.runInContext(transformSync(bodies.get('flagActionViewModel'),{loader:'ts'}).code,h.context);
 const resolved={...h.get(),status:'resolved'};
 let model=h.context.flagActionViewModel(resolved);
 assert.equal(model.fields.find(f=>f.key==='MV answer').value,'Resolved without an MV answer');
 assert.ok(!model.fields.some(f=>f.key==='Workflow'));
 h.context.flagsList.push({id:'older-answer',gist:'My answer',status:'resolved',fields:{'ke-flag':resolved.id}});
 model=h.context.flagActionViewModel(resolved);assert.match(model.fields.find(f=>f.key==='Earlier MV answers').value,/My answer \(resolved\)/);
 h.context.flagsList=[];h.context.flagStoreWarning=true;
 model=h.context.flagActionViewModel({...resolved,fields:{'mv-answer':'unreadable'}});
 assert.match(model.fields.find(f=>f.key==='MV answer').value,/unavailable/);
 assert.doesNotMatch(model.fields.find(f=>f.key==='MV answer').value,/removed/);
});

test('retained issue-close warning allows explicit sign-in after an earlier decline',async()=>{
 let body;function scan(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='reportPartialClose')body=node.getText(source);ts.forEachChild(node,scan);}scan(source);
 const notes=[],actions=[];let prompts=0;
 const c=vm.createContext({githubAuthDeclined:true,flagNote:m=>notes.push(m),openIssueNumber:()=>{throw Error('wrong recovery');},
  githubToken:async()=>{assert.equal(c.githubAuthDeclined,false);prompts++;return 'token';},
  vscode:{window:{showWarningMessage:async(_message,...choices)=>{actions.push(...choices);return 'Sign in to GitHub';}}}});
 vm.runInContext(transformSync(body,{loader:'ts'}).code,c);c.reportPartialClose(42,'captured.cel','not signed in to GitHub');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(prompts,1);assert.equal(c.githubAuthDeclined,false);assert.ok(actions.includes('Sign in to GitHub'));
 assert.match(notes[0],/Open issue #42/);
});

test('node flag controls open disjoint categories and only MV can create',async()=>{
 const ke={id:'ke',category:'extraction'},mv={id:'mv',category:'validation'},opened=[],created=[],notes=[];
 const tree={gen:1,reveals:{node:{nodeKey:'q'}},flaggableGids:['gid']};
 const c=vm.createContext({views:new Map([['tree',tree]]),indexVersion:1,currentCel:'policy',mode:'medical-validation',
   flagsByGid:new Map([['gid',[ke,mv]]]),flagsList:[ke,mv],flagStoreWarning:false,flagStateNote:undefined,
   guardDrawerDiscard:async()=>true,flagTargetChoices:()=>[{label:'Q'}],openFlagDrawer:v=>created.push(v),flagNote:v=>notes.push(v),
   toggleFlagActionView:f=>opened.push(f.id),vscode:{window:{showQuickPick:()=>{throw Error('Categories must not be combined in the chooser');}}},
 });
 for(const name of ['nodeFlagAction','openNodeFlags'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts'}).code,c);
 await c.nodeFlagAction('node','gid',1,'extraction');await c.nodeFlagAction('node','gid',1,'validation');assert.deepEqual(opened,['ke','mv']);
 c.flagsByGid.set('gid',[ke]);await c.nodeFlagAction('node','gid',1,'validation');assert.equal(created.length,1);
 c.flagsByGid.set('gid',[]);await c.nodeFlagAction('node','gid',1,'extraction');assert.equal(created.length,1);assert.match(notes.at(-1),/no KE flags/);
 await c.nodeFlagAction('node','gid',0,'validation');assert.equal(created.length,1);
});


test('actual host propagates authored concept IDs into badge placement and drawer navigation',async()=>{
 const {resolveAnchor}=await import('../../crl/src/flags/mvFlagAnchor.ts');
 const {computeFlagPlacement}=await import('./flagPlacement.ts');
 const flag={id:'f',anchor:{scope:'concept',name:'Old',library:'OldLib',entityId:'stable',label:'Old'}};
 const tree={conceptOccurrences:[{gid:'current',lib:'L',name:'New'},{gid:'replacement',lib:'OldLib',name:'Old'}],criterionOccurrences:[]};
 const c=vm.createContext({mode:'medical-validation',currentCel:'policy',findPolicySrc:()=>'/policy/src',readdirSync:()=>[],join:(...s)=>s.join('/'),
  crlStructure:[],conceptLayer:[{lib:'L',name:'New',id:'stable'},{lib:'OldLib',name:'Old',id:'other'}],
  flagStoreDir:()=>'/flags',loadStoredFlags:()=>({flags:[flag]}),hasLegacyFlagStore:()=>({present:false}),
  flagsList:[],flagStateError:false,flagStoreWarning:false,flagStateNote:undefined,anchorCtx:undefined,
  computeFlagPlacement,resolveAnchor,views:new Map([['tree',tree]])});
 for(const name of ['reloadReviewFlags','flagPlacementFor','gidsForFlag'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts'}).code,c);
 c.reloadReviewFlags();assert.equal(c.anchorCtx.concepts[0].id,'stable');
 assert.equal(c.flagsList[0],flag); // drawer captures the verbatim store record, not enriched UI data
 assert.deepEqual([...c.gidsForFlag(flag)],['current']);
 c.conceptLayer.push({lib:'Unrendered',name:'Duplicate',id:'stable'});c.reloadReviewFlags();
 assert.deepEqual([...c.gidsForFlag(flag)],[]);
 c.conceptLayer.pop();c.conceptLayer.push({lib:'L',name:'Broken',idInvalid:true});flag.status='resolved';c.reloadReviewFlags();
 assert.equal(c.flagStateError,true);assert.match(c.flagStateNote,/identity metadata is invalid/);
 assert.deepEqual([...c.gidsForFlag(flag)],[]);
 c.conceptLayer.pop();c.reloadReviewFlags();
 assert.equal(c.flagStateError,false);assert.equal(c.flagStateNote,undefined);assert.deepEqual([...c.gidsForFlag(flag)],['current']);
});
