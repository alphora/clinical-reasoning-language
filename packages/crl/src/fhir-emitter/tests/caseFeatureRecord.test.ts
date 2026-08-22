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
    expect(r.recordsDefineId).toBe("Qualifying Diagnosis Records");
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
    expect(r.recordsDefineId).toBe("Active Rx Records");
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
    expect(r.recordsDefineId).toBe("Screen Positive Records");
  });

  it("Encounter (no registry row) → unsupported-resource (NOT re-hacked to Observation)", () => {
    const r = resolve(
      `concept "Enc":\n- type is Encounter.\n- value type is boolean.\n- code is \`enc\`.\n- definition is exists this.\n`,
      "Enc",
    );
    expect(r.kind).toBe("unsupported-resource");
    if (r.kind !== "unsupported-resource") return;
    expect(r.resourceType).toBe("Encounter");
  });

  it("bare-scalar `code is` (no reduction — the legacy/pre-migration form) → not-a-record (must be re-authored)", () => {
    const r = resolve(
      `concept "Legacy":\n- type is Condition.\n- value type is boolean.\n- code is \`legacy\`.\n`,
      "Legacy",
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
