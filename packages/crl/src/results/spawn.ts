/**
 * ⭐⭐ THE JVM SPAWN CONTRACT for result producers.
 *
 * `$apply` and `$evaluate-measure` run on the cqf engine, which is Java. Nothing here runs Java in-process:
 * this module decides HOW a child is launched and bounded, and every decision below exists because of a
 * measured failure rather than a preference.
 *
 * ⚠ AN UNBOUNDED RUN OF THIS CRASHED VS CODE AND THE MACHINE. That is the recorded local measurement, and
 * it is why bounding is part of the contract rather than an option a caller may omit.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The engine entry point. ⚠ `applyR5` ONLY — the R4 processor re-opens the null-behaviour findings. */
export const APPLY_OPERATION = "applyR5" as const;

export interface JvmBounds {
  /** Max heap. A cap is mandatory: the crash that motivated this contract was an unbounded heap. */
  maxHeapMb: number;
  /**
   * WHOLE-BATCH wall timeout in ms.
   *
   * ⚠ THERE IS DELIBERATELY NO PER-CASE TIMEOUT. A hung case cannot be reliably interrupted inside a
   * shared JVM — `Future.cancel` does not stop CQL/HAPI computation — so process-tree kill is the only
   * real enforcement, and it necessarily takes the rest of the batch with it. Pretending to offer a
   * per-case timeout would be a contract we cannot honour; the manifest expresses the consequence
   * instead (`timeout` for the offender, `not-run` for everything unreached).
   */
  batchTimeoutMs: number;
  /** Max bytes retained from each of stdout/stderr. Beyond this the TAIL is kept — errors land last. */
  maxCapturedBytes: number;
}

export const DEFAULT_BOUNDS: JvmBounds = {
  maxHeapMb: 1024,
  batchTimeoutMs: 10 * 60 * 1000,
  maxCapturedBytes: 1 << 20,
};

/**
 * The JVM flags for a bounded run.
 *
 * `ExitOnOutOfMemoryError` matters more than the heap cap: without it a JVM at its ceiling thrashes GC
 * indefinitely and looks like a hang, so the batch timeout is the only thing that ends it — a ten-minute
 * stall instead of a fast, legible failure.
 */
export const jvmFlags = (b: JvmBounds): string[] => [
  `-Xmx${b.maxHeapMb}m`,
  "-XX:+ExitOnOutOfMemoryError",
  // Headless: the engine pulls in AWT-touching transitive deps; a stray window on a KE's machine is a bug.
  "-Djava.awt.headless=true",
];

/**
 * ⚠ RETRIEVE SETTINGS. Without in-memory filtering, valueset retrieves die against a repository built
 * from files. This is a measured trap from the working recipe, not a tuning knob.
 */
export const RETRIEVE_SETTINGS = "FILTER_IN_MEMORY" as const;

/**
 * ⭐ MEASURED, not guessed: every class in `cqf-fhir-cr-cli-4.7.0.jar` is class-file major 61 = Java 17.
 * The KE's working runs were on JDK 23, so 17 is the conservative floor. A JDK below this fails with
 * `UnsupportedClassVersionError` deep inside the engine, which reads as a mysterious producer crash.
 */
export const MIN_JAVA_MAJOR = 17;

export type JavaResolution =
  | { ok: true; javaExe: string; source: "JAVA_HOME" | "PATH"; major: number }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "too-old"; javaExe: string; major: number; required: number };

/**
 * Parse `java -version` output into a major version.
 *
 * ⚠ `java -version` WRITES TO STDERR, not stdout — a probe that captures only stdout gets an empty
 * string and every JDK on the machine looks absent. That is not a hypothetical: the first check written
 * against this function made exactly that mistake and reported `not-found` on a box with JDK 23 on PATH.
 * A caller MUST concatenate stderr (and may add stdout).
 */
export function parseJavaMajor(versionOutput: string): number | undefined {
  // `"23.0.1"` / `"17.0.9"` / legacy `"1.8.0_392"`.
  const m = /version "(\d+)(?:\.(\d+))?/.exec(versionOutput);
  if (!m) return undefined;
  const first = Number(m[1]);
  return first === 1 ? Number(m[2]) : first;
}

/**
 * Find a USABLE JAVA RUNTIME. JAVA_HOME first, then PATH — deliberately NOT the Windows registry or
 * common-directory scanning. For a default-off tool a KE opts into, a loud refusal beats a filesystem
 * crawl that can pick a runtime below the floor.
 *
 * ⚠ A JRE IS ENOUGH — do not re-derive a JDK requirement from an older comment. The driver ships
 * COMPILED and the engine runs unextracted through Spring Boot's PropertiesLauncher, so neither
 * `javac` nor `jar` is needed at runtime. Requiring a JDK is what made this tool unusable in
 * 4.114.0; on Windows `java` commonly resolves to the Oracle javapath shim, which has no `jar` at all.
 *
 * ⚠ EXISTENCE IS NOT ENOUGH, and this was a real defect here rather than a hypothetical. On the machine
 * this was written, `java` on PATH was 23 while `JAVA_HOME` still pointed at a JDK 11 from an old
 * install. An earlier cut of this function checked only that the executable existed, so it preferred
 * JAVA_HOME and would have handed the engine a runtime that cannot load its classes — surfacing as
 * `UnsupportedClassVersionError` from inside cqf, nowhere near the cause. A stale JAVA_HOME is the
 * COMMON case, not an edge one.
 *
 * So: probe each candidate and take the first that SATISFIES the minimum. Report a too-old runtime by name
 * and version rather than falling through silently, because "no Java found" would be a lie that sends a
 * KE to install a second copy.
 */
