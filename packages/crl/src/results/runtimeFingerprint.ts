import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { driverArgs, driverDir } from "./driver";
import { jvmFlags, type JvmBounds } from "./spawn";
import { runNativeProcess } from "./nativeProcess";
import type {NativeRuntime} from './nativeWorker';

export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileDigest = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Probe effective Java defaults through precisely the same launcher as execution. */
export async function runtimeFingerprint(javaExe: string, engineJarPath: string, bounds: JvmBounds, signal?: AbortSignal, env: NodeJS.ProcessEnv = process.env, runtime?:NativeRuntime):
Promise<{ sha256?: string; cleanupConfirmed: boolean; reason?: string }> {
  const args = driverArgs({ jvmFlags: jvmFlags(bounds), engineJarPath, loaderPath: driverDir(),
    repoPath: "--runtime-info", planDefinitionId: "-", subjectReference: "-" });
  // REFACTOR:grounded: borrow actual reserved-worker identity; isolated mode retains its probe.
  const probe = runtime?.runtimeInfo ? {stdout:runtime.runtimeInfo,cleanupConfirmed:true,status:0,failure:undefined} : await runNativeProcess(javaExe, args, { timeoutMs: 30000, maxBytes: 65536, signal, env });
  const line = probe.stdout.split(/\r?\n/).find(s => s.startsWith("CRL_RUNTIME_INFO:"));
  const fields = line?.slice("CRL_RUNTIME_INFO:".length).split(".");
  if (!probe.cleanupConfirmed || probe.failure || probe.status !== 0 || fields?.length !== 9 || fields.some(s => !/^[A-Za-z0-9+/]*={0,2}$/.test(s))) {
    return { cleanupConfirmed: probe.cleanupConfirmed, reason: "Cannot fingerprint the effective Java runtime; retry compatibility is unavailable." };
  }
  const environment = Object.fromEntries(Object.entries(env).filter(([key]) =>
    /^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS|CLASSPATH|TZ|LANG|LC_.*|LOADER_.*|SPRING_.*)$/i.test(key)).sort(([a],[b]) => a.localeCompare(b)));
  // In the extension bundle __dirname contains the staged bundle; in core it contains producer modules.
  const code = readdirSync(__dirname).filter(name => name.endsWith(".js")).sort().map(name => [name,fileDigest(path.join(__dirname,name))]);
  const shipped = ["ApplyDriver.class", "ApplyWorker.class", "windows-owned-process.ps1"].map(name => [name,fileDigest(path.join(driverDir(),name))]);
  return { cleanupConfirmed: true, sha256: digest({ fields, environment, code, shipped }) };
}
