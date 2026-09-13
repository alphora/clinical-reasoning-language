import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {isAuthoringFlag} from './flagWorkflow.ts';
import {flagCloseEligibility} from './flagCloseEligibility.ts';

// Execute the actual private host handlers with controlled disk reads and modal completion.
// VS Code refuses native modal dialogs in extension-test hosts.
const source=ts.createSourceFile('cockpit.ts',readFileSync(fileURLToPath(new URL('./correspondenceCockpit.ts',import.meta.url)),'utf8'),ts.ScriptTarget.Latest,true);
const names=['writeFlagStatus','saveFlagEdit','deleteFlagFromDrawer','nodeFlagAction','openNodeFlags'];const bodies=new Map();
function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))bodies.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}visit(source);
function harness(category,confirm){
 let current={id:'f',category,tag:'other',gist:'Flag',status:'open',fields:{},anchor:{scope:'concept',name:'Q',label:'Q'},createdAt:'2026-09-12'};
 const captured=structuredClone(current),counts={save:0,remove:0,confirm:0},notes=[];
 const noop=()=>{};
 const context=vm.createContext({isAuthoringFlag,flagCloseEligibility,indexVersion:1,currentCel:'policy.cel',mode:'medical-validation',flagActionBusy:false,
  flagActionView:{flag:captured,ver:1,cel:'policy.cel'},flagEditDraft:{flag:captured,cel:'policy.cel',descriptionOnly:true},flagsList:[captured],flagEditDirty:false,
  flagStoreDir:()=>'/memory',loadStoredFlags:()=>({flags:current?[structuredClone(current)]:[]}),
  saveFlag:(_dir,flag)=>{counts.save++;current=flag;},removeFlag:()=>{counts.remove++;current=undefined;},flagNote:m=>notes.push(m),
  reloadReviewFlags:noop,renderTreeChrome:noop,driveFlagBadges:noop,postFlagDrawer:noop,openFlagActionView:noop,closeFlagActionView:noop,
  flagDisplayNameOf:()=> 'Other',vscode:{workspace:{isTrusted:false},window:{showWarningMessage:async()=>{counts.confirm++;confirm?.(()=>{current={...current,category:'extraction'};});return 'Delete flag';}}},
 });
 for(const name of names)vm.runInContext(transformSync(bodies.get(name),{loader:'ts',target:'es2022'}).code,context);
 return {context,counts,notes,get:()=>current,setCategory:value=>{current={...current,category:value};}};
}
test('host rejects forged edit and delete against authoring records',async()=>{
 for(const action of ['edit','delete']){
  const h=harness('extraction');
  if(action==='edit')await h.context.saveFlagEdit({stub:'New description'});
  if(action==='delete')await h.context.deleteFlagFromDrawer();
  assert.deepEqual(h.counts,{save:0,remove:0,confirm:0});assert.ok(h.notes.some(n=>n.includes('read only')));
 }
});
test('MV can resolve and reopen KE flags without editing their content',async()=>{
 const h=harness('extraction'),before=structuredClone(h.get());
 await h.context.writeFlagStatus(h.get(),'resolved',1,'policy.cel');assert.equal(h.get().status,'resolved');
 await h.context.writeFlagStatus(h.get(),'open',1,'policy.cel');assert.equal(h.get().status,'open');
 const {editedAt,...after}=h.get();assert.deepEqual(after,before);assert.equal(h.counts.save,2);
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
