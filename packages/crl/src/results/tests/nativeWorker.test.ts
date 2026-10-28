import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {driverArgs,driverDir} from '../driver';
import {DEFAULT_BOUNDS} from '../spawn';
import type {NativeRuntime,NativeSpec} from '../nativeWorker';
const fake=vi.hoisted(()=>({launch:vi.fn(),count:0,duration:20,clean:true,crash:false,options:[] as any[],active:0,peak:0,probes:0,crashCall:undefined as string|undefined}));
vi.mock('../ownedProcess',()=>({runOwnedProcess:fake.launch}));
let api:typeof import('../nativeWorker'),root:string,spec:NativeSpec,exitListeners:Set<(...args:any[])=>void>;
const info='CRL_RUNTIME_INFO:'+['17','17.0.1','Vendor','VM','UTC','UTC','en','en','en'].map(s=>Buffer.from(s).toString('base64')).join('.');
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
beforeEach(async()=>{
 exitListeners=new Set(process.listeners('beforeExit'));
 vi.resetModules();api=await import('../nativeWorker');root=mkdtempSync(path.join(tmpdir(),'worker-tests-'));writeFileSync(path.join(root,'engine.jar'),'engine');
 spec={javaExe:process.execPath,engineJarPath:path.join(root,'engine.jar'),bounds:{...DEFAULT_BOUNDS,maxHeapMb:512,batchTimeoutMs:2000}};
 fake.count=0;fake.duration=20;fake.clean=true;fake.crash=false;fake.options=[];fake.active=0;fake.peak=0;fake.probes=0;fake.crashCall=undefined;
 fake.launch.mockImplementation((_exe:string,args:string[],options:any)=>new Promise(resolve=>{
  if(args[0]==='-version'||args.includes('--runtime-info')){fake.probes++;resolve({status:fake.clean?0:null,failure:fake.clean?undefined:'cleanup-unconfirmed',stdout:info,stderr:'',cleanupConfirmed:fake.clean});return;}
  if(!options.persistent){
   fake.count++;fake.options.push(options);fake.active++;fake.peak=Math.max(fake.peak,fake.active);
   setTimeout(()=>{fake.active--;resolve({status:0,stdout:'isolated',stderr:'',cleanupConfirmed:fake.clean});},fake.duration);return;
  }
  fake.count++;fake.options.push(options);const dir=args.at(-2)!,pid=1000+fake.count;let stopped=false,active:NodeJS.Timeout|undefined,callActive=false;
  writeFileSync(path.join(dir,'ready'),pid+'\n'+info+'\n');
  const close=(status:number|null,failure?:string)=>{if(stopped)return;stopped=true;if(callActive){callActive=false;fake.active--;}clearInterval(poll);clearTimeout(active);resolve({status,failure,stdout:'',stderr:'',cleanupConfirmed:fake.clean});};
  options.signal.addEventListener('abort',()=>close(null,'cancelled'),{once:true});
  const poll=setInterval(()=>{
   const request=path.join(dir,'request');if(!existsSync(request))return;
   const lines=readFileSync(request,'utf8').trimEnd().split('\n');rmSync(request);
   const logs=Buffer.from(lines[3],'base64').toString('utf8'),call=Buffer.from(lines[4],'base64').toString('utf8');
   callActive=true;fake.active++;fake.peak=Math.max(fake.peak,fake.active);
   active=setTimeout(()=>{
    if(callActive){callActive=false;fake.active--;}
    writeFileSync(path.join(logs,'stdout.log'),call);writeFileSync(path.join(logs,'stderr.log'),'');
    if(fake.crash||fake.crashCall===call){close(1);return;}
    writeFileSync(path.join(dir,'response'),lines[0]+'\n0\n');
   },fake.duration);
  },2);
 }));
});
afterEach(async()=>{try{if(fake.clean)await api.shutdownNativeRuntime();else await expect(api.shutdownNativeRuntime()).rejects.toMatchObject({code:'cleanup-unconfirmed',cleanupConfirmed:false});}finally{vi.unstubAllEnvs();for(const listener of process.listeners('beforeExit'))if(!exitListeners.has(listener))process.removeListener('beforeExit',listener);rmSync(root,{recursive:true,force:true});}});
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

