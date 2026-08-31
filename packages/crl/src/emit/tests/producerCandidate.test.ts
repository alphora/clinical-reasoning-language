import { describe, it, expect } from "vitest";

import * as path from "node:path";
import { readFileSync } from "node:fs";

import { emitCQL } from "../../cql-emitter/emitCQL";
import { emitCQLImports } from "../../imports/emit";
import { buildCRL } from "../../index";
import { resolveRecencyValueConcept } from "../../template-match/recencyValueConcept";
import type { Concept } from "../../ast/types";
import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
import { conceptRefsOfConcept, conceptRefsOfDefinition } from "../../ast/conceptDependencies";

/**
 * ⭐ #189 — the PRODUCER stage's constructed candidate, and the refusals that guard it.
 *
 * ⚠ THE HAPPY PATH IS EXECUTION-VERIFIED ELSEWHERE, NOT HERE. `tmp/nullprobe/bmiexec/` runs the emitted
 * layered library against the real cqf CQL engine: 90 kg / (1.7 m)^2 yields a constructed candidate valued
 * `31100 'g.m-2'` stamped MAY (the `Max` of Weight-May and Height-Feb, §5b), carrying the case-feature
 * profile url, and the threshold over it constructs a second candidate `true` at that stamp. This file
 * covers what a running engine CANNOT show: that the shapes we refuse are refused, and refused LOUDLY.
 */

const BASE = { canonicalBase: "http://example.org/crl/pc", localDomainId: "pc", policyId: "pc" };

/** The committed integration fixture — the goal's producer shape, both value modes. */
const FIXTURE_POLICY = path.resolve(__dirname, "fixtures/producer-wire/policy.crl");

const emitLane = (): { success: boolean; cqlByLibrary?: { cql?: string }[] } =>
  emitCQLImports(FIXTURE_POLICY) as unknown as { success: boolean; cqlByLibrary?: { cql?: string }[] };

const HEADER = `library "PC".

terminology "H VS":
- valueset is \`http://example.org/vitals/ValueSet/height\`.
terminology "W VS":
- valueset is \`http://example.org/vitals/ValueSet/weight\`.
terminology "B VS":
- valueset is \`http://example.org/vitals/ValueSet/bmi\`.
`;

const leaf = (name: string, code: string, vs: string, shape = "Record"): string => `
concept "${name}":
- shape is ${shape}.
- type is Observation.
- value type is Quantity.
- code is \`${code}\`.
${shape === "Record" ? "- definition is most recent this.\n" : ""}- source representation:
  - type is Observation.
  - coded from "${vs}".
`;

const bmi = `
concept "BMI":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`bmi\`.
- definition is body mass index of "Weight" and "Height", then most recent this.
- source representation:
  - type is Observation.
  - coded from "B VS".
`;

function emit(src: string, opts: Record<string, unknown> = {}) {
  return emitCQL(src, { libraryName: "PC", ...BASE, ...opts }) as unknown as {
    success: boolean;
    errors?: { kind?: string; message?: string }[];
  };
}

const kindsOf = (r: { errors?: { kind?: string }[] }): string[] => (r.errors ?? []).map((e) => e.kind ?? "");
const msgOf = (r: { errors?: { message?: string }[] }, needle: string): string =>
  (r.errors ?? []).map((e) => e.message ?? "").find((m) => m.includes(needle)) ?? "";

