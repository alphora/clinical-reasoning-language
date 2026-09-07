import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
import { ageMethod, produceAgeCandidate, eligibleAgeCandidates, type PublicationAgeSource } from "../publicationAge";
import { selectPublicationCandidate, type PublicationCandidate } from "../publicationSelection";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
import * as path from "node:path";

// REFACTOR:grounded (#320, plan583): independently specified birthday, repair and override outcomes.
const text = readFileSync(path.join(__dirname, "fixtures/publication-age.crl"), "utf8");
const options = { canonicalBase: "http://example.org", policyId: "age-publication" };
function prepared(source = text) {
  const parsed = buildCRL(source); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  const program = prepareSingleLibraryPublication(parsed.result!, options);
  return { ast: parsed.result!, program, d: program.descriptors[0] };
}
const clock = { day: "2026-09-07", offsetHours: 0 };
type Candidate = PublicationCandidate<Record<string, unknown>>;
function local(value: boolean | undefined, validity = clock.day, method: "asserted" | "calculated" = "asserted", id = "a"): Candidate {
  const result = adaptPublicationCandidate(prepared().d, { resourceType: "Observation", id, status: "final", method: ageMethod(method), effectiveDateTime: validity, ...(value === undefined ? {} : { valueBoolean: value }) });
  if (result.kind !== "candidate") throw new Error(result.message);
  return result.candidate;
}
function calculate(birthDate?: string, day = clock.day, source?: PublicationAgeSource) {
  const d = prepared().d;
  return produceAgeCandidate(d, source ?? d.sources![0] as PublicationAgeSource, { resourceType: "Patient", id: "p", ...(birthDate === undefined ? {} : { birthDate }), meta: { lastUpdated: "2020-01-01T00:00:00Z" } }, "Patient/p", { ...clock, day });
}
function resolve(birth: string | undefined, inputs: Candidate[]) {
  const d = prepared().d, produced = calculate(birth);
  if (produced.kind === "error") throw new Error(produced.message);
  const eligible = eligibleAgeCandidates(d, [...inputs, ...(produced.kind === "candidate" ? [produced.candidate] : [])], clock);
  return eligible.kind === "error" ? eligible : selectPublicationCandidate(eligible.candidates, { conceptId: d.conceptId, equalTime: "error" });
}
describe("pattern-owned age publication", () => {
  it("publishes uncoded age without inventing an answer representation", () => {
    const source = text.replace(/^- code is .*\r?\n/m, "");
    const { ast, program, d } = prepared(source);
    expect(program.diagnostics).toEqual([]);
    expect(d.localCode).toBeUndefined(); expect(d.profileUrl).toBeUndefined();
    const produced = produceAgeCandidate(d, d.sources![0] as PublicationAgeSource, { resourceType: "Patient", id: "p", birthDate: "2008-09-07" }, "Patient/p", clock);
    expect(produced).toMatchObject({ kind: "candidate", candidate: { resource: { code: { text: "Adult" }, valueBoolean: true } } });
    if (produced.kind === "candidate") { expect(produced.candidate.resource.meta).toBeUndefined(); expect((produced.candidate.resource.code as any).coding).toBeUndefined(); }
    for (const result of [emitCQLFromAST(ast, options), emitPartitioned(lowerLocalCodes(ast, options).ast, "Age Publication", options.policyId, FULL_PARTITION, options)]) {
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
    }
  });
  it("admits the exact age pattern and emits direct/full/custom source bindings", () => {
    const { ast, program } = prepared();expect(program.diagnostics).toEqual([]);
    expect(program.descriptors[0].sources![0]).toMatchObject({ kind: "ageToday", op: "AtLeast", unit: "years", threshold: 18 });
    const direct = emitCQLFromAST(ast, options);expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
    expect(direct.result).toContain("[Patient] P where P.id.value = Patient.id.value");
    expect(direct.result).not.toContain("lastUpdated");
    const lowered = lowerLocalCodes(ast, options);
    for (const partition of [FULL_PARTITION, { ...FULL_PARTITION, libraryNameFor: (_p: string, view: string) => `Custom${view}` }]) {
      const result = emitPartitioned(lowered.ast, "Age Publication", options.policyId, partition, options);
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      expect(JSON.stringify(result.entries.find(e => e.libraryName.endsWith("Inferences")))).toContain("ExternalPrimitives");
    }
  });
  it.each(["age today less than 18 years", "age today at least 18 days", "exists this"])("does not admit unsupported Patient %s", projection => {
    expect(prepared(text.replace("age today at least 18 years", projection)).program.diagnostics.length).toBeGreaterThan(0);
  });
  it("crosses the birthday without a Patient update and dates the calculation today", () => {
    expect(calculate("2008-09-07", "2026-09-06")).toMatchObject({ kind: "candidate", candidate: { resource: { valueBoolean: false } } });
    expect(calculate("2008-09-07")).toMatchObject({ kind: "candidate", candidate: { validity: clock.day, resource: { valueBoolean: true, effectiveDateTime: clock.day, method: ageMethod("calculated") } } });
  });
  it.each([undefined, "2008", "2008-09"])("missing/partial DOB %s does not manufacture a negative", birth => expect(calculate(birth)).toEqual({ kind: "missing" }));
  it.each(["2026-13-01", "2026-02-30", "2027-01-01", "2027"])("invalid/future DOB %s fails", birth => expect(calculate(birth).kind).toBe("error"));
  it.each([
    ["2008-09-07", [local(false, "2026-09-06")], true],
    ["2008-09-07", [local(false)], false],
    ["2008-09-07", [local(undefined)], undefined],
    [undefined, [local(true)], true],
    [undefined, [local(false, "2026-09-06")], false],
    ["2008-09-07", [local(false, clock.day, "calculated")], true],
    [undefined, [local(true, clock.day, "calculated")], true],
  ] as const)("selects the intended determination (%s)", (birth, inputs, want) => {
    const result = resolve(birth, [...inputs]);expect(result).toMatchObject({ state: "selected", candidate: { resource: {} } });
    if ("state" in result && result.state === "selected") expect(result.candidate.resource.valueBoolean).toBe(want);
  });
  it("expires yesterday's cached calculation", () => expect(resolve(undefined, [local(true, "2026-09-06", "calculated")])).toEqual({ state: "missing" }));
  it.each(["2020", "2026-08"])("classifies definitely past partial validity %s", validity => {
    expect(resolve("2008-09-07", [local(false, validity)])).toMatchObject({ state: "selected", candidate: { resource: { valueBoolean: true } } });
    expect(resolve(undefined, [local(false, validity)])).toMatchObject({ state: "selected", candidate: { resource: { valueBoolean: false } } });
    expect(resolve(undefined, [local(false, validity, "calculated")])).toEqual({ state: "missing" });
  });
  it.each(["2027", "2026-10"])("rejects definitely future partial validity %s with or without a calculation", validity => {
    for (const birth of [undefined, "2008-09-07"]) expect(resolve(birth, [local(false, validity)])).toMatchObject({ kind: "error", code: "publication-age-future-input" });
  });
  it.each(["2026", "2026-09"])("does not guess same-day eligibility from overlapping validity %s", validity => {
    expect(resolve("2008-09-07", [local(false, validity)])).toMatchObject({ kind: "error", code: "publication-age-day-unknown" });
    expect(resolve(undefined, [local(false, validity, "calculated")])).toMatchObject({ kind: "error", code: "publication-age-day-unknown" });
  });
  it.each([[5.5, "2026-09-06T18:45:00Z"], [5.75, "2026-09-06T18:30:00Z"], [-3.5, "2026-09-08T03:15:00Z"]] as const)("preserves fractional timezone %s at midnight", (offsetHours, validity) => {
    const c = calculate("2008-09-07"); if (c.kind !== "candidate") throw Error("missing computation");
    expect(eligibleAgeCandidates(prepared().d, [local(false, validity), c.candidate], { ...clock, offsetHours })).toMatchObject({ kind: "eligible", candidates: [{ arm: "local", resource: { valueBoolean: false } }] });
  });
  it("validates identity before discarding stale inputs", () => {
    const old = local(false, "2026-09-06");expect(resolve("2008-09-07", [old, old])).toMatchObject({ kind: "error", code: "publication-duplicate-input" });
  });
  it("requires observable method rather than guessing from the local arm", () => {
    const answer = local(false);delete answer.resource.method;
    expect(resolve("2008-09-07", [answer])).toMatchObject({ kind: "error", code: "publication-age-method-required" });
  });
  it("keeps ambiguous same-day selection visible", () => expect(resolve("2008-09-07", [local(true), local(false, clock.day, "asserted", "b")])).toMatchObject({ state: "failed", diagnostic: { code: "publication-ambiguous-selection" } }));
  it("uses invocation offset to determine same-day eligibility", () => {
    const d = prepared().d, c = calculate("2008-09-07");if (c.kind !== "candidate") throw Error("missing computation");
    const eligible = eligibleAgeCandidates(d, [local(false, "2026-09-06T23:30:00-02:00"), c.candidate], clock);
    expect(eligible).toMatchObject({ kind: "eligible", candidates: [{ arm: "local", resource: { valueBoolean: false } }] });
  });
});
