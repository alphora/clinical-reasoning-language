// REFACTOR:grounded: independent jobs share a bounded queue; a session retains one serial owner.
import {AsyncLocalStorage} from 'node:async_hooks';
import {createNativeOwner,nativeIdentity,type NativeOwner,type NativeSpec,type NativeRuntime} from './nativeWorkerOwner';
import {NativeRuntimeError,assertNativeHealthy,joinNativeSignals,nativeHeapBudget,reserveNativeHeap,nativeQuarantined,subscribeNativeAbort} from './nativeProcess';

export interface NativeWorkerPoolStatus {
  workerLimit:number;maxHeapMb:number;activeJobs:number;queuedJobs:number;closed:boolean;quarantined:boolean;
  heap:{budgetMb:number;reservedMb:number;poolReservedMb:number};
  workers:{id:number;pid?:number;identity?:string;heapMb:number;active:boolean;draining:boolean}[];
}
export interface NativeWorkerPool {
  runJob<T>(use:(job:{signal:AbortSignal})=>Promise<T>,options?:{signal?:AbortSignal}):Promise<T>;
  setWorkerLimit(workerLimit:number):Promise<NativeWorkerPoolStatus>;
  status():NativeWorkerPoolStatus;
  shutdown(options?:{cancel?:boolean}):Promise<void>;
}
interface Slot {id:number;owner:NativeOwner;active:boolean;draining:boolean}
interface Job {active:boolean;slot?:Slot;cancel:()=>void;fail:(error:unknown)=>void;run:(slot:Slot)=>Promise<void>;done:Promise<void>;identity?:string}
interface Scope {pool:Pool;slot:Slot;signal:AbortSignal;open:boolean;pending:Set<Promise<unknown>>}
interface Operation {active:boolean}
const storage=new AsyncLocalStorage<{job?:Scope;operation?:Operation}>();
const pools=new Set<Pool>(),rootOperations=new Set<Promise<unknown>>();
let defaultPool:Pool|undefined,retiring:Promise<void>|undefined;
const cancelled=()=>new NativeRuntimeError('cancelled','Native job cancelled.');
function integer(value:number,name:string,max:number):void {
  if(!Number.isSafeInteger(value)||value<1||value>max)throw new NativeRuntimeError('invalid-limit',name+' must be an integer from 1 to '+max+'.');
}
export function assertOutsideNativeJob(operation:string):void {
  const context=storage.getStore();
  if(context?.job||context?.operation?.active)throw new NativeRuntimeError('pool-self-wait',operation+' cannot wait from inside a native job or operation.');
}
function waitBarrier(promise:Promise<void>,signal?:AbortSignal):Promise<void>{
  if(!signal)return promise;
  return new Promise((resolve,reject)=>{
    let stop:()=>void=()=>{};const cancel=()=>{stop();reject(cancelled());};
    stop=subscribeNativeAbort(signal,cancel);
    promise.then(()=>{stop();resolve();},error=>{stop();reject(error);});
  });
}

/** Register before invoking work, retaining already accepted operations through callback return. */
export function withNativeOperation<T>(signal:AbortSignal|undefined,use:(signal:AbortSignal|undefined)=>Promise<T>):Promise<T>{
  const context=storage.getStore();
  try{
    if(context?.job&&!context.job.open||context?.operation&&!context.operation.active)
      throw new NativeRuntimeError('reservation-closed','The native job or operation has ended.');
  }catch(error){return Promise.reject(error);}
  if(!context?.job&&retiring)return waitBarrier(retiring,signal).then(()=>withNativeOperation(signal,use));
  const joined=joinNativeSignals([signal,context?.job?.signal]);
  if(joined.signal?.aborted){joined.dispose();return Promise.reject(cancelled());}
  const operation:Operation={active:true},pending=context?.job?.pending??rootOperations;
  let resolve!:(value:T|PromiseLike<T>)=>void,reject!:(error:unknown)=>void;
  const initial=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  const result=initial.finally(()=>{operation.active=false;joined.dispose();pending.delete(result);});
  pending.add(result);void result.catch(()=>{});
  try{Promise.resolve(storage.run({...context,operation},()=>use(joined.signal))).then(resolve,reject);}catch(error){reject(error);}
  return result;
}

