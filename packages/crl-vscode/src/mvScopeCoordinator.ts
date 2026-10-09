// REFACTOR:grounded (Medical Review): local publication is required; KELP coordination is best effort.
// KELP owns concurrency and Git publication; MV stages complete local definitions and surfaces CLI outcomes.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { KelpEditScopes, changedKelpScopes, KelpEditError, type KelpStatus } from './kelpEditScopes';
import { MvEditTransaction, EditInterrupted, assertOrdinaryEditPath } from './mvEditTransaction';
import type { DirectEditPlan } from './mvDirectEdit';

/** Acquired locks are retained after refusal; recovery lists their keys for explicit KELP release. Never release prior locks. */
export interface ScopeOperation {
  schemaVersion: 1; id: string; artifactRoot: string; phase: 'planning' | 'acquiring' | 'locked' |
    'scope-outcome-unknown' | 'publishing' | 'local-applied' | 'saved' | 'save-failed' | 'save-outcome-unknown' | 'save-in-flight' | 'no-live-change';
  scopes: string[]; acquired: string[]; preExisting: string[]; changedPaths: string[];
  transactionDirectory?: string; detail?: string; scopeMapping?: string; localComplete?: boolean; released?: string[]; attempted?: string[];
}
const normalized = (paths: readonly string[]) => [...new Set(paths.map(p=>resolve(p)))].sort();
export const kelpScopeMapping = (status: KelpStatus) => JSON.stringify(status.entities.map(e=>[e.key,e.folder,e.humanEditable,e.reserved]).sort());
const mappings = kelpScopeMapping;
const inside = (root: string, target: string) => {const r=relative(resolve(root),resolve(target));return r!=='' && !isAbsolute(r) && r!=='..' && !r.startsWith('..'+sep);};
export class DirectEditAppliedError extends Error {
  constructor(message:string,readonly plan:DirectEditPlan,readonly transaction:MvEditTransaction,readonly operationFile:string){super(message);}
}

export function writeScopeOperation(file: string, state: ScopeOperation): void {
  assertOrdinaryEditPath(file);
  mkdirSync(dirname(file),{recursive:true});const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify(state,null,2)+'\n');renameSync(tmp,file);
}
export function readScopeOperation(file: string, artifactRoot: string): ScopeOperation {
  assertOrdinaryEditPath(file);
  const raw=JSON.parse(readFileSync(file,'utf8')) as ScopeOperation;
  if(raw.attempted!==undefined && (!Array.isArray(raw.attempted) || raw.attempted.some(k=>typeof k!=='string'||!k)) || raw.schemaVersion!==1 || raw.localComplete!==undefined && typeof raw.localComplete!=='boolean' || raw.released!==undefined && (!Array.isArray(raw.released) || raw.released.some(k=>typeof k!=='string'||!k)) || !/^[a-f0-9-]{36}$/.test(raw.id) || raw.artifactRoot!==resolve(artifactRoot) ||
    !Array.isArray(raw.scopes) || !Array.isArray(raw.acquired) || !Array.isArray(raw.preExisting) || !Array.isArray(raw.changedPaths) ||
    !['planning','acquiring','locked','scope-outcome-unknown','publishing','local-applied','saved','save-failed','save-outcome-unknown','save-in-flight','no-live-change'].includes(raw.phase) ||
    [...raw.scopes,...raw.acquired,...raw.preExisting].some(k=>typeof k!=='string'||!k) ||
    raw.acquired.some(k=>raw.preExisting.includes(k)) || raw.changedPaths.some(p=>typeof p!=='string'||!inside(artifactRoot,p))) throw new Error('Invalid Medical Review scope operation.');
  return raw;
}
export function inspectScopeOperations(storageRoot:string,artifactRoot:string):{operations:{file:string;operation:ScopeOperation}[];errors:{file:string;message:string}[]}{
  const operations:{file:string;operation:ScopeOperation}[]=[],errors:{file:string;message:string}[]=[];
  assertOrdinaryEditPath(storageRoot);if(!existsSync(storageRoot))return {operations,errors};
  for(const id of readdirSync(storageRoot).sort().filter(id=>/^[a-f0-9-]{36}$/.test(id))){
    const file=join(storageRoot,id,'scope.json');try{operations.push({file,operation:readScopeOperation(file,artifactRoot)});}catch(error){errors.push({file,message:String(error)});}
  }return {operations,errors};
}

export interface CoordinateDirectEdit {
  artifactRoot: string; storageRoot: string; id: string; scopes?: KelpEditScopes;
  plan: (partition:{acquired:string[];preExisting:string[]}) => DirectEditPlan;
  checkInputs: (plan:DirectEditPlan) => void;
  onLocalApplied: (plan:DirectEditPlan,tx:MvEditTransaction) => Promise<void> | void;
}
export interface CoordinatedEditOutcome {
  state: 'saved' | 'local-applied' | 'save-failed';
  plan: DirectEditPlan; transaction: MvEditTransaction; operationFile: string; detail?: string;
}

