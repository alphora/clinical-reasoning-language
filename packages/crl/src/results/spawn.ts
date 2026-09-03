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

export type JavaResolution =
  | { ok: true; javaExe: string; source: "JAVA_HOME" | "PATH" }
  | { ok: false; reason: "not-found" };

/**
 * Find a JDK. JAVA_HOME first, then PATH — deliberately NOT the Windows registry or common-directory
 * scanning. For a default-off tool a KE opts into, a loud "set JAVA_HOME" beats a filesystem crawl that
 * can pick a JRE the engine cannot use.
 */
export function resolveJava(env: NodeJS.ProcessEnv, isWindows: boolean): JavaResolution {
  const exe = isWindows ? "java.exe" : "java";
  const home = env.JAVA_HOME?.trim();
  if (home) {
    const candidate = path.join(home, "bin", exe);
    if (existsSync(candidate)) return { ok: true, javaExe: candidate, source: "JAVA_HOME" };
  }
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, exe);
    if (existsSync(candidate)) return { ok: true, javaExe: candidate, source: "PATH" };
  }
  return { ok: false, reason: "not-found" };
}

export type JarVerification =
  | { ok: true; sha256: string }
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
  const actual = createHash("sha256").update(readFileSync(jarPath)).digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    return { ok: false, reason: "sha-mismatch", actualSha256: actual };
  }
  return { ok: true, sha256: actual };
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
