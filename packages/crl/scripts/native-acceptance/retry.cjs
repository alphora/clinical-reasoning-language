#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dist=path.resolve(__dirname,'../../dist');
const {ANSWER_EXAMPLE_BASE,ANSWER_EXAMPLE_TERMS,ANSWER_EXAMPLE_CEL,answerExampleSource}=require(path.join(dist,'authoring-kit/answerExample'));
async function main(){
 const [jarArg,outputArg]=process.argv.slice(2);assert(jarArg&&outputArg,'retry.cjs ENGINE_JAR NEW_OUTPUT');
 const jar=fs.realpathSync(jarArg),out=path.resolve(outputArg);fs.mkdirSync(out);
 const write=(rel,value)=>{const file=path.join(out,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2));};
 write('package.json',{name:'native-retry-probe',version:'1.0.0',crl:{canonicalBase:ANSWER_EXAMPLE_BASE,date:'2026-09-16'}});
 write('src/crl/policy.crl',answerExampleSource());write('src/crl/shared.crl','library "Shared".\n'+ANSWER_EXAMPLE_TERMS);
 write('src/cel/mv/cases.cel',ANSWER_EXAMPLE_CEL);
 const runner=require(path.join(dist,'results/runProducer')),actual=runner.runOneCase;
 let invocations=0,forceFailure=true;
 // First invocation retains a real success; second uses the real owned-runner deadline.
 runner.runOneCase=(ctx,c)=>{invocations++;return actual(forceFailure&&invocations===2?{...ctx,bounds:{...ctx.bounds,batchTimeoutMs:1}}:ctx,c);};
 const {produceResults}=require(path.join(dist,'results/produce'));
 const req={celPath:out,crlPath:path.join(out,'src/crl/policy.crl'),outRoot:out,useCase:'prior-auth',jarPath:jar,crlVersion:require(path.join(dist,'../package.json')).version};
 const first=await produceResults(req);assert(first.ok,JSON.stringify(first));assert.equal(first.failed,1);
 assert.equal(first.manifest.cases.length,3);assert.equal(first.manifest.cases[1].state,'timeout');
 const kept=first.manifest.cases[0];assert.equal(kept.state,'generated');
 const before=kept.artifacts.map(a=>({path:a.path,bytes:fs.readFileSync(path.join(out,a.path)),mtime:fs.statSync(path.join(out,a.path)).mtimeMs}));
 forceFailure=false;invocations=0;
 const second=await produceResults({...req,retryFailed:true,caseTimeoutMs:900000});
 assert(second.ok,JSON.stringify(second));assert.equal(second.failed,0);assert.equal(invocations,1);
 assert.equal(second.manifest.cases[0].reused,true);assert.equal(second.manifest.cases[0].producedAt,kept.producedAt);
 for(const a of before){assert.deepEqual(fs.readFileSync(path.join(out,a.path)),a.bytes);assert.equal(fs.statSync(path.join(out,a.path)).mtimeMs,a.mtime);}
 invocations=0;const third=await produceResults({...req,retryFailed:true});assert(third.ok,JSON.stringify(third));assert.equal(invocations,0);
 const execFile=require('node:util').promisify(require('node:child_process').execFile);
 const cli=await execFile(process.execPath,[path.join(dist,'cli/run-emit-results.js'),'--cel',out,'--crl',req.crlPath,'--use-case','prior-auth','--jar',jar,'--out',out,'--enable','--retry-failed','--case-timeout-ms','900000'],{timeout:120000,maxBuffer:8388608});
 assert.equal((cli.stdout.match(/\[retained\]/g)||[]).length,3);
 const cliManifest=JSON.parse(fs.readFileSync(third.manifestPath,'utf8'));assert(cliManifest.cases.every(c=>c.reused));
 const evidence={cliRetainedCases:3,firstStates:first.manifest.cases.map(c=>c.state),retryStates:second.manifest.cases.map(c=>c.state),retryNativeCalls:1,repeatNativeCalls:0,preservedBytesAndMtimes:true,inputClock:third.manifest.provenance.inputClock,producedAt:third.manifest.cases.map(c=>c.producedAt)};
 write('verification.json',evidence);console.log(JSON.stringify(evidence));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
