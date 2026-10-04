import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ENGINE_JAR_SOURCE,
  LAUNCHER_ENTRY,
  defaultEngineJarPath,
  engineJarFetchCommand,
  engineJarHelp,
  APPLY_OPERATION,
  DEFAULT_BOUNDS,
  RETRIEVE_SETTINGS,
  SingleFlight,
  assertSafeWorkingDir,
  capTail,
  jvmFlags,
  killTreeCommand,
  MIN_JAVA_MAJOR,
  parseJavaMajor,
  resolveJava,
  resolveJavaAsync,
  verifyJar,
} from "../spawn";

describe("the JVM spawn contract is bounded by construction", () => {
  it.each(["Path", "pAtH"])("Windows snapshots discover Java from %s in both APIs", async key => {
    const dir = mkdtempSync(path.join(tmpdir(), "crl-java-case-"));
    writeFileSync(path.join(dir, "java.exe"), "");
    const env = { [key]: dir }, expected = { ok: true, javaExe: path.join(dir, "java.exe"), source: "PATH", major: 23 };
    expect(resolveJava(env, true, () => 'java version "23.0.1"')).toEqual(expected);
    expect(await resolveJavaAsync(env, true, async () => 'java version "23.0.1"')).toEqual(expected);
    expect(resolveJava({ PATH: "", [key]: dir }, true, () => 'java version "23.0.1"')).toEqual({ ok: false, reason: "not-found" });
  });

  it("Windows mixed-case JAVA_HOME retains usable-home priority and too-old fallback", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crl-java-home-case-")), home = path.join(dir, "home"), bin = path.join(dir, "path");
    mkdirSync(path.join(home, "bin"), { recursive: true }); mkdirSync(bin);
    writeFileSync(path.join(home, "bin", "java.exe"), ""); writeFileSync(path.join(bin, "java.exe"), "");
    const env = { Java_Home: home, Path: bin }, homeExe = path.join(home, "bin", "java.exe");
    expect(resolveJava(env, true, () => 'java version "23.0.1"')).toEqual({ ok: true, javaExe: homeExe, source: "JAVA_HOME", major: 23 });
    const probe = (p: string) => p === homeExe ? 'java version "11.0.13"' : 'java version "23.0.1"';
    expect(await resolveJavaAsync(env, true, async p => probe(p))).toEqual({ ok: true, javaExe: path.join(bin, "java.exe"), source: "PATH", major: 23 });
    expect(resolveJava({ ...env, Java_Home: path.join(dir, "missing") }, true, probe)).toMatchObject({ ok: true, source: "PATH" });
  });

  it("POSIX environment lookup remains case-sensitive", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crl-java-posix-case-")); writeFileSync(path.join(dir, "java"), "");
    expect(resolveJava({ Path: dir }, false, () => 'java version "23.0.1"')).toEqual({ ok: false, reason: "not-found" });
    expect(await resolveJavaAsync({ Path: dir }, false, async () => 'java version "23.0.1"')).toEqual({ ok: false, reason: "not-found" });
    expect(resolveJava({ PATH: dir }, false, () => 'java version "23.0.1"')).toMatchObject({ ok: true, source: "PATH" });
  });
  it("matches the delivered engine provenance manifest", () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../patches/cqframework/cli-build.json"), "utf8"));
    expect(manifest).toMatchObject({ sha256: ENGINE_JAR_SOURCE.sha256, buildId: ENGINE_JAR_SOURCE.buildId, url: ENGINE_JAR_SOURCE.url });
    expect(ENGINE_JAR_SOURCE.cacheRelativePath).toBe(".cache/crl/engines/" + manifest.asset);
  });
  it("⚠ every run is heap-capped AND exits on OOM", () => {
    const flags = jvmFlags(DEFAULT_BOUNDS);
    expect(flags).toContain(`-Xmx${DEFAULT_BOUNDS.maxHeapMb}m`);
    // Without this a JVM at its ceiling thrashes GC forever and reads as a hang — the batch timeout
    // becomes the only thing that ends it, turning a fast failure into a ten-minute stall.
    expect(flags).toContain("-XX:+ExitOnOutOfMemoryError");
  });

  it("⚠ the kill is a process TREE on Windows — a bare kill orphans the JVM's children", () => {
    const win = killTreeCommand(1234, true);
    expect(win.cmd).toBe("taskkill");
    expect(win.args).toContain("/T");
    expect(win.args).toContain("/F");
    // POSIX: negative pid targets the process GROUP, which is the same intent.
    expect(killTreeCommand(1234, false).args).toContain("-1234");
  });

  it("⭐ captured output keeps the TAIL — a stack trace is last, a banner is first", () => {
    const chunks = [Buffer.from("A".repeat(100)), Buffer.from("STACKTRACE")];
    const out = capTail(chunks, 20);
    expect(out.endsWith("STACKTRACE")).toBe(true);
    expect(out).toContain("elided");
    // Under the cap, nothing is touched.
    expect(capTail([Buffer.from("short")], 100)).toBe("short");
  });

  it("⚠ a second concurrent run REFUSES rather than queueing", () => {
    const sf = new SingleFlight();
    expect(sf.tryAcquire()).toBe(true);
    // Two JVMs at the cap is twice the ceiling that already crashed a machine, and an MCP caller has no
    // natural backpressure. A queue silently converts impatience into memory pressure.
    expect(sf.tryAcquire()).toBe(false);
    sf.release();
    expect(sf.tryAcquire()).toBe(true);
  });

  it("⚠ refuses to run inside packages/ — scratch there pollutes sibling sessions' test gate", () => {
    const repo = process.platform === "win32" ? "E:\repo" : "/repo";
    expect(() => assertSafeWorkingDir(path.join(repo, "packages", "crl", "scratch"), repo)).toThrow(
      /Refusing to run a producer inside packages/,
    );
    // A scratchpad outside the repo is fine.
    expect(() => assertSafeWorkingDir(tmpdir(), repo)).not.toThrow();
  });

  it("⭐ the jar is verified by hash BEFORE EVERY LAUNCH, not once at download", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crl-jar-"));
    const jar = path.join(dir, "producer.jar");
    writeFileSync(jar, "pretend-jar-bytes");
    const sha = createHash("sha256").update("pretend-jar-bytes").digest("hex");

    // `hasLauncher` is false here because these bytes are not a Boot jar — which is the point of the
    // check: an engine without `PropertiesLauncher` cannot be launched the way `driverArgs` launches it.
    expect(verifyJar(jar, sha)).toEqual({ ok: true, sha256: sha, hasLauncher: false });

    // A jar CONTAINING the launcher entry reports it. The name is stored uncompressed in the zip
    // headers, so the substring search finds it without a zip reader.
    const boot = path.join(dir, "boot.jar");
    writeFileSync(boot, `PK padding ${LAUNCHER_ENTRY} more padding`);
    const bootSha = createHash("sha256").update(readFileSync(boot)).digest("hex");
    const bootCheck = verifyJar(boot, bootSha);
    expect(bootCheck.ok === true && bootCheck.hasLauncher).toBe(true);
    // An atomic download prevents a TRUNCATED jar. It does not prevent a wrong or substituted one, nor a
    // file that changed after it landed — which is why this runs at launch.
    writeFileSync(jar, "tampered");
    const bad = verifyJar(jar, sha);
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.reason).toBe("sha-mismatch");

    expect(verifyJar(path.join(dir, "absent.jar"), sha)).toEqual({ ok: false, reason: "missing" });
    const sub = path.join(dir, "adir");
    mkdirSync(sub);
    expect(verifyJar(sub, sha)).toEqual({ ok: false, reason: "not-a-file" });
  });

  it("⭐⭐ A TOO-OLD JDK IS REFUSED BY NAME — existence is not usability", () => {
    // ⚠ THIS WAS A REAL DEFECT, not a hypothetical. On the machine this was written, `java` on PATH was
    // 23 while JAVA_HOME still pointed at a JDK 11 from an old install. An earlier cut checked only that
    // the executable EXISTED, so it preferred JAVA_HOME and would have handed the engine a JDK that
    // cannot load its classes — surfacing as UnsupportedClassVersionError from inside cqf, nowhere near
    // the cause. A stale JAVA_HOME is the common case.
    const dir = mkdtempSync(path.join(tmpdir(), "crl-jdk-"));
    const oldHome = path.join(dir, "jdk11");
    const newDir = path.join(dir, "jdk23bin");
    mkdirSync(path.join(oldHome, "bin"), { recursive: true });
    mkdirSync(newDir, { recursive: true });
    const isWin = process.platform === "win32";
    const exe = isWin ? "java.exe" : "java";
    writeFileSync(path.join(oldHome, "bin", exe), "");
    writeFileSync(path.join(newDir, exe), "");

    const probe = (p: string): string =>
      p.includes("jdk11") ? 'java version "11.0.13"' : 'java version "23.0.1"';

    // JAVA_HOME is stale-but-present; PATH has a usable one. The usable one must win.
    const r = resolveJava({ JAVA_HOME: oldHome, PATH: newDir } as NodeJS.ProcessEnv, isWin, probe);
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.major).toBe(23);
    expect(r.ok === true && r.source).toBe("PATH");

    // Only a too-old JDK: refuse BY NAME AND VERSION. "not-found" would be a lie that sends a KE to
    // install a second copy of something they already have.
    const only = resolveJava({ JAVA_HOME: oldHome } as NodeJS.ProcessEnv, isWin, probe);
    expect(only.ok).toBe(false);
    expect(only.ok === false && only.reason).toBe("too-old");
    expect(only.ok === false && only.reason === "too-old" && only.required).toBe(MIN_JAVA_MAJOR);

    expect(resolveJava({} as NodeJS.ProcessEnv, isWin, probe)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("⚠ a probe that reads only STDOUT sees NO java at all", () => {
    // `java -version` writes to stderr. The first check written against `resolveJava` captured stdout and
    // reported `not-found` on a machine with JDK 23 on PATH — pinned here so the trap is a test, not a
    // comment somebody skims.
    const dir = mkdtempSync(path.join(tmpdir(), "crl-stderr-"));
    const isWin = process.platform === "win32";
    writeFileSync(path.join(dir, isWin ? "java.exe" : "java"), "");
    const stdoutOnlyProbe = (): string => ""; // what you get capturing the wrong stream
    expect(resolveJava({ PATH: dir } as NodeJS.ProcessEnv, isWin, stdoutOnlyProbe)).toEqual({
      ok: false,
      reason: "not-found",
    });
    const stderrProbe = (): string => 'java version "23.0.1"';
    expect(resolveJava({ PATH: dir } as NodeJS.ProcessEnv, isWin, stderrProbe).ok).toBe(true);
  });

  it("⭐ the minimum is MEASURED from the jar, not chosen", () => {
    // Every class in cqf-fhir-cr-cli-4.7.0.jar is class-file major 61 = Java 17.
    expect(MIN_JAVA_MAJOR).toBe(17);
    expect(parseJavaMajor('java version "23.0.1" 2024-10-15')).toBe(23);
    expect(parseJavaMajor('openjdk version "17.0.9"')).toBe(17);
    expect(parseJavaMajor('java version "1.8.0_392"')).toBe(8); // legacy 1.x spelling
    expect(parseJavaMajor("garbage")).toBeUndefined();
  });

  it("⚠ the engine entry point and retrieve settings are PINNED, not configurable", () => {
    // applyR5 only — the R4 processor re-opens the null-behaviour findings.
    expect(APPLY_OPERATION).toBe("applyR5");
    // Without in-memory filtering, valueset retrieves die against a file-backed repository.
    expect(RETRIEVE_SETTINGS).toBe("FILTER_IN_MEMORY");
  });

  it("⚠ there is deliberately NO per-case timeout in the bounds", () => {
    // A hung case cannot be interrupted inside a shared JVM, so a per-case timeout would be a contract we
    // cannot honour. The manifest carries the consequence instead (`timeout` + `not-run`).
    expect(Object.keys(DEFAULT_BOUNDS).sort()).toEqual([
      "batchTimeoutMs",
      "maxCapturedBytes",
      "maxHeapMb",
    ]);
  });
});

