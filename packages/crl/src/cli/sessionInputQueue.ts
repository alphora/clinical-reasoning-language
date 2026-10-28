// REFACTOR:grounded: queued controls hold paths; admitted input bytes remain bounded through finalization.
import {readFileSync,statSync} from 'node:fs';
import {SessionInputError} from '../results/sessionJson';
import {subscribeNativeAbort} from '../results/nativeProcess';
const cancelled=()=>new SessionInputError('cancelled','Session input loading cancelled.');

export class SessionInputQueue {
  private used=0;
  private loading=false;
  private loaders:{run:()=>void;cancel:()=>void}[]=[];
  private changes=new Set<()=>void>();
  constructor(private maximum=128*1024*1024){}
  private changed(signal?:AbortSignal):Promise<void>{
    return new Promise((resolve,reject)=>{
      let unsubscribe:()=>void=()=>{};
      const finish=()=>{this.changes.delete(finish);unsubscribe();resolve();};
      this.changes.add(finish);
      unsubscribe=subscribeNativeAbort(signal,()=>{this.changes.delete(finish);unsubscribe();reject(cancelled());});
    });
  }
  private exclusive<T>(signal:AbortSignal|undefined,use:()=>Promise<T>):Promise<T>{
    return new Promise((resolve,reject)=>{
      let unsubscribe:()=>void=()=>{},started=false;
      const item={run:()=>{
        started=true;unsubscribe();this.loading=true;
        void (async()=>{try{if(signal?.aborted)throw cancelled();resolve(await use());}catch(error){reject(error);}finally{this.loading=false;this.loaders.shift()?.run();}})();
      },cancel:()=>{if(started)return;const at=this.loaders.indexOf(item);if(at>=0)this.loaders.splice(at,1);unsubscribe();reject(cancelled());}};
      if(signal?.aborted){reject(cancelled());return;}
      if(!this.loading)item.run();else{this.loaders.push(item);unsubscribe=subscribeNativeAbort(signal,item.cancel);}
    });
  }
  lease(signal?:AbortSignal):{
    load<T>(use:(read:(file:string,limit:number)=>Promise<string>)=>Promise<T>):Promise<T>;
    release():void;
  }{
    let held=0,released=false;
    return {
      load:use=>this.exclusive(signal,()=>use(async(file,limit)=>{
        if(released||signal?.aborted)throw cancelled();
        const stat=statSync(file);
        if(!stat.isFile()||stat.size>limit)throw new SessionInputError('input-limit','Input must be a regular file within the byte limit.',file);
        if(held+stat.size>this.maximum)throw new SessionInputError('input-limit','One control exceeds the CLI input-byte budget.',file);
        while(this.used+stat.size>this.maximum){await this.changed(signal);if(signal?.aborted)throw cancelled();}
        this.used+=stat.size;held+=stat.size;
        return readFileSync(file,'utf8');
      })),
      release:()=>{if(released)return;released=true;this.used-=held;held=0;for(const notify of [...this.changes])notify();},
    };
  }
}