export function resolveJava(
  env: NodeJS.ProcessEnv,
  isWindows: boolean,
  probe: (javaExe: string) => string | undefined,
): JavaResolution {
  const exe = isWindows ? "java.exe" : "java";
  const candidates: { javaExe: string; source: "JAVA_HOME" | "PATH" }[] = [];
  const home = env.JAVA_HOME?.trim();
  if (home) {
    const c = path.join(home, "bin", exe);
    if (existsSync(c)) candidates.push({ javaExe: c, source: "JAVA_HOME" });
  }
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const c = path.join(dir, exe);
    if (existsSync(c)) candidates.push({ javaExe: c, source: "PATH" });
  }
  let tooOld: { javaExe: string; major: number } | undefined;
  for (const c of candidates) {
    const major = parseJavaMajor(probe(c.javaExe) ?? "");
    if (major === undefined) continue;
    if (major >= MIN_JAVA_MAJOR) return { ok: true, ...c, major };
    tooOld ??= { javaExe: c.javaExe, major };
  }
  if (tooOld) return { ok: false, reason: "too-old", ...tooOld, required: MIN_JAVA_MAJOR };
  return { ok: false, reason: "not-found" };
}

/**
 * The launcher entry `driverArgs` names. Its PACKAGE MOVED in Spring Boot 3.2
 * (`org.springframework.boot.loader` → `…loader.launch`), so a jar built against an older Boot has no
 * such class — and the JVM reports that as `Could not find or load main class …`, exit 1, which
 * `classify` would otherwise render as a bare "driver exited 1" for every case with no cause named.
 */
/**
 * ⭐ WHERE THE ENGINE JAR COMES FROM — CARRIED IN THE REFUSAL, NOT LEFT TO THE READER.
 *
 * `emit_results` verifies a jar it never told anyone how to obtain. The IEHP KE hit the
 * launcher refusal, had no fat jar, and found exactly ONE copy on their machine: OUR repository’s
 * `tmp/`. Their working configuration was reaching across the filesystem into another team’s checkout,
 * which is a coincidence of that workstation, not a dependency — on any machine that does not also
 * host this repo the tool could not run at all.
 *
 * A gate that knows the input is wrong and cannot say what right looks like is half a feature.
 *
 * ⚠ `cqf-fhir-cr` AND `cqf-fhir-cr-cli` ARE DIFFERENT ARTIFACTS. Only the `-cli` one is the Spring
 * Boot fat jar carrying PropertiesLauncher; the plain library jar fails the launcher check. That is the
 * exact wrong turn taken in the field, so the coordinates below are spelled out rather than described.
 *
 * VERIFIED 2026-09-04: fetched Maven Central’s published `.sha1` and compared it against the local copy
 * that produced a 44-case run — identical, with Content-Length matching to the byte.
 */
export const ENGINE_JAR_SOURCE = {
  coordinates: "org.opencds.cqf.fhir:cqf-fhir-cr-cli:4.7.0",
  url: "https://repo1.maven.org/maven2/org/opencds/cqf/fhir/cqf-fhir-cr-cli/4.7.0/cqf-fhir-cr-cli-4.7.0.jar",
  sha256: "10e6ae4e0846671bdfb8005fd577e9c195c7e9896bbd21342002eecd055e6ae0",
  /** Where Maven would put it if anything on this machine has ever resolved the coordinates. */
  mavenLocalPath: "org/opencds/cqf/fhir/cqf-fhir-cr-cli/4.7.0/cqf-fhir-cr-cli-4.7.0.jar",
} as const;

/**
 * The jar this build expects, if it is already in the local Maven repository.
 *
 * ⚠ A DEFAULT, NOT A SEARCH. One deterministic location that Maven itself defines — no filesystem
 * crawl, no guessing. It is `undefined` when the file is not there, and the caller then refuses with
 * the URL rather than hunting.
 */
export function defaultEngineJarPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) return undefined;
  const candidate = path.join(home, ".m2", "repository", ...ENGINE_JAR_SOURCE.mavenLocalPath.split("/"));
  return existsSync(candidate) ? candidate : undefined;
}

