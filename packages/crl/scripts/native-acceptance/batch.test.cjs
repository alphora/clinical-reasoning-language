'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {batchReady,jobFile,collectBatch}=require('./batch.cjs');
const {options}=require('./run.cjs');
const tmp=path.resolve(__dirname,'../../../../tmp');fs.mkdirSync(tmp,{recursive:true});
const bounds={timeoutMs:120000,maxBytes:1024};
function sample(t){
  const root=fs.mkdtempSync(path.join(tmp,'batch-check-'));
  const jobs=[0,1].map(i=>{const dir=path.join(root,String(i));fs.mkdirSync(dir);fs.writeFileSync(dir+'/completed.txt','10');fs.writeFileSync(dir+'/stdout.log','{"resourceType":"Parameters"}');fs.writeFileSync(dir+'/stderr.log','');return{dir,repoPath:dir+'/repo.json',subject:'Patient/x',planId:'p'};});
  t.after(()=>{for(const j of jobs){for(const n of fs.readdirSync(j.dir))fs.unlinkSync(path.join(j.dir,n));fs.rmdirSync(j.dir);}fs.rmdirSync(root);});
  return{root,jobs,outer:{exitCode:0,stdout:'completed case',stderr:''}};
}
test('committed batch classes match source and Java17 floor',()=>batchReady());
test('batch job arguments preserve spaces and reject delimiter injection',t=>{
  const s=sample(t);s.jobs[0].planId='plan with spaces';assert.ok(jobFile(s.jobs).includes('plan with spaces\n'));
  for(const value of ['a\nb','a\rb','a\0b','']){s.jobs[0].planId=value;assert.throws(()=>jobFile(s.jobs));}
  assert.throws(()=>jobFile([]));assert.throws(()=>jobFile(Array(33).fill(s.jobs[1])));
});
test('valid batch evidence retains each case output and timing',t=>{
  const s=sample(t);const r=collectBatch(s.jobs,s.outer,bounds);assert.equal(r.length,2);assert.ok(r.every(p=>!p.failure&&p.exitCode===0&&p.durationMs===10));
});
for(const [name,mutate] of [
  ['outer error at exit zero',s=>s.outer.stderr='ERROR startup failure'],
  ['outer stdout error',s=>s.outer.stdout='Exception in thread main'],
  ['batch crash',s=>s.outer.exitCode=1],
  ['batch timeout',s=>s.outer.failure='timeout'],
  ['missing completion',s=>fs.unlinkSync(s.jobs[1].dir+'/completed.txt')],
  ['malformed completion',s=>fs.writeFileSync(s.jobs[1].dir+'/completed.txt','10junk')],
  ['over-time completion',s=>fs.writeFileSync(s.jobs[1].dir+'/completed.txt','120001')],
  ['oversized case output',s=>fs.writeFileSync(s.jobs[1].dir+'/stdout.log','x'.repeat(1025))]
]) test(name+' invalidates entire batch',t=>{const s=sample(t);mutate(s);assert.ok(collectBatch(s.jobs,s.outer,bounds).every(r=>r.failure));});
test('case null warnings are not copied to other cases',t=>{
  const s=sample(t);fs.writeFileSync(s.jobs[0].dir+'/stderr.log','Condition expression X returned null');
  const r=collectBatch(s.jobs,s.outer,bounds);assert.equal(r[1].stderr,'');assert.equal(r[0].failure,null);
});
test('batch CLI bounds, order and duplicates',t=>{
  const s=sample(t),jar=path.join(s.jobs[0].dir,'fake.jar');fs.writeFileSync(jar,'test');
  const base=['--engine-jar',jar,'--out',path.join(s.root,'new')];
  assert.equal(options(base).batchSize,8);
  assert.equal(options([...base,'--batch-size','1','--order','reverse']).batchSize,1);
  for(const b of ['0','33','2.5','NaN'])assert.throws(()=>options([...base,'--batch-size',b]));
  assert.throws(()=>options([...base,'--order','random']));
  assert.throws(()=>options([...base,'--batch-size','8','--batch-size','8']));
});
