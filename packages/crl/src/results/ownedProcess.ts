// REFACTOR:grounded: every native invocation has an owned lifetime and finite cleanup.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { driverDir } from "./driver";

export interface OwnedProcessOptions {
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}
export interface OwnedProcessResult {
  stdout: string;
  stderr: string;
  status: number | null;
  failure?: "timeout" | "cancelled" | "output-limit" | "spawn-error" | "cleanup-unconfirmed";
  cleanupConfirmed: boolean;
}
export function runOwnedProcess(executable: string, args: readonly string[], options: OwnedProcessOptions): Promise<OwnedProcessResult> {
  if (options.signal?.aborted) return Promise.resolve({stdout:"",stderr:"",status:null,failure:"cancelled",cleanupConfirmed:true});
  const windows = process.platform === "win32", token = randomBytes(16).toString("hex");
  const request = Buffer.from(JSON.stringify({executable,arguments:args,ownerPid:process.pid,deadline:Date.now()+options.timeoutMs,token})).toString("base64");
  const command = windows ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe") : executable;
  const argv = windows ? ["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(driverDir(),"windows-owned-process.ps1"),request] : [...args];
  return new Promise(resolve => {
    let child;
    try { child = spawn(command,argv,{windowsHide:true,detached:!windows,env:options.env,stdio:["pipe","pipe","pipe"]}); }
    catch (error) { resolve({stdout:"",stderr:String(error),status:null,failure:"spawn-error",cleanupConfirmed:true}); return; }
    let stdout=Buffer.alloc(0), stderr=Buffer.alloc(0), totalOut=0, totalErr=0;
    let failure: OwnedProcessResult["failure"], status:number|null=null, done=false, ack:string|undefined;
    let stderrScan="", cleanupTimer:NodeJS.Timeout|undefined, groupPoll:NodeJS.Timeout|undefined;
    const finish = (confirmed:boolean) => {
      if(done) return; done=true; clearTimeout(timer); clearTimeout(cleanupTimer); clearTimeout(groupPoll);
      options.signal?.removeEventListener("abort",cancel);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      const cleanErr=stderr.toString("utf8").replace(new RegExp("\\r?\\n?CRL_JOB_DONE:"+token+":[^\\r\\n]*\\r?\\n?","g"),"");
      resolve({stdout:stdout.toString("utf8"),stderr:cleanErr,status,failure:confirmed?failure:"cleanup-unconfirmed",cleanupConfirmed:confirmed});
    };
    const groupGone = () => {
      if(!child.pid) return true;
      try { process.kill(-child.pid,0); return false; } catch(e) { return (e as NodeJS.ErrnoException).code==="ESRCH"; }
    };
    const stop = (why?:OwnedProcessResult["failure"]) => {
      failure ??= why;
      if(done || cleanupTimer) return;
      if(windows) child.stdin.end("cancel\n");
      else if(child.pid) {
        try { process.kill(-child.pid,"SIGKILL"); } catch(e) {
          if((e as NodeJS.ErrnoException).code!=="ESRCH") { finish(false); return; }
        }
      }
      cleanupTimer=setTimeout(()=>{ child.kill("SIGKILL"); finish(false); },15000);
    };
    const cancel=()=>stop("cancelled");
    const timer=setTimeout(()=>stop("timeout"),options.timeoutMs);
    options.signal?.addEventListener("abort",cancel,{once:true});
    if(options.signal?.aborted) cancel();
    child.stdin.on("error",()=>{ /* wrapper may close input while exiting; close/ack decides */ });
    const capture = (chunk:Buffer, err:boolean) => {
      if(err) {
        stderrScan=(stderrScan+chunk.toString("utf8")).slice(-4096);
        const match=new RegExp("CRL_JOB_DONE:"+token+":(exit|timeout|cancelled|spawn-error):(confirmed|unconfirmed):(\\d+)").exec(stderrScan);
        if(match) { ack=match[2]; status=Number(match[3]); if(match[1]!=="exit") failure ??= match[1] as OwnedProcessResult["failure"]; }
        totalErr+=chunk.length; stderr=Buffer.concat([stderr,chunk]).subarray(-options.maxBytes);
      } else { totalOut+=chunk.length; stdout=Buffer.concat([stdout,chunk]).subarray(-options.maxBytes); }
      if(totalOut>options.maxBytes || totalErr>options.maxBytes) stop("output-limit");
    };
    child.stdout.on("data",(chunk:Buffer)=>capture(chunk,false));
    child.stderr.on("data",(chunk:Buffer)=>capture(chunk,true));
    child.on("error",error=>{ stderr=Buffer.from(String(error)); failure="spawn-error"; finish(true); });
    child.on("exit",code=>{ if(!windows) {status=code; stop();} });
    const confirmGroup = () => {
      if (done) return;
      if (groupGone()) finish(true);
      else groupPoll = setTimeout(confirmGroup, 20);
    };
    child.on("close",code=>{
      if(!windows) {status=code; confirmGroup();}
      else { if(!ack) status=code; finish(ack==="confirmed"); }
    });
  });
}