class Pool implements NativeWorkerPool {
  private slots:Slot[]=[];
  private queue:Job[]=[];
  private jobs=new Set<Job>();
  private nextId=1;
  private closed=false;
  private reserved=0;
  private resizing=Promise.resolve();
  private closing?:Promise<void>;
  private removals=new Set<Promise<void>>();
  private retirementFailure:unknown;
  constructor(private limit:number,private heap:number,private automatic=false){
    integer(limit,'workerLimit',32);integer(heap,'maxHeapMb',65536);
    assertNativeHealthy();this.reserve(limit,heap);pools.add(this);
  }
  private reserve(limit=this.limit,heap=this.heap):void {
    // An admitted active callback owns capacity even before Java starts or in isolated mode.
    const physical=this.slots.reduce((sum,slot)=>sum+Math.max(slot.owner.status().heapMb,slot.active?heap:0),0);
    const mb=Math.max(limit*heap,physical);
    reserveNativeHeap(this,mb,this.automatic&&limit===1);this.reserved=mb;
  }
  private releaseReservation():void {reserveNativeHeap(this,0);this.reserved=0;}
  status():NativeWorkerPoolStatus {
    return {workerLimit:this.limit,maxHeapMb:this.heap,activeJobs:this.slots.filter(s=>s.active).length,
      queuedJobs:this.queue.length,closed:this.closed,quarantined:nativeQuarantined(),heap:{...nativeHeapBudget(),poolReservedMb:this.reserved},
      workers:this.slots.map(slot=>({id:slot.id,...slot.owner.status(),active:slot.active,draining:slot.draining}))};
  }
  private selfWait():boolean {return storage.getStore()?.job?.pool===this;}
  setWorkerLimit(limit:number):Promise<NativeWorkerPoolStatus>{
    // Before the resize queue: even an increase queued behind a decrease could self-wait.
    if(this.selfWait())return Promise.reject(new NativeRuntimeError('pool-self-wait','Resize the pool from outside its jobs.'));
    const change=this.resizing.then(async()=>{
      integer(limit,'workerLimit',32);assertNativeHealthy();
      if(this.closed)throw new NativeRuntimeError('pool-closed','Native worker pool is closed.');
      this.reserve(limit);this.limit=limit;
      for(const slot of this.slots.slice(limit))slot.draining=true;
      this.pump();await this.waitRemovals(true);this.reserve();return this.status();
    });
    this.resizing=change.then(()=>{},()=>{});return change;
  }
  accountHeap(heap:number):void {
    integer(heap,'maxHeapMb',65536);
    if(heap<=this.heap)return;
    if(!this.automatic)throw new NativeRuntimeError('heap-budget','Request heap exceeds this pool\'s declared maxHeapMb ('+this.heap+').');
    this.reserve(this.limit,heap);this.heap=heap;
  }
  runJob<T>(use:(job:{signal:AbortSignal})=>Promise<T>,options:{signal?:AbortSignal}={}):Promise<T>{
    if(this.selfWait())return Promise.reject(new NativeRuntimeError('pool-self-wait','Do not recursively queue a job on its own pool.'));
    if(retiring){
      if(storage.getStore()?.job)return Promise.reject(new NativeRuntimeError('pool-self-wait','Cannot enter another pool while global retirement waits for this job.'));
      return waitBarrier(retiring,options.signal).then(()=>this.runJob(use,options));
    }
    return this.enqueue(use,options);
  }
  enqueue<T>(use:(job:{signal:AbortSignal})=>Promise<T>,options:{signal?:AbortSignal}={},identity?:string,rejectActiveCancellation=true):Promise<T>{
    try{assertNativeHealthy();if(this.closed)throw new NativeRuntimeError('pool-closed','Native worker pool is closed.');this.reserve();}
    catch(error){return Promise.reject(error);}
    return new Promise<T>((resolve,reject)=>{
      const controller=new AbortController();let done!:()=>void,stopExternal:()=>void=()=>{};
      const finish=()=>{stopExternal();this.jobs.delete(job);done();};
      const cancel=()=>{
        controller.abort();if(job.active)return;
        const index=this.queue.indexOf(job);if(index>=0)this.queue.splice(index,1);
        reject(cancelled());finish();this.pump();
      };
      const job:Job={active:false,cancel,fail:error=>{reject(error);finish();},identity,done:new Promise<void>(yes=>{done=yes;}),run:async slot=>{
        job.active=true;job.slot=slot;slot.active=true;
        const scope:Scope={pool:this,slot,signal:controller.signal,open:true,pending:new Set()};
        let value:T|undefined,error:unknown,failed=false;
        try{value=await storage.run({job:scope},()=>use({signal:controller.signal}));}
        catch(e){error=e;failed=true;controller.abort();}
        finally{
          scope.open=false;
          while(scope.pending.size){const settled=await Promise.allSettled([...scope.pending]);for(const item of settled)if(item.status==='rejected'&&!failed){error=item.reason;failed=true;}}
          try{await slot.owner.drain();}catch(e){error=e;failed=true;}
          if(controller.signal.aborted&&!failed&&rejectActiveCancellation){error=cancelled();failed=true;}
          slot.active=false;
          if(slot.draining||this.closed)await this.remove(slot).catch(e=>{error=e;failed=true;});
          if(failed)reject(error);else resolve(value as T);
          finish();this.pump();
        }
      }};
      this.jobs.add(job);this.queue.push(job);
      stopExternal=subscribeNativeAbort(options.signal,cancel);
      if(!options.signal?.aborted)this.pump();
    });
  }
  private pump():void {
    for(const slot of this.slots)if(slot.draining&&!slot.active)void this.remove(slot).catch(()=>{});
    while(this.queue.length){
      try{assertNativeHealthy();}catch(error){for(const job of this.queue.splice(0))job.fail(error);return;}
      if(this.slots.filter(s=>s.active).length>=this.limit)return;
      const job=this.queue[0];
      const idle=this.slots.filter(s=>!s.active&&!s.draining);
      let slot=idle.find(s=>job.identity&&s.owner.status().identity===job.identity)
        ??idle.find(s=>s.owner.status().pid===undefined)??idle[0];
      if(!slot){
        if(this.slots.length>=this.limit)return;
        slot={id:this.nextId++,owner:createNativeOwner(),active:false,draining:false};this.slots.push(slot);
      }
      this.queue.shift();void job.run(slot);
    }
  }
  private remove(slot:Slot):Promise<void>{
    const prior=(slot as Slot&{removal?:Promise<void>}).removal;if(prior)return prior;
    const work=slot.owner.retire().then(()=>{
      const index=this.slots.indexOf(slot);if(index>=0)this.slots.splice(index,1);
      this.reserve();
    }).catch(error=>{this.retirementFailure??=error;throw error;}).finally(()=>{this.removals.delete(work);this.pump();});
    (slot as Slot&{removal?:Promise<void>}).removal=work;this.removals.add(work);return work;
  }
  private async waitRemovals(waitActive=false):Promise<void>{
    if(waitActive)await Promise.all([...this.jobs].filter(j=>j.active&&j.slot?.draining).map(j=>j.done));
    while(this.removals.size){const settled=await Promise.allSettled([...this.removals]);const failed=settled.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;}
    if(this.retirementFailure!==undefined)throw this.retirementFailure;
  }
  async drainRetired():Promise<void>{await this.waitRemovals();}
  async retire():Promise<void>{
    await Promise.all([...this.jobs].map(j=>j.done));
    await Promise.all(this.slots.map(slot=>this.remove(slot)));
    this.releaseReservation();
  }
  shutdown(options:{cancel?:boolean}={}):Promise<void>{
    if(this.selfWait())return Promise.reject(new NativeRuntimeError('pool-self-wait','Close the pool from outside its jobs.'));
    if(this.closing)return this.closing;
    this.closed=true;if(options.cancel)for(const job of [...this.jobs])job.cancel();
    this.closing=this.retire().then(()=>{pools.delete(this);});return this.closing;
  }
}

