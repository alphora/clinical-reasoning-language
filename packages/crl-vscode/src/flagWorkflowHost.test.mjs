import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {isAuthoringFlag} from './flagWorkflow.ts';
import {summarizeFlagBadges} from './flagPlacement.ts';
import {renderFlagActionDrawer} from './flagActionDrawerHtml.ts';
import {flagCloseEligibility} from './flagCloseEligibility.ts';

// Execute the actual private host handlers with controlled disk reads and modal completion.
// VS Code refuses native modal dialogs in extension-test hosts.
const source=ts.createSourceFile('cockpit.ts',readFileSync(fileURLToPath(new URL('./correspondenceCockpit.ts',import.meta.url)),'utf8'),ts.ScriptTarget.Latest,true);
const names=['writeFlagStatus','saveFlagEdit','deleteFlagFromDrawer','nodeFlagAction','openNodeFlags','reloadReviewFlags','flagPlacementFor','gidsForFlag','flagActionToggle','refreshFlagActionDrawer'];const bodies=new Map();
function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))bodies.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}visit(source);
function harness(category,confirm,options={}){
 let current={schemaVersion:1,id:'f',category,tag:'customer-confirmable',gist:'Flag',description:'Full description',status:'open',fields:{assumption:'Preserve this',ref:'docs/source.md'},dedupKey:'source-hash',anchor:{scope:'concept',library:'L',name:'Q',label:'Q',entityId:'q-id'},createdAt:'2026-09-12'};
 const captured=structuredClone(current),counts={save:0,remove:0,confirm:0},notes=[];
 const noop=()=>{};
 const context=vm.createContext({isAuthoringFlag,flagCloseEligibility,indexVersion:1,currentCel:'policy.cel',mode:'medical-validation',flagActionBusy:false,flagStoreWarning:!!options.warning,
  flagActionView:{flag:captured,ver:1,cel:'policy.cel'},flagEditDraft:{flag:captured,cel:'policy.cel',descriptionOnly:true},flagsList:[captured],flagEditDirty:false,
  flagStoreDir:()=>'/memory',loadStoredFlags:()=>({flags:current?[structuredClone(current)]:[],warning:options.warning}),
  saveFlag:(_dir,flag)=>{if(options.writeError)throw Error('disk full');counts.save++;current=flag;},removeFlag:()=>{counts.remove++;current=undefined;},flagNote:m=>notes.push(m),
  reloadReviewFlags:()=>{context.flagsList=current?[structuredClone(current)]:[];},renderTreeChrome:noop,driveFlagBadges:noop,postFlagDrawer:noop,openFlagActionView:noop,closeFlagActionView:noop,
  flagDisplayNameOf:()=> 'Other',vscode:{workspace:{isTrusted:false},window:{showWarningMessage:async()=>{counts.confirm++;confirm?.(()=>{current={...current,category:'extraction'};});return 'Delete flag';}}},
 });
 for(const name of [...names.slice(0,5),'flagActionToggle','refreshFlagActionDrawer'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts',target:'es2022'}).code,context);
 return {context,counts,notes,get:()=>current,setCategory:value=>{current={...current,category:value};},set:value=>{current=value;}};
}
test('host rejects forged edit and delete against authoring records',async()=>{
 for(const action of ['edit','delete']){
  const h=harness('extraction');
  if(action==='edit')await h.context.saveFlagEdit({stub:'New description'});
  if(action==='delete')await h.context.deleteFlagFromDrawer();
  assert.deepEqual(h.counts,{save:0,remove:0,confirm:0});assert.ok(h.notes.some(n=>n.includes('read only')));
 }
});
test('Reject closes KE without conversion and Reopen restores its review actions',async()=>{
 const h=harness('extraction'),before=structuredClone(h.get());
 await h.context.flagActionToggle('reject');assert.equal(h.get().status,'resolved');assert.equal(h.get().category,'extraction');
 assert.equal(h.context.flagActionView.flag.status,'resolved');
 await h.context.flagActionToggle();assert.equal(h.get().status,'open');
 const {editedAt,...after}=h.get();assert.deepEqual(after,before);assert.equal(h.counts.save,2);
});

test('Accept transfers the same flag intact to MV and refreshes the drawer and badges',async()=>{
 const h=harness('extraction'),before=structuredClone(h.get());
 h.set({...h.get(),description:'Updated before click'});
 await h.context.flagActionToggle('accept');
 const {editedAt,...after}=h.get();
 assert.deepEqual(after,{...before,category:'validation',description:'Updated before click'});
 assert.ok(editedAt);assert.equal(h.counts.save,1);
 assert.equal(h.context.flagActionView.flag.category,'validation');
 const summary=summarizeFlagBadges(new Map([['node',[h.get()]]]))[0];
 assert.equal(summary.authoringOpen,0);assert.equal(summary.authoringResolved,0);assert.equal(summary.open,1);
 const drawer=renderFlagActionDrawer({...h.get(),typeLabel:h.get().tag,targetLabel:'Q',anchorAddress:'concept:Q',summary:h.get().gist,fields:[],targetPresent:true,descriptionOnly:true,readOnly:isAuthoringFlag(h.get())});
 assert.doesNotMatch(drawer,/data-flag-action-(accept|reject)/);assert.match(drawer,/Resolve flag/);assert.match(drawer,/Edit description/);
 await h.context.flagActionToggle('reject');assert.equal(h.counts.save,1);assert.equal(h.get().status,'open');
 await h.context.flagActionToggle();assert.equal(h.get().status,'resolved');assert.equal(h.counts.save,2);
});

test('KE dispositions refuse stale ownership, status, policy, missing data, and unreadable stores',async()=>{
 for(const action of ['accept','reject']){
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

test('generic Resolve cannot bypass KE accept/reject and busy actions cannot overlap',async()=>{
 const h=harness('extraction');await h.context.flagActionToggle();assert.equal(h.counts.save,0);
 h.context.flagActionBusy=true;await h.context.flagActionToggle('accept');assert.equal(h.counts.save,0);
});

test('fresh record category protects edits and delete confirmation races',async()=>{
 const edit=harness('validation');edit.setCategory('extraction');await edit.context.saveFlagEdit({stub:'Must not save'});assert.equal(edit.counts.save,0);
 const del=harness('validation',change=>change());await del.context.deleteFlagFromDrawer();assert.deepEqual(del.counts,{save:0,remove:0,confirm:1});assert.equal(del.get().category,'extraction');
});
test('validation records still accept status, description editing and confirmed deletion',async()=>{
 const status=harness('validation');await status.context.writeFlagStatus(status.get(),'resolved',1,'policy.cel');assert.equal(status.get().status,'resolved');
 const edit=harness('validation');await edit.context.saveFlagEdit({stub:'Updated description'});assert.equal(edit.get().description,'Updated description');
 const del=harness('validation');await del.context.deleteFlagFromDrawer();assert.deepEqual(del.counts,{save:0,remove:1,confirm:1});
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
 assert.deepEqual([...c.gidsForFlag(flag)],['current']);
 c.conceptLayer.push({lib:'Unrendered',name:'Duplicate',id:'stable'});c.reloadReviewFlags();
 assert.deepEqual([...c.gidsForFlag(flag)],[]);
 c.conceptLayer.pop();c.conceptLayer.push({lib:'L',name:'Broken',idInvalid:true});flag.status='resolved';c.reloadReviewFlags();
 assert.equal(c.flagStateError,true);assert.match(c.flagStateNote,/identity metadata is invalid/);
 assert.deepEqual([...c.gidsForFlag(flag)],[]);
 c.conceptLayer.pop();c.reloadReviewFlags();
 assert.equal(c.flagStateError,false);assert.equal(c.flagStateNote,undefined);assert.deepEqual([...c.gidsForFlag(flag)],['current']);
});