/** Publish the complete local edit; optional KELP failures never prevent local Save. */
export async function coordinateDirectEdit(options: CoordinateDirectEdit): Promise<CoordinatedEditOutcome> {
  const root=resolve(options.artifactRoot),storage=resolve(options.storageRoot),client=options.scopes;
  if(!/^[a-f0-9-]{36}$/.test(options.id) || inside(root,storage) || root===storage)throw new Error('Invalid local edit storage.');
  const file=join(storage,'operations',options.id,'scope.json');
  const state:ScopeOperation={schemaVersion:1,id:options.id,artifactRoot:root,phase:'planning',scopes:[],acquired:[],preExisting:[],changedPaths:[]};
  const persist=()=>writeScopeOperation(file,state);
  const partition=()=>({acquired:[...state.acquired],preExisting:[...state.preExisting]});
  const diagnostics:string[]=[];
  const note=(step:string,error:unknown)=>{if(error instanceof EditInterrupted)throw error;diagnostics.push(step+': '+String(error));state.detail=diagnostics.join('\n');};
  let plan=options.plan(partition()),transaction:MvEditTransaction|undefined;
  if(resolve(plan.projectRoot)!==root)throw new Error('Policy output root differs from the selected artifact root.');
  const initialFingerprint=plan.projectFingerprint;
  state.changedPaths=normalized(plan.changedPaths);
  try {
    if(client){
      try{const status=await client.status();state.scopeMapping=mappings(status);state.scopes=changedKelpScopes(root,status,[...plan.changedPaths,...plan.units.map(u=>u.path)]);}
      catch(error){note('KELP status',error);}
      persist();
      if(state.scopes.length){
        try{
          const locks=await client.acquire(state.scopes,p=>{state.phase='acquiring';state.preExisting=p.preExisting;state.attempted=p.acquired;persist();});
          state.acquired=locks.acquired;state.preExisting=locks.preExisting;
        }catch(error){if(error instanceof KelpEditError)state.acquired=[...error.acquired];note('KELP lock',error);}
        // A lock attempt can pull source even when its later ownership check fails.
        const next=options.plan(partition());
        if(next.projectFingerprint!==initialFingerprint)throw new Error('Policy inputs changed when KELP pulled. Re-pin before saving; your draft is retained.');
        plan=next;state.changedPaths=normalized(plan.changedPaths);
      }
    }
    options.checkInputs(plan);
    const tx=MvEditTransaction.prepare({artifactRoot:root,storageRoot:join(storage,'transactions'),units:plan.units,expectedBefore:plan.before,
      acquired:state.acquired,preExisting:state.preExisting,scopes:state.scopes});
    transaction=tx;state.transactionDirectory=tx.directory;state.phase='publishing';persist();tx.publish();
    state.phase='local-applied';try{persist();}catch(error){note('Local outcome record',error);}await options.onLocalApplied(plan,tx);state.localComplete=true;try{persist();}catch(error){note('Local outcome record',error);}
    let outcome:CoordinatedEditOutcome['state']='local-applied';
    let kelpMappingCurrent=false;
    if(client && state.scopes.length){
      try{const status=await client.status();kelpMappingCurrent=mappings(status)===state.scopeMapping;if(kelpMappingCurrent)state.scopes=changedKelpScopes(root,status,[...plan.changedPaths,...plan.units.map(u=>u.path)]);else note('KELP status','Scope mapping changed; local Save is complete.');}
      catch(error){kelpMappingCurrent=false;note('KELP status',error);}
    }
    if(client && kelpMappingCurrent){
      let saveDetail:string|undefined;
      try{await client.save(state.scopes);state.phase='saved';outcome='saved';}
      catch(error){saveDetail=String(error);note('KELP Save',error);state.phase='save-failed';outcome='save-failed';}
      try{tx.recordSave(outcome==='saved'?'saved':'save-failed',saveDetail);}catch(error){note('KELP outcome record',error);}
      try{state.released=await client.releaseAcquired([...new Set([...state.acquired,...state.attempted??[]])],state.preExisting);}catch(error){note('KELP unlock',error);}
    }
    try{persist();}catch(error){note('KELP outcome record',error);}
    return {state:outcome,plan,transaction:tx,operationFile:file,...(state.detail?{detail:state.detail}:{})};
  }catch(error){
    if(error instanceof EditInterrupted)throw error;
    state.phase=transaction?.state.phase==='rolled-back'?'no-live-change':transaction && ['local-applied','saved','save-failed','save-outcome-unknown'].includes(transaction.state.phase)?'local-applied':
      state.phase==='publishing'?'publishing':'no-live-change';
    state.detail=[...diagnostics,String(error)].join('\n');persist();
    if(transaction && state.phase==='local-applied')throw new DirectEditAppliedError(`Edit applied locally; host refresh requires recovery. ${String(error)}`,plan,transaction,file);
    throw error;
  }
}
