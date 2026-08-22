// #189 CEL-writer todo 1 — the fact-role classifier (inert seam; design panel disc 486 + impl round disc 487).
// `classifyConceptRole` is the CEL instance writer's dispatch axis: it decides whether a fact's coding is DERIVED
// from a local `code is` concept (its local arm is LIVE), carried from a source-only binding, or belongs to a
// pure derivation with no datum. It consumes the SHARED `hasLocalCode`/`hasSourceBinding` predicates the descriptor
// deriver uses, so it cannot drift from the definition lane. INERT in todo 1 (consumed by no write path yet), so
// this test pins the classification directly. The contested cells (bothrep, patient-age, uncoded posrep) are the
// point of this test — impl round disc 487 caught that an earlier `both` cell wrongly read patient-age as parked.
import { describe, it, expect } from "vitest";
import { buildCRL } from "../../../index";
import { classifyConceptRole } from "../emitFhir";
import type { CRL, Concept } from "../../../ast/types";

function conceptsOf(src: string): Map<string, Concept> {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("fixture failed to build: " + JSON.stringify(built.errors));
  }
  const ast = built.result as CRL;
  const m = new Map<string, Concept>();
  for (const s of ast.statements) if (s.type === "Concept") m.set(s.name, s);
  return m;
}

describe("classifyConceptRole (#189 CEL-writer todo 1)", () => {
  it("local `code is` concept (with a reduction) → 'local'", () => {
    const c = conceptsOf(`library "L".
concept "Local Med":
- type is MedicationRequest.
- value type is boolean.
- code is \`med-local\`.
- definition is exists this.`);
    expect(classifyConceptRole(c.get("Local Med")!)).toBe("local");
  });

  it("source-only `coded from` concept (no local code) → 'remote'", () => {
    const c = conceptsOf(`library "L".
concept "Remote Enc":
- type is Encounter.
- value type is CodeableConcept.
- coded from "VS"."Screening Encounter".`);
    expect(classifyConceptRole(c.get("Remote Enc")!)).toBe("remote");
  });

  it("BOTHREP (`code is` + `coded from`) → 'local' — the local arm is live; the source arm is #189-D2-deferred", () => {
    const c = conceptsOf(`library "L".
concept "Local And Sourced":
- type is Condition.
- value type is boolean.
- code is \`local-cond\`.
- coded from "VS"."Some Diagnoses".`);
    expect(classifyConceptRole(c.get("Local And Sourced")!)).toBe("local");
  });

  it("PATIENT-AGE bothrep (`code is` + Patient `source representation`) → 'local' — assertable, NOT parked", () => {
    // The exact shape of the shipped patient-age concept (fhir-emitter/tests/fixtures/patient-age): a local
    // `code is` age Observation PLUS a Patient birthDate source representation. Impl round disc 487 caught that a
    // prior `both`-means-parked classification would fail-close a CEL fact asserting the local age Observation.
    const c = conceptsOf(`library "Patient Age".
concept "Age 18 Or Older":
- value type is boolean.
- code is \`age-18-or-older\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 18 years.`);
    expect(classifyConceptRole(c.get("Age 18 Or Older")!)).toBe("local");
  });

  it("UNCODED source-only posrep (no `code is`, no `coded from`) → 'remote'", () => {
    // 'remote' means "external source datum", NOT "carries an authored external coding": an uncoded posrep
    // (Patient/birthDate) has no authored code. Todo 2 splits coded-vs-uncoded within the remote lane.
    const c = conceptsOf(`library "L".
concept "Sourced Age Only":
- value type is boolean.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 18 years.`);
    expect(classifyConceptRole(c.get("Sourced Age Only")!)).toBe("remote");
  });

  it("pure `defined as` boolean (no datum) → 'derived'; its record-bearing operands stay 'local'", () => {
    const c = conceptsOf(`library "L".
concept "A":
- type is Condition.
- value type is boolean.
- code is \`a\`.
- definition is exists this.
concept "B":
- type is Condition.
- value type is boolean.
- code is \`b\`.
- definition is exists this.
concept "Either":
- value type is boolean.
- defined as ( "A" sem-or "B" ).`);
    expect(classifyConceptRole(c.get("Either")!)).toBe("derived");
    expect(classifyConceptRole(c.get("A")!)).toBe("local");
  });

  it("a code-less reduction over a named ref (no own datum) → 'derived'", () => {
    const c = conceptsOf(`library "L".
concept "Trials":
- type is Observation.
- shape is RecordSet.
- code is \`trial\`.
concept "Enough Trials":
- value type is boolean.
- definition is count "Trials" at least 2.`);
    expect(classifyConceptRole(c.get("Enough Trials")!)).toBe("derived");
    expect(classifyConceptRole(c.get("Trials")!)).toBe("local");
  });
});
