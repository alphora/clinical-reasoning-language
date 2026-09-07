'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {hash, hasEngineError} = require('./check.cjs');
const {runBounded,childEnvironment} = require('./process.cjs');
const write = (p,v)=>fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');
const classDir = path.join(__dirname,'batch-classes');
function batchReady(dir=classDir,source=path.join(__dirname,'BatchApplyDriver.java')) {
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'build.json')));
  assert.equal(meta.sourceSha256,hash(fs.readFileSync(source)),'Batch source/class drift; rebuild with build-batch.cjs');
  assert.equal(meta.classFileMajor,61);
  assert.deepEqual(fs.readdirSync(dir).filter(n=>n.endsWith('.class')).sort(),Object.keys(meta.classes).sort());
  assert.ok(Object.hasOwn(meta.classes,'BatchApplyDriver.class'));
  for(const [name,want] of Object.entries(meta.classes)) {
    assert.match(name,/^BatchApplyDriver(?:\$\w+)?\.class$/);
    const bytes=fs.readFileSync(path.join(dir,name));
    assert.equal(hash(bytes),want); assert.equal(bytes.readUInt32BE(0),0xcafebabe); assert.equal(bytes.readUInt16BE(6),61);
  }
  return meta;
}
function jobFile(jobs) {
  assert.ok(jobs.length>0&&jobs.length<=32);
  return jobs.flatMap(j=>[j.repoPath,j.planId,j.subject,j.dir]).map(v=>{
    assert.ok(typeof v==='string'&&v.length>0&&!/[\r\n\0]/.test(v),'Invalid batch argument');return v;
  }).join('\n')+'\n';
}
function collectBatch(jobs, outer, bounds) {
  const outerFailure=outer.failure || (outer.exitCode!==0 ? `Batch exit ${outer.exitCode}` : null)
    || (hasEngineError((outer.stdout||'')+'\n'+(outer.stderr||'')) ? 'Batch log reports engine error' : null);
  const results=jobs.map(job=>{
    let marker, stdout='',stderr='',failure=outerFailure;
    try {
      marker=fs.readFileSync(path.join(job.dir,'completed.txt'),'utf8');
      assert.match(marker,/^\d+$/); assert.ok(Number.isSafeInteger(Number(marker))&&Number(marker)<=bounds.timeoutMs);
      for(const name of ['stdout','stderr']) assert.ok(fs.statSync(path.join(job.dir,name+'.log')).size<=bounds.maxBytes);
    } catch(e) { failure ||= 'Missing/invalid batch completion evidence'; }
    // Preserve partial logs after a failed process, but never accept them as successful.
    for(const name of ['stdout','stderr']) {
      const p=path.join(job.dir,name+'.log');
      if(fs.existsSync(p)) {
        const size=fs.statSync(p).size;
        if(size>bounds.maxBytes) { failure ||= 'Case log limit exceeded'; continue; }
        if(name==='stdout') stdout=fs.readFileSync(p,'utf8');else stderr=fs.readFileSync(p,'utf8');
      }
    }
    return {exitCode:outer.exitCode,signal:outer.signal,failure,stdout,stderr,durationMs:marker&&/^\d+$/.test(marker)?Number(marker):null};
  });
  // Incomplete/corrupt batch evidence invalidates the entire batch, including earlier rows.
  const failure=results.find(r=>r.failure)?.failure;
  if(failure) for(const r of results) r.failure ||= failure;
  return results;
}
async function runBatch({java,argsPrefix,jobs,dir,bounds,signal,driverClass='ApplyDriver'}) {
  write(path.join(dir,'jobs.txt'),jobFile(jobs));
  const args=[...argsPrefix,driverClass,path.join(dir,'jobs.txt'),String(bounds.timeoutMs),String(bounds.maxBytes)];
  const command={executable:java,args};write(path.join(dir,'command.json'),command);
  const start=Date.now();
  const outer=await runBounded(java,args,{cwd:dir,env:childEnvironment(dir),signal,timeoutMs:30000+jobs.length*bounds.timeoutMs,maxBytes:bounds.maxBytes});
  outer.durationMs=Date.now()-start;
  write(path.join(dir,'stdout.log'),outer.stdout);write(path.join(dir,'stderr.log'),outer.stderr);
  write(path.join(dir,'process.json'),{...outer,stdout:undefined,stderr:undefined});
  return {command,outer,results:collectBatch(jobs,outer,bounds)};
}
module.exports={batchReady,classDir,jobFile,collectBatch,runBatch};
