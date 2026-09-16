import { expect, it, vi } from "vitest";
const native=vi.hoisted(()=>vi.fn());
vi.mock("../ownedProcess",()=>({runOwnedProcess:native}));
import { runtimeFingerprint } from "../runtimeFingerprint";
import { DEFAULT_BOUNDS } from "../spawn";
const reply=(zone="UTC")=>({stdout:"CRL_RUNTIME_INFO:"+["23","23.0.1","Vendor","VM",zone,zone,"en-US","en-US","en-US"].map(s=>Buffer.from(s).toString("base64")).join(".")+"\n",stderr:"",status:0,cleanupConfirmed:true});
// @kit produce-results:runtime-compatibility
it("fingerprints effective Java defaults while allowing operational timeout increases",async()=>{
 native.mockResolvedValue(reply());
 const a=await runtimeFingerprint("java","engine.jar",DEFAULT_BOUNDS);
 const b=await runtimeFingerprint("java","engine.jar",{...DEFAULT_BOUNDS,batchTimeoutMs:900000});
 expect(a.sha256).toBeTruthy();expect(a.sha256).toBe(b.sha256);
 native.mockResolvedValue(reply("America/New_York"));
 const c=await runtimeFingerprint("java","engine.jar",DEFAULT_BOUNDS);expect(c.sha256).not.toBe(a.sha256);
 expect(native.mock.calls[0][1]).toContain("-Djava.awt.headless=true");
 expect(native.mock.calls[0][1]).toContain("--runtime-info");
});
it.each([{...reply(),stdout:"broken"},{...reply(),failure:"timeout"},{...reply(),cleanupConfirmed:false,failure:"cleanup-unconfirmed"}])("does not fall back after an invalid runtime probe",async result=>{
 native.mockResolvedValue(result);
 const r=await runtimeFingerprint("java","engine.jar",DEFAULT_BOUNDS);
 expect(r.sha256).toBeUndefined();expect(r.cleanupConfirmed).toBe(result.cleanupConfirmed);
});
