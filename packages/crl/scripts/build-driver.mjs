#!/usr/bin/env node
/**
 * Rebuild `ApplyDriver.class` — a MAINTAINER step, run once per engine bump, never by a user.
 *
 * ⚠ WHY THE CLASS IS COMMITTED. Compiling it needs the engine's own classes, which live in the fat
 * jar's nested `BOOT-INF/lib` — 216 MB we do not vendor and CI does not download. `javac` cannot read
 * nested jars (measured: "package ca.uhn.fhir.context does not exist" when the fat jar is passed to
 * `-cp` directly), so a rebuild must extract first. Asking a knowledge engineer to do that is exactly
 * the six-step setup this whole change deleted. So: WE compile, WE commit the class, and users need
 * only a JRE.
 *
 * ⚠ `--release 17` IS THE CONTRACT, not a preference. It pins the class-file version to major 61 so the
 * shipped class loads on the oldest runtime `MIN_JAVA_MAJOR` admits. Building on a newer JDK without it
 * silently raises the floor, and the failure lands on a user as UnsupportedClassVersionError.
 *
 * USAGE:  node packages/crl/scripts/build-driver.mjs <engine.jar>
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRIVER_DIR = path.join(HERE, "..", "src", "results", "driver");
const EXPECTED_CLASS_MAJOR = 61; // Java 17

const jar = process.argv[2];
if (!jar || !existsSync(jar)) {
  console.error(`usage: node build-driver.mjs <engine.jar>\n  (missing or unreadable: ${jar ?? "<none>"})`);
  process.exit(1);
}

// The JDK bin, not whatever `java` resolves to: on Windows that is commonly the Oracle javapath shim,
// which holds java/javac/javaw/jshell and NO `jar`. This script needs both javac and jar.
//
// ⚠ JAVA_HOME FIRST, matching `resolveJava` in spawn.ts. PATH pointing at a JRE while JAVA_HOME points
// at a JDK is the ordinary shape on a developer box, and probing PATH alone refuses with "needs a full
// JDK" on a machine that has one.
function javaHome() {
  const fromEnv = process.env.JAVA_HOME?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, "bin"))) return fromEnv;
  const probe = spawnSync("java", ["-XshowSettings:properties", "-version"], { encoding: "utf8" });
  // ⚠ java writes BOTH of these to STDERR. Reading stdout reports "no Java" on a box that has it.
  return /java\.home = (.+)/.exec(`${probe.stdout ?? ""}${probe.stderr ?? ""}`)?.[1]?.trim();
}

const home = javaHome();
if (!home) { console.error("could not determine a Java home (set JAVA_HOME)"); process.exit(1); }
const bin = (t) => path.join(home, "bin", t);
for (const tool of ["javac", "jar"]) {
  if (!existsSync(bin(tool)) && !existsSync(bin(`${tool}.exe`))) {
    console.error(`${tool} not found in ${home}/bin — rebuilding the driver needs a full JDK, not a JRE.`);
    process.exit(1);
  }
}

const work = mkdtempSync(path.join(tmpdir(), "crl-driver-build-"));
try {
  console.log("extracting engine libs (nested jars are invisible to javac)…");
  execFileSync(bin("jar"), ["xf", path.resolve(jar), "BOOT-INF/lib", "BOOT-INF/classes"], { cwd: work, stdio: "inherit" });
  const cp = [path.join(work, "BOOT-INF", "classes"), path.join(work, "BOOT-INF", "lib", "*")].join(path.delimiter);

  console.log("compiling ApplyDriver at --release 17…");
  execFileSync(bin("javac"), ["--release", "17", "-cp", cp, "-d", DRIVER_DIR, path.join(DRIVER_DIR, "ApplyDriver.java")], { stdio: "inherit" });

  // ⚠ EXACTLY ONE CLASS, OR THE SHIPPING STEPS SILENTLY DROP THE REST. Add a lambda or an inner
  // class to the driver and javac emits `ApplyDriver$1.class` beside it — but copy-catalog.mjs,
  // esbuild.js and STABLE_SERVER_ASSETS each copy ONE hard-coded filename, so the extra class would
  // be left behind and surface as NoClassDefFoundError at runtime with every gate green.
  const produced = readdirSync(DRIVER_DIR).filter((f) => f.endsWith(".class"));
  if (produced.length !== 1) {
    console.error(
      `javac produced ${produced.length} classes (${produced.join(", ")}); the shipping steps carry exactly one.
` +
        "Keep ApplyDriver free of lambdas and inner classes, or teach copy-catalog.mjs, esbuild.js and " +
        "STABLE_SERVER_ASSETS to carry the whole set."
    );
    process.exit(1);
  }

  // Verify the floor rather than trusting the flag: bytes 6-7 of a class file are the major version.
  const classBytes = readFileSync(path.join(DRIVER_DIR, "ApplyDriver.class"));
  const major = classBytes.readUInt16BE(6);
  if (major !== EXPECTED_CLASS_MAJOR) {
    console.error(`class-file major ${major}, expected ${EXPECTED_CLASS_MAJOR} — the runtime floor moved. Refusing.`);
    process.exit(1);
  }

  // ⭐ THE DRIFT GATE. The realistic six-month failure is not a wrong JDK, it is someone editing
  // ApplyDriver.java and not rebuilding the class — after which the source documents behaviour the
  // shipped binary does not have, and nothing anywhere disagrees. Recording the source hash beside the
  // class lets an ordinary test detect that with no JDK, no engine jar and no JVM in CI.
  const meta = {
    builtFrom: "ApplyDriver.java",
    javaSha256: createHash("sha256").update(readFileSync(path.join(DRIVER_DIR, "ApplyDriver.java"))).digest("hex"),
    classSha256: createHash("sha256").update(classBytes).digest("hex"),
    classFileMajor: major,
    engineJar: path.basename(jar),
    engineJarSha256: createHash("sha256").update(readFileSync(path.resolve(jar))).digest("hex"),
  };
  writeFileSync(path.join(DRIVER_DIR, "ApplyDriver.build.json"), `${JSON.stringify(meta, null, 2)}
`);

  console.log(`ok — ApplyDriver.class rebuilt, class-file major ${major} (Java 17).`);
  console.log("commit ApplyDriver.class AND ApplyDriver.build.json together.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
