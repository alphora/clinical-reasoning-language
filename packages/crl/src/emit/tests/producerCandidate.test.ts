import { describe, it, expect } from "vitest";

import { emitCQL } from "../../cql-emitter/emitCQL";
import { buildCRL } from "../../index";
import { resolveRecencyValueConcept } from "../../template-match/recencyValueConcept";
import type { Concept } from "../../ast/types";

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

  it("⭐ the producer no longer refuses — its candidate reaches the emitted space", () => {
    // The `emit-reduction-not-active` sentinel that stood here is GONE for this shape. What replaces it is a
    // constructed candidate unioned into the merge's space, so the derivation can never be silently dropped.
    const r = emit(good);
    expect(kindsOf(r)).not.toContain("emit-reduction-not-active");
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

  it("⚠ but still REFUSES it downstream — classifying a shape is not building its arm", () => {
    // `deriveOneSourceArm` defers a projection posrep `out-of-scope`, so the merge gets one descriptor where
    // it needs `[local-exact, source]` and fails loudly. If this ever passes without the projection arm being
    // BUILT, a projection has been silently dropped — which is the failure this whole slice exists to prevent.
    const r = emit(src, { libraryName: "PJ" });
    expect(r.success).toBe(false);
    expect(kindsOf(r)).toContain("emit-most-recent-derivation");
  });
});
