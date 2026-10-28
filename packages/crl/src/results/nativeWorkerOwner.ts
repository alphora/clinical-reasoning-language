// REFACTOR:grounded: a cancellable reservation binds runtime identity and isolated request execution.
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {type OwnedProcessOptions,type OwnedProcessResult} from './ownedProcess';
import {runNativeProcess,NativeRuntimeError,assertNativeHealthy,reportNativeCleanup,nativeQuarantined,joinNativeSignals,subscribeNativeAbort} from './nativeProcess';
import {driverArgs,driverDir,PROPERTIES_LAUNCHER} from './driver';
import {jvmFlags,verifyJar,type JvmBounds} from './spawn';

export type NativeMode='worker'|'isolated';
export interface NativeSpec {javaExe:string;engineJarPath:string;engineSha256?:string;bounds:JvmBounds;env?:NodeJS.ProcessEnv;signal?:AbortSignal;nativeMode?:NativeMode}
export interface NativeRuntime {
  mode:NativeMode;runtimeInfo?:string;pid?:number;calls?:number;
  run(args:readonly string[],options:OwnedProcessOptions):Promise<OwnedProcessResult>;
}
interface Worker {key:string;dir:string;abort:AbortController;exit?:OwnedProcessResult;closed:Promise<OwnedProcessResult>;runtimeInfo?:string;pid?:number}

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function nativeIdentity(spec:NativeSpec):string {
  const files=[spec.javaExe,spec.engineJarPath,...['ApplyDriver.class','ApplyWorker.class'].map(f=>path.join(driverDir(),f))];
  return digest({files:files.map(file=>{const s=statSync(file);return [path.resolve(file),s.size,s.mtimeMs,s.ctimeMs];}),flags:jvmFlags(spec.bounds),env:Object.entries(spec.env??process.env).sort(([a],[b])=>a.localeCompare(b))});
}
export interface NativeOwner {
 reserve<T>(input:NativeSpec,use:(runtime:NativeRuntime)=>Promise<T>,expectedKey?:string):Promise<T>;
 drain():Promise<void>;retire():Promise<void>;
 status():{pid?:number;identity?:string;heapMb:number};
}
export function createNativeOwner():NativeOwner {
let worker:Worker|undefined,queue=Promise.resolve(),execution=Promise.resolve();
let heapMb=0;
async function retire():Promise<boolean>{
  const old=worker;if(!old)return !nativeQuarantined();worker=undefined;old.abort.abort();
  const closed=await old.closed;if(!closed.cleanupConfirmed){reportNativeCleanup(false);return false;}
  rmSync(old.dir,{recursive:true,force:true,maxRetries:3});heapMb=0;return true;
}
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,10));
function checkStopped(signal?:AbortSignal){assertNativeHealthy();if(signal?.aborted)throw new NativeRuntimeError('cancelled','Native request cancelled.');}
async function prepare(spec:NativeSpec,key:string,expectedInfo?:string):Promise<Worker>{
  checkStopped(spec.signal);
  if(nativeIdentity(spec)!==key)throw new NativeRuntimeError('runtime-changed','Native runtime files changed during this reservation.');
  if(worker?.key!==key||worker.exit){if(!await retire())checkStopped();}
  if(!worker){
    const dir=mkdtempSync(path.join(tmpdir(),'crl-native-worker-'));mkdirSync(path.join(dir,'tmp'));
    const args=driverArgs({jvmFlags:[...jvmFlags(spec.bounds),'-Djava.io.tmpdir='+path.join(dir,'tmp')],engineJarPath:spec.engineJarPath,loaderPath:driverDir(),repoPath:dir,planDefinitionId:String(process.pid),subjectReference:'unused'});
    const end=args.indexOf(PROPERTIES_LAUNCHER);const launch=args.slice(0,end+1).map(a=>a==='-Dloader.main=ApplyDriver'?'-Dloader.main=ApplyWorker':a);
    const abort=new AbortController(),current={} as Worker;
    Object.assign(current,{key,dir,abort});worker=current;
    heapMb=spec.bounds.maxHeapMb;
    current.closed=runNativeProcess(spec.javaExe,[...launch,dir,String(process.pid)],{timeoutMs:30000,maxBytes:65536,env:spec.env,signal:abort.signal,persistent:true,unref:true}).then(r=>{current.exit=r;return r;});
    const deadline=Date.now()+Math.min(30000,spec.bounds.batchTimeoutMs);
    try{
      while(!existsSync(path.join(dir,'ready'))){checkStopped(spec.signal);if(current.exit)throw new NativeRuntimeError('worker-start','Native worker exited before readiness.',current.exit.cleanupConfirmed);if(Date.now()>=deadline)throw new NativeRuntimeError('timeout','Native worker startup timed out.');await pause();}
      const ready=readFileSync(path.join(dir,'ready'),'utf8').split(/\r?\n/),line=ready.find(s=>s.startsWith('CRL_RUNTIME_INFO:'));
      const fields=line?.slice(17).split('.');
      if(!/^\d+$/.test(ready[0])||!line||fields?.length!==9||fields.some(s=>!/^[A-Za-z0-9+/]*={0,2}$/.test(s)))throw new NativeRuntimeError('worker-protocol','Invalid native worker readiness.');
      current.pid=Number(ready[0]);current.runtimeInfo=line;
    }catch(error){const clean=await retire();if(!clean)throw new NativeRuntimeError('cleanup-unconfirmed','Worker startup cleanup unconfirmed.',false);throw error;}
  }
  if(expectedInfo&&worker.runtimeInfo!==expectedInfo){if(!await retire())checkStopped();throw new NativeRuntimeError('runtime-changed','Replacement JVM runtime identity differs.');}
  return worker;
}
async function runWorker(spec:NativeSpec,key:string,info:string,args:readonly string[],options:OwnedProcessOptions,onStart:()=>void):Promise<OwnedProcessResult>{
  const joined=joinNativeSignals([options.signal,spec.signal]);options={...options,signal:joined.signal};
  let current:Worker|undefined,logs:string|undefined,reason:OwnedProcessResult['failure'],status:number|null=null;
  try{
    checkStopped(options.signal);current=await prepare({...spec,signal:options.signal},key,info);
    const launcher=args.indexOf(PROPERTIES_LAUNCHER);if(launcher<0)throw new NativeRuntimeError('worker-protocol','Missing native launcher.');
    const call=args.slice(launcher+1);if(call.length!==3&&call.length!==8)throw new NativeRuntimeError('worker-protocol','Invalid native driver argument count.');
    const token=randomBytes(16).toString('hex');logs=path.join(current.dir,token);mkdirSync(logs);
    const body=[token,String(options.maxBytes),String(options.timeoutMs),Buffer.from(logs).toString('base64'),...call.map(s=>Buffer.from(s).toString('base64'))].join('\n')+'\n';
    if(Buffer.byteLength(body)>65536)throw new NativeRuntimeError('worker-protocol','Native request control exceeds limit.');
    writeFileSync(path.join(current.dir,'request.tmp'),body);renameSync(path.join(current.dir,'request.tmp'),path.join(current.dir,'request'));onStart();
    const deadline=Date.now()+options.timeoutMs,response=path.join(current.dir,'response');
    while(true){
      if(options.signal?.aborted){reason='cancelled';break;}
      if(Date.now()>=deadline){reason='timeout';break;}
      if(existsSync(response)){
        const lines=readFileSync(response,'utf8').trimEnd().split('\n');rmSync(response);
        if(lines.length!==2||lines[0]!==token||!['0','1'].includes(lines[1]))throw new NativeRuntimeError('worker-protocol','Invalid native response correlation.');
        status=Number(lines[1]);break;
      }
      if(current.exit){status=current.exit.status;reason=current.exit.failure??(status===124?'timeout':status===125?'output-limit':undefined);break;}
      await pause();
    }
    const read=(name:string)=>{const p=path.join(logs!,name);if(!existsSync(p))return '';if(statSync(p).size>options.maxBytes){reason='output-limit';return '';}return readFileSync(p,'utf8');};
    // Stop failed work before inventorying logs, including timed-out writers.
    let clean=true;
    if(reason||status!==0){current.abort.abort();const end=await current.closed;clean=end.cleanupConfirmed;if(!clean)reportNativeCleanup(false);}
    const stdout=read('stdout.log'),stderr=read('stderr.log');
    if(reason||status!==0){clean=await retire()&&clean;}else rmSync(logs,{recursive:true,force:true,maxRetries:3});
    return {stdout,stderr,status,failure:clean?reason:'cleanup-unconfirmed',cleanupConfirmed:clean};
  }catch(error){const clean=await retire();return {stdout:'',stderr:String(error),status:null,failure:clean?(error instanceof NativeRuntimeError&&error.code==='cancelled'?'cancelled':'spawn-error'):'cleanup-unconfirmed',cleanupConfirmed:clean};}finally{joined.dispose();}
}

