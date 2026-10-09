import type {KeUpdateInput,KeUpdateSelection} from './keQaApply';
import type {QaEditRequest} from '@smile-digital-health/crl';

export interface KeAppRequest {id:string;revision:string;gist:string;editRequest:QaEditRequest}
export interface KeAppResult {
  ok:boolean;error?:string;state?:string;requests?:KeAppRequest[];pendingFindings?:{id:string;gist:string}[];
  recoveryRequired?:boolean;changes?:{file:string;before:string;after:string}[];changedPaths?:string[];
  clearedCases?:{file:string;caseName:string;factName:string}[];basis?:string;refreshedFolders?:string[];message?:string;
}
export interface KeAppState {
  root:string;busy?:string;requests:KeAppRequest[];pendingFindings:{id:string;gist:string}[];
  selected:string[];recoveryRequired:boolean;preview?:KeAppResult;result?:KeAppResult;error?:string;
}
export type KeAppOperation=(input:KeUpdateInput)=>Promise<KeAppResult>;
/** Artifact lifetime, independent of a webview. KELP owns its lifecycle externally. */
export class KeAppController {
  readonly state:KeAppState;
  private listeners=new Set<(state:KeAppState)=>void>();
  private disposed=false;
  private invalidation=0;
  constructor(root:string,private readonly operation:KeAppOperation){this.state={root,requests:[],pendingFindings:[],selected:[],recoveryRequired:false};}
  subscribe(listener:(state:KeAppState)=>void){this.listeners.add(listener);listener(this.state);return()=>this.listeners.delete(listener);}
  private emit(){if(!this.disposed)for(const listener of this.listeners)listener(this.state);}
  dispose(){this.disposed=true;this.listeners.clear();}
  invalidate(){this.invalidation++;this.state.preview=undefined;this.emit();}
  select(ids:unknown){
    if(this.state.busy || !Array.isArray(ids) || !ids.every(id=>typeof id==='string'))return;
    const allowed=new Set(this.state.requests.map(r=>r.id));this.state.selected=[...new Set(ids as string[])].filter(id=>allowed.has(id));
    this.invalidate();this.state.error=undefined;this.emit();
  }
  private selection():KeUpdateSelection[]{return this.state.requests.filter(r=>this.state.selected.includes(r.id)).map(({id,revision})=>({id,revision}));}
  private async call(operation:KeUpdateInput['operation'],requests?:KeUpdateSelection[]){
    const result=await this.operation({schemaVersion:1,operation,artifactRoot:this.state.root,...(requests?{requests}:{})});
    if(!result.ok)throw Error(result.error??'KE operation failed.');return result;
  }
  private async discover(){
    const result=await this.call('discover');this.state.requests=result.requests??[];this.state.pendingFindings=result.pendingFindings??[];
    this.state.recoveryRequired=!!result.recoveryRequired;const ids=new Set(this.state.requests.map(r=>r.id));this.state.selected=this.state.selected.filter(id=>ids.has(id));
  }
  async act(action:'refresh'|'preview'|'run'|'recover'){
    if(this.state.busy || this.disposed)return;
    const reviewed=this.state.preview,selection=this.selection();this.state.busy=action;this.state.error=undefined;this.emit();
    try{
      if(action==='refresh'){this.invalidate();await this.discover();}
      else if(action==='preview'){
        if(this.state.recoveryRequired)throw Error('Recover the interrupted update first.');
        const epoch=this.invalidation,result=await this.call('preview',selection);
        if(epoch!==this.invalidation)throw Error('Artifact changed during Preview. Preview again.');
        this.state.preview=result;this.state.result=undefined;
      }else if(action==='run'){
        if(!reviewed || this.state.recoveryRequired)throw Error('Preview the selected requests before Run.');
        const epoch=this.invalidation,fresh=await this.call('preview',selection);
        if(epoch!==this.invalidation || JSON.stringify(fresh)!==JSON.stringify(reviewed)){this.invalidate();throw Error('Requests or source changed. Preview again before Run.');}
        this.state.preview=undefined;this.state.result=await this.call('apply',selection);await this.discover();
      }else{
        this.invalidate();this.state.result=await this.call('recover');await this.discover();
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);this.state.error=message;
      if(action==='run' || action==='recover'){
        this.state.preview=undefined;
        try{await this.discover();}catch(discoveryError){this.state.error=message+'\nCould not refresh recovery state: '+(discoveryError instanceof Error?discoveryError.message:String(discoveryError));}
      }
    }
    finally{this.state.busy=undefined;this.emit();}
  }
}
