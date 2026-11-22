import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, unlinkSync, rmSync, truncateSync } from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';
import { captureNautilusLog, refreshNautilusLog, hasNautilusLog, watchNautilusLog } from './nautilusLogState.ts';
import { resolveMvReprocessLog, MV_REPROCESS_LOG_MAX_BYTES } from './mvReprocessLog.ts';

function fixture() {
  const temp=realpathSync(tmpdir()),root=mkdtempSync(join(temp,'crl-nautilus-log-'));
  const artifact=join(root,'artifacts/policy'),src=join(artifact,'src'),cel=join(src,'cel/policy.cel');
  mkdirSync(dirname(cel),{recursive:true});mkdirSync(join(src,'crl'));writeFileSync(cel,'Synthetic');
  const packageFile=join(artifact,'package.json');writeFileSync(packageFile,'{}');
  const project=join(root,'kelp.project.json');
  const config=folder=>writeFileSync(project,JSON.stringify({project:{schemaVersion:1,structure:{entities:[{key:'medical-validation',folder}]}}}));
  config('src/medical-validation');
  const report=(folder='src/medical-validation')=>{const file=join(artifact,folder,'nautilus-log.md');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'# Synthetic Nautilus log');return file;};
  return {root,src,artifact,cel,project,packageFile,config,report,capture:()=>captureNautilusLog(undefined,cel,src,realpathSync(src)),close(){const rel=relative(temp,realpathSync(root));assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..'));rmSync(root,{recursive:true,force:true});}};
}

test('cached status refreshes on first arrival/deletion while same-policy tokens survive chrome refresh',()=>{
  const f=fixture();try{
    const first=f.capture();assert.equal(hasNautilusLog(first.report),false);
    assert.equal(captureNautilusLog(first,f.cel,f.src,realpathSync(f.src)),first);
    const file=f.report();assert.equal(hasNautilusLog(first.report),false);
    const present=refreshNautilusLog(first);assert.equal(hasNautilusLog(present.report),true);assert.equal(present.token,first.token);
    assert.equal(refreshNautilusLog(present),present);
    truncateSync(file,MV_REPROCESS_LOG_MAX_BYTES+1);const large=refreshNautilusLog(present);assert.equal(large.report.reason,'too-large');assert.equal(hasNautilusLog(large.report),true);
    unlinkSync(file);const missing=refreshNautilusLog(large);assert.equal(hasNautilusLog(missing.report),false);assert.equal(missing.token,first.token);
    assert.notEqual(captureNautilusLog(first,'other.cel',f.src,realpathSync(f.src)).token,first.token);
  }finally{f.close();}
});

test('mapping, malformed configuration and package repair update cached state without reselection',()=>{
  const f=fixture();try{
    f.report();let state=f.capture();assert.equal(hasNautilusLog(state.report),true);
    f.config('review/mv');state=refreshNautilusLog(state);assert.equal(hasNautilusLog(state.report),false);
    f.report('review/mv');state=refreshNautilusLog(state);assert.equal(hasNautilusLog(state.report),true);
    writeFileSync(f.project,'invalid');state=refreshNautilusLog(state);assert.equal(state.report.reason,'invalid-project');assert.equal(hasNautilusLog(state.report),false);
    f.config('review/mv');unlinkSync(f.packageFile);state=refreshNautilusLog(state);assert.equal(state.report.reason,'artifact-layout');
    writeFileSync(f.packageFile,'{}');state=refreshNautilusLog(state);assert.equal(hasNautilusLog(state.report),true);
  }finally{f.close();}
});

function fakeWatcherApi(){
  const records=[];
  return {api:{RelativePattern:class{constructor(base,value){this.base=base;this.pattern=value;}},workspace:{createFileSystemWatcher:pattern=>{const r={pattern,handlers:{},disposed:false};records.push(r);return {onDidCreate:fn=>r.handlers.create=fn,onDidChange:fn=>r.handlers.change=fn,onDidDelete:fn=>r.handlers.delete=fn,dispose:()=>r.disposed=true};}}},emit:(kind,file)=>{for(const r of records){const rel=relative(r.pattern.base,file).replaceAll('\\','/');if(r.disposed||rel.startsWith('../')||isAbsolute(rel))continue;const matches=r.pattern.pattern==='**'?true:r.pattern.pattern==='**/nautilus-log.md'?rel.endsWith('/nautilus-log.md')||rel==='nautilus-log.md':rel===r.pattern.pattern;if(matches)r.handlers[kind]?.({fsPath:file});}},pattern:()=>records[0].pattern,patterns:()=>records.map(r=>r.pattern),disposed:()=>records.every(r=>r.disposed)};
}

test('watcher starts at existing project root before folder/package/config repairs and cancels stale events',()=>{
  const f=fixture();vi.useFakeTimers();try{
    unlinkSync(f.packageFile);writeFileSync(f.project,'invalid');let state=f.capture(),refreshes=0;
    const fake=fakeWatcherApi(),watcher=watchNautilusLog(f.src,()=>{refreshes++;state=refreshNautilusLog(state);},fake.api);
    assert.equal(fake.pattern().base,f.root);assert(fake.patterns().some(p=>p.base===f.artifact&&p.pattern==='**'));assert(!fake.patterns().some(p=>p.base===f.root&&p.pattern.includes('**')));
    f.config('src/medical-validation');fake.emit('change',f.project);writeFileSync(f.packageFile,'{}');fake.emit('create',f.packageFile);
    vi.advanceTimersByTime(100);assert.equal(refreshes,1);assert.equal(hasNautilusLog(state.report),false);
    const file=f.report();fake.emit('create',file);vi.advanceTimersByTime(100);assert.equal(hasNautilusLog(state.report),true);
    unlinkSync(f.packageFile);fake.emit('delete',f.packageFile);vi.advanceTimersByTime(100);assert.equal(hasNautilusLog(state.report),false);
    writeFileSync(f.packageFile,'{}');fake.emit('create',f.packageFile);vi.advanceTimersByTime(100);assert.equal(hasNautilusLog(state.report),true);
    const before=refreshes;fake.emit('change',join(f.root,'artifacts/other/src/medical-validation/nautilus-log.md'));vi.advanceTimersByTime(100);assert.equal(refreshes,before);
    fake.emit('delete',file);watcher.dispose();vi.advanceTimersByTime(100);fake.emit('create',file);vi.advanceTimersByTime(100);assert.equal(refreshes,before);assert.equal(fake.disposed(),true);
  }finally{vi.useRealTimers();f.close();}
});

test('standalone F5 policy reads its local MV log and absence is ordinary information',()=>{
  const f=fixture();try{
    unlinkSync(f.project);const missing=resolveMvReprocessLog(f.src);assert.equal(missing.kind,'missing');assert.equal(missing.message,'No Nautilus log has been delivered for this policy yet.');
    const file=f.report();assert.equal(resolveMvReprocessLog(f.src).filePath,realpathSync(file));
    const fake=fakeWatcherApi(),watcher=watchNautilusLog(f.src,()=>{},fake.api);assert.equal(fake.pattern().base,f.src);watcher.dispose();
    assert.match(readFileSync(file,'utf8'),/Synthetic/);
  }finally{f.close();}
});


test('containing-folder-only deletion and creation events refresh managed and standalone log availability',()=>{
  for(const standalone of [false,true]){
    const f=fixture();vi.useFakeTimers();try{
      if(standalone)unlinkSync(f.project);
      const file=f.report();let state=f.capture(),refreshes=0;
      const fake=fakeWatcherApi(),watcher=watchNautilusLog(f.src,()=>{refreshes++;state=refreshNautilusLog(state);},fake.api);
      assert.equal(hasNautilusLog(state.report),true);
      const folder=dirname(file);rmSync(folder,{recursive:true,force:true});
      fake.emit('delete',folder);vi.advanceTimersByTime(100);
      assert.equal(hasNautilusLog(state.report),false,'folder-only deletion must clear glow');
      f.report();fake.emit('create',folder);vi.advanceTimersByTime(100);
      assert.equal(hasNautilusLog(state.report),true,'folder-only arrival must restore glow');
      const before=refreshes;fake.emit('change',f.cel);vi.advanceTimersByTime(100);
      assert.equal(refreshes,before,'ordinary source changes do not refresh log state');
      watcher.dispose();
    }finally{vi.useRealTimers();f.close();}
  }
});