const until=async(test:()=>boolean)=>{for(let i=0;i<1000&&!test();i++)await sleep(2);expect(test()).toBe(true);};
// @kit native-apply-session:pool-queue
it('runs independent jobs on two persistent owners while one session keeps its owner',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512});
 let release!:()=>void,ready!:()=>void;const held=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{ready=r;});
 let aPid=0,bPid=0,cPid=0;
 const a=pool.runJob(()=>api.withNativeRuntime(spec,async r=>{aPid=r.pid!;ready();await held;return run(r,'A');}));await started;
 const b=pool.runJob(()=>api.withNativeRuntime(spec,async r=>{bPid=r.pid!;return run(r,'B');}));
 const c=pool.runJob(()=>api.withNativeRuntime(spec,async r=>{cPid=r.pid!;return run(r,'C');}));
 expect((await b).stdout).toBe('B');expect((await c).stdout).toBe('C');
 expect(cPid).toBe(bPid);expect(aPid).not.toBe(bPid);expect(fake.count).toBe(2);
 release();expect((await a).stdout).toBe('A');await pool.shutdown();expect(pool.status().closed).toBe(true);
});
it('executes native calls simultaneously across owners but serializes separate handles within one owner',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512});fake.duration=60;
 const values=await Promise.all(['A','B'].map(name=>pool.runJob(()=>api.withNativeRuntime(spec,r=>run(r,name)))));
 expect(values.map(r=>r.stdout)).toEqual(['A','B']);expect(fake.peak).toBe(2);
 await pool.setWorkerLimit(1);fake.peak=0;
 const serial=await pool.runJob(()=>Promise.all(['C','D'].map(name=>api.withNativeRuntime(spec,r=>run(r,name)))));
 expect(serial.map(r=>r.stdout)).toEqual(['C','D']);expect(fake.peak).toBe(1);await pool.shutdown();
});
// @kit native-apply-session:pool-resize
it('raises admission while active, then drains excess owners before a decrease resolves',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:1,maxHeapMb:512});
 let releaseA!:()=>void,releaseB!:()=>void;
 const heldA=new Promise<void>(r=>{releaseA=r;}),heldB=new Promise<void>(r=>{releaseB=r;});
 const a=pool.runJob(()=>api.withNativeRuntime(spec,async r=>{await heldA;return run(r,'A');}));
 await until(()=>fake.count===1);
 const b=pool.runJob(()=>api.withNativeRuntime(spec,async r=>{await heldB;return run(r,'B');}));
 await pool.setWorkerLimit(2);await until(()=>fake.count===2);
 let downDone=false;const down=pool.setWorkerLimit(1).then(x=>{downDone=true;return x;});
 await until(()=>pool.status().workerLimit===1);expect(downDone).toBe(false);
 const c=pool.runJob(()=>api.withNativeRuntime(spec,r=>run(r,'C')));expect(pool.status().queuedJobs).toBe(1);
 releaseB();await b;await down;expect(fake.options[1].signal.aborted).toBe(true);expect(pool.status().activeJobs).toBe(1);
 releaseA();await a;expect((await c).stdout).toBe('C');expect(fake.count).toBe(2);await pool.shutdown();
});
it('rejects same-pool resizing before a resize queue can wait on its caller',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512});
 await pool.runJob(async()=>{await expect(pool.setWorkerLimit(1)).rejects.toMatchObject({code:'pool-self-wait'});});
 let releaseA!:()=>void,tryIncrease!:()=>void;
 const heldA=new Promise<void>(r=>{releaseA=r;}),tryB=new Promise<void>(r=>{tryIncrease=r;});
 const a=pool.runJob(async()=>{await heldA;});const b=pool.runJob(async()=>{await tryB;await expect(pool.setWorkerLimit(2)).rejects.toMatchObject({code:'pool-self-wait'});});
 const down=pool.setWorkerLimit(1);await until(()=>pool.status().workerLimit===1);tryIncrease();await b;await down;releaseA();await a;await pool.shutdown();
});
it('combines job and request cancellation without interrupting a sibling owner',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512}),jobSignal=new AbortController(),requestSignal=new AbortController();
 fake.duration=500;
 const a=pool.runJob(()=>api.withNativeRuntime({...spec,signal:requestSignal.signal},r=>run(r,'A',1500,requestSignal.signal)),{signal:jobSignal.signal});
 const failed=expect(a).rejects.toMatchObject({code:'cancelled'});
 const b=pool.runJob(()=>api.withNativeRuntime(spec,r=>run(r,'B',1500)));
 await until(()=>fake.active===2);jobSignal.abort();await failed;expect(requestSignal.signal.aborted).toBe(false);
 expect((await b).stdout).toBe('B');expect(fake.options[1].signal.aborted).toBe(false);await pool.shutdown();
});
it('a crash retires only its owner, does not replay, and leaves an active sibling intact',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512});fake.duration=50;fake.crashCall='crash';
 const values=await Promise.all(['crash','B'].map(name=>pool.runJob(()=>api.withNativeRuntime(spec,r=>run(r,name)))));
 expect(values[0].status).toBe(1);expect(values[1].stdout).toBe('B');expect(fake.count).toBe(2);
 fake.crashCall=undefined;expect((await pool.runJob(()=>api.withNativeRuntime(spec,r=>run(r,'next')))).status).toBe(0);
 expect(fake.count).toBeLessThanOrEqual(3);await pool.shutdown();
});
// @kit native-apply-session:pool-budget
it('rejects excessive aggregate capacity before launch and releases confirmed retired capacity',async()=>{
 vi.stubEnv('CRL_NATIVE_HEAP_BUDGET_MB','64');
 const pool=api.createNativeWorkerPool({workerLimit:4,maxHeapMb:16});
 expect(pool.status().heap).toMatchObject({budgetMb:64,reservedMb:64});
 expect(()=>api.createNativeWorkerPool({maxHeapMb:16})).toThrow(/budget/);
 await expect(pool.setWorkerLimit(5)).rejects.toMatchObject({code:'heap-budget'});expect(pool.status().workerLimit).toBe(4);
 await pool.setWorkerLimit(2);const second=api.createNativeWorkerPool({maxHeapMb:32});
 expect(second.status().heap.reservedMb).toBe(64);expect(fake.count).toBe(0);
 await pool.shutdown();await second.shutdown();expect(api.nativeWorkerPoolStatus().heap.reservedMb).toBe(0);vi.unstubAllEnvs();
});
it('keeps exclusive legacy limit-one heap behavior but refuses aggregate overcommit',async()=>{
 vi.stubEnv('CRL_NATIVE_HEAP_BUDGET_MB','64');
 expect((await api.withNativeRuntime(spec,r=>run(r,'legacy'))).status).toBe(0);
 await expect(api.setNativeWorkerLimit(2)).rejects.toMatchObject({code:'heap-budget'});expect(fake.count).toBe(1);
 await api.shutdownNativeRuntime();const pool=api.createNativeWorkerPool({maxHeapMb:16});await pool.shutdown();vi.unstubAllEnvs();
});
it('retirement is restartable, terminal close rejects, and global retirement never self-waits',async()=>{
 const pool=api.createNativeWorkerPool({maxHeapMb:512});
 await pool.runJob(async()=>{await expect(api.shutdownNativeRuntime()).rejects.toMatchObject({code:'pool-self-wait'});});
 await api.withNativeRuntime(spec,r=>run(r,'first'));await api.shutdownNativeRuntime();
 await api.withNativeRuntime(spec,r=>run(r,'second'));expect(fake.count).toBe(2);
 await pool.shutdown();await expect(pool.runJob(async()=>1)).rejects.toMatchObject({code:'pool-closed'});
});
it('shares one physical abort subscription for a large pending queue and removes it after settlement',async()=>{
 const {getEventListeners}=await import('node:events');const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512}),controller=new AbortController();
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 const jobs=Array.from({length:24},()=>pool.runJob(async()=>{await held;},{signal:controller.signal}));
 expect(getEventListeners(controller.signal,'abort')).toHaveLength(1);release();await Promise.all(jobs);
 expect(getEventListeners(controller.signal,'abort')).toHaveLength(0);await pool.shutdown();
});
// @kit native-apply-session:process-health
it.each(['discovery','fingerprint'])('unconfirmed %s cleanup stops future Java launches in every pool',async kind=>{
 const pool=api.createNativeWorkerPool({maxHeapMb:512});fake.clean=false;
 if(kind==='discovery'){
  const {runNativeProcess}=await import('../nativeProcess');
  expect(await runNativeProcess(process.execPath,['-version'],{timeoutMs:1000,maxBytes:65536})).toMatchObject({cleanupConfirmed:false});
 }else{
  const {runtimeFingerprint}=await import('../runtimeFingerprint');
  expect(await runtimeFingerprint(process.execPath,spec.engineJarPath,spec.bounds)).toMatchObject({cleanupConfirmed:false});
 }
 const calls=fake.count+fake.probes;
 await expect(api.withNativeRuntime(spec,r=>run(r,'refused'))).rejects.toMatchObject({code:'cleanup-unconfirmed',cleanupConfirmed:false});
 await expect(pool.runJob(async()=>1)).rejects.toMatchObject({code:'cleanup-unconfirmed'});
 expect(fake.count+fake.probes).toBe(calls);expect(api.nativeWorkerPoolStatus().quarantined).toBe(true);
});

