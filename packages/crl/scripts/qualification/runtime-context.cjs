// Independent synthetic release caller: pins files before launch, validates probe before dispatch.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function pinnedFiles(runtimeRoot,server){
 const files=[...fs.readdirSync(runtimeRoot).filter(n=>n.endsWith('.js')).map(n=>path.join(runtimeRoot,n)),
  ...['ApplyDriver.class','ApplyWorker.class','windows-owned-process.ps1'].map(n=>path.join(runtimeRoot,'driver',n)),path.resolve(server)];
 return Object.fromEntries([...new Set(files)].sort().map(p=>[p,hash(fs.readFileSync(p))]));
}
function verifyProbe(probe,{challenge,files,engineSha,version,javaExe,bounds,enginePath}){
 assert.equal(probe.schemaVersion,1);assert.equal(probe.operation,'native-runtime-context');assert.equal(probe.ok,true);assert.equal(probe.status,'available');assert.equal(probe.challenge,challenge);
 assert.equal(probe.producerVersion,version);assert.equal(probe.engineJarSha256,engineSha);assert.equal(probe.clinicalEvaluations,0);
 for(const k of ['fingerprintSha256','runtimeSha256','executionSha256','startupFilesSha256'])assert.match(probe[k],/^[a-f0-9]{64}$/);
 assert.match(probe.processInstanceId,/^[a-f0-9-]{36}$/);assert.deepEqual(probe.files,files,'independently pinned files');assert.equal(hash(JSON.stringify(files)),probe.startupFilesSha256);
 assert.equal(hash(JSON.stringify(probe.execution)),probe.executionSha256);assert.equal(probe.execution.javaExe,path.resolve(javaExe));assert.equal(probe.execution.javaRealPath,fs.realpathSync(javaExe));assert.equal(probe.execution.javaSha256,hash(fs.readFileSync(javaExe)));
 assert.equal(probe.execution.engineJarPath,fs.realpathSync(enginePath));
 assert.equal(probe.execution.nativeMode,'worker');assert.equal(probe.execution.nodeExe,process.execPath);assert.equal(probe.execution.nodeVersion,process.version);
 assert.deepEqual(probe.execution.bounds,bounds,'caller-requested native bounds');
 assert.equal(hash(JSON.stringify({runtime:probe.fingerprintSha256,crlVersion:version,jar:engineSha})),probe.runtimeSha256);
 return Object.fromEntries(['processInstanceId','fingerprintSha256','runtimeSha256','executionSha256'].map(k=>[k,probe[k]]));
}
function verifyBoundIndex(index,probe){
 for(const k of ['processInstanceId','fingerprintSha256','runtimeSha256','executionSha256'])assert.equal(index.runtime[k],probe[k],k+' differs from original independent probe');
 assert.equal(index.runtimeSha256,probe.runtimeSha256);assert.equal(index.runtime.engineJarSha256,probe.engineJarSha256);assert.deepEqual(index.runtime.files,probe.files);assert.deepEqual(index.runtime.bounds,probe.execution.bounds);
}
function contextNegativeControls(probe,pins,index){
 const results=[];
 for(const kind of ['wrong-challenge','different-process','wrong-fingerprint','wrong-execution','self-consistent-wrong-bounds','wrong-engine','wrong-code']){
  const p=structuredClone(probe),x=structuredClone(index);
  if(kind==='wrong-challenge')p.challenge='other';
  if(kind==='different-process')x.runtime.processInstanceId='other';
  if(kind==='wrong-fingerprint')x.runtime.fingerprintSha256='f'.repeat(64);
  if(kind==='wrong-execution')p.execution.bounds.batchTimeoutMs++;
  if(kind==='self-consistent-wrong-bounds'){p.execution.bounds.batchTimeoutMs++;p.executionSha256=hash(JSON.stringify(p.execution));}
  if(kind==='wrong-engine')p.engineJarSha256='f'.repeat(64);
  if(kind==='wrong-code')p.files[Object.keys(p.files)[0]]='f'.repeat(64);
  if(kind==='self-consistent-wrong-bounds')assert.throws(()=>verifyProbe(p,pins),undefined,kind+' must refuse at the caller probe check');
  else assert.throws(()=>{verifyProbe(p,pins);verifyBoundIndex(x,p);},undefined,kind+' must refuse');
  results.push({kind,rejected:true});
 }
 return results;
}
function prepareCatalogProof(fixture,packedCatalog){
 assert(!fs.existsSync(path.join(fixture,'.git')),'Use a new synthetic qualification fixture');
 const git=args=>execFileSync('git',['-c','core.autocrlf=false',...args],{cwd:fixture,stdio:['ignore','pipe','pipe']});
 git(['init','--quiet']);fs.writeFileSync(path.join(fixture,'.gitattributes'),'* text=auto eol=lf\n');git(['add','src/cql']);
 const pins={};
 for(const name of ['CRLCommon','CaseFeatureCommon','FHIRHelpers']){
  const relative='src/cql/'+name+'.cql',bytes=fs.readFileSync(path.join(fixture,relative));assert(!bytes.includes(13),name+' must be LF before evaluation');
  assert.deepEqual(bytes,fs.readFileSync(path.join(packedCatalog,name+'.cql')),'standalone vs pinned distributed catalog');assert.deepEqual(bytes,git(['show',':'+relative]),'normal Git LF delivery differs');pins[name]={sha256:hash(bytes),bytes:bytes.length};
 }
 return pins;
}
function verifyConsumedCatalog(root,index,pins){
 const cql=JSON.parse(fs.readFileSync(path.join(root,index.files.cql.path)));
 for(const name of Object.keys(pins)){const bytes=Buffer.from(cql[name+'.cql']);assert.equal(hash(bytes),pins[name].sha256);assert.equal(bytes.length,pins[name].bytes);}
 for(const c of index.cases){
  const resources=JSON.parse(fs.readFileSync(path.join(root,c.files.repository.path))).entry.map(e=>e.resource);
  for(const name of ['CRLCommon','CaseFeatureCommon']){const r=resources.find(r=>r.resourceType==='Library'&&r.id===name);assert(r);const bytes=Buffer.from(r.content.find(c=>c.contentType==='text/cql').data,'base64');assert.equal(hash(bytes),pins[name].sha256);assert.equal(bytes.length,pins[name].bytes);}
  assert(!resources.some(r=>r.resourceType==='Library'&&r.id==='FHIRHelpers'));
 }
 return {canonicalLfBeforeEvaluation:true,standalonePackedEmbeddedAndGitBytesEqual:true,catalogs:pins};
}
module.exports={pinnedFiles,verifyProbe,verifyBoundIndex,contextNegativeControls,prepareCatalogProof,verifyConsumedCatalog};
