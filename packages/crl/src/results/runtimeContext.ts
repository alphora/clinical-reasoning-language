// REFACTOR:grounded: independent control-plane observation; zero policy evaluation and explicit binding refusal.
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {digest,runtimeFingerprint} from './runtimeFingerprint';
import {prepareNativeRuntime,type PreparedNativeRuntime,type NativePreparationOptions} from './runtimePreparation';
import {assertRuntimeCodeUnchanged,fileSha256,processInstanceId,startupFilesSha256} from './runtimeIdentity';
import {withNativeOperation,withNativeRuntime} from './nativeWorker';
import {resultBounds} from './spawn';
import {reportNativeCleanup} from './nativeProcess';

export interface ExpectedRuntimeContext {processInstanceId:string;fingerprintSha256:string;runtimeSha256:string;executionSha256:string}
export interface RuntimeProbeRequest extends Partial<NativePreparationOptions> {challenge:string;crlVersion:string;caseTimeoutMs?:number}
function executionIdentity(p:PreparedNativeRuntime){
  const b=p.spec.bounds;
  return {javaExe:path.resolve(p.java.javaExe),javaRealPath:realpathSync(p.java.javaExe),javaSha256:fileSha256(p.java.javaExe),
    engineJarPath:realpathSync(p.jarPath),nativeMode:p.spec.nativeMode??'worker',bounds:{maxHeapMb:b.maxHeapMb,batchTimeoutMs:b.batchTimeoutMs,maxCapturedBytes:b.maxCapturedBytes},nodeExe:process.execPath,nodeVersion:process.version};
}
export function validateExpectedContext(expected:ExpectedRuntimeContext):void{
  if(!expected||typeof expected!=='object'||Object.keys(expected).sort().join(',')!=='executionSha256,fingerprintSha256,processInstanceId,runtimeSha256'||
    !['executionSha256','fingerprintSha256','runtimeSha256'].every(k=>/^[a-f0-9]{64}$/.test((expected as unknown as Record<string,string>)[k])))
    throw new Error('expectedRuntimeContext requires processInstanceId and three lowercase SHA256 bindings.');
  if(expected.processInstanceId!==processInstanceId)throw new Error('Expected runtime context belongs to a different process instance.');
  assertRuntimeCodeUnchanged();
}
export function verifyExpectedContext(expected:ExpectedRuntimeContext,p:PreparedNativeRuntime,fingerprint:string,version:string):ExpectedRuntimeContext{
  validateExpectedContext(expected);
  const actual={processInstanceId,fingerprintSha256:fingerprint,runtimeSha256:digest({runtime:fingerprint,crlVersion:version,jar:p.jarSha256}),executionSha256:digest(executionIdentity(p))};
  if(Object.keys(actual).some(k=>actual[k as keyof typeof actual]!==expected[k as keyof typeof expected]))throw new Error('Expected native runtime context mismatch; the affected clinical dispatch was refused.');
  return actual;
}
export async function probeRuntimeContext(req:RuntimeProbeRequest,busy=false){
  const base={schemaVersion:1 as const,operation:'native-runtime-context' as const,challenge:req.challenge,processInstanceId};
  try{
    if(typeof req.challenge!=='string'||!req.challenge.length||req.challenge.length>256)throw new Error('challenge must be a fresh nonempty caller nonce of at most256characters.');
    if(req.nativeMode!==undefined&&!['worker','isolated'].includes(req.nativeMode))throw new Error('Unsupported nativeMode.');
    if(busy)throw new Error('Native producer is busy or shutting down.');
    assertRuntimeCodeUnchanged();
    return await withNativeOperation(req.signal,async signal=>{
      const p=await prepareNativeRuntime({...req,bounds:resultBounds(req.bounds,req.caseTimeoutMs),signal});
      if(!p.ok)return {...base,ok:false as const,status:'unavailable' as const,reason:p.reason};
      return withNativeRuntime(p.spec,async runtime=>{
        const f=await runtimeFingerprint(p.java.javaExe,p.jarPath,p.spec.bounds,signal,p.environment,runtime);
        if(!f.cleanupConfirmed)reportNativeCleanup(false);
        if(!f.cleanupConfirmed||!f.sha256)throw new Error(f.reason??'Runtime fingerprint unavailable.');
        const files=assertRuntimeCodeUnchanged(),execution=executionIdentity(p);
        return {...base,ok:true as const,status:'available' as const,observedAt:new Date().toISOString(),producerVersion:req.crlVersion,
          fingerprintSha256:f.sha256,runtimeSha256:digest({runtime:f.sha256,crlVersion:req.crlVersion,jar:p.jarSha256}),
          execution,executionSha256:digest(execution),startupFilesSha256:startupFilesSha256!,files,
          engineJarSha256:p.jarSha256,javaMajor:p.java.major,clinicalEvaluations:0 as const};
      });
    });
  }catch(error){return {...base,ok:false as const,status:'unavailable' as const,reason:String(error)};}
}
export type RuntimeProbeOutcome=Awaited<ReturnType<typeof probeRuntimeContext>>;
