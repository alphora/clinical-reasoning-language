#!/usr/bin/env node
'use strict';
// Native operation API test, not a client renderer or production driver replacement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {loadFixture,hash}=require('./check.cjs');
const {runBounded,childEnvironment}=require('./process.cjs');
const {classDir,overlaySha256,helperReady,checkOrigins,single,editResponse,checkExtraction,sessionVerdict}=require('./session-check.cjs');
const pkg=path.resolve(__dirname,'../..'),workspace=fs.realpathSync(path.resolve(pkg,'../..')),fixture=path.join(pkg,'test/acceptance/bleph');
const write=(p,v)=>fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');
const maxBytes=32*1024*1024;
const read=p=>{assert.ok(fs.statSync(p).size<=maxBytes,'Oversized evidence: '+p);return JSON.parse(fs.readFileSync(p));};
const clone=structuredClone;
function treeHashes(dir) {
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  return Object.fromEntries(walk(dir).map(p=>[path.relative(dir,p).replaceAll('\\','/'),hash(fs.readFileSync(p))]));
}
function options(args) {
  const o={},seen=new Set();
  for(let i=0;i<args.length;i+=2) {
    const k={'--engine-jar':'jar','--engine-overlay':'overlay','--out':'out','--java':'java'}[args[i]];
    assert.ok(k&&args[i+1]&&!args[i+1].startsWith('--'),'Usage: --engine-jar PATH --out NEW_DIRECTORY [--engine-overlay PATH] [--java PATH]');
    assert.ok(!seen.has(k),'Duplicate option');seen.add(k);o[k]=args[i+1];
  }
  assert.ok(o.jar&&o.out,'Explicit engine jar and new output directory required');o.jar=fs.realpathSync(o.jar);
  if(o.overlay)o.overlay=fs.realpathSync(o.overlay);
  const target=path.resolve(o.out);o.out=path.join(fs.realpathSync(path.dirname(target)),path.basename(target));
  const rel=path.relative(workspace,o.out).replaceAll('\\','/');
  assert.ok(path.isAbsolute(rel)||rel.startsWith('../')||/^tmp\//i.test(rel),'Output must be outside workspace or under tmp/');
  assert.ok(!fs.existsSync(o.out),'Output directory must be new');
  assert.ok(![classDir,o.overlay].filter(Boolean).some(p=>p.includes(',')),'Spring loader paths cannot contain commas');return o;
}
async function main(args) {
  const startTime=Date.now(),o=options(args),f=loadFixture(fixture),session=read(path.join(fixture,'session.json'));
  const {ENGINE_JAR_SOURCE,parseJavaMajor,MIN_JAVA_MAJOR}=require('../../dist/results/spawn');
  const engineHash=hash(fs.readFileSync(o.jar));assert.equal(engineHash,ENGINE_JAR_SOURCE.sha256,'Requires original pinned engine jar');
  if(o.overlay)assert.equal(hash(fs.readFileSync(o.overlay)),overlaySha256,'Only reviewed combined4.7 overlay admitted');
  const helper=helperReady();assert.equal(helper.engineSha256,engineHash);
  assert.equal(session.schemaVersion,1);assert.equal(session.steps.length,4);
  fs.mkdirSync(o.out);const controller=new AbortController(),interrupt=()=>controller.abort();
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  const rows=[],failures=[];
  const distHashes=treeHashes(path.join(pkg,'dist')),harnessHashes=treeHashes(__dirname);
  const settings=['-Xmx768m','-XX:ActiveProcessorCount=2','-Duser.timezone=UTC','-Duser.language=en','-Duser.country=US','-Dfile.encoding=UTF-8'];
  const git=(...a)=>execFileSync('git',a,{cwd:workspace,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
  try {
    const java=o.java||'java',version=await runBounded(java,['-version'],{cwd:o.out,env:childEnvironment(o.out),signal:controller.signal,timeoutMs:15000});
    assert.ok(!version.failure&&version.exitCode===0&&parseJavaMajor(version.stderr+version.stdout)>=MIN_JAVA_MAJOR,'Java unavailable/too old');
    write(path.join(o.out,'manifest.json'),{schemaVersion:1,sourceHead:git('rev-parse','HEAD'),sourceStatus:git('status','--porcelain'),engine:ENGINE_JAR_SOURCE,
      overlay:o.overlay?{sha256:overlaySha256,label:'Reviewed local test instrument; not installed/shipped engine'}:null,
      helper,distHashes,harnessHashes,fixtureHashes:f.hashes,node:process.version,java:version.stderr+version.stdout,
      invocation:'Native R4 applyR5, useServerData=true, complete Q+QR in dataBundle; fresh repository per call; fixed initial clinical data',
      bounds:{timeoutMs:120000,maxBytes,heapMiB:768,activeProcessors:2},settings});
    const {resolveCelImports}=require('../../dist/cel/imports'),{emitCelToFhir}=require('../../dist/cel/emitter/emitFhir');
    const {emitCQLImports}=require('../../dist/imports/emit'),{emitFhirDefFromPath}=require('../../dist/fhir-emitter/closureOrchestrator');
    const {buildEngineRepoBundle}=require('../../dist/results/repoBundle');
    const crl=path.join(fixture,'src/crl/blepharoplasty-blepharoptosis-repair.crl'),cql=emitCQLImports(crl),fhir=emitFhirDefFromPath(crl);
    assert.equal(cql.success,true);assert.equal(fhir.success,true);
    const cel=emitCelToFhir(resolveCelImports(path.join(fixture,'src/cel/unknowns.cel')));
    assert.deepEqual(cel.diagnostics.filter(d=>d.severity==='error'),[]);
    for(const name of [session.initialCase,session.controlCase]) {
      const found=cel.emittedCases.filter(c=>c.caseName===name);assert.equal(found.length,1);
      assert.equal(hash(JSON.stringify(found[0].resources.map(r=>r.body))),f.inputs.find(e=>e.suite==='unknowns'&&e.case===name).resourcesSha256,'CEL input drift');
    }
    const initial=cel.emittedCases.find(c=>c.caseName===session.initialCase),controls=cel.emittedCases.find(c=>c.caseName===session.controlCase).resources.map(r=>r.body);
    const base=buildEngineRepoBundle({definitions:fhir.resources.map(r=>r.resource),cqlByLibraryFile:Object.fromEntries(cql.cqlByLibrary.map(r=>[r.outputFilename,r.cql])),caseInput:{caseName:initial.caseName,resources:initial.resources}});
    assert.deepEqual(base.missingCql,[]);
    const subject='Patient/'+single(initial.resources.map(r=>r.body),'Patient').id;
    const oracle=clone(f.entries.find(e=>e.suite==='unknowns'&&e.case===session.initialCase));
    write(path.join(o.out,'emission.json'),{cql,fhir,cel});
    let q,qr;
    for(const [index,step] of session.steps.entries()) {
      const dir=path.join(o.out,String(index)+'-'+step.name);fs.mkdirSync(dir);
      const repo=clone(base.bundle),request={resourceType:'Bundle',type:'collection',entry:[]};
      if(index) {
        const submitted=editResponse(q,qr,step,f.contract);oracle.answers[step.key]=step.value;
        repo.entry.push({resource:clone(q)});request.entry.push({resource:clone(q)},{resource:submitted});
        write(path.join(dir,'edit-proof.json'),{fullQrPreservedExceptAnswerAndAuthored:true,key:step.key,authored:step.authored});
      }
      write(path.join(dir,'repo.json'),repo);write(path.join(dir,'request.json'),request);
      const prefix=path.join(dir,'apply'),loader=[classDir,o.overlay].filter(Boolean).join(',');
      const javaArgs=[...settings,'-Djava.io.tmpdir='+dir,'-Dloader.main=ApplySessionDriver','-Dloader.path='+loader,'-cp',o.jar,'org.springframework.boot.loader.launch.PropertiesLauncher',path.join(dir,'repo.json'),path.join(dir,'request.json'),f.contract.planId,subject,prefix];
      write(path.join(dir,'command.json'),{executable:java,args:javaArgs});
      const began=Date.now(),p=await runBounded(java,javaArgs,{cwd:dir,env:childEnvironment(dir),signal:controller.signal,timeoutMs:120000,maxBytes});
      p.durationMs=Date.now()-began;write(path.join(dir,'stdout.log'),p.stdout);write(path.join(dir,'stderr.log'),p.stderr);write(path.join(dir,'process.json'),{...p,stdout:undefined,stderr:undefined});
      assert.ok(!p.failure&&p.exitCode===0,'Native process failed at '+step.name);
      checkOrigins(fs.readFileSync(prefix+'-origins.txt','utf8'),o.jar,o.overlay);
      const result=read(prefix+'-result.json'),native=sessionVerdict(result,oracle,f.contract,step,subject,p);
      const extraction=checkExtraction({before:read(prefix+'-request-before.json'),after:read(prefix+'-request-after.json'),
        storedBefore:read(prefix+'-stored-observations-before.json'),storedAfter:read(prefix+'-stored-observations-after.json'),
        repoBefore:read(prefix+'-repository-bundle-before.json'),repoAfter:read(prefix+'-repository-bundle-after.json'),subject,contract:f.contract,controls});
      const row={index,name:step.name,expected:step.expected,native,extraction,passed:native.passed&&extraction.passed,durationMs:p.durationMs};
      rows.push(row);write(path.join(dir,'verdict.json'),row);
      console.log(`${index+1}/4 ${step.name}: ${row.passed?'PASS':'FAIL'} (${Math.round(p.durationMs/1000)}s)`);
      // Retain all stages after clinical/extraction mismatches. Missing unique Q/QR is fatal.
      q=single(result,'Questionnaire');qr=single(result,'QuestionnaireResponse');
    }
  } catch(e) {failures.push(e.stack||String(e));}
  finally {
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
    try {
      assert.deepEqual(treeHashes(path.join(pkg,'dist')),distHashes,'Built core changed during run');
      assert.deepEqual(treeHashes(__dirname),harnessHashes,'Harness changed during run');
      assert.deepEqual(loadFixture(fixture).hashes,f.hashes,'Fixture changed during run');
      assert.equal(hash(fs.readFileSync(o.jar)),engineHash,'Engine changed during run');
      if(o.overlay)assert.equal(hash(fs.readFileSync(o.overlay)),overlaySha256,'Overlay changed during run');
    }catch(e){failures.push(e.message);}
    const passed=rows.length===4&&rows.every(r=>r.passed)&&!failures.length;
    write(path.join(o.out,'summary.json'),{passed,scope:session.scope,engine:o.overlay?'explicit-reviewed-overlay':'original-pinned-engine',durationMs:Date.now()-startTime,rows,failures});
    console.log(`Session acceptance: ${passed?'PASS':'FAIL'}; ${rows.filter(r=>r.passed).length}/4 stages`);
    if(!passed)process.exitCode=1;
  }
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={options};
