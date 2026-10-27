// REFACTOR:grounded: native differential controls reuse identities while replacing content and data.
import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {applySession,shutdownNativeRuntime,type ApplySessionRequestV1} from '../session';
import {withNativeRuntime} from '../nativeWorker';
import {driverArgs,driverDir} from '../driver';
import {DEFAULT_BOUNDS,jvmFlags} from '../spawn';
import {runOwnedProcess} from '../ownedProcess';
const engine=process.env.CRL_NATIVE_WORKER_JAR;
// @kit native-apply-session:native-isolation
it.skipIf(!engine)('native A/B/A isolates same-identity Library, terminology and patient content; reuses and recovers the JVM',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'native-worker-controls-'));let seq=0;
 const cql=(inverted=false)=>`library Warm version '1.0.0'
using FHIR version '4.0.1'
include FHIRHelpers version '4.0.1' called FHIRHelpers
codesystem "Codes": 'http://example.org/worker-codes'
valueset "Allowed": 'http://example.org/ValueSet/allowed'
code "Selected": 'yes' from "Codes"
context Patient
define "Pass": ${inverted?'not ':''}exists([Observation: "Allowed"])
define "Fail": not "Pass"
`;
 function request(variant='A'):ApplySessionRequestV1{
  const resources:any[]=[{resourceType:'PlanDefinition',id:'policy',url:'http://example.org/PlanDefinition/policy',version:'1.0.0',status:'active',library:['http://example.org/Library/Warm|1.0.0'],action:['Met','Unmet'].map((label,i)=>({id:label,condition:[{kind:'applicability',expression:{language:'text/cql-identifier',expression:i?'Fail':'Pass'}}],definitionCanonical:'http://example.org/ActivityDefinition/'+label+'|1.0.0'}))},
   {resourceType:'Library',id:'Warm',url:'http://example.org/Library/Warm',name:'Warm',version:'1.0.0',status:'active',type:{coding:[{system:'http://terminology.hl7.org/CodeSystem/library-type',code:'logic-library'}]},content:[{contentType:'text/cql',data:Buffer.from(cql(variant==='library')).toString('base64')}]},
   {resourceType:'Library',id:'FHIRHelpers',url:'http://example.org/Library/FHIRHelpers',name:'FHIRHelpers',version:'4.0.1',status:'active',type:{coding:[{system:'http://terminology.hl7.org/CodeSystem/library-type',code:'logic-library'}]},content:[{contentType:'text/cql',data:readFileSync(path.resolve(__dirname,'../../cql-emitter/catalog/FHIRHelpers.cql')).toString('base64')}]},
   {resourceType:'ValueSet',id:'allowed',url:'http://example.org/ValueSet/allowed',version:'1.0.0',status:'active',compose:{include:[{system:'http://example.org/worker-codes',concept:[{code:variant==='terminology'?'no':'yes'}]}]},expansion:{timestamp:'2026-01-01T00:00:00Z',total:1,contains:[{system:'http://example.org/worker-codes',code:variant==='terminology'?'no':'yes'}]}},
   ...['Met','Unmet'].map(label=>({resourceType:'ActivityDefinition',id:label,url:'http://example.org/ActivityDefinition/'+label,version:'1.0.0',status:'active',kind:'Task',code:{coding:[{system:'http://example.org/outcomes',code:label}]}}))];
  return {schemaVersion:1,requestId:'request-'+seq,caseId:variant,stepId:'apply',planDefinitionId:'policy',subjectReference:'Patient/p',repositoryJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:resources.map(resource=>({resource}))}),requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p',gender:variant==='patient'?'male':'female'}},{resource:{resourceType:'Observation',id:'observation',status:'final',subject:{reference:'Patient/p'},code:{coding:[{system:'http://example.org/worker-codes',code:variant==='patient'?'no':'yes'}]}}}]}),engine:{path:engine!,sha256:createHash('sha256').update(readFileSync(engine!)).digest('hex')}};
 }
 function taskCodes(value:unknown):string[]{
  if(!value||typeof value!=='object')return [];
  const v=value as any;return [...(v.resourceType==='Task'?(v.code?.coding??[]).filter((c:any)=>c.system==='http://example.org/outcomes').map((c:any)=>c.code):[]),...Object.values(v).flatMap(taskCodes)];
 }
 async function evaluate(variant:string,mode:'worker'|'isolated'='worker'){
  const out=path.join(root,'run-'+seq++),r=await applySession(request(variant),{outDir:out,nativeMode:mode,limits:{maxHeapMb:512,timeoutMs:120000}});
  expect(r.ok,JSON.stringify(r)).toBe(true);const result=JSON.parse(readFileSync(r.artifacts['native-result.json'].path,'utf8'));return {r,out,codes:taskCodes(result)};
 }
 try{
  const baseline=await evaluate('A','isolated');expect(baseline.codes).toEqual(['Met']);
  const java=baseline.r.runtime!.javaExe,watchdog=path.join(root,'WatchdogControl.java');
  writeFileSync(watchdog,`import java.util.concurrent.atomic.AtomicBoolean;
public class WatchdogControl {
 public static void main(String[] args) throws Exception {
  if(args.length>0){
   ApplyWorker.beginRequest("A",100000);ApplyWorker.finishRequest("A");
   ApplyWorker.beginRequest("B",1);ApplyWorker.finishRequest("A");
   Thread.sleep(25);ApplyWorker.enforceDeadline();throw new AssertionError("B deadline was cleared by A");
  }
  AtomicBoolean done=new AtomicBoolean();
  Thread monitor=new Thread(()->{while(!done.get())ApplyWorker.enforceDeadline();});monitor.setDaemon(true);monitor.start();
  for(int i=0;i<100000;i++){
   ApplyWorker.beginRequest("A",2147483647L);ApplyWorker.finishRequest("A");
   ApplyWorker.beginRequest("B",2147483647L);ApplyWorker.finishRequest("A");ApplyWorker.finishRequest("B");
  }
  done.set(true);monitor.join();System.out.println("watchdog-ok");
 }
}`);
  // Compile only this control; checkout mtimes must not cause javac to rebuild driver sources.
  execFileSync(path.join(path.dirname(java),process.platform==='win32'?'javac.exe':'javac'),['--release','17','-sourcepath',root,'-cp',driverDir(),watchdog],{timeout:15000,windowsHide:true});
  const controlArgs=['-Xmx64m','-cp',root+path.delimiter+driverDir(),'WatchdogControl'];
  expect(await runOwnedProcess(java,controlArgs,{timeoutMs:15000,maxBytes:65536})).toMatchObject({status:0,stdout:'watchdog-ok'+(process.platform==='win32'?'\r\n':'\n'),cleanupConfirmed:true});
  expect(await runOwnedProcess(java,[...controlArgs,'stale-token'],{timeoutMs:15000,maxBytes:65536})).toMatchObject({status:124,cleanupConfirmed:true});
  const first=await evaluate('A'),pid=first.r.runtime?.workerPid;expect(pid).toBeGreaterThan(0);expect(first.codes).toEqual(baseline.codes);
  rmSync(first.out,{recursive:true,force:true});
  for(const variant of ['terminology','A','library','A','patient','A']){
   const result=await evaluate(variant);expect(result.r.runtime?.workerPid).toBe(pid);expect(result.codes).toEqual([variant==='A'?'Met':'Unmet']);
  }
  const javaExe=first.r.runtime!.javaExe,spec={javaExe,engineJarPath:engine!,bounds:{...DEFAULT_BOUNDS,maxHeapMb:512,batchTimeoutMs:120000}};
  const crashed=await withNativeRuntime(spec,r=>r.run(driverArgs({jvmFlags:jvmFlags(spec.bounds),engineJarPath:engine!,loaderPath:driverDir(),repoPath:path.join(root,'missing.json'),planDefinitionId:'policy',subjectReference:'Patient/p'}),{timeoutMs:10000,maxBytes:65536}));
  expect(crashed).toMatchObject({status:1,cleanupConfirmed:true});
  const recovered=await evaluate('A');expect(recovered.codes).toEqual(['Met']);expect(recovered.r.runtime?.workerPid).not.toBe(pid);
  const repo=path.join(recovered.out,'repository-input.json');
  const timed=await withNativeRuntime(spec,r=>r.run(driverArgs({jvmFlags:jvmFlags(spec.bounds),engineJarPath:engine!,loaderPath:driverDir(),repoPath:repo,planDefinitionId:'policy',subjectReference:'Patient/p'}),{timeoutMs:1,maxBytes:65536}));expect(timed).toMatchObject({failure:'timeout',cleanupConfirmed:true});
  const afterTimeout=await evaluate('A');expect(afterTimeout.codes).toEqual(['Met']);expect(afterTimeout.r.runtime?.workerPid).not.toBe(recovered.r.runtime?.workerPid);
 }finally{await shutdownNativeRuntime();rmSync(root,{recursive:true,force:true});}
},300000);