/** The jar source, formatted for an error message a human has to act on. */
export function engineJarHelp(): string[] {
  return [
    `download: ${ENGINE_JAR_SOURCE.url}`,
    `sha256:   ${ENGINE_JAR_SOURCE.sha256}  (the default — you only pass it to pin something else)`,
    `maven:    ${ENGINE_JAR_SOURCE.coordinates}`,
    `or drop it at: <home>/.m2/repository/${ENGINE_JAR_SOURCE.mavenLocalPath} and omit jarPath entirely`,
    "⚠ it must be the -cli artifact: the plain cqf-fhir-cr jar is not a Spring Boot fat jar and will not launch",
  ];
}

/**
 * ⭐ THE ONE-LINE FETCH. Printed when the jar cannot be found, because "here is a URL" still leaves a
 * person composing a command, and the whole finding was that we made them compose too much.
 */
export function engineJarFetchCommand(): string {
  return (
    `curl -fL --create-dirs -o "$HOME/.m2/repository/${ENGINE_JAR_SOURCE.mavenLocalPath}" ` +
    `"${ENGINE_JAR_SOURCE.url}"`
  );
}

export const LAUNCHER_ENTRY = "org/springframework/boot/loader/launch/PropertiesLauncher.class";

export type JarVerification =
  | { ok: true; sha256: string; hasLauncher: boolean }
  | { ok: false; reason: "missing" | "not-a-file" | "sha-mismatch"; actualSha256?: string };

/**
 * Verify the producer jar BEFORE EVERY LAUNCH, not once at download.
 *
 * ⚠ An atomic download-then-rename prevents a TRUNCATED jar masquerading as complete. It does not
 * prevent a wrong or substituted one, and it says nothing about a file that changed after it landed.
 * Hashing at launch is what makes "the jar we tested" and "the jar we ran" the same claim.
 */
export function verifyJar(jarPath: string, expectedSha256: string): JarVerification {
  if (!existsSync(jarPath)) return { ok: false, reason: "missing" };
  if (!statSync(jarPath).isFile()) return { ok: false, reason: "not-a-file" };
  const buf = readFileSync(jarPath);
  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    return { ok: false, reason: "sha-mismatch", actualSha256: actual };
  }
  // ⚠ SAME READ. The buffer is already here and the jar is 216 MB; scanning it for the launcher entry
  // costs nothing, while reading the file twice to answer a second question about it costs a lot.
  // A zip stores entry names uncompressed in both the local header and the central directory, so a
  // plain substring search answers "is this class in the archive" without a zip reader.
  return { ok: true, sha256: actual, hasLauncher: buf.includes(LAUNCHER_ENTRY) };
}

/**
 * The kill command for a JVM that must die.
 *
 * ⚠ ON WINDOWS A BARE `kill()` ORPHANS THE CHILD'S CHILDREN. The engine spawns helpers; killing only the
 * direct child leaves a JVM holding memory with nothing supervising it — which is the crash scenario
 * again, minus the process that would have reported it. `/T` is the tree.
 */
export const killTreeCommand = (
  pid: number,
  isWindows: boolean,
): { cmd: string; args: string[] } =>
  isWindows
    ? { cmd: "taskkill", args: ["/pid", String(pid), "/T", "/F"] }
    : { cmd: "kill", args: ["-KILL", String(-pid)] };

/**
 * Keep the TAIL of a stream, not the head.
 *
 * A truncated-from-the-front capture loses the stack trace and keeps the banner — exactly backwards for
 * diagnosis, since the interesting output of a failing run is last.
 */
export function capTail(chunks: readonly Buffer[], maxBytes: number): string {
  const all = Buffer.concat(chunks as Buffer[]);
  if (all.length <= maxBytes) return all.toString("utf8");
  return `…[${all.length - maxBytes} bytes elided]…\n${all.subarray(all.length - maxBytes).toString("utf8")}`;
}

/**
 * ⚠ SINGLE-FLIGHT. A second concurrent run must REFUSE, not queue.
 *
 * Two JVMs at the heap cap is twice the ceiling that already crashed a machine, and an MCP caller can
 * invoke a tool repeatedly with no natural backpressure. Refusing is legible; a queue silently converts
 * impatience into memory pressure.
 */
export class SingleFlight {
  private held = false;
  tryAcquire(): boolean {
    if (this.held) return false;
    this.held = true;
    return true;
  }
  /** ⚠ Release only after the process tree is CONFIRMED dead — not when the timeout merely fired. */
  release(): void {
    this.held = false;
  }
  get busy(): boolean {
    return this.held;
  }
}

/**
 * The working directory for a run. NEVER inside `packages/**`: sibling sessions share this working tree,
 * and scratch under a package pollutes their test gate.
 */
export function assertSafeWorkingDir(dir: string, repoRoot: string): void {
  const rel = path.relative(repoRoot, path.resolve(dir));
  if (!rel.startsWith("..") && rel.split(path.sep)[0] === "packages") {
    throw new Error(
      `Refusing to run a producer inside packages/ ("${dir}") — scratch there pollutes other sessions' test gate.`,
    );
  }
}
