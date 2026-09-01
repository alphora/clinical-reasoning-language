// #189 2d P2 — tests for the per-concept case-feature RECORD resolver (inert precursor).
// Grounded in the deriver's verified output shapes (see emit/tests/effectiveRepresentation.test.ts): `exists this`
// on ANY resource → NO value datum (presence is orthogonal to the record's value — a value-bearing Observation is
// still read by presence, not by its value); Encounter → unsupported-resource; bare-scalar →
// unsupported-reduction-form; Patient age → uncoded (supplied).

import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import type { Concept } from "../../ast/types";
import type { OwningLibraryMetadata } from "../../emit/effectiveRepresentation";
import { resolveCaseFeatureRecord } from "../caseFeatureRecord";

const OWNING: OwningLibraryMetadata = {
  libraryName: "T",
  canonicalBase: "http://example.org/crl/t",
  localDomainId: "t",
};

const concept = (src: string, name: string): Concept => {
  const c = parseInput(src).statements.find((s) => s.type === "Concept" && s.name === name);
  if (!c) throw new Error(`concept "${name}" not found`);
  return c as Concept;
};

const resolve = (body: string, name: string) =>
  resolveCaseFeatureRecord(concept(`library "T".\n${body}`, name), OWNING);

describe("resolveCaseFeatureRecord — #189 2d P2 (case-feature record resolution)", () => {
  it("Condition + exists this → a valueless record; featureExpression target is the `<X> Records` twin", () => {
    const r = resolve(
      `concept "Qualifying Diagnosis":\n- type is Condition.\n- value type is boolean.\n- code is \`qd\`.\n- definition is exists this.\n`,
      "Qualifying Diagnosis",
    );
    expect(r.kind).toBe("record");
    if (r.kind !== "record") return;
    expect(r.descriptor.resourceType).toBe("Condition");
    expect(r.descriptor.valueElement).toBeUndefined(); // valueless — no value[x], truth is `exists`
    expect(r.target.define).toBe("Qualifying Diagnosis Records");
  });

  it("MedicationRequest + exists this → a valueless record (NOT forced to Observation — the hack is gone)", () => {
    const r = resolve(
      `concept "Active Rx":\n- type is MedicationRequest.\n- value type is boolean.\n- code is \`rx\`.\n- definition is exists this.\n`,
      "Active Rx",
    );
    expect(r.kind).toBe("record");
    if (r.kind !== "record") return;
    expect(r.descriptor.resourceType).toBe("MedicationRequest");
    expect(r.descriptor.valueElement).toBeUndefined();
    expect(r.target.define).toBe("Active Rx Records");
  });

  it("Observation + boolean + exists this → a valueless record (exists is PRESENCE; the Observation's value is orthogonal and NOT read)", () => {
    const r = resolve(
      `concept "Screen Positive":\n- type is Observation.\n- value type is boolean.\n- code is \`sp\`.\n- definition is exists this.\n`,
      "Screen Positive",
    );
    expect(r.kind).toBe("record");
    if (r.kind !== "record") return;
    expect(r.descriptor.resourceType).toBe("Observation");
    // `exists([Observation: code])` is true when a record EXISTS regardless of its value (a present
    // `value=false` Observation still exists → true). There is no "value-filtered exists" — no value datum,
    // so the SD carries no `value[x]`. A value READ is `most recent this`, a different reduction.
    expect(r.descriptor.valueElement).toBeUndefined();
    expect(r.target.define).toBe("Screen Positive Records");
  });

  it("⭐ Encounter resolves to a RECORD — it is a case-feature row now", () => {
    // ⚠ This case was titled "Encounter (no registry row)", which was never true: Encounter always HAD a row,
    // it was `caseFeature: false` — a CEL-writer-only ambient datum. That flag FLIPPED (operator,
    // 2026-08-30) after both mechanics it was assumed to lack (`type[]` array coding, nested `period.start`
    // recency) were MEASURED to construct and round-trip in CQL.
    const r = resolve(
      `concept "Enc":\n- type is Encounter.\n- value type is boolean.\n- code is \`enc\`.\n- definition is exists this.\n`,
      "Enc",
    );
    expect(r.kind).toBe("record");
    if (r.kind !== "record") return;
    expect(r.descriptor.resourceType).toBe("Encounter");
    expect(r.target.define).toBe("Enc Records");
  });

  it("a resource with NO registry row → unsupported-resource (NOT re-hacked to Observation)", () => {
    // The point the Encounter case used to carry, now made by a genuinely unlisted resource: an unmodeled
    // type fails closed rather than being coerced into an Observation, which is the hack #189 removes.
    const r = resolve(
      `concept "G":\n- type is Goal.\n- value type is boolean.\n- code is \`g\`.\n- definition is exists this.\n`,
      "G",
    );
    expect(r.kind).toBe("unsupported-resource");
    if (r.kind !== "unsupported-resource") return;
    expect(r.resourceType).toBe("Goal");
  });

  it("bare-scalar `code is` (no reduction — the legacy/pre-migration form) → not-a-record (must be re-authored)", () => {
    const r = resolve(
      `concept "Legacy":\n- type is Condition.\n- value type is boolean.\n- code is \`legacy\`.\n`,
      "Legacy",
    );
    expect(r.kind).toBe("not-a-record");
    if (r.kind !== "not-a-record") return;
    // Condition cannot carry a stored boolean, so the PURE-QUESTION cell below deliberately does NOT claim it:
    // the right re-authoring is `definition is exists this`, which KEEPS the natural resource
    // (`cql-to-crl-type-valuetype-rule.md:30` forbids steering it to `Observation+boolean`).
    expect(r.derivationKind).toBe("unsupported-reduction-form");
  });

  // ⭐ #189 null/pause — the PURE QUESTION cell (`tmp/DESIGN-apply-null-pause.md` §3.1/§3.5).
  // A local-coded boolean with NO definition and no source rep is the ONLY shape a `when` may gate on: only a
  // stored boolean lets a user answer true / false / leave-unanswered. Before this cell it resolved
  // `not-a-record`, NO case-feature StructureDefinition was emitted, and the generated Questionnaire contained
  // no question at all — the tree denied on something the user was never given a way to answer.
  it("PURE QUESTION: Observation + boolean + bare `code is` → a record WITH a boolean answer slot", () => {
    const r = resolve(
      `concept "Can Use Equipment At Home":\n- type is Observation.\n- value type is boolean.\n- code is \`safe-home-use\`.\n`,
      "Can Use Equipment At Home",
    );
    expect(r.kind).toBe("record");
    if (r.kind !== "record") return;
    expect(r.descriptor.resourceType).toBe("Observation");
    // The answer slot — this is what becomes the answerable `Observation.value[x]` boolean questionnaire item.
    expect(r.descriptor.valueElement).toBe("value");
    expect(r.descriptor.datumValueType).toBe("boolean");
    // T5 step 2b — a question now lowers exactly like `code is` + `definition is exists this`: the answer
    // RECORDS are published as `"<X> Records"` in LocalPrimitives and `"<X>"` is the three-state determination
    // in Inferences. The featureExpression must target the records define, or it dangles (Inv 2(d)).
    expect(r.target.define).toBe("Can Use Equipment At Home Records");
  });

  // ⚠ BOUNDARY, NOT A TARGET. Pins today's edge of the cell so it cannot move by accident. Non-boolean
  // questions ("what is the BMI?") ARE in scope for this work (design §7 — there is no deferred list); when
  // they land, this expectation CHANGES to a record with a Quantity answer slot. Do not read it as the
  // intended end state.
  it("PURE QUESTION cell claims ONLY boolean — a bare `code is` Quantity stays not-a-record (for now)", () => {
    const r = resolve(
      `concept "Most Recent BMI":\n- type is Observation.\n- value type is Quantity.\n- code is \`bmi\`.\n`,
      "Most Recent BMI",
    );
    expect(r.kind).toBe("not-a-record");
    if (r.kind !== "not-a-record") return;
    expect(r.derivationKind).toBe("unsupported-reduction-form");
  });

  it("standalone Patient age (uncoded arm, posrep) → supplied-patient (READ, no case-feature SD — charter §2)", () => {
    // The uncoded arm is the age POSREP form (birthDate projection), NOT the retired `definition is age` carve-out.
    const r = resolve(
      `concept "Age 18 Or Older":\n- value type is boolean.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`,
      "Age 18 Or Older",
    );
    expect(r.kind).toBe("supplied-patient");
  });
});
