import { afterEach, expect, it, vi } from "vitest";
const shutdown=vi.hoisted(()=>vi.fn());
vi.mock("../../results/produce",()=>({shutdownProducer:shutdown}));
import { installNativeSignals } from "../nativeSignals";
afterEach(()=>vi.restoreAllMocks());
it.each(["SIGINT","SIGTERM"] as const)("waits for cleanup before exiting on %s",async(signal)=>{
  let release!:()=>void;
  shutdown.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
  const handlers:Record<string,()=>void>={};
  vi.spyOn(process,"on").mockImplementation(((event:string,handler:()=>void)=>{handlers[event]=handler;return process;}) as any);
  const exit=vi.spyOn(process,"exit").mockImplementation((()=>undefined) as never);
  shutdown.mockClear();
  const lifecycle=installNativeSignals();handlers[signal]();handlers[signal]();
  expect(shutdown).toHaveBeenCalledTimes(1);
  expect(lifecycle.interrupted).toBe(true);expect(exit).not.toHaveBeenCalled();
  release();await vi.waitFor(()=>expect(exit).toHaveBeenCalledWith(signal==="SIGINT"?130:143));
});
