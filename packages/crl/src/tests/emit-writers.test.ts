import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

import { writeTwoLane, EmitWriteError } from "../emit-writers";
import { CEL_DATA_MANIFEST, writeEmitResult } from "../cel/emitter";
import type { EmitCrlTwoLaneResult } from "../emit-two-lane";
import type { EmitResult } from "../cel/emitter/types";

/**
 * T2 — the shared filesystem writer behind BOTH the `crl-emit --target fhir-def`
 * CLI and the `emit_crl`/`emit_cel` MCP `out` directory. These pin the layout,
 * the absolute-path manifest, the containment guard, and the partial-write
 * accounting that the MCP `out` mode and the CLI both rely on.
 */

// Minimal EmitCrlTwoLaneResult — writeTwoLane reads only `cqlLibraries` and
// `fhir.resources`; the rest of the envelope is irrelevant to the writer.
function makeTwo(
  cqlLibraries: Array<{ outputFilename: string; cql: string }>,
  fhirResources: Array<{ resourceType: string; relativePath: string; resource: Record<string, unknown> }>,
): EmitCrlTwoLaneResult {
  return {
    success: true,
    fhir: { resources: fhirResources } as unknown as EmitCrlTwoLaneResult["fhir"],
    cql: {} as unknown as EmitCrlTwoLaneResult["cql"],
    cqlLibraries,
    fhirHardErrors: [],
    hardErrors: [],
    warnings: [],
    filenameCollisions: [],
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "emit-writers-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeTwoLane", () => {
  it("writes CQL under <out>/cql and FHIR under <out>/fhir, returning ABSOLUTE paths in emit order", () => {
    const two = makeTwo(
      [
        { outputFilename: "Alpha.cql", cql: "library Alpha\n" },
        { outputFilename: "Beta.cql", cql: "library Beta\n" },
      ],
      [
        { resourceType: "Library", relativePath: join("Library", "alpha.json"), resource: { resourceType: "Library", id: "alpha" } },
      ],
    );
    const written = writeTwoLane(two, dir);

    expect(written.cql.every((p) => isAbsolute(p))).toBe(true);
    expect(written.fhir.every((p) => isAbsolute(p))).toBe(true);
    expect(written.cql).toEqual([join(dir, "cql", "Alpha.cql"), join(dir, "cql", "Beta.cql")]);
    expect(written.fhir).toEqual([join(dir, "fhir", "Library", "alpha.json")]);
    expect(readFileSync(written.cql[0], "utf-8")).toBe("library Alpha\n");
    // writeFhirResources pretty-prints + trailing newline.
    expect(readFileSync(written.fhir[0], "utf-8")).toBe(
      JSON.stringify({ resourceType: "Library", id: "alpha" }, null, 2) + "\n",
    );
  });

  it("throws EmitWriteError on a traversal-y CQL outputFilename, writing nothing", () => {
    const two = makeTwo([{ outputFilename: join("..", "escape.cql"), cql: "x" }], []);
    let err: unknown;
    try {
      writeTwoLane(two, dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EmitWriteError);
    expect((err as Error).message).toMatch(/traversal/i);
    expect((err as EmitWriteError).partial.cql).toEqual([]);
    expect(existsSync(join(dir, "escape.cql"))).toBe(false);
  });

  it("on a mid-LOOP FHIR failure, EmitWriteError.partial enumerates BOTH lanes' files already written", () => {
    const two = makeTwo(
      [{ outputFilename: "Good.cql", cql: "library Good\n" }],
      [
        // This one lands first...
        { resourceType: "Library", relativePath: join("Library", "good.json"), resource: { resourceType: "Library", id: "good" } },
        // ...then this traversal-y one throws mid-loop.
        { resourceType: "Library", relativePath: join("..", "escape.json"), resource: { id: "evil" } },
      ],
    );
    let err: unknown;
    try {
      writeTwoLane(two, dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EmitWriteError);
    const partial = (err as EmitWriteError).partial;
    expect(partial.cql).toEqual([join(dir, "cql", "Good.cql")]);
    // The FHIR file that DID land is enumerated — the accounting the fix restores
    // (a hardcoded `fhir: []` here was the round-2 [critical]).
    expect(partial.fhir).toEqual([join(dir, "fhir", "Library", "good.json")]);
    expect(existsSync(join(dir, "cql", "Good.cql"))).toBe(true);
    expect(existsSync(join(dir, "fhir", "Library", "good.json"))).toBe(true);
    expect(existsSync(join(dir, "escape.json"))).toBe(false);
  });
});

describe("writeEmitResult (CEL) — absolute manifest + containment", () => {
  // ⚠ MATCHES THE EMITTER. `caseName` and `compartmentDir` are required on `EmittedCase` and the
  // manifest carries both; tests are excluded from `tsc`, so omitting them compiled while the manifest
  // silently wrote `undefined`. `outputPath` is `/`-joined here because that is what the emitter
  // produces — `path.join` would give `patient\c1/obs.json` on Windows and pass only by tolerance.
  function makeResult(outputPath: string, id: string, caseName = "Case A"): EmitResult {
    return {
      emittedCases: [
        {
          caseName,
          caseSlug: "case-a",
          librarySlug: "lib-a",
          compartmentDir: "patient/case-a",
          resources: [{ resourceType: "Observation", id, outputPath, body: { resourceType: "Observation", id } }],
        },
      ],
      diagnostics: [],
    };
  }

  // ⚠⚠ THE CRITICAL THE PANEL CAUGHT. The wipe used to run BEFORE the traversal check, so a call that
  // failed its own validation deleted the tree and only then threw — the one failure that used to write
  // nothing became the one that destroyed the most. MEASURED before the fix: pre-existing case data gone.
  // ⚠ MEASURED, NOT ASSERTED. The results pruner had a real junction traversal with `statSync`, so the
  // recursive delete here gets the same scrutiny rather than a reading of Node's rimraf. Both cases are
  // cheap on Windows without privileges (`junction`).
  it("a junction UNDER patient/ is unlinked, not followed out of the tree", () => {
    const outside = mkdtempSync(join(tmpdir(), "crl-outside-"));
    const precious = join(outside, "DO-NOT-DELETE.json");
    writeFileSync(precious, "{}", "utf8");
    const link = join(dir, "patient", "c1", "observation");
    mkdirSync(dirname(link), { recursive: true });
    try {
      symlinkSync(outside, link, "junction");
    } catch {
      return; // no symlink permission on this machine; nothing to prove here
    }
    try {
      writeEmitResult(makeResult("patient/c2/observation", "obs-1"), dir);
      expect(existsSync(precious), "the wipe followed a junction out of the tree").toBe(true);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("a junction AT patient/ is replaced by a real directory, target intact", () => {
    const outside = mkdtempSync(join(tmpdir(), "crl-outside-"));
    const precious = join(outside, "DO-NOT-DELETE.json");
    writeFileSync(precious, "{}", "utf8");
    try {
      symlinkSync(outside, join(dir, "patient"), "junction");
    } catch {
      return;
    }
    try {
      writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
      expect(existsSync(precious), "the wipe deleted through a junction at patient/").toBe(true);
      expect(existsSync(join(dir, "patient", "c1", "observation", "obs-1.json"))).toBe(true);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("a REJECTED write deletes nothing — validation happens before the wipe", () => {
    const keep = join(dir, "patient", "EXISTING", "observation", "keep.json");
    mkdirSync(dirname(keep), { recursive: true });
    writeFileSync(keep, "{}", "utf8");

    expect(() => writeEmitResult(makeResult("../../escape", "x"), dir)).toThrow(/traversal/i);
    expect(existsSync(keep), "a failed call destroyed pre-existing data").toBe(true);
  });

  // The wipe owns `patient/` and nothing else: a sibling file in the same out dir is not ours.
  it("wipes ONLY patient/ — anything else in the out dir survives", () => {
    const sibling = join(dir, "not-ours.json");
    writeFileSync(sibling, "{}", "utf8");
    writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    expect(existsSync(sibling)).toBe(true);
  });

  // `written` means RESOURCE paths. A consumer counting or mirroring it must not silently acquire the
  // manifest, and must not silently MISS it either — hence the exported constant.
  it("written[] carries resources only, never the manifest", () => {
    const written = writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    expect(written.some((w) => w.includes(CEL_DATA_MANIFEST))).toBe(false);
    expect(existsSync(join(dir, CEL_DATA_MANIFEST))).toBe(true);
  });

  // ⚠ A stale manifest beside a wiped tree would certify files that no longer exist — the same
  // "manufactured confidence" failure this whole change exists to remove, one level in.
  it("a failed write leaves NO manifest, rather than the previous run's", () => {
    writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    expect(existsSync(join(dir, CEL_DATA_MANIFEST))).toBe(true);
    expect(() => writeEmitResult(makeResult("../../escape", "x"), dir)).toThrow();
    // The rejected call never wiped, so the manifest still describes the tree that is still there.
    const m = JSON.parse(readFileSync(join(dir, CEL_DATA_MANIFEST), "utf8")) as {
      cases: { artifacts: { path: string }[] }[];
    };
    for (const a of m.cases.flatMap((c) => c.artifacts)) {
      expect(existsSync(join(dir, a.path)), `manifest lists a missing file: ${a.path}`).toBe(true);
    }
  });

  // The manifest is a pure function of the source, so a re-emit must be byte-identical — that is what
  // makes "re-emit, git status clean" a usable staleness check.
  it("the manifest is byte-identical across re-emits (no run clock)", () => {
    writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    const first = readFileSync(join(dir, CEL_DATA_MANIFEST), "utf8");
    writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    expect(readFileSync(join(dir, CEL_DATA_MANIFEST), "utf8")).toBe(first);
  });

  it("WIPES a stale compartment left by a renamed case, rather than leaving it beside the new one", () => {
    writeEmitResult(makeResult("patient/OLD-NAME/observation", "obs-1"), dir);
    const ghost = join(dir, "patient", "OLD-NAME", "observation", "obs-1.json");
    expect(existsSync(ghost)).toBe(true);

    // The case is renamed: same suite, different compartment.
    writeEmitResult(makeResult("patient/NEW-NAME/observation", "obs-1"), dir);
    expect(existsSync(ghost), "the renamed case's old compartment survived the re-emit").toBe(false);
    expect(existsSync(join(dir, "patient", "NEW-NAME", "observation", "obs-1.json"))).toBe(true);
  });

  // A manifest is a fact a consumer can check; a prune is an action they have to trust. `emit_cel`
  // previously returned its resource list in the RESPONSE only, so the tree could be verified solely by
  // whoever still held that response.
  it("writes a manifest whose sha256 matches the bytes actually on disk", () => {
    writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    const manifest = JSON.parse(readFileSync(join(dir, CEL_DATA_MANIFEST), "utf8")) as {
      cases: { artifacts: { path: string; sha256: string }[] }[];
    };
    const resources = manifest.cases.flatMap((c) => c.artifacts);
    expect(resources).toHaveLength(1);
    for (const r of resources) {
      const onDisk = readFileSync(join(dir, r.path));
      expect(createHash("sha256").update(onDisk).digest("hex"), `sha256 mismatch for ${r.path}`).toBe(r.sha256);
    }
  });

  // "This emit produced nothing" is a fact worth recording — it is the only thing distinguishing an
  // empty tree from a tree nobody has emitted into.
  it("writes a manifest even for a zero-resource result", () => {
    writeEmitResult({ emittedCases: [], diagnostics: [] }, dir);
    expect(existsSync(join(dir, CEL_DATA_MANIFEST))).toBe(true);
  });

  it("returns the ABSOLUTE paths written, in emit order", () => {
    const written = writeEmitResult(makeResult(join("patient", "lib-a", "case-a", "Observation"), "obs-1"), dir);
    expect(written).toHaveLength(1);
    expect(isAbsolute(written[0])).toBe(true);
    expect(written[0]).toBe(join(dir, "patient", "lib-a", "case-a", "Observation", "obs-1.json"));
    expect(existsSync(written[0])).toBe(true);
  });

  it("throws on a traversal-y outputPath, escaping outDir", () => {
    expect(() => writeEmitResult(makeResult(join("..", "escape"), "obs-1"), dir)).toThrow(/traversal/i);
    expect(existsSync(join(dir, "..", "escape"))).toBe(false);
  });

  it("creates <outDir> up front even for a zero-resource result", () => {
    const fresh = join(dir, "fresh");
    const written = writeEmitResult({ emittedCases: [], diagnostics: [] }, fresh);
    expect(written).toEqual([]);
    expect(existsSync(fresh)).toBe(true);
  });

  // ⚠ CONTRACT CHANGED, DELIBERATELY. This used to assert a PARTIAL write list: the good resource was
  // written, then the traversal threw mid-loop. Validation now runs over the whole plan BEFORE anything
  // is written or deleted, so an invalid result writes NOTHING — which is strictly better, and is what
  // makes a rejected call non-destructive. `sink` still accumulates on a mid-loop FILESYSTEM failure
  // (disk full, EPERM), which is the case it exists for.
  it("writes NOTHING when any resource is invalid — validation precedes every write", () => {
    const result: EmitResult = {
      emittedCases: [
        {
          caseName: "c",
          caseSlug: "c",
          librarySlug: "l",
          compartmentDir: "patient/c",
          resources: [
            { resourceType: "Observation", id: "good", outputPath: "patient/l/c/observation", body: {} },
            { resourceType: "Observation", id: "evil", outputPath: "../escape", body: {} },
          ],
        },
      ],
      diagnostics: [],
    };
    const sink: string[] = [];
    expect(() => writeEmitResult(result, dir, sink)).toThrow(/traversal/i);
    expect(sink, "a rejected result wrote a partial tree").toEqual([]);
    expect(existsSync(join(dir, "patient", "l", "c", "observation", "good.json"))).toBe(false);
  });
});
