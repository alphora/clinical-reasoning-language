'use strict';
// Run from the repository, but execute only the separately installed npm package.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const [packageArg,outArg,archiveArg]=process.argv.slice(2);
assert(packageArg&&outArg&&archiveArg,'Usage: installed.cjs INSTALLED_PACKAGE OUT ARCHIVE');
const pkg=fs.realpathSync(packageArg),out=path.resolve(outArg),archive=path.resolve(archiveArg),repo=path.resolve(__dirname,'../../../..');
assert(!pkg.startsWith(repo+path.sep),'Install the package outside the source checkout');
const load=createRequire(path.join(pkg,'package.json')),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const objects=x=>!x||typeof x!=='object'?[]:[x,...Object.values(x).flatMap(v=>Array.isArray(v)?v.flatMap(objects):objects(v))];
fs.mkdirSync(out,{recursive:true});
const receipt={passed:false,packagePath:pkg,packageVersion:load('./package.json').version,archiveSha256:hash(fs.readFileSync(archive)),sourceCommit:process.env.GITHUB_SHA||null,artifactMode:process.env.RELEASE_TAG?'release-asset':'source-build',releaseTag:process.env.RELEASE_TAG||null,platform:process.platform,stages:[]};
const save=()=>fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(receipt,null,2));
const stage=name=>{receipt.stages.push(name);save();console.log(name+' passed');};save();
async function main(){
 assert.equal(receipt.packageVersion,read(path.join(repo,'packages/crl/package.json')).version);
 const expected= require(path.join(repo,'packages/crl/dist/authoring-kit')).getAuthoringKit();
 const installed=load('./dist/authoring-kit').getAuthoringKit();assert.deepEqual(installed,expected);assert(installed.audit.contentMatchesAudit);
 receipt.kit={schema:installed.schemaVersion,hash:installed.contentHash,audit:installed.audit};stage('installed kit identity');
 const engineSource=load('./dist/results/spawn').ENGINE_JAR_SOURCE;
 const home=path.join(out,'home'),jar=path.join(home,engineSource.cacheRelativePath);fs.mkdirSync(path.dirname(jar),{recursive:true});
 const response=await fetch(engineSource.url,{signal:AbortSignal.timeout(180000)});assert(response.ok,'Engine HTTP '+response.status);
 await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(jar));assert.equal(hash(fs.readFileSync(jar)),engineSource.sha256);
 const engine={path:jar,sha256:engineSource.sha256};const engineFile=path.join(out,'engine.json');fs.writeFileSync(engineFile,JSON.stringify(engine));
 receipt.engine={...engineSource,path:jar};receipt.driverSha256=hash(fs.readFileSync(path.join(pkg,'dist/results/driver/ApplyDriver.class')));stage('pinned engine download');
 const env={...process.env,HOME:home,USERPROFILE:home,CRL_ENABLE_RESULTS:'1',CRL_TEST_PACKAGE:pkg,CRL_TEST_ENGINE:engineFile};
 const {Client}=load('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=load('@modelcontextprotocol/sdk/client/stdio.js');
 const client=new Client({name:'remote-installed-qualification',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(pkg,'dist/cli/run-mcp-server.js')],env,stderr:'pipe'});
 const log=fs.createWriteStream(path.join(out,'mcp-stderr.log'));transport.stderr?.pipe(log);
 const call=async(name,args,timeout=120000)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout});assert(!r.isError,JSON.stringify(r));return JSON.parse(r.content.find(x=>x.type==='text').text);};
 try{
  await client.connect(transport,{timeout:120000});
  const k=await call('authoring_kit',{view:'full'});const {view,complete,fullContentHash,...canonical}=k;assert.equal(complete,true);assert.equal(fullContentHash,installed.contentHash);assert.deepEqual(canonical,installed);
  const names=(await client.listTools()).tools.map(x=>x.name).sort();assert.deepEqual(names,read(path.join(__dirname,'expected-tools.json')).sort());receipt.tools=names;stage('installed MCP kit and inventory');
  const fixture=path.join(out,'preview');fs.cpSync(path.join(repo,'packages/crl/src/cre/tests/fixtures/condition-status'),fixture,{recursive:true});
  for(const tool of ['run_decision','render_scenario']){const r=await call(tool,{path:path.join(fixture,'cases.cel')});fs.writeFileSync(path.join(out,tool+'.json'),JSON.stringify(r,null,2));assert.equal(r.caseCount,3);assert.equal(r.passCount,3);assert.equal(r.failCount,0);assert.equal(r.errorCount,0);}stage('three generic preview cases');
  const native=path.join(out,'native');fs.cpSync(path.join(__dirname,'fixtures/native'),native,{recursive:true});
  const r=await call('emit_results',{celPath:path.join(native,'src/cel/mv/cases.cel'),crlPath:path.join(native,'src/crl/policy.crl'),useCase:'prior-auth',caseTimeoutMs:120000},300000);
  fs.writeFileSync(path.join(out,'native-mcp.json'),JSON.stringify(r,null,2));assert(r.ok,JSON.stringify(r));assert.equal(r.failed,0);assert.equal(r.engineJar.defaulted,true);assert.equal(path.resolve(r.engineJar.path),path.resolve(jar));
  const manifest=read(r.manifestPath);assert.equal(manifest.cases.length,2);assert.equal(manifest.provenance.producerJarSha256,engineSource.sha256);
  assert.deepEqual(manifest.cases.map(c=>c.caseName).sort(),['Answered','Unanswered']);
  for(const c of manifest.cases){
   assert.equal(c.state,'generated');assert(!c.cleanupUncertain);
   // Batch emission persists Q/QR, not action dispositions. The session controls
   // below assert native actions from the complete returned Parameters.
   const resources=c.artifacts.map(a=>{const file=path.resolve(native,a.path);assert(file.startsWith(native+path.sep));const bytes=fs.readFileSync(file);assert.equal(hash(bytes),a.sha256);return JSON.parse(bytes);});
   const qs=resources.filter(x=>x.resourceType==='Questionnaire'),qrs=resources.filter(x=>x.resourceType==='QuestionnaireResponse');assert.equal(qs.length,1);assert.equal(qrs.length,1);
   assert.equal(qrs[0].questionnaire,qs[0].url);
   const items=objects(qs[0]).filter(x=>x.linkId&&x.type&&!['group','display'].includes(x.type));assert.equal(items.length,1);assert.equal(items[0].type,'boolean');
   const answers=objects(qrs[0]).filter(x=>x.linkId===items[0].linkId&&x.definition===items[0].definition);assert.equal(answers.length,1);
   if(c.caseName==='Answered')assert.deepEqual(answers[0].answer,[{valueBoolean:true}]);else assert(!answers[0].answer?.length);
  }
  stage('installed MCP native emission');
 }finally{await client.close();log.end();}
 for(const [script,count] of [['session',6],['typed',4]]){
  const target=path.join(out,script),logFile=fs.openSync(path.join(out,script+'.log'),'w');
  try{execFileSync(process.execPath,[path.join(__dirname,script+'.cjs'),target],{env,stdio:['ignore',logFile,logFile],timeout:script==='session'?780000:540000});}finally{fs.closeSync(logFile);}
  const result=read(path.join(target,'verification.json'));assert(result.passed);assert.equal(result.rows.length,count);stage(script+' native steps');
 }
 receipt.passed=true;save();
}
main().catch(e=>{receipt.error=String(e.stack||e);save();console.error(e);process.exitCode=1;});
