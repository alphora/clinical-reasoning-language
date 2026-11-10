// REFACTOR:grounded: a trusted immutable installation binds this process lifetime, not later disk labels.
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {driverDir} from './driver';

export const processInstanceId=randomUUID();
export const fileSha256=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function runtimeFileIdentities():Record<string,string>{
  const files=[...readdirSync(__dirname).filter(n=>n.endsWith('.js')).map(n=>path.join(__dirname,n)),
    ...['ApplyDriver.class','ApplyWorker.class','windows-owned-process.ps1'].map(n=>path.join(driverDir(),n))];
  if(process.argv[1]&&existsSync(process.argv[1]))files.push(path.resolve(process.argv[1]));
  return Object.fromEntries([...new Set(files)].sort().map(file=>[file,fileSha256(file)]));
}
// Loading nonnative tools remains available when optional native files are missing.
const startup=(()=>{try{const files=runtimeFileIdentities();return {sha256:hash(files),error:undefined};}
  catch(error){return {sha256:undefined,error:String(error)};}})();
export const startupFilesSha256=startup.sha256;
export function assertRuntimeCodeUnchanged():Record<string,string>{
  if(startup.error)throw new Error('Cannot establish startup runtime identity; restart after repairing the installation: '+startup.error);
  const current=runtimeFileIdentities();
  if(hash(current)!==startupFilesSha256)throw new Error('Runtime files changed after this process started; restart the verified MCP process.');
  return current;
}