function processPool():Pool{return defaultPool??=(new Pool(1,1024,true));}
export function createNativeWorkerPool(options:{workerLimit?:number;maxHeapMb?:number}={}):NativeWorkerPool {
  return new Pool(options.workerLimit??1,options.maxHeapMb??1024);
}
export function nativeWorkerPoolStatus():NativeWorkerPoolStatus{return defaultPool?.status()??{workerLimit:1,maxHeapMb:1024,activeJobs:0,queuedJobs:0,closed:false,quarantined:nativeQuarantined(),heap:{...nativeHeapBudget(),poolReservedMb:0},workers:[]};}
export function setNativeWorkerLimit(limit:number):Promise<NativeWorkerPoolStatus>{return processPool().setWorkerLimit(limit);}
export function checkNativeAdmission(heap:number):void{assertNativeHealthy();(storage.getStore()?.job?.pool??processPool()).accountHeap(heap);}
export async function drainRetiredNativeWorkers():Promise<void>{await (storage.getStore()?.job?.pool??defaultPool)?.drainRetired();}

/** Shared scheduling primitive; an ambient complete-session job joins its reserved owner. */
export function withDefaultNativeJob<T>(use:()=>Promise<T>,signal?:AbortSignal,identity?:string,rejectCancellation=true):Promise<T>{
  const context=storage.getStore();
  if(context?.job)return use();
  return processPool().enqueue(use,{signal},identity,rejectCancellation);
}