describe("#189 — a producer stage's constructed candidate", () => {
  const good = HEADER + leaf("Height", "height", "H VS") + leaf("Weight", "weight", "W VS") + bmi;

  it("⭐ the producer's candidate REACHES THE EMITTED SPACE — constructor defined, called, unioned in", () => {
    // ⚠ THIS ASSERTED ONLY THAT ONE ERROR KIND WAS ABSENT, which a panel arm correctly called a non-test: a
    // regression to a DIFFERENT error — or back to silently omitting the producer while reporting success —
    // passed it. The integration evidence lived only under `tmp/`: gitignored, prunable, invisible to CI,
    // which is the "handoff instead of a fixture" failure this repo keeps paying for. It is a FIXTURE now.
    //
    // ⚠ Through `emitCQLImports`, not `emitCQL`: a both-representation merge is only valid in the layered
    // case-feature lane, and a direct emit collides the two twins into a duplicate define.
    const r = emitLane();
    expect(r.success).toBe(true);
    const cql = (r.cqlByLibrary ?? []).map((l) => l.cql ?? "").join(String.fromCharCode(10));
    // 1. the constructor FUNCTION is defined — it had NO production caller at all before this slice
    expect(cql).toContain("define function CRLConstructObservationQuantity(");
    // 2. and its boolean sibling, so both value modes are covered
    expect(cql).toContain("define function CRLConstructObservationBoolean(");
    // 3. the producer's computation is IN the emitted text. Its silent ABSENCE under `success: true` is the
    //    exact failure this slice exists to make impossible — measured once on this very shape.
    expect(cql).toContain("CRLCommon.BodyMassIndex(");
    expect(cql).toContain("CRLCommon.AtLeast(");
    // 4. §5b — all-or-nothing, and a `Max` only where there is more than one determinant
    expect(cql).toContain("then null as System.DateTime");
    expect(cql).toContain("Max({");
    // 5. the candidate is a THIRD arm of the space the terminal selection reads, beside local and source
    const bmi = cql.slice(cql.indexOf('define "BMI":'));
    expect(bmi).toContain("LocalPrimitives");
    expect(bmi).toContain("ExternalPrimitives");
    expect(bmi).toContain("CRLConstructObservationQuantity(");
    expect(bmi).toContain("where C is not null");
    // 6. and it is stamped with the case-feature profile url the FHIR lane emits (parity, not a lookalike)
    expect(bmi).toContain("'http://example.org/producerwire/StructureDefinition/producerwire-bmi'");
  });

  it("⚠ REFUSES a member-existence interface over a PRODUCER-BEARING referent", () => {
    // MEASURED as a silent WRONG ANSWER, not a missing feature: the fold's arms read the retrieves directly,
    // so `exists ("Obese")` evaluated FALSE on data where `Obese` is a constructed `true` — two defines in
    // one library publishing contradictory determinations under `success: true`. ⚠ THIS SLICE made it
    // reachable (before, such a referent hard-failed and no CQL shipped), so it is this slice's to refuse.
    const src = readFileSync(FIXTURE_POLICY, "utf8").replace(
      'defined as exists ("Weight")',
      'defined as exists ("Obese")',
    );
    const r = emit(src, { libraryName: "BMI Wire" });
    expect(r.success).toBe(false);
    expect(msgOf(r, "member-existence interface")).toContain("would publish");
  });

  it("⚠ REFUSES when no policy id is available, rather than stamping a profile the FHIR lane never emits", () => {
    // `policyId` is OPTIONAL and normalizes to `""`. A candidate's `meta.profile` MUST equal the case-feature
    // StructureDefinition url the FHIR lane emits; with no policy id that url cannot be composed, and an
    // `unnamed` canonical would silently disagree with the other lane. Panel round 1, gpt-5.6 #7.
    const r = emit(good, { policyId: undefined });
    expect(r.success).toBe(false);
    expect(kindsOf(r)).toContain("emit-reduction-not-active");
    expect(msgOf(r, "policy id")).toContain("case-feature StructureDefinition url");
  });

  it("⚠ REFUSES a RecordSet operand — a history has no one value and no one timestamp", () => {
    // The catalog grounds `BodyMassIndex` against two SINGLETON Observations. A `shape is RecordSet` operand
    // binds a different overload or none, and `componentStampCql`'s record read has nothing to read. How to
    // PAIR two histories is an open question, not an omission — so this refuses with that reason rather than
    // emitting CQL that dies in the translator. Panel round 1, both arms.
    const src = HEADER + leaf("Height", "height", "H VS", "RecordSet") + leaf("Weight", "weight", "W VS") + bmi;
    const r = emit(src);
    expect(r.success).toBe(false);
    expect(msgOf(r, "Height")).toContain("SINGLE RECORD per operand");
  });
});

