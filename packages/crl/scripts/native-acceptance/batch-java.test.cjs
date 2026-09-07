'use strict';
// Explicit maintainer integration check: requires a JDK. Ordinary checker tests remain Java-free.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {runBatch,classDir,batchReady}=require('./batch.cjs');
const root=path.resolve(__dirname,'../../../../tmp');fs.mkdirSync(root,{recursive:true});
const work=fs.mkdtempSync(path.join(root,'batch-java-'));
const java=process.env.ACCEPTANCE_JAVA||'java',javac=process.env.ACCEPTANCE_JAVAC||'javac';
before(()=>{
 batchReady();
 fs.writeFileSync(work+'/FakeApply.java',`import java.io.PrintStream;
public class FakeApply {
 static final PrintStream cached=System.err;
 public static void main(String[] args) throws Exception {
  cached.println("case "+args[2]);
  if(args[1].equals("throw")) throw new IllegalStateException("synthetic failure");
  if(args[1].equals("hang")) Thread.sleep(100000);
  if(args[1].equals("overflow")) System.out.print("x".repeat(10000));
  System.out.println("result "+args[2]);
 }
}`);
 execFileSync(javac,['--release','17','-d',work,work+'/FakeApply.java'],{windowsHide:true});
});
// Keep process evidence under tmp for inspection; never generate on the system temp drive.
after(()=>console.log('Java batch evidence: '+work));
async function run(name,modes,bounds={timeoutMs:5000,maxBytes:4096}){
 const dir=path.join(work,name);fs.mkdirSync(dir);
 const jobs=modes.map((mode,i)=>{const d=path.join(dir,'case-'+i);fs.mkdirSync(d);return{dir:d,repoPath:d+'/unused.json',planId:mode,subject:'Patient/'+i};});
 return {...await runBatch({java,argsPrefix:['-cp',[classDir,work].join(path.delimiter),'BatchApplyDriver'],jobs,dir,bounds,driverClass:'FakeApply'}),jobs};
}
test('warm invocations isolate output even with a cached logger stream',async()=>{
 const b=await run('error-in-output-path',['ok','ok','ok']);assert.equal(b.outer.exitCode,0);
 b.results.forEach((r,i)=>{assert.equal(r.failure,null);assert.equal(r.stdout,'result Patient/'+i+require('node:os').EOL);assert.equal(r.stderr,'case Patient/'+i+require('node:os').EOL);});
});
test('throwing invocation fails its entire batch and does not execute the next case',async()=>{
 const b=await run('throw',['ok','throw','ok']);assert.notEqual(b.outer.exitCode,0);assert.ok(b.results.every(r=>r.failure));assert.equal(fs.existsSync(b.jobs[2].dir+'/completed.txt'),false);
});
test('per-case watchdog halts whole JVM',async()=>{
 const b=await run('timeout',['ok','hang','ok'],{timeoutMs:500,maxBytes:4096});assert.equal(b.outer.exitCode,124);assert.ok(b.results.every(r=>r.failure));
});
test('per-case output cap halts whole JVM and bounds retained bytes',async()=>{
 const b=await run('overflow',['ok','overflow','ok'],{timeoutMs:5000,maxBytes:1024});assert.equal(b.outer.exitCode,125);assert.ok(b.results.every(r=>r.failure));assert.ok(fs.statSync(b.jobs[1].dir+'/stdout.log').size<=1024);
});
