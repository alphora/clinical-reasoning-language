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
    // ⚠ PIN THE MULTIPLICITY, not just the name. `resultKind` records the CQL type of the target define,
    // and "every current target is a record-list" was a COMMENT-ONLY claim until this line — which is
    // exactly the shape probe 2 measured failing at ≥2 records. T4 is what introduces a `record` target.
    expect(r.target.resultKind).toBe("record-list");
    expect(r.target.layer).toBe("local-primitives");
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE ANSWERABILITY CHAIN, pinned — because prose has not held it.
//
// Charter (§3, "QUESTIONS, ANSWERS AND featureExpression ARE THE SAME THING") states this correctly and
// records that it "has been re-derived wrongly at least four times in one session, by me and by both
// review arms". It was re-derived wrongly AGAIN on 2026-09-04, in a design round, from an overstated
// comment in the goal fixture — while the charter clause itself sat unread.
//
// So the rule is pinned HERE, where breaking it fails a test at the moment of the edit, rather than
// relying on a document that is read once at the start of a round.
//
//     `code is`  ⇒  QUESTION  ⇒  ANSWERABLE  ⇒  CASE FEATURE
//
// ⚠ AND THE CHAIN DOES NOT EXTEND TO PRE-FILLABLE. "Answerable" and "has a `cpg-featureExpression`" are
// DIFFERENT PROPERTIES — charter: *"An answerable is not automatically one."* The gap between them is
// where #317 lives.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("the answerability chain — answerable ≠ pre-fillable", () => {
  // ⚠ THE CARVE-OUT THAT BREAKS THE CHAIN, and the one nothing pinned. A coded history IS a case feature
  // and IS asked — but it gets NO featureExpression, because answering APPENDS a record, so there is
  // nothing to confirm. It is also what makes the question work: a target yielding MULTIPLE values into a
  // non-repeating group makes `$populate` DELETE the item.
  it("a `shape is RecordSet` coded concept IS a case feature but gets NO featureExpression target", () => {
    const r = resolve(
      `concept "Height History":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is \`hh\`.\n`,
      "Height History",
    );
    expect(r.kind).toBe("record"); // asked — it IS a case feature
    if (r.kind !== "record") return;
    expect(r.target).toBeUndefined(); // …and deliberately NOT pre-fillable
  });

  // The positive half of the same distinction: shape decides what a concept PUBLISHES, never whether it
  // may be asked. A RecordSet and a pure question are both answerable; they differ only in the target.
  it("a bare `code is` pure question IS both a case feature AND pre-fillable", () => {
    const r = resolve(
      `concept "Smoker":\n- type is Observation.\n- value type is boolean.\n- code is \`sm\`.\n`,
      "Smoker",
    );
    expect(r.kind).toBe("record");
    if (r.kind !== "record") return;
    expect(r.target).toBeDefined();
    expect(r.target!.define).toBe("Smoker Records");
  });

  // ⚠ THE THIRD TERMINATOR of a derivation closure is already pinned above — "standalone Patient age
  // (uncoded arm, posrep) → supplied-patient". Not duplicated here. A closure may bottom out in `code is`
  // (ANSWERABLE), a representation (SOURCED), or the supplied Patient arm (SUPPLIED); #291 is the check
  // that a closure reaching NONE of the three is an authoring error rather than a concept that is null
  // forever. That matters most once `defined as exists` may drop its `code is` (#318), because today the
  // emitter's refusal prevents the degenerate case by accident.
});