/** Cancel queued work without touching the active lease; deadlines start at dispatch. */
function reserve<T>(input:NativeSpec,use:(runtime:NativeRuntime)=>Promise<T>,expectedKey?:string):Promise<T>{
  const spec={...input,bounds:{...input.bounds},env:{...(input.env??process.env)}};
  return new Promise<T>((resolve,reject)=>{
    let key:string;try{key=expectedKey??nativeIdentity(spec);}catch(error){reject(error);return;}
    let cancelled=false,active=false,removeCancel:()=>void=()=>{};
    const cancel=()=>{if(!active){cancelled=true;reject(new NativeRuntimeError('cancelled','Queued native request cancelled.'));}};
    removeCancel=subscribeNativeAbort(spec.signal,cancel);
    const job=queue.then(async()=>{
      if(cancelled)return;
      active=true;removeCancel();
      try{
        checkStopped(spec.signal);
        if(nativeIdentity(spec)!==key)throw new NativeRuntimeError('runtime-changed','Native runtime files changed while queued.');
        if(spec.engineSha256){const verified=verifyJar(spec.engineJarPath,spec.engineSha256);if(!verified.ok||!verified.hasLauncher)throw new NativeRuntimeError('engine-verification','Native engine no longer matches its verified SHA256.');}
        if(spec.nativeMode==='isolated'){
          if(!await retire())checkStopped();
          let open=true;
          const runtime:NativeRuntime={mode:'isolated',calls:0,run:(args,options)=>{
            if(!open)return Promise.reject(new NativeRuntimeError('reservation-closed','Native runtime reservation has ended.'));
            const job=execution.then(async()=>{
              checkStopped(spec.signal);
              if(nativeIdentity(spec)!==key)throw new NativeRuntimeError('runtime-changed','Native runtime files changed during isolated execution.');
              const joined=joinNativeSignals([options.signal,spec.signal]);
              try{heapMb=spec.bounds.maxHeapMb;runtime.calls=(runtime.calls??0)+1;return await runNativeProcess(spec.javaExe,args,{...options,env:spec.env,signal:joined.signal});}
              finally{joined.dispose();if(!nativeQuarantined())heapMb=0;}
            });
            execution=job.then(()=>{},()=>{});return job;
          }};
          let result:T;try{result=await use(runtime);}finally{open=false;await execution;}
          resolve(result);
          return;
        }
        const ready=await prepare(spec,key),info=ready.runtimeInfo!;
        let open=true;
        const runtime:NativeRuntime={mode:'worker',runtimeInfo:info,pid:ready.pid,calls:0,run:(args,options)=>{
          if(!open)return Promise.reject(new NativeRuntimeError('reservation-closed','Native runtime reservation has ended.'));
          const job=execution.then(()=>runWorker(spec,key,info,args,options,()=>{runtime.pid=worker?.pid;runtime.calls=(runtime.calls??0)+1;}));
          execution=job.then(()=>{},()=>{});return job;
        }};
        try{
          let result:T;
          try{result=await use(runtime);}finally{open=false;await execution;}
          resolve(result);
        }catch(error){if(!await retire())throw new NativeRuntimeError('cleanup-unconfirmed','Native worker cleanup unconfirmed after request failure.',false);throw error;}
      }catch(error){reject(error);}
    });
    queue=job.then(()=>{},()=>{});
  });
}
return {reserve,drain:()=>queue,retire:()=>{const done=queue.then(async()=>{if(!await retire())checkStopped();});queue=done.catch(()=>{});return done;},status:()=>({pid:worker?.pid,identity:worker?.key,heapMb})};
}
