import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {driverArgs,driverDir} from '../driver';
import {DEFAULT_BOUNDS} from '../spawn';
import type {NativeRuntime,NativeSpec} from '../nativeWorker';
const fake=vi.hoisted(()=>({launch:vi.fn(),count:0,duration:20,clean:true,crash:false,options:[] as any[]}));
vi.mock('../ownedProcess',()=>({runOwnedProcess:fake.launch}));
let api:typeof import('../nativeWorker'),root:string,spec:NativeSpec,exitListeners:Set<(...args:any[])=>void>;
const info='CRL_RUNTIME_INFO:'+['17','17.0.1','Vendor','VM','UTC','UTC','en','en','en'].map(s=>Buffer.from(s).toString('base64')).join('.');
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
beforeEach(async()=>{
 exitListeners=new Set(process.listeners('beforeExit'));
 vi.resetModules();api=await import('../nativeWorker');root=mkdtempSync(path.join(tmpdir(),'worker-tests-'));writeFileSync(path.join(root,'engine.jar'),'engine');
 spec={javaExe:process.execPath,engineJarPath:path.join(root,'engine.jar'),bounds:{...DEFAULT_BOUNDS,maxHeapMb:512,batchTimeoutMs:2000}};
 fake.count=0;fake.duration=20;fake.clean=true;fake.crash=false;fake.options=[];
 fake.launch.mockImplementation((_exe:string,args:string[],options:any)=>new Promise(resolve=>{
  fake.count++;fake.options.push(options);const dir=args.at(-2)!,pid=1000+fake.count;let stopped=false,active:NodeJS.Timeout|undefined;
  writeFileSync(path.join(dir,'ready'),pid+'\n'+info+'\n');
  const close=(status:number|null,failure?:string)=>{if(stopped)return;stopped=true;clearInterval(poll);clearTimeout(active);resolve({status,failure,stdout:'',stderr:'',cleanupConfirmed:fake.clean});};
  options.signal.addEventListener('abort',()=>close(null,'cancelled'),{once:true});
  const poll=setInterval(()=>{
   const request=path.join(dir,'request');if(!existsSync(request))return;
   const lines=readFileSync(request,'utf8').trimEnd().split('\n');rmSync(request);
   const logs=Buffer.from(lines[3],'base64').toString('utf8'),call=Buffer.from(lines[4],'base64').toString('utf8');
   active=setTimeout(()=>{
    writeFileSync(path.join(logs,'stdout.log'),call);writeFileSync(path.join(logs,'stderr.log'),'');
    if(fake.crash){close(1);return;}
    writeFileSync(path.join(dir,'response'),lines[0]+'\n0\n');
   },fake.duration);
  },2);
 }));
});
afterEach(async()=>{try{if(fake.clean)await api.shutdownNativeRuntime();else await expect(api.shutdownNativeRuntime()).rejects.toMatchObject({code:'cleanup-unconfirmed',cleanupConfirmed:false});}finally{for(const listener of process.listeners('beforeExit'))if(!exitListeners.has(listener))process.removeListener('beforeExit',listener);rmSync(root,{recursive:true,force:true});}});
function run(runtime:NativeRuntime,name:string,timeoutMs=1000,signal?:AbortSignal){
 return runtime.run(driverArgs({jvmFlags:[],engineJarPath:spec.engineJarPath,loaderPath:driverDir(),repoPath:name,planDefinitionId:'D',subjectReference:'Patient/p'}),{timeoutMs,maxBytes:65536,signal});
}
// @kit native-apply-session:worker-reuse
it('reuses one owned JVM across requests and independent evidence directories',async()=>{
 let pid:number|undefined;
 for(const name of ['case-A','case-B','case-A'])await api.withNativeRuntime(spec,async runtime=>{pid??=runtime.pid;expect(runtime.pid).toBe(pid);expect(await run(runtime,name)).toMatchObject({status:0,stdout:name,cleanupConfirmed:true});});
 expect(fake.count).toBe(1);expect(fake.options[0]).toMatchObject({persistent:true,unref:true});
});
it('serializes calls within a reservation and refuses use after it ends',async()=>{
 let borrowed!:NativeRuntime;
 await api.withNativeRuntime(spec,async runtime=>{borrowed=runtime;const results=await Promise.all(['A','B','C'].map(name=>run(runtime,name)));expect(results.map(r=>r.stdout)).toEqual(['A','B','C']);});
 await expect(run(borrowed,'late')).rejects.toMatchObject({code:'reservation-closed'});expect(fake.count).toBe(1);
});
it('cancels active work and replaces its worker for the next request',async()=>{
 fake.duration=1000;const controller=new AbortController();
 const work=api.withNativeRuntime({...spec,signal:controller.signal},r=>run(r,'cancelled'));
 await sleep(35);controller.abort();expect(await work).toMatchObject({failure:'cancelled',cleanupConfirmed:true});
 fake.duration=5;expect(await api.withNativeRuntime(spec,r=>run(r,'next'))).toMatchObject({status:0,stdout:'next'});expect(fake.count).toBe(2);
});
it('request deadlines do not become worker lifetime or affect the next request',async()=>{
 await api.withNativeRuntime(spec,async runtime=>{for(let i=0;i<4;i++)expect((await run(runtime,'short',80)).status).toBe(0);});
 expect(fake.count).toBe(1);fake.duration=200;
 const failed=await api.withNativeRuntime(spec,r=>run(r,'timeout',30));expect(failed).toMatchObject({failure:'timeout',cleanupConfirmed:true});
 fake.duration=5;await api.withNativeRuntime(spec,async r=>expect((await run(r,'after')).status).toBe(0));expect(fake.count).toBe(2);
 await sleep(100);await api.withNativeRuntime(spec,async r=>expect((await run(r,'still-warm')).status).toBe(0));expect(fake.count).toBe(2);
});
it('cancelling queued B leaves active A untouched and returns promptly',async()=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});
 const a=api.withNativeRuntime(spec,async r=>{ready();await held;return run(r,'A');});await started;
 const controller=new AbortController(),b=api.withNativeRuntime({...spec,signal:controller.signal},r=>run(r,'B'));
 const rejected=expect(b).rejects.toMatchObject({code:'cancelled'});controller.abort();await rejected;expect(fake.count).toBe(1);release();expect((await a).stdout).toBe('A');
});
it('reserves fingerprint and execution together across different heap specifications',async()=>{
 const pids:number[]=[];
 await Promise.all([spec,{...spec,bounds:{...spec.bounds,maxHeapMb:768}}].map(s=>api.withNativeRuntime(s,async r=>{pids.push(r.pid!);expect(r.runtimeInfo).toBe(info);await sleep(15);expect((await run(r,'same-runtime')).status).toBe(0);})));expect(pids[0]).not.toBe(pids[1]);expect(fake.count).toBe(2);
});
it('refuses a changed engine during a reservation and retires the old worker',async()=>{
 await api.withNativeRuntime(spec,async r=>{writeFileSync(spec.engineJarPath,'different engine bytes');expect(await run(r,'must-not-run')).toMatchObject({failure:'spawn-error'});});
 await api.withNativeRuntime(spec,async r=>expect((await run(r,'fresh')).status).toBe(0));expect(fake.count).toBe(2);
});
it('rejects runtime replacement while queued before accepting a new identity',async()=>{
 let release!:()=>void,ready!:()=>void;const held=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{ready=r;});
 const a=api.withNativeRuntime(spec,async r=>{await run(r,'A');ready();await held;});await started;
 const b=api.withNativeRuntime(spec,r=>run(r,'must-not-run'));
 writeFileSync(spec.engineJarPath,'replacement');release();await a;
 await expect(b).rejects.toMatchObject({code:'runtime-changed'});expect(fake.count).toBe(1);
});
it('rechecks the verified engine SHA256 inside its reservation',async()=>{
 await expect(api.withNativeRuntime({...spec,engineSha256:'0'.repeat(64)},r=>run(r,'unverified'))).rejects.toMatchObject({code:'engine-verification'});expect(fake.count).toBe(0);
});
it('producer shutdown explicitly retires its idle worker',async()=>{
 await api.withNativeRuntime(spec,r=>run(r,'idle'));
 const {shutdownProducer}=await import('../produce');await shutdownProducer();
 expect(fake.options[0].signal.aborted).toBe(true);
});
// @kit native-apply-session:worker-failure
it('does not replay a crash and starts clean for the next request',async()=>{
 fake.crash=true;await api.withNativeRuntime(spec,async r=>expect((await run(r,'crash')).status).toBe(1));expect(fake.count).toBe(1);
 fake.crash=false;await api.withNativeRuntime(spec,async r=>expect((await run(r,'recovered')).status).toBe(0));expect(fake.count).toBe(2);
});
// @kit native-apply-session:worker-quarantine
it('quarantines launches when failed-worker cleanup cannot be confirmed',async()=>{
 fake.clean=false;fake.duration=200;await api.withNativeRuntime(spec,async r=>expect(await run(r,'timeout',10)).toMatchObject({failure:'cleanup-unconfirmed',cleanupConfirmed:false}));
 await expect(api.withNativeRuntime(spec,r=>run(r,'must-not-start'))).rejects.toMatchObject({code:'cleanup-unconfirmed',cleanupConfirmed:false});expect(fake.count).toBe(1);
});