/** Native-only reservations also use the shared queue; whole sessions can bind an explicit owner. */
export function withNativeRuntime<T>(input:NativeSpec,use:(runtime:NativeRuntime)=>Promise<T>):Promise<T>{
  const spec={...input,bounds:{...input.bounds},env:{...(input.env??process.env)}};
  const context=storage.getStore();
  try{
    assertNativeHealthy();
    if(context?.job&&!context.job.open&&!context.operation?.active||context?.operation&&!context.operation.active)
      throw new NativeRuntimeError('reservation-closed','Native operation has ended.');
    const key=nativeIdentity(spec);
    if(context?.job){
      context.job.pool.accountHeap(spec.bounds.maxHeapMb);
      const joined=joinNativeSignals([spec.signal,context.job.signal]);
      return context.job.slot.owner.reserve({...spec,signal:joined.signal},use,key).finally(joined.dispose);
    }
    if(retiring&&!context?.operation?.active)return waitBarrier(retiring,spec.signal).then(()=>withNativeRuntime(spec,use));
    const pool=processPool();pool.accountHeap(spec.bounds.maxHeapMb);
    return withDefaultNativeJob(()=>{
      const scope=storage.getStore()!.job!;
      const joined=joinNativeSignals([spec.signal,scope.signal]);
      return scope.slot.owner.reserve({...spec,signal:joined.signal},use,key).finally(joined.dispose);
    },spec.signal,key,false);
  }catch(error){return Promise.reject(error);}
}

/** Restartable retirement, distinct from terminal pool.shutdown(). */
export function shutdownNativeRuntime():Promise<void>{
  try{assertOutsideNativeJob('shutdownNativeRuntime');}catch(error){return Promise.reject(error);}
  if(retiring)return retiring;
  retiring=(async()=>{
    await Promise.allSettled([...rootOperations]);
    const settled=await Promise.allSettled([...pools].map(pool=>pool.retire()));
    const failed=settled.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
    assertNativeHealthy();
  })().finally(()=>{retiring=undefined;});
  return retiring;
}
process.once('beforeExit',()=>{void shutdownNativeRuntime().catch(error=>{console.error(String(error));process.exitCode=1;});});
