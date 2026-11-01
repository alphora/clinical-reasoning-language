import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,truncateSync,realpathSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {tmpdir} from 'node:os';
import {loadFlagChangeSummaries,verifyFlagChangeEvidence,FlagChangeSummaryController,SUMMARY_FILE_BYTES,SUMMARY_ENTRY_LIMIT,EVIDENCE_FILE_BYTES} from './flagChangeSummaryStore.ts';

const owned=[];
afterEach(()=>{for(const root of owned.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'flag-summaries-'));owned.push(root);
 const dir=join(root,'src','medical-validation','change-summaries');mkdirSync(dir,{recursive:true});
 const evidence=join(root,'tests','results','report.json');mkdirSync(join(root,'tests','results'),{recursive:true});
 writeFileSync(evidence,'{"passed":true}');
 const reference={label:'Report',path:'tests/results/report.json',sha256:createHash('sha256').update('{"passed":true}').digest('hex')};
 const summary={schemaVersion:1,runId:'run-1',recordedAt:'2026-11-01T12:00:00.000Z',beforeCommit:'a'.repeat(40),items:[{flagIds:['mv-1','mv-2'],priorState:'Before',requestedChange:'Clarify',implementedChange:'Reworded',affectedTargets:[{scope:'concept',name:'C',library:'L',label:'Question'}],evidence:[reference]}]};
 const save=(s=summary)=>writeFileSync(join(dir,s.runId+'.json'),JSON.stringify(s));save();
 return {root,dir,evidence,reference,summary,save};
}

test('multiple runs link to every originating flag; corrupt siblings do not hide valid summaries',()=>{
 const f=fixture();f.save({...f.summary,runId:'run-2'});writeFileSync(join(f.dir,'broken.json'),'{');
 const read=loadFlagChangeSummaries(f.root);assert.equal(read.summaries.length,2);
 assert.equal(read.byFlagId.get('mv-1').length,2);assert.equal(read.byFlagId.get('mv-2').length,2);assert.equal(read.warnings.length,1);
});

test('history orders by recorded time, not lexical run ID; render cache invalidates on file events',()=>{
 const f=fixture(),c=new FlagChangeSummaryController();
 f.save({...f.summary,runId:'run-10',recordedAt:'2026-11-01T13:00:00.000Z'});
 assert.deepEqual(c.render(f.root,'mv-1').changes.map(c=>c.runId),['run-10','run-1']);
 f.save({...f.summary,runId:'run-2',recordedAt:'2026-11-01T14:00:00.000Z'});
 assert.equal(c.render(f.root,'mv-1').changes.length,2,'re-render does not re-read unchanged cache');
 c.clear();assert.deepEqual(c.render(f.root,'mv-1').changes.map(c=>c.runId),['run-2','run-10','run-1']);
 for(const runId of ['run_1','run1','run-0'])f.save({...f.summary,runId});
 c.clear();assert.deepEqual(c.render(f.root,'mv-1').changes.slice(2).map(c=>c.runId),['run-0','run-1','run1','run_1']);
});