describe("#189 — `value projection` and the age lane", () => {
  // ⚠ THE REGRESSION BOTH ARMS ASKED FOR. `resolveRecencyValueConcept` used to reject EVERY `value
  // projection` posrep; narrowing that to the AGE lane is what admits the goal's `Obese`. The correction
  // both arms made to my reasoning: the deleted line was NOT redundant with the age check — it was the
  // classifier's only NON-age projection gate. So the broadening is DELIBERATE, and what makes it safe is
  // that a projection posrep is refused DOWNSTREAM. This pins that it still is.
  const src = `library "PJ".

terminology "O VS":
- valueset is \`http://example.org/vitals/ValueSet/obese\`.

concept "Obese":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`obese\`.
- definition is most recent this.
- source representation:
  - type is Condition.
  - coded from "O VS".
  - value projection is exists this.
`;

  it("CLASSIFIES a non-age projection as the both-rep merge", () => {
    const built = buildCRL(src) as unknown as { result?: { statements: Concept[] } };
    const obese = (built.result?.statements ?? []).find((s) => (s as Concept).name === "Obese") as Concept;
    expect(resolveRecencyValueConcept(obese).kind).toBe("recency-value");
  });

  it("⭐ and now BUILDS its arm — each source record becomes ONE candidate carrying `true`", () => {
    // ⚠ THIS TEST PINNED THE OPPOSITE UNTIL THE ARM LANDED: `deriveOneSourceArm` deferred a projection posrep
    // `out-of-scope`, the merge got one descriptor where it needs `[local-exact, source]`, and it failed
    // loudly — which was CORRECT while the arm was unbuilt. The refusal was never the goal; it was the
    // honest state of a classified-but-unbuilt shape. Now it is built, and the pin flips.
    //
    // ⚠ REP-LOCAL AND PER RECORD, and that is the semantics: zero source records ⇒ zero invocations ⇒ NO
    // candidate. An `exists this` projection can only ever contribute `true`, never `false`, which is what
    // lets an unestablished determination PAUSE rather than deny. EXECUTED across the acceptance matrix in
    // `tmp/NOTES-obese-projection-executed.md`.
    const r = emit(src, { libraryName: "PJ" });
    expect(kindsOf(r)).not.toContain("emit-most-recent-derivation");
    const cql = (r as unknown as { result?: string }).result ?? "";
    // The retrieve stays the honest SOURCE records; the projection transforms each into a candidate.
    expect(cql).toContain("return CRLConstructObservationBoolean(");
    expect(cql).toContain("FHIR.boolean { value: true }");
    // stamped by the record it was projected FROM, through the SOURCE resource's own registry row
    expect(cql).toContain("(C).recordedDate.value");
  });
});

describe("#189 — a producer edge is a DEPENDENCY edge", () => {
  // ⚠⚠ THE REGRESSION THIS PINS WAS REAL AND SHIPPED FOR ONE COMMIT. When producer stages started lowering,
  // their operands moved from `definition` onto `__recencyProducerSpecs` — and every walk that asked
  // `conceptRefsOfDefinition` stopped seeing them. The merge twin's definition is a synthetic
  // `most recent <self>`, so `Obese` reported only its own name and the case-feature walk halted there:
  // 2 of 5 reachable concepts got a StructureDefinition, and a constructed `BMI` candidate carried a
  // `meta.profile` canonical that resolved to NOTHING.
  //
  // ⚠ Nothing was wrong with `Weight`/`Height`. They were unreachable through an edge that had gone
  // invisible — which is why "these concepts are fine on their own" is not evidence that a walk reaches them.
  //
  // THE RULE: moving an edge off `definition` does not move it out of the graph.
  it("survives lowering — the case-feature walk still reaches THROUGH a producer", () => {
    const src = HEADER + leaf("Height", "height", "H VS") + leaf("Weight", "weight", "W VS") + bmi + `
concept "Big":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`big\`.
- defined as exists ("BMI").
`;
    const built = buildCRL(src) as unknown as { result?: { statements: Concept[] } };
    const lowered = lowerLocalCodes(built.result as never, {
      canonicalBase: "http://example.org/crl/pc",
      localDomainId: "pc",
      policyId: "pc",
    }) as unknown as { ast: { statements: Concept[] } };

    const merge = lowered.ast.statements.find(
      (s) => s.name === "BMI" && (s as Concept).__loweringRole === "public-determination",
    ) as Concept;

    // The definition alone reports only the synthetic self-reference...
    expect(conceptRefsOfDefinition(merge.definition).map(String)).toEqual(["BMI"]);
    // ...while the WHOLE concept still names the operands the derivation actually depends on.
    expect(conceptRefsOfConcept(merge).map(String).sort()).toEqual(["BMI", "Height", "Weight"]);
  });
});