// ⭐ THE JAR MUST BE OBTAINABLE, not merely verifiable. Both parameters were REQUIRED, so a consumer
// could not construct the call without already possessing a approximately 217 MB artifact and its hash — and the
// refusal naming the download URL sat AFTER the call they could not make. As the IEHP KE put it: "the
// gate is not the failure path — it is the signature." They recovered the URL by reading back an
// agent-to-agent message thread, because it existed nowhere in the shipped tool.
describe("obtaining the engine jar", () => {
  it("uses a distinct corrected-engine cache while preserving the original Maven jar", () => {
    const home = mkdtempSync(path.join(tmpdir(), "crl-engine-"));
    const old = path.join(home, ".m2/repository/org/opencds/cqf/fhir/cqf-fhir-cr-cli/4.7.0/cqf-fhir-cr-cli-4.7.0.jar");
    mkdirSync(path.dirname(old), { recursive: true });
    writeFileSync(old, "original-engine");
    expect(defaultEngineJarPath({ HOME: home } as NodeJS.ProcessEnv)).toBeUndefined();
    const corrected = path.join(home, ENGINE_JAR_SOURCE.cacheRelativePath);
    mkdirSync(path.dirname(corrected), { recursive: true });
    writeFileSync(corrected, "corrected-engine");
    expect(defaultEngineJarPath({ HOME: home } as NodeJS.ProcessEnv)).toBe(corrected);
    expect(readFileSync(old, "utf8")).toBe("original-engine");
  });

  it("is undefined in a fresh cache and without a home", () => {
    const home = mkdtempSync(path.join(tmpdir(), "crl-engine-empty-"));
    expect(defaultEngineJarPath({ USERPROFILE: home } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(defaultEngineJarPath({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("the help names a source, a hash, and the artifact that is NOT it", () => {
    const help = engineJarHelp().join("\n");
    expect(help).toContain(ENGINE_JAR_SOURCE.url);
    expect(help).toContain(ENGINE_JAR_SOURCE.sha256);
    // The wrong turn actually taken in the field: cqf-fhir-cr vs cqf-fhir-cr-cli.
    expect(help).toContain("-cli artifact");
  });

  // "Here is a URL" still leaves a person composing a command, and composing too much was the finding.
  it("the fetch command is copy-pasteable and lands where the default looks", () => {
    const cmd = engineJarFetchCommand();
    expect(cmd).toContain(ENGINE_JAR_SOURCE.url);
    expect(cmd).toContain(ENGINE_JAR_SOURCE.cacheRelativePath);
    expect(cmd).toContain("--create-dirs"); // the directory will not exist on a first fetch
  });
});
