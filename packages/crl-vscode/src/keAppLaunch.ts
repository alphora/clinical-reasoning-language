import {existsSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {kelpArtifactRoot} from './kelpEditScopes';

export type KeLaunchTarget={kind:'none'}|{kind:'artifact';root:string}|{kind:'error';detail:string};
/** One entity-folder URI; lexical ancestors support folders not created yet. */
export function resolveKeLaunchTarget(arg:unknown):KeLaunchTarget {
  if(arg===undefined || arg===null)return {kind:'none'};
  let raw:unknown=arg;
  if(typeof arg==='object' && arg!==null && 'scheme' in arg){
    const uri=arg as {scheme:unknown;fsPath:unknown};if(uri.scheme!=='file')return {kind:'error',detail:'KE requires a local file URI.'};raw=uri.fsPath;
  }
  if(typeof raw!=='string' || !raw.trim() || !isAbsolute(raw))return {kind:'error',detail:'KE requires an absolute artifact or entity-folder path.'};
  const path=resolve(raw);let dir=path,nearest:string|undefined;
  for(;;){
    if(!nearest && existsSync(join(dir,'package.json')))nearest=dir;
    if(existsSync(join(dir,'kelp.project.json'))){
      try{return {kind:'artifact',root:kelpArtifactRoot(path,join(dir,'kelp.project.json'))};}
      catch(error){return {kind:'error',detail:String(error instanceof Error?error.message:error)};}
    }
    const parent=dirname(dir);if(parent===dir)break;dir=parent;
  }
  if(nearest && existsSync(join(nearest,'src')))return {kind:'artifact',root:nearest};
  return {kind:'error',detail:`No artifact package with src/ found near ${path}.`};
}
