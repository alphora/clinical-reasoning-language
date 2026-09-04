/**
 * The shipped driver is a BINARY we commit. These tests are what stand in for reading it.
 *
 * ⚠ Deliberately JVM-FREE. They assert facts about bytes on disk, so CI needs no Java, no JDK and no
 * 216 MB engine jar — which is the whole reason the class is committed rather than built. A gate that
 * only runs where a JDK happens to exist is a gate that does not run.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXPECTED_CLASS_MAJOR,
  PROPERTIES_LAUNCHER,
  driverArgs,
  driverClassPath,
  driverDir,
  driverReady,
} from "../driver";
import { MIN_JAVA_MAJOR } from "../spawn";

const SRC_DRIVER_DIR = path.join(__dirname, "..", "driver");
const read = (f: string): Buffer => readFileSync(path.join(SRC_DRIVER_DIR, f));
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

interface BuildMeta {
  javaSha256: string;
  classSha256: string;
  classFileMajor: number;
}

describe("the committed driver binary", () => {
  const meta = JSON.parse(read("ApplyDriver.build.json").toString("utf8")) as BuildMeta;

  // ⭐ THE DRIFT GATE. Editing ApplyDriver.java without rebuilding the class leaves the source
  // documenting behaviour the shipped binary does not have, with nothing anywhere disagreeing. This is
  // the one check that catches it, and it is why build-driver.mjs writes the sidecar at all.
  it("was built from the ApplyDriver.java currently in the tree", () => {
    expect(sha(read("ApplyDriver.java"))).toBe(meta.javaSha256);
  });

  it("is the class the build recorded", () => {
    expect(sha(read("ApplyDriver.class"))).toBe(meta.classSha256);
  });

  // A class built on a newer JDK without --release loads fine for us and dies as
  // UnsupportedClassVersionError on a user sitting at the floor.
  it("targets the runtime floor, not the build machine's JDK", () => {
    expect(read("ApplyDriver.class").readUInt16BE(6)).toBe(EXPECTED_CLASS_MAJOR);
    expect(EXPECTED_CLASS_MAJOR).toBe(MIN_JAVA_MAJOR + 44);
    expect(meta.classFileMajor).toBe(EXPECTED_CLASS_MAJOR);
  });

  // The shipping steps (copy-catalog.mjs, esbuild.js, STABLE_SERVER_ASSETS) each carry ONE filename.
  it("is a single class — a lambda or inner class would be left behind by every copy step", () => {
    const extras = require("node:fs")
      .readdirSync(SRC_DRIVER_DIR)
      .filter((f: string) => f.endsWith(".class"));
    expect(extras).toEqual(["ApplyDriver.class"]);
  });
});

describe("driverReady", () => {
  it("accepts the shipped class", () => {
    const r = driverReady();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.loaderPath).toBe(driverDir());
  });

  it("resolves the class beside the module, where every packaging step puts it", () => {
    expect(driverClassPath()).toBe(path.join(driverDir(), "ApplyDriver.class"));
  });
});

describe("driverArgs", () => {
  const args = driverArgs({
    jvmFlags: ["-Xmx512m"],
    engineJarPath: "/e/engine.jar",
    loaderPath: "/e/driver",
    repoPath: "/e/repo.json",
    planDefinitionId: "PD-1",
    subjectReference: "Patient/p1",
  });

  // ⚠ The engine jar is ONE `-cp` entry. Composing a classpath is precisely what this design removed;
  // a delimiter reappearing here would mean the six-step setup had crept back in.
  it("puts the engine jar on -cp as a single entry", () => {
    const cp = args[args.indexOf("-cp") + 1];
    expect(cp).toBe("/e/engine.jar");
    expect(cp).not.toContain(path.delimiter);
  });

  it("launches our class through PropertiesLauncher, with the driver dir on loader.path", () => {
    expect(args).toContain("-Dloader.main=ApplyDriver");
    expect(args).toContain("-Dloader.path=/e/driver");
    expect(args[args.indexOf("-cp") + 2]).toBe(PROPERTIES_LAUNCHER);
  });

  // Boot 3.2 moved the launcher out of `org.springframework.boot.loader`; produceResults preflights the
  // jar for this exact entry so an unsupported engine fails by name instead of "driver exited 1".
  it("names the Spring Boot 3.2+ launcher package", () => {
    expect(PROPERTIES_LAUNCHER).toBe("org.springframework.boot.loader.launch.PropertiesLauncher");
  });

  it("passes the engine's three positional arguments last, in order", () => {
    expect(args.slice(-3)).toEqual(["/e/repo.json", "PD-1", "Patient/p1"]);
  });

  it("keeps JVM flags ahead of the launcher", () => {
    expect(args[0]).toBe("-Xmx512m");
  });
});
