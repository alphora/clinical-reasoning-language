import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  APPLY_OPERATION,
  DEFAULT_BOUNDS,
  RETRIEVE_SETTINGS,
  SingleFlight,
  assertSafeWorkingDir,
  capTail,
  jvmFlags,
  killTreeCommand,
  resolveJava,
  verifyJar,
} from "../spawn";

describe("the JVM spawn contract is bounded by construction", () => {
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

    expect(verifyJar(jar, sha)).toEqual({ ok: true, sha256: sha });
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

  it("⭐ JAVA_HOME wins over PATH, and absence is reported rather than guessed", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crl-java-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const isWin = process.platform === "win32";
    writeFileSync(path.join(bin, isWin ? "java.exe" : "java"), "");

    const viaHome = resolveJava({ JAVA_HOME: dir } as NodeJS.ProcessEnv, isWin);
    expect(viaHome.ok && viaHome.source).toBe("JAVA_HOME");

    const viaPath = resolveJava({ PATH: bin } as NodeJS.ProcessEnv, isWin);
    expect(viaPath.ok && viaPath.source).toBe("PATH");

    // No registry scan, no common-directory crawl: a loud "set JAVA_HOME" beats picking a JRE the engine
    // cannot use.
    expect(resolveJava({} as NodeJS.ProcessEnv, isWin)).toEqual({ ok: false, reason: "not-found" });
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