// @kit native-apply-session:pool-draining-capacity
it.each(['worker','isolated'] as const)('retains prelaunch active capacity during a downward resize in %s mode',async nativeMode=>{
 vi.stubEnv('CRL_NATIVE_HEAP_BUDGET_MB','1024');
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512});let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 const jobs=[0,1].map(i=>pool.runJob(async()=>{await held;return api.withNativeRuntime({...spec,nativeMode},r=>run(r,'job'+i));}));
 const down=pool.setWorkerLimit(1);await until(()=>pool.status().workerLimit===1);
 expect(pool.status().heap.poolReservedMb).toBe(1024);expect(()=>api.createNativeWorkerPool({maxHeapMb:512})).toThrow(/budget/);
 release();await Promise.all(jobs);await down;
 const other=api.createNativeWorkerPool({maxHeapMb:512});expect(pool.status().heap.reservedMb).toBe(1024);
 await other.shutdown();await pool.shutdown();
});
it('isolated calls share the owner execution chain and drain unawaited work before closing',async()=>{
 const pool=api.createNativeWorkerPool({maxHeapMb:512});let handle!:NativeRuntime,pending!:Promise<unknown>;
 await pool.runJob(()=>api.withNativeRuntime({...spec,nativeMode:'isolated'},async r=>{
  handle=r;const a=run(r,'A'),b=run(r,'B');await Promise.all([a,b]);pending=run(r,'unawaited');
 }));
 expect(fake.peak).toBe(1);expect(fake.active).toBe(0);expect(fake.count).toBe(3);await pending;
 await expect(run(handle,'late')).rejects.toMatchObject({code:'reservation-closed'});expect(fake.count).toBe(3);await pool.shutdown();
});
it('a downward resize rejects retirement failure after its draining active job settles',async()=>{
 const pool=api.createNativeWorkerPool({workerLimit:2,maxHeapMb:512});let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 const a=pool.runJob(()=>api.withNativeRuntime(spec,async r=>{await held;return run(r,'A');}));
 const b=pool.runJob(()=>api.withNativeRuntime(spec,async()=>{await held;}));
 await until(()=>fake.count===2);
 const down=pool.setWorkerLimit(1);const downError=expect(down).rejects.toMatchObject({code:'cleanup-unconfirmed'});
 const jobError=expect(b).rejects.toMatchObject({code:'cleanup-unconfirmed'});
 await until(()=>pool.status().workerLimit===1);fake.clean=false;release();await jobError;await downError;await a;
 expect(pool.status().quarantined).toBe(true);
});
