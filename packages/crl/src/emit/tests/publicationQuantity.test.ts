import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
import { adaptObservationPublicationCandidate, type PublicationObservationSource } from "../publicationSource";
import { readPublicationQuantity, publicationQuantityAtLeast } from "../publicationQuantity";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
import { selectPublicationCandidate } from "../publicationSelection";

// REFACTOR:grounded (#320, plan587): measurements preserve values, units, unknowns and source identity.
const source = `library "Measurements".
terminology "Height Source":
- system is \`http://loinc.org\`.
- code is \`8302-2\`.
concept "Height":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`height\`.
- shape reduction is most recent.
- source representation:
  - type is Observation.
  - coded from "Height Source".
`;
const options = { canonicalBase: "http://example.org", policyId: "measurements" };
function prepare(text = source) {
  const p = buildCRL(text); expect(p.success, JSON.stringify(p.errors)).toBe(true);
  const program = prepareSingleLibraryPublication(p.result!, options);
  expect(program.diagnostics).toEqual([]);
  return { ast: p.result!, d: program.descriptors[0] };
}
const measurement = (value: unknown = { value: 200, unit: "cm" }) => ({
  resourceType: "Observation", id: "h", status: "final", subject: { reference: "Patient/p" },
  code: { coding: [{ system: "http://loinc.org", code: "8302-2" }] },
  effectiveDateTime: "2026-09-01", ...(value === null ? {} : { valueQuantity: value }),
});
describe("Quantity publication", () => {
  it.each([
    [{value:100,unit:"cm"},{value:1,unit:"m"},true],
    [{value:99.99999999,unit:"cm"},{value:1,unit:"m"},false],
    [{value:100.00000001,unit:"cm"},{value:1,unit:"m"},true],
    [{value:30,unit:"kg/m2"},{value:30,unit:"kg/m2"},true],
    [{value:29.99999999,unit:"kg/m2"},{value:30,unit:"kg/m2"},false],
  ])("compares exact decimal quantities %j against %j", (q,t,want) => expect(publicationQuantityAtLeast(q,t)).toEqual({kind:"known",value:want}));
  it.each([
    [{ value: 200, unit: "cm" }, { kind: "known", value: 200, unit: "cm" }],
    [{ value: 200, system: "http://unitsofmeasure.org", code: "cm", unit: "m" }, { kind: "known", value: 200, unit: "cm" }],
    [{ unit: "cm" }, { kind: "unknown" }],
    [null, { kind: "unknown" }],
    [{ value: 0, unit: "kg" }, { kind: "known", value: 0, unit: "kg" }],
  ])("interprets wire value %j", (q, expected) => expect(readPublicationQuantity(q)).toEqual(expected));
  it.each([
    { value: 2 }, { value: 2, system: "other", code: "m" },
    { value: 2, system: "http://unitsofmeasure.org", unit: "m" },
    { value: 2, unit: "m", comparator: ">" }, { value: Infinity, unit: "m" },
  ])("refuses invalid exact measurement %j", q => expect(readPublicationQuantity(q).kind).toBe("error"));
  it("projects source analytical identity while retaining quantity and validity", () => {
    const { d } = prepare();
    const out = adaptObservationPublicationCandidate(d, d.sources![0] as PublicationObservationSource, measurement(), "Patient/p");
    expect(out).toMatchObject({ kind: "candidate", candidate: { arm: "source", retrievedInputIdentity: "Observation/h", validity: "2026-09-01", resource: {
      code: { coding: [d.localCode] }, valueQuantity: { value: 200, unit: "cm" }, effectiveDateTime: "2026-09-01", derivedFrom: [{ reference: "Observation/h" }],
    } } });
    if (out.kind === "candidate") expect(out.candidate.resource.id).toBeUndefined();
  });
  it("permits uncoded source publication without an answer representation", () => {
    const { ast, d } = prepare(source.replace('- code is `height`.\n', ""));
    expect(d.localCode).toBeUndefined(); expect(d.profileUrl).toBeUndefined();
    const out = adaptObservationPublicationCandidate(d, d.sources![0] as PublicationObservationSource, measurement(), "Patient/p");
    expect(out).toMatchObject({ kind: "candidate", candidate: { resource: { code: { text: "Height" } } } });
    const emitted = emitCQLFromAST(ast, options);
    expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
  });
  it("selects an unknown-valued newer assertion instead of an older measured value", () => {
    const { d } = prepare();
    const a = adaptObservationPublicationCandidate(d, d.sources![0] as PublicationObservationSource, measurement(), "Patient/p");
    const b = adaptPublicationCandidate(d, { ...measurement(null), id: "answer", effectiveDateTime: "2026-09-02" });
    if (a.kind !== "candidate" || b.kind !== "candidate") throw Error("adaptation failed");
    const result = selectPublicationCandidate([a.candidate, b.candidate], { conceptId: d.conceptId, equalTime: "error" });
    expect(result).toMatchObject({ state: "selected", candidate: { key: "Observation/answer" } });
    if (result.state === "selected") expect(result.candidate.resource.valueQuantity).toBeUndefined();
  });
  it("retains duplicate retrieved identity for the final selector to reject", () => {
    const { d } = prepare();
    const a = adaptObservationPublicationCandidate(d, d.sources![0] as PublicationObservationSource, measurement(), "Patient/p");
    if (a.kind !== "candidate") throw Error(a.message);
    expect(selectPublicationCandidate([a.candidate, a.candidate], { conceptId: d.conceptId, equalTime: "error" }).state).toBe("failed");
  });
  it("emits source and local Quantity paths in direct and partitioned libraries", () => {
    const { ast } = prepare();
    const direct = emitCQLFromAST(ast, options);
    expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
    expect(direct.result).toContain('[Observation: { System.Code');
    const lowered = lowerLocalCodes(ast, options);
    for (const partition of [FULL_PARTITION, { ...FULL_PARTITION, libraryNameFor: (_p: string, view: string) => `Custom${view}` }]) {
      const result = emitPartitioned(lowered.ast, "Measurements", options.policyId, partition, options);
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
    }
  });
});
