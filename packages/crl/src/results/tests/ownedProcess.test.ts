import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { runOwnedProcess } from "../ownedProcess";
const roots: string[] = [];
const sleep = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
const alive = (pid:number) => { try { process.kill(pid,0); return true; } catch { return false; } };
afterEach(()=>{for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true});});
function fixture() { const dir=mkdtempSync(path.join(tmpdir(),"crl-owned-")); roots.push(dir); return dir; }
async function waitFor(file:string) { for(let n=0;n<200&&!existsSync(file);n++) await sleep(50); expect(existsSync(file)).toBe(true); }
describe("owned native processes",()=>{
  it("preserves argv quoting and UTF-8 raw output",async()=>{
    const args=["space here",'a"b',"tail\\",String.fromCodePoint(0x65e5,0x672c,0x1fa7a)];
    const r=await runOwnedProcess(process.execPath,["-e","process.stdout.write(JSON.stringify(process.argv.slice(1)))",...args],{timeoutMs:15000,maxBytes:65536});
    expect(r,{cause:r.stderr}).toMatchObject({status:0,cleanupConfirmed:true});
    expect(r.failure).toBeUndefined(); expect(JSON.parse(r.stdout)).toEqual(args);
  },20000);
  it.each([false,true])("kills launcher and descendant, even without inherited pipes (%s)",async(ignore)=>{
    const dir=fixture(), pids=path.join(dir,"pids.json");
    const code="const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:"+JSON.stringify(ignore?"ignore":"inherit")+"});require('node:fs').writeFileSync("+JSON.stringify(pids)+",JSON.stringify([process.pid,c.pid]));setInterval(()=>{},1000);";
    const sentinel=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true});
    try {
      // Allow the Windows PowerShell wrapper to compile before exercising descendant timeout cleanup.
      const r=await runOwnedProcess(process.execPath,["-e",code],{timeoutMs:15000,maxBytes:65536});
      expect(r).toMatchObject({failure:"timeout",cleanupConfirmed:true});
      const owned=JSON.parse(readFileSync(pids,"utf8")) as number[];
      for(let i=0;i<50&&owned.some(alive);i++) await sleep(20);
      expect(owned.map(alive)).toEqual([false,false]); expect(alive(sentinel.pid!)).toBe(true);
    } finally { sentinel.kill("SIGKILL"); }
  },35000);
  it("cleans a descendant after its launcher exits normally",async()=>{
    const pids=path.join(fixture(),"pids.json");
    const code="const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync("+JSON.stringify(pids)+",JSON.stringify([process.pid,c.pid]));process.exit(0);";
    const r=await runOwnedProcess(process.execPath,["-e",code],{timeoutMs:15000,maxBytes:65536});
    expect(r).toMatchObject({status:0,cleanupConfirmed:true}); expect(r.failure).toBeUndefined();
    const p=JSON.parse(readFileSync(pids,"utf8")) as number[];
    for(let i=0;i<50&&p.some(alive);i++) await sleep(20);
    expect(p.map(alive)).toEqual([false,false]);
  },20000);
  it("cancels an active invocation and confirms cleanup",async()=>{
    const file=path.join(fixture(),"pid"),controller=new AbortController();
    const code="require('node:fs').writeFileSync("+JSON.stringify(file)+",String(process.pid));setInterval(()=>{},1000)";
    const work=runOwnedProcess(process.execPath,["-e",code],{timeoutMs:20000,maxBytes:65536,signal:controller.signal});
    await waitFor(file);controller.abort();const r=await work;
    expect(r).toMatchObject({failure:"cancelled",cleanupConfirmed:true}); expect(alive(Number(readFileSync(file,"utf8")))).toBe(false);
  },25000);
  it("reports output overflow instead of accepting a truncated result",async()=>{
    const r=await runOwnedProcess(process.execPath,["-e","process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)"],{timeoutMs:15000,maxBytes:4096});
    expect(r).toMatchObject({failure:"output-limit",cleanupConfirmed:true});expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(4096);
  },20000);
  it("refuses a missing executable without leaving a process",async()=>{
    const r=await runOwnedProcess(path.join(fixture(),"not-a-program"),[],{timeoutMs:15000,maxBytes:65536});
    expect(r).toMatchObject({failure:"spawn-error",cleanupConfirmed:true});
  },20000);

  it.runIf(process.platform === "win32")("cleans descendants after abrupt Node owner loss",async()=>{
    const dir=fixture(), childPidFile=path.join(dir,"child.pid"), wrapperPidFile=path.join(dir,"wrapper.pid");
    const script=path.resolve(__dirname,"../driver/windows-owned-process.ps1");
    const payload={executable:process.execPath,arguments:["-e","require('node:fs').writeFileSync("+JSON.stringify(childPidFile)+",String(process.pid));setInterval(()=>{},1000)"],deadline:Date.now()+20000,token:"owner-loss-test"};
    const code="const req="+JSON.stringify(payload)+";req.ownerPid=process.pid;const c=require('node:child_process').spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',"+JSON.stringify(script)+",Buffer.from(JSON.stringify(req)).toString('base64')],{stdio:['pipe','ignore','ignore'],windowsHide:true});require('node:fs').writeFileSync("+JSON.stringify(wrapperPidFile)+",String(c.pid));setInterval(()=>{},1000);";
    const owner=spawn(process.execPath,["-e",code],{stdio:"ignore",windowsHide:true});
    try {
      await waitFor(childPidFile); const pid=Number(readFileSync(childPidFile,"utf8"));
      owner.kill("SIGKILL");
      for(let i=0;i<200&&alive(pid);i++) await sleep(50);
      expect(alive(pid)).toBe(false);
    } finally {
      if(owner.exitCode===null) owner.kill("SIGKILL");
      if(existsSync(wrapperPidFile)) { const pid=Number(readFileSync(wrapperPidFile,"utf8")); if(alive(pid)) process.kill(pid,"SIGKILL"); }
    }
  },25000);
  it("cancels during wrapper startup without launching the target",async()=>{
    const file=path.join(fixture(),"must-not-exist"),controller=new AbortController();
    const work=runOwnedProcess(process.execPath,["-e","require('node:fs').writeFileSync("+JSON.stringify(file)+",'unexpected')"],{timeoutMs:15000,maxBytes:65536,signal:controller.signal});
    controller.abort(); expect(await work).toMatchObject({failure:"cancelled",cleanupConfirmed:true});expect(existsSync(file)).toBe(false);
  },20000);
  it("does not launch after pre-cancellation",async()=>{
    const controller=new AbortController(); controller.abort();
    const r=await runOwnedProcess(process.execPath,["-e","throw Error('must not start')"],{timeoutMs:1000,maxBytes:1024,signal:controller.signal});
    expect(r).toMatchObject({failure:"cancelled",cleanupConfirmed:true});
  });
});
