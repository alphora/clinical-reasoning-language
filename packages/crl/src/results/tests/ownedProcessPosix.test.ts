import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const state=vi.hoisted(()=>({child:undefined as any}));
vi.mock("node:child_process",()=>({spawn:()=>state.child}));
import { runOwnedProcess } from "../ownedProcess";
const platform=Object.getOwnPropertyDescriptor(process,"platform")!;
afterEach(()=>{Object.defineProperty(process,"platform",platform);vi.restoreAllMocks();vi.useRealTimers();});
it("waits for a terminating POSIX group during the existing cleanup grace",async()=>{
  Object.defineProperty(process,"platform",{value:"linux"});vi.useFakeTimers();
  const child=Object.assign(new EventEmitter(),{pid:12345,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});state.child=child;
  let exists=true;
  const kill=vi.spyOn(process,"kill").mockImplementation((_pid,signal)=>{
    if(signal===0 && !exists) throw Object.assign(new Error("gone"),{code:"ESRCH"});
    return true;
  });
  let completed=false;
  const work=runOwnedProcess("/node",[],{timeoutMs:1000,maxBytes:1024}).then(r=>{completed=true;return r;});
  child.emit("exit",0);child.emit("close",0);
  await vi.advanceTimersByTimeAsync(100);expect(completed).toBe(false);
  expect(kill).toHaveBeenCalledWith(-12345,"SIGKILL");
  exists=false;await vi.advanceTimersByTimeAsync(20);
  expect(await work).toMatchObject({status:0,cleanupConfirmed:true});expect(vi.getTimerCount()).toBe(0);
});
it("reports uncertainty only after the POSIX cleanup grace expires",async()=>{
  Object.defineProperty(process,"platform",{value:"linux"});vi.useFakeTimers();
  const child=Object.assign(new EventEmitter(),{pid:12345,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});state.child=child;
  vi.spyOn(process,"kill").mockReturnValue(true);
  const work=runOwnedProcess("/node",[],{timeoutMs:1000,maxBytes:1024});
  child.emit("exit",0);child.emit("close",0);
  await vi.advanceTimersByTimeAsync(15000);
  expect(await work).toMatchObject({failure:"cleanup-unconfirmed",cleanupConfirmed:false});expect(vi.getTimerCount()).toBe(0);
});
