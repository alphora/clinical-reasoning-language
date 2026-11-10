// REFACTOR:grounded: context probes and batches select the same pinned bounded runtime.
import {driverReady} from './driver';
import {DEFAULT_BOUNDS,ENGINE_JAR_SOURCE,LAUNCHER_ENTRY,MIN_JAVA_MAJOR,defaultEngineJarPath,engineJarFetchCommand,engineJarHelp,resolveJavaAsync,verifyJar,type JvmBounds} from './spawn';
import {runNativeProcess,nativeQuarantined,reportNativeCleanup} from './nativeProcess';
import {checkNativeAdmission,type NativeMode,type NativeSpec} from './nativeWorker';
export interface NativePreparationOptions {jarPath?:string;jarSha256?:string;bounds:JvmBounds;signal?:AbortSignal;nativeMode?:NativeMode}
export async function prepareNativeRuntime(req:NativePreparationOptions) {
  const environment={...process.env};
  const jarPath = req.jarPath ?? defaultEngineJarPath(environment);
  if (!jarPath) {
    return {
      ok: false as const,
      reason: "no engine jar: none was given and none is in the CRL engine cache",
      detail: [...engineJarHelp(), "", "fetch it with:", `  ${engineJarFetchCommand()}`],
    };
  }
  const jarCheck = verifyJar(jarPath, req.jarSha256 ?? ENGINE_JAR_SOURCE.sha256);
  if (!jarCheck.ok) {
    return {
      ok: false as const,
      reason: `engine jar unusable (${jarCheck.reason})`,
      detail: [
        ...(jarCheck.reason === "sha-mismatch" ? [`actual sha256: ${jarCheck.actualSha256}`] : []),
        ...engineJarHelp(),
      ],
    };
  }

  // ⚠ PRECONDITIONS BELONG HERE, NOT IN THE PER-CASE LOOP. A missing driver or a launcher-less jar
  // is one fact about the run, not N facts about N cases: checked per-case it yields a manifest of N
  // identical `failed` entries and an `ok: true` envelope, which reads as "the policy produced
  // nothing" rather than "we could not start". That mistranslation is the exact shape this file
  // exists to prevent.
  if (!jarCheck.hasLauncher) {
    return {
      ok: false as const,
      reason: "engine jar has no Spring Boot PropertiesLauncher — it is not a supported engine build",
      detail: [
        `expected the zip entry ${LAUNCHER_ENTRY}`,
        "that package moved in Spring Boot 3.2; a jar built against an older Boot will not launch this way",
        ...engineJarHelp(),
      ],
    };
  }

  const driver = driverReady();
  if (!driver.ok) {
    return {
      ok: false as const,
      reason: `the compiled driver did not ship (${driver.reason})`,
      detail: [`expected at ${driver.expectedAt}`, ...(driver.detail ?? [])],
    };
  }

  // ⚠ The verified jar IS the jar executed — it goes on `-cp` directly. The classpath-containment
  // check this replaces existed only because the user supplied a separate classpath that need not
  // have contained it, which made `producerJarSha256` a claim about an artifact that never ran.
  checkNativeAdmission((req.bounds??DEFAULT_BOUNDS).maxHeapMb);
  const probe = async (exe: string): Promise<string | undefined> => {
    if (req.signal?.aborted || nativeQuarantined()) return undefined;
    const result = await runNativeProcess(exe, ["-version"], { timeoutMs: 15000, maxBytes: 65536, signal: req.signal,env:environment });
    if (!result.cleanupConfirmed) reportNativeCleanup(false);
    return result.failure || result.status !== 0 ? undefined : result.stderr + result.stdout;
  };
  const java = await resolveJavaAsync(environment, process.platform === "win32", probe);
  if (nativeQuarantined()) return { ok: false as const, reason: "Java discovery cleanup could not be confirmed; native execution stopped." };
  if (req.signal?.aborted) return { ok: false as const, reason: "Native production cancelled during Java discovery." };
  if (!java.ok) {
    return {
      ok: false as const,
      reason: java.reason === "too-old" ? `Java too old (${java.major}); need ${MIN_JAVA_MAJOR}+ (a JRE is enough)` : "no usable Java runtime found",
    };
  }

  const spec:NativeSpec={javaExe:java.javaExe,engineJarPath:jarPath,engineSha256:jarCheck.sha256,bounds:req.bounds,signal:req.signal,nativeMode:req.nativeMode,env:environment};
  return {ok:true as const,java,jarPath,jarSha256:jarCheck.sha256,environment,spec};
}
export type PreparedNativeRuntime=Extract<Awaited<ReturnType<typeof prepareNativeRuntime>>,{ok:true}>;
