#!/usr/bin/env node
// REFACTOR:grounded: parallel independent controls retain ordered responses and per-request evidence.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {applySession,shutdownNativeRuntime,createNativeWorkerPool,DEFAULT_SESSION_LIMITS,type ApplySessionRequestV1,type ApplySessionResult} from '../results/session';
import {NativeRuntimeError} from '../results/nativeWorker';
import {JsonDocument,SessionInputError,sha256} from '../results/sessionJson';
import {SessionInputQueue} from './sessionInputQueue';

interface Control {request:string;out:string}
interface Preprocessing {outDir:string;original?:string}
const inputs=new SessionInputQueue();
function failure(error:unknown,evidence?:Preprocessing):ApplySessionResult {
  const result:ApplySessionResult={schemaVersion:1,ok:false,artifacts:{},diagnostics:[],elapsedMs:0,
    cleanupConfirmed:error instanceof NativeRuntimeError?error.cleanupConfirmed:true,
    error:{code:error instanceof SessionInputError||error instanceof NativeRuntimeError?error.code:'request-failure',message:error instanceof Error?error.message:String(error)}};
  if(evidence)try{
    mkdirSync(evidence.outDir);
    if(evidence.original!==undefined){const file=path.join(evidence.outDir,'original-request.json');writeFileSync(file,evidence.original,{encoding:'utf8',flag:'wx'});result.artifacts['original-request.json']={path:file,bytes:Buffer.byteLength(evidence.original),sha256:sha256(evidence.original)};}
    writeFileSync(path.join(evidence.outDir,'result.json'),JSON.stringify(result,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  }catch(error){result.error={code:'evidence-write',message:result.error.message+'; could not write CLI failure evidence: '+String(error)};}
  return result;
}
async function execute(call:Control,signal:AbortSignal):Promise<ApplySessionResult>{
  let preprocessing:Preprocessing|undefined={outDir:path.resolve(call.out)};
  const lease=inputs.lease(signal);
  try{
    const requestPath=path.resolve(call.request);
    const loaded=await lease.load(async read=>{
      const original=await read(requestPath,DEFAULT_SESSION_LIMITS.inputBytes*2);preprocessing!.original=original;
      new JsonDocument(original,DEFAULT_SESSION_LIMITS.inputBytes*2);const request=JSON.parse(original);
      if(!request||typeof request!=='object'||Array.isArray(request))throw new SessionInputError('request','Request must be an object.');
      for(const [inline,file] of [['repositoryJson','repositoryPath'],['requestDataJson','requestDataPath']])if(request[file]!==undefined){
        if(request[inline]!==undefined||typeof request[file]!=='string')throw new SessionInputError('ambiguous-input','Supply exactly one of '+inline+' or '+file+'.');
        request[inline]=await read(path.resolve(path.dirname(requestPath),request[file]),DEFAULT_SESSION_LIMITS.inputBytes);delete request[file];
      }
      if(request.engine&&typeof request.engine.path==='string')request.engine.path=path.resolve(path.dirname(requestPath),request.engine.path);
      return {request,original};
    });
    preprocessing=undefined;
    return await applySession(loaded.request as ApplySessionRequestV1,{outDir:path.resolve(call.out),originalRequestJson:loaded.original,signal});
  }catch(error){return failure(error,preprocessing);}finally{lease.release();}
}
function workers(value:string|number):number {
  const count=typeof value==='number'?value:Number(value);
  if(!Number.isSafeInteger(count)||count<1||count>32)throw new SessionInputError('arguments','--workers requires an integer from1to32.');return count;
}
async function write(value:unknown):Promise<void>{if(!process.stdout.write(JSON.stringify(value)+'\n'))await once(process.stdout,'drain');}

async function* controls():AsyncGenerator<string|SessionInputError>{
  let pending=Buffer.alloc(0),discarding=false;
  for await(const chunk of process.stdin){
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    let start=0;
    while(start<bytes.length){
      const newline=bytes.indexOf(10,start),end=newline<0?bytes.length:newline,part=bytes.subarray(start,end);
      if(!discarding){
        if(pending.length+part.length>65536){pending=Buffer.alloc(0);discarding=true;yield new SessionInputError('input-limit','Control line exceeds 65536 bytes.');}
        else pending=Buffer.concat([pending,part]);
      }
      if(newline>=0){if(!discarding)yield pending.toString('utf8');pending=Buffer.alloc(0);discarding=false;}
      start=end+1;
    }
  }
  if(pending.length)yield pending.toString('utf8');
}

async function entry():Promise<number>{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('crl-apply-session --request <step.json> --out <new-directory>\ncrl-apply-session --serve [--workers <1..32>]\nServe controls: {request:request-file,out:new-directory} or {workers:n}. Responses retain input order; pipeline writes for concurrency. Fixed64outstanding controls and128MiB total loaded-input budget. Complete dynamic sessions use createNativeWorkerPool.runJob in the API. See docs/apply-session.md.');return 0;
  }
  let serve=false,limit=1;const flags=new Map<string,string>();
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--serve'){if(serve)throw new SessionInputError('arguments','Duplicate --serve.');serve=true;continue;}
    if(!['--request','--out','--workers'].includes(arg)||!args[i+1]||args[i+1].startsWith('--')||flags.has(arg))throw new SessionInputError('arguments','Use --request <file> --out <new-directory>, or --serve [--workers n].');flags.set(arg,args[++i]);
  }
  if(serve&&(flags.has('--request')||flags.has('--out'))||!serve&&(flags.has('--workers')||!flags.has('--request')||!flags.has('--out')))throw new SessionInputError('arguments','Use one-shot request/out or --serve with optional --workers.');
  if(flags.has('--workers'))limit=workers(flags.get('--workers')!);
  const abort=new AbortController();let signalCode=0,failed=false;
  const stop=(code:number)=>{signalCode=code;abort.abort();if(serve)process.stdin.destroy();};
  const interrupt=()=>stop(130),terminate=()=>stop(143);
  process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
  try{
    if(!serve){const result=await execute({request:flags.get('--request')!,out:flags.get('--out')!},abort.signal);await write(result);return signalCode||(result.ok?0:1);}
    const pool=createNativeWorkerPool({workerLimit:limit});
    const pending=new Set<Promise<void>>();let writer=Promise.resolve();
    const output=(result:Promise<unknown>)=>{
      const completion=writer.then(async()=>{const value=await result;if(value&&typeof value==='object'&&'ok'in value&&!value.ok)failed=true;await write(value);});
      writer=completion;pending.add(completion);void completion.finally(()=>pending.delete(completion)).catch(()=>{abort.abort();process.stdin.destroy();});
    };
    try{
      for await(const line of controls()){
        if(abort.signal.aborted)break;
        let result:Promise<unknown>;
        try{
          if(line instanceof SessionInputError)throw line;
          new JsonDocument(line,65536);const call=JSON.parse(line);
          if(call&&typeof call==='object'&&!Array.isArray(call)&&Object.keys(call).length===1&&'workers'in call){
            const target=workers(call.workers);result=pool.setWorkerLimit(target).then(status=>({schemaVersion:1,control:'workers',ok:true,workerLimit:target,status})).catch(error=>failure(error));
          }else{
            if(!call||typeof call.request!=='string'||typeof call.out!=='string'||Object.keys(call).some(k=>!['request','out'].includes(k)))throw new SessionInputError('arguments','Each line requires request/out paths or a workers control.');
            let completed:ApplySessionResult|undefined;
            result=pool.runJob(async({signal})=>completed=await execute(call,signal),{signal:abort.signal}).catch(error=>{
              if(completed&&error instanceof NativeRuntimeError&&error.code==='cancelled')return completed;
              const rejected=failure(error,completed?undefined:{outDir:path.resolve(call.out)});return completed?{...completed,...rejected,artifacts:completed.artifacts}:rejected;
            });
          }
        }catch(error){result=Promise.resolve(failure(error));}
        output(result);if(pending.size>=64)await Promise.race(pending);
      }
    }catch(error){if(!abort.signal.aborted)throw error;}
    finally{process.stdin.destroy();try{await writer;}finally{await pool.shutdown({cancel:abort.signal.aborted});}}
    return signalCode||(failed?1:0);
  }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);}
}
void entry().then(code=>{process.exitCode=code;}).catch(async error=>{try{await write(failure(error));}catch{}process.exitCode=1;}).finally(()=>shutdownNativeRuntime()).catch(error=>{console.error(String(error));if(!process.exitCode)process.exitCode=1;});
