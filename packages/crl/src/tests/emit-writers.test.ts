import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

import { writeTwoLane, writeCqlLibraries, EmitWriteError } from "../emit-writers";
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

  it("rejects an invalid second-lane path before replacing either lane", () => {
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
    expect(partial.cql).toEqual([]);
    // The FHIR file that DID land is enumerated — the accounting the fix restores
    // (a hardcoded `fhir: []` here was the round-2 [critical]).
    expect(partial.fhir).toEqual([]);
    expect(existsSync(join(dir, "cql", "Good.cql"))).toBe(false);
    expect(existsSync(join(dir, "fhir", "Library", "good.json"))).toBe(false);
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

  // The complete CEL output directory is generated, including arbitrary sibling files.
  it("wipes the complete output directory — arbitrary siblings are removed", () => {
    const sibling = join(dir, "not-ours.json");
    writeFileSync(sibling, "{}", "utf8");
    writeEmitResult(makeResult("patient/c1/observation", "obs-1"), dir);
    expect(existsSync(sibling)).toBe(false);
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
  // @kit emitted-trees-are-ours:cel-preflight-preservation
  it("a preflight-rejected write preserves the previous valid manifest and data", () => {
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

  // @kit emitted-trees-are-ours:cel-stale-compartment-removal
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
  // @kit emitted-trees-are-ours:cel-manifest-disk-hash
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


describe("complete CRL replacement", () => {
  // @kit emitted-trees-are-ours:crl-replacement
  it("removes old roots and custom files while preserving authored siblings; empty emit clears both lanes", () => {
    writeFileSync(join(dir, "policy.crl"), "authored");
    writeTwoLane(makeTwo([{outputFilename:"Old.cql",cql:"old"}], [{resourceType:"PlanDefinition",relativePath:"PlanDefinition/policy-intake.json",resource:{id:"policy-intake"}}]),dir);
    writeFileSync(join(dir,"fhir","custom.txt"),"custom");
    const written=writeTwoLane(makeTwo([{outputFilename:"New.cql",cql:"new"}], [{resourceType:"PlanDefinition",relativePath:"PlanDefinition/policy.json",resource:{id:"policy"}}]),dir);
    expect(written.fhir).toEqual([join(dir,"fhir","PlanDefinition","policy.json")]);
    for(const file of ["cql/Old.cql","fhir/PlanDefinition/policy-intake.json","fhir/custom.txt"]) expect(existsSync(join(dir,file))).toBe(false);
    expect(readFileSync(join(dir,"policy.crl"),"utf8")).toBe("authored");
    writeTwoLane(makeTwo([],[]),dir);
    expect(existsSync(written.cql[0])).toBe(false); expect(existsSync(written.fhir[0])).toBe(false);
  });

  it("preserves both previous lanes when a later FHIR entry fails preflight", () => {
    const old=writeTwoLane(makeTwo([{outputFilename:"Old.cql",cql:"old"}], [{resourceType:"Library",relativePath:"Library/old.json",resource:{id:"old"}}]),dir);
    expect(()=>writeTwoLane(makeTwo([{outputFilename:"New.cql",cql:"new"}], [{resourceType:"Library",relativePath:"../escape.json",resource:{}}]),dir)).toThrow(/traversal/);
    for(const file of [...old.cql,...old.fhir]) expect(existsSync(file)).toBe(true);
  });

  it("standalone CQL replaces only its own directory", () => {
    writeFileSync(join(dir,"authored.crl"),"source");
    mkdirSync(join(dir,"cql"));writeFileSync(join(dir,"cql","custom.txt"),"old");
    writeCqlLibraries([{outputFilename:"New.cql",cql:"new"}],join(dir,"cql"));
    expect(existsSync(join(dir,"cql","custom.txt"))).toBe(false);
    expect(existsSync(join(dir,"authored.crl"))).toBe(true);
  });
});


it("preserves the caller admission of unmatched output with no hard errors", () => {
  const two=makeTwo([{outputFilename:"Valid.cql",cql:"library Valid"}],[]);
  two.success=false;two.cql.success=true;
  two.fhir.unmatched=[{kind:"unresolved-concept",name:"Unresolved"}] as never;
  expect(writeTwoLane(two,dir).cql).toEqual([join(dir,"cql","Valid.cql")]);
});

it.each(["duplicate","file-directory"])("CEL %s collision preserves prior generated output", (kind) => {
  const keep=join(dir,"keep.json");writeFileSync(keep,"previous");
  const resource={resourceType:"Observation",id:"a",outputPath:"patient/c/observation",body:{resourceType:"Observation",id:"a"}};
  const second=kind==="duplicate" ? resource : {...resource,id:"child",outputPath:"patient/c/observation/a.json"};
  const result={diagnostics:[],emittedCases:[{caseName:"Case",caseSlug:"case",librarySlug:"lib",compartmentDir:"patient/c",resources:[resource,second]}]} as EmitResult;
  expect(()=>writeEmitResult(result,dir)).toThrow(/collision/);
  expect(readFileSync(keep,"utf8")).toBe("previous");
});

// @kit emitted-trees-are-ours:linked-root
it("allows a linked ancestor while refusing a linked generated boundary", () => {
  const real = join(dir, "real"), alias = join(dir, "alias");
  mkdirSync(real);
  symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");
  const out = join(alias, "nested", "cql");
  writeCqlLibraries([{ outputFilename: "A.cql", cql: "library A" }], out);
  expect(readFileSync(join(real, "nested", "cql", "A.cql"), "utf8")).toBe("library A");
  const linkedOutput = join(dir, "linked-output");
  symlinkSync(join(real, "nested", "cql"), linkedOutput, process.platform === "win32" ? "junction" : "dir");
  expect(() => writeCqlLibraries([], linkedOutput)).toThrow(/Linked generated output boundary/);
  expect(readFileSync(join(real, "nested", "cql", "A.cql"), "utf8")).toBe("library A");
});
