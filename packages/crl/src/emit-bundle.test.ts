import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "path";
import * as twoLane from "./emit-two-lane";
import { emitCrlBundle } from "./emit-bundle";
import { buildEngineRepoBundle, cqlIndex } from "./results/repoBundle";

const fixture = path.resolve(__dirname, "fhir-emitter/tests/fixtures/code-is-decision/code-is-decision.crl");
afterEach(() => vi.restoreAllMocks());
// @kit fhir-packaging:definition-bundle
describe("definitions-only Bundle", () => {
  it('retains the owning library for imported question profiles in host-only provenance',()=>{
    const result=emitCrlBundle(path.resolve(__dirname,'fhir-emitter/tests/fixtures/interactive-origin-owner/root.crl'),{sourceOrigins:true});
    expect(result.success).toBe(true);if(!result.success)throw Error(JSON.stringify(result.diagnostics));
    const imported=result.definitionOrigins!.filter(o=>o.kind==='CaseFeature'&&o.name==='Imported Answer');
    expect(imported).toHaveLength(1);expect(imported[0].library).toBe('Origin Shared');
    expect(JSON.stringify(result.bundle)).not.toContain('sourceLibraryName');
  });
  it("embeds the actual two-lane CQL without patient data or mutation", () => {
    const two = twoLane.emitCrlTwoLane(fixture);
    expect(two.success).toBe(true);
    const before = JSON.stringify(two);
    const expected = buildEngineRepoBundle({ definitions: two.fhir.resources.map(r => ({ ...r.resource, resourceType: String(r.resource.resourceType) })),
      cqlByLibraryFile: cqlIndex(two.cqlLibraries), caseInput: { caseName: "", resources: [] } });
    const result = emitCrlBundle(fixture, {sourceOrigins:true});
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("emit refused");
    expect(result.bundle).toEqual(expected.bundle);
    expect(result.definitionOrigins!.length).toBeGreaterThan(0);
    for (const origin of result.definitionOrigins!) {
      expect(origin.library).toBeTruthy();
      expect(result.bundle.entry.some(e => e.resource.url === origin.canonical)).toBe(true);
    }
    expect(JSON.stringify(result.bundle)).not.toContain('sourceLibraryName');
    expect(JSON.stringify(result.bundle)).not.toContain('sourceDecision');
    expect(JSON.stringify(two.fhir.resources)).not.toContain('sourceDecision');
    expect(emitCrlBundle(fixture)).not.toHaveProperty('definitionOrigins');
    expect(result.resourceCount).toBe(two.fhir.resources.length);
    expect(result.bundle.entry.some(e => ["Patient", "Observation", "QuestionnaireResponse"].includes(e.resource.resourceType))).toBe(false);
    for (const entry of result.bundle.entry) {
      if (entry.resource.resourceType !== "Library") continue;
      for (const content of entry.resource.content ?? []) {
        if (content.contentType !== "text/cql") continue;
        expect(content.url).toBeUndefined();
        expect(Buffer.from(content.data!, "base64").toString("utf8"))
          .toBe(cqlIndex(two.cqlLibraries)[`${entry.resource.id}.cql`]);
      }
    }
    expect(JSON.stringify(two)).toBe(before);
  });

  it.each(["unmatched", "collision", "import", "missing-cql"] as const)("refuses %s with a reason and no partial Bundle", (failure) => {
    const two = twoLane.emitCrlTwoLane(fixture);
    if (failure === "unmatched") { two.success = false; two.fhir.unmatched.push({ kind: "unresolved-concept", text: "Missing" }); }
    if (failure === "collision") { two.success = false; two.filenameCollisions.push("Duplicate.cql"); }
    if (failure === "import") { two.success = false; two.cql.success = false;
      two.cql.importDiagnostics.push({ severity: "error", kind: "library-not-found", message: "Missing source", filePath: fixture } as typeof two.cql.importDiagnostics[number]); }
    if (failure === "missing-cql") two.cqlLibraries = [];
    vi.spyOn(twoLane, "emitCrlTwoLane").mockReturnValue(two);
    const result = emitCrlBundle(fixture);
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("bundle");
    expect(result.diagnostics.some(d => d.severity === "error")).toBe(true);
    expect(JSON.stringify(result.diagnostics)).toMatch(/Missing|Duplicate|missing-cql/);
    if (failure === "missing-cql") expect(result).toHaveProperty("missingCql", expect.arrayContaining([expect.any(String)]));
  });
});
