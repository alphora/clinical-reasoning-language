// REFACTOR:grounded: every native launch shares cleanup health and declared heap admission.
import {totalmem} from 'node:os';
import {runOwnedProcess,type OwnedProcessOptions,type OwnedProcessResult} from './ownedProcess';

export class NativeRuntimeError extends Error {
  constructor(public code:string,message:string,public cleanupConfirmed=true){super(message);}
}
let quarantined=false;
export function assertNativeHealthy():void {
  if(quarantined)throw new NativeRuntimeError('cleanup-unconfirmed','Restart this tool process before another native request.',false);
}
export function reportNativeCleanup(confirmed:boolean):void {if(!confirmed)quarantined=true;}
export function nativeQuarantined():boolean{return quarantined;}
export async function runNativeProcess(exe:string,args:readonly string[],options:OwnedProcessOptions):Promise<OwnedProcessResult>{
  assertNativeHealthy();
  const result=await runOwnedProcess(exe,args,options);
  reportNativeCleanup(result.cleanupConfirmed);
  return result;
}

let budget:number|undefined;
const reservations=new Map<object,number>();
export function nativeHeapBudget():{budgetMb:number;reservedMb:number}{
  if(budget===undefined){
    const memoryQuery=(process as NodeJS.Process&{constrainedMemory?:()=>number}).constrainedMemory;
    const constrained=typeof memoryQuery==='function'?memoryQuery.call(process):undefined;
    const effective=Math.max(1,Math.floor(Math.min(totalmem(),constrained&&constrained>0?constrained:Infinity)/1048576));
    const configured=process.env.CRL_NATIVE_HEAP_BUDGET_MB;
    if(configured!==undefined&&(!/^[1-9]\d*$/.test(configured)||!Number.isSafeInteger(Number(configured))||Number(configured)>effective))
      throw new NativeRuntimeError('heap-budget','CRL_NATIVE_HEAP_BUDGET_MB must be a positive MiB integer no greater than effective memory ('+effective+').');
    budget=configured===undefined?Math.max(1,Math.floor(effective/2)):Number(configured);
  }
  return {budgetMb:budget,reservedMb:[...reservations.values()].reduce((a,b)=>a+b,0)};
}
export function reserveNativeHeap(pool:object,mb:number,legacySingle=false):void {
  if(!mb){reservations.delete(pool);return;}
  const state=nativeHeapBudget(),proposed=state.reservedMb-(reservations.get(pool)??0)+mb;
  const other=state.reservedMb-(reservations.get(pool)??0);
  if(proposed>state.budgetMb&&!(legacySingle&&other===0))throw new NativeRuntimeError('heap-budget','Native worker heap admission exceeds budget: '+proposed+' MiB requested, '+state.budgetMb+' MiB budget.');
  if(mb)reservations.set(pool,mb);else reservations.delete(pool);
}

/** One physical abort subscription per source, regardless of queued jobs. */
const abortChannels=new WeakMap<AbortSignal,{callbacks:Set<()=>void>;listener:()=>void}>();
export function subscribeNativeAbort(signal:AbortSignal|undefined,callback:()=>void):()=>void {
  if(!signal)return ()=>{};
  if(signal.aborted){callback();return ()=>{};}
  let channel=abortChannels.get(signal);
  if(!channel){
    const callbacks=new Set<()=>void>();
    const listener=()=>{signal.removeEventListener('abort',listener);abortChannels.delete(signal);for(const fn of [...callbacks])fn();callbacks.clear();};
    channel={callbacks,listener};abortChannels.set(signal,channel);signal.addEventListener('abort',listener,{once:true});
  }
  const registered=channel;registered.callbacks.add(callback);
  return ()=>{registered.callbacks.delete(callback);if(!registered.callbacks.size){signal.removeEventListener('abort',registered.listener);if(abortChannels.get(signal)===registered)abortChannels.delete(signal);}};
}
/** Both cancellation owners remain live; no retained subscription after settlement. */
export function joinNativeSignals(signals:readonly (AbortSignal|undefined)[]):{signal:AbortSignal|undefined;dispose:()=>void}{
  const unique=[...new Set(signals.filter((s):s is AbortSignal=>!!s))];
  if(unique.length<2)return {signal:unique[0],dispose:()=>{}};
  const controller=new AbortController(),cancel=()=>controller.abort();
  const subscriptions=unique.map(signal=>subscribeNativeAbort(signal,cancel));
  return {signal:controller.signal,dispose:()=>{for(const stop of subscriptions)stop();}};
}
