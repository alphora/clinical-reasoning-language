/**
 * ⭐⭐ RUNNING THE ENGINE NEEDS `java` AND NOTHING ELSE.
 *
 * ⚠ WHAT THIS REPLACES. `emit_results` 4.114.0 asked a knowledge engineer to find a 216 MB jar, hash it,
 * extract its 131 nested libraries, hand-type a classpath (`…\out;…\lib\*`) with a platform separator and
 * a JDK wildcard, `setx` it into the environment, and restart the client — six manual steps to run a tool
 * whose whole purpose is removing manual steps. Every one was something we could do and they could get
 * wrong.
 *
 * Two of the three tools that design required were consequences of MY choices, not the engine's:
 *
 *   java   runs the engine. Unavoidable — `$apply` is Java.
 *   javac  compiled the driver on demand. Avoided by SHIPPING the compiled class.
 *   jar    unpacked the fat jar into a classpath. Avoided by Spring Boot's PropertiesLauncher.
 *
 * ⭐ MEASURED, both ways round. `PropertiesLauncher` runs our class against the fat jar's nested libs with
 * NO extraction — full `$apply`, answerable Questionnaire, exit 0. And dropping to a JRE dissolves a real
 * Windows trap: `java` commonly resolves to the Oracle javapath shim, a directory holding only
 * `java`/`javac`/`javaw`/`jshell` — no `jar` at all — while the real JDK bin is not on PATH. That cost an
 * hour today and now cannot matter.
 *
 * ⚠ THE CLASS IS BUILT AT OUR BUILD TIME, targeting the `MIN_JAVA_MAJOR` floor (class-file major 61 =
 * Java 17), and shipped. Compiling it needs the engine's own classes, which only we have — asking the
 * user to do that is precisely what produced the six steps above.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { MIN_JAVA_MAJOR } from "./spawn";

/** Spring Boot's launcher: runs `-Dloader.main` against a fat jar's nested `BOOT-INF/lib`, unextracted. */
export const PROPERTIES_LAUNCHER = "org.springframework.boot.loader.launch.PropertiesLauncher";

/** The driver we ship, beside this module in `dist/results/driver/`. */
export const driverDir = (): string => path.join(__dirname, "driver");
export const driverClassPath = (): string => path.join(driverDir(), "ApplyDriver.class");

/** `.class` magic, and the class-file major for the runtime floor (Java N compiles to major N+44). */
const CLASS_MAGIC = 0xcafebabe;
export const EXPECTED_CLASS_MAJOR = MIN_JAVA_MAJOR + 44;

export type DriverReady =
  | { ok: true; loaderPath: string }
  | {
      ok: false;
      reason: "class-missing" | "not-a-class-file" | "class-too-new";
      expectedAt: string;
      detail?: string[];
    };

/**
 * Confirm the compiled driver actually shipped.
 *
 * ⚠ Fails LOUD and names the path. This is the 4.114.0 defect's own detector: that release shipped
 * `emit_results` while `ApplyDriver` was in neither the vsix nor the npm tarball, so the tool required a
 * class no user could obtain. A missing class must never degrade into "go compile it yourself".
 */
export function driverReady(): DriverReady {
  const cls = driverClassPath();
  if (!existsSync(cls)) return { ok: false, reason: "class-missing", expectedAt: cls };

  // ⚠ EXISTENCE IS NOT READINESS — the same lesson as the Java resolver one file over, which
  // preferred a stale JAVA_HOME because it checked only that the executable was there. A class
  // built on a newer JDK without `--release` loads fine for US and dies as
  // `UnsupportedClassVersionError` on a user at the floor. Eight bytes settle it, with no JVM —
  // which is what lets CI assert the FLOOR OF THE SHIPPED BINARY on a machine with no Java at all.
  const head = readFileSync(cls);
  if (head.length < 8 || head.readUInt32BE(0) !== CLASS_MAGIC) {
    return { ok: false, reason: "not-a-class-file", expectedAt: cls };
  }
  const major = head.readUInt16BE(6);
  if (major > EXPECTED_CLASS_MAJOR) {
    return {
      ok: false,
      reason: "class-too-new",
      expectedAt: cls,
      detail: [
        `class-file major ${major}, but the runtime floor is ${EXPECTED_CLASS_MAJOR} (Java ${MIN_JAVA_MAJOR})`,
        "rebuild with `node packages/crl/scripts/build-driver.mjs <engine.jar>`, which pins --release 17",
      ],
    };
  }
  return { ok: true, loaderPath: driverDir() };
}

/**
 * The full `java` argument list for one case.
 *
 * The engine jar goes on `-cp` as ONE file; `loader.path` carries our driver directory. Nothing is
 * extracted, and no classpath is composed by the caller.
 */
export function driverArgs(args: {
  jvmFlags: readonly string[];
  engineJarPath: string;
  loaderPath: string;
  repoPath: string;
  planDefinitionId: string;
  subjectReference: string;
}): string[] {
  return [
    ...args.jvmFlags,
    "-Dloader.main=ApplyDriver",
    `-Dloader.path=${args.loaderPath}`,
    "-cp",
    args.engineJarPath,
    PROPERTIES_LAUNCHER,
    args.repoPath,
    args.planDefinitionId,
    args.subjectReference,
  ];
}