test('folder notices are bounded and missing IDs concern only the selected flag',()=>{
 const f=fixture(),c=new FlagChangeSummaryController();
 f.save({...f.summary,runId:'unrelated',items:[{...f.summary.items[0],flagIds:['unrelated','old']} ]});
 for(let i=0;i<8;i++)writeFileSync(join(f.dir,'broken-'+i+'.json'),'{');
 const a=c.render(f.root,'mv-1',new Set(['mv-1','mv-2']));
 assert.equal(a.warnings.length,4);assert.match(a.warnings[0],/Summary folder:/);
 assert.doesNotMatch(a.warnings.join(' '),/missing flags: old/);
 const b=c.render(f.root,'unrelated',new Set(['unrelated']));assert.match(b.warnings.join(' '),/missing flags: old/);
});
test('missing summaries are ordinary absence; mismatched run IDs and large files warn',()=>{
 const f=fixture();rmSync(f.dir,{recursive:true});assert.deepEqual(loadFlagChangeSummaries(f.root).warnings,[]);
 mkdirSync(f.dir);writeFileSync(join(f.dir,'Run-1.json'),JSON.stringify(f.summary));
 writeFileSync(join(f.dir,'large.json'),'');truncateSync(join(f.dir,'large.json'),SUMMARY_FILE_BYTES+1);
 const read=loadFlagChangeSummaries(f.root);assert.equal(read.summaries.length,0);assert.equal(read.warnings.length,2);
});
test('a symlinked summary ancestor cannot import another artifact',()=>{
 const a=fixture(),b=fixture();rmSync(a.dir,{recursive:true});symlinkSync(b.dir,a.dir,'junction');
 const read=loadFlagChangeSummaries(a.root);assert.equal(read.summaries.length,0);assert.match(read.warnings.join(' '),/outside/);
});
test('entry count is bounded independently of JSON bytes',()=>{
 const f=fixture();for(let i=0;i<SUMMARY_ENTRY_LIMIT+1;i++)writeFileSync(join(f.dir,'small-'+i+'.txt'),'');
 assert.match(loadFlagChangeSummaries(f.root).warnings.join(' '),/too many entries/);
 assert.match(new FlagChangeSummaryController().render(f.root,'mv-1').warnings[0],/some were not read/);
});
test('aggregate read budget retains valid summaries already read',()=>{
 const f=fixture();rmSync(join(f.dir,'run-1.json'));
 for(let i=0;i<17;i++){
  const name='budget-'+String(i).padStart(2,'0');const json=JSON.stringify({...f.summary,runId:name});
  writeFileSync(join(f.dir,name+'.json'),json+' '.repeat(SUMMARY_FILE_BYTES-1-Buffer.byteLength(json)));
 }
 for(let i=0;i<4;i++)writeFileSync(join(f.dir,'a-broken-'+i+'.json'),'{');
 const notices=new FlagChangeSummaryController().render(f.root,'mv-1').warnings;assert.match(notices[0],/later files were not read/);
 const read=loadFlagChangeSummaries(f.root);assert.equal(read.summaries.length,16);assert.match(read.warnings.join(' '),/read budget/);
});
test('a symlinked JSON entry is refused without dropping a valid sibling',ctx=>{
 const f=fixture(),other=fixture();
 try{symlinkSync(join(other.dir,'run-1.json'),join(f.dir,'linked.json'),'file');}
 catch(error){if(error.code==='EPERM'||error.code==='EACCES'){ctx.skip('File symlink permission unavailable');return;}throw error;}
 const read=loadFlagChangeSummaries(f.root);assert.equal(read.summaries.length,1);assert.match(read.warnings.join(' '),/not a regular/);
});
test('evidence is hash checked, not a silently mutable reference to a later run',async()=>{
 const f=fixture();assert.equal(await verifyFlagChangeEvidence(f.root,f.reference),f.evidence);
 writeFileSync(f.evidence,'{"differentRun":true}');
 await assert.rejects(()=>verifyFlagChangeEvidence(f.root,f.reference),/no longer matches/);
 truncateSync(f.evidence,EVIDENCE_FILE_BYTES+1);
 await assert.rejects(()=>verifyFlagChangeEvidence(f.root,f.reference),/64 MiB/);
 rmSync(f.evidence);await assert.rejects(()=>verifyFlagChangeEvidence(f.root,f.reference),/unavailable for this historical run/);
});
test('sibling-prefix and symlink evidence escapes are refused',async()=>{
 const f=fixture(),other=f.root+'-evil';owned.push(other);mkdirSync(join(other,'results'),{recursive:true});writeFileSync(join(other,'results','report.json'),'{"passed":true}');
 await assert.rejects(()=>verifyFlagChangeEvidence(f.root,{...f.reference,path:'src/../outside'}));
 symlinkSync(other,join(f.root,'src','external'),'junction');
 await assert.rejects(()=>verifyFlagChangeEvidence(f.root,{...f.reference,path:'src/external/results/report.json'}),/outside/);
});
test('opaque keys are bound to current flag and invalidate on refresh/deletion/policy change',async()=>{
 const f=fixture(),c=new FlagChangeSummaryController();
 let display=c.render(f.root,'mv-1'),key=display.changes[0].evidence[0].key;
 assert.equal(await c.resolve(key,f.root,'mv-1'),f.evidence);
 await assert.rejects(()=>c.resolve(key,f.root,'mv-2'),/Reopen/);
 c.render(f.root,'mv-1');await assert.rejects(()=>c.resolve(key,f.root,'mv-1'),/Reopen/);
 display=c.render(f.root,'mv-1');key=display.changes[0].evidence[0].key;
 rmSync(join(f.dir,'run-1.json'));c.clear();await assert.rejects(()=>c.resolve(key,f.root,'mv-1'),/Reopen/);
 assert.equal(c.render(f.root,'mv-1').changes.length,0);
});

test('actual host refuses matching disk evidence when VS Code would display a dirty buffer',async()=>{
 const f=fixture(),controller=new FlagChangeSummaryController();
 const display=controller.render(f.root,'mv-1'),key=display.changes[0].evidence[0].key;
 const source=ts.createSourceFile('host.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 let method;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='openFlagSummaryEvidence')method=n.getText(source);ts.forEachChild(n,visit);}visit(source);assert.ok(method);
 const cel=join(f.root,'src','cel','policy.cel'),calls=[],notes=[];
 const dirty={uri:{scheme:'file',fsPath:f.evidence},isDirty:true,getText:()=>'{"unsavedDifferentResult":true}'};
 const context=vm.createContext({currentCel:cel,flagActionView:{cel,flag:{id:'mv-1'}},mode:'medical-validation',
  findPolicySrc:()=>join(f.root,'src'),flagChangeSummaries:controller,flagNote:m=>notes.push(m),relative,resolve,dirname,realpathSync,
  vscode:{workspace:{textDocuments:[dirty]},Uri:{file:path=>({fsPath:path})},commands:{executeCommand:(...args)=>calls.push(args)}}});
 vm.runInContext(transformSync(method,{loader:'ts',target:'es2022'}).code,context);
 await context.openFlagSummaryEvidence(key);assert.equal(calls.length,0);assert.match(notes.join(' '),/Save or revert/);
 symlinkSync(join(f.root,'tests','results'),join(f.root,'src','evidence-alias'),'junction');
 dirty.uri.fsPath=join(f.root,'src','evidence-alias','report.json');
 await context.openFlagSummaryEvidence(key);assert.equal(calls.length,0,'dirty buffer through a symlink is also refused');
 dirty.uri.scheme='git';await context.openFlagSummaryEvidence(key);assert.equal(calls.length,1,'virtual URI does not block a disk open');calls.length=0;
 dirty.uri.scheme='file';dirty.isDirty=false;await context.openFlagSummaryEvidence(key);assert.equal(calls.length,1);assert.equal(calls[0][0],'vscode.open');assert.equal(calls[0][1].fsPath,f.evidence);
});
