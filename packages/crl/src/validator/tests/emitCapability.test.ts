import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { Validator, type EmitCapabilityWarning, type ValidationResult } from "../validator";

// #189 / disc 495 Q6 — the authoring-time EMIT-CAPABILITY warning ("#1"). A concept with a local `code is` whose
// effective resource type (`type is`, defaulted to Observation) is not a case-feature-emittable registry resource
// gets an intrinsic WARNING (never an error — the registry is a deliberate SUBSET of capability). End-to-end via
// buildCRL → Validator, mirroring reductionShape.test.ts.

function validateFull(src: string): ValidationResult {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("build failed: " + JSON.stringify(built.errors));
  }
  return new Validator().validate(built.result);
}

function emitCapWarnings(src: string, conceptName?: string): EmitCapabilityWarning[] {
  return validateFull(src).warnings.filter(
    (e): e is EmitCapabilityWarning =>
      e.kind === "unsupported-casefeature-resource" &&
      (conceptName === undefined || e.conceptName === conceptName),
  );
}

describe("EmitCapabilityValidator (#189 disc 495 Q6) — emit-capability WARNING", () => {
  it("warns on a local `code is` whose type is a grammar-valid but NOT case-feature-emittable resource", () => {
    const r = validateFull(
      `library "T".\nconcept "Peanut Allergy":\n- type is AllergyIntolerance.\n- value type is boolean.\n- code is \`peanut-allergy\`.\n`,
    );
    const w = r.warnings.filter(
      (e): e is EmitCapabilityWarning => e.kind === "unsupported-casefeature-resource",
    );
    expect(w).toHaveLength(1);
    expect(w[0].resourceType).toBe("AllergyIntolerance");
    expect(w[0].conceptName).toBe("Peanut Allergy");
    // Intrinsic WARNING: it lands on warnings, never errors, and never flips isValid off on its own account.
    expect(r.errors.some((e) => e.kind === "unsupported-casefeature-resource")).toBe(false);
  });

  it("does NOT warn on the case-feature-emittable resource types", () => {
    for (const t of ["Observation", "Condition", "Procedure", "ServiceRequest", "MedicationRequest"]) {
      expect(
        emitCapWarnings(`library "T".\nconcept "C":\n- type is ${t}.\n- value type is boolean.\n- code is \`c\`.\n`),
      ).toHaveLength(0);
    }
  });

  it("⭐ does NOT warn on Encounter — it is a case-feature datum now", () => {
    // Encounter was the standing example of a CEL-writer-only row the VALIDATE lane warned about. The flag
    // flipped (operator, 2026-08-30), and the lane-neutral set moved WITH it — which is the whole point of
    // the bridge test: validate and emit must not disagree about what is emittable.
    expect(
      emitCapWarnings(
        `library "T".\nconcept "Visit":\n- type is Encounter.\n- value type is boolean.\n- code is \`visit\`.\n`,
        "Visit",
      ),
    ).toHaveLength(0);
  });

  it("still warns on a type that backs NO case-feature datum", () => {
    // The warning itself is live and must stay reachable — an unlisted resource is what exercises it now.
    expect(
      emitCapWarnings(
        `library "T".\nconcept "Aim":\n- type is Goal.\n- value type is boolean.\n- code is \`aim\`.\n`,
        "Aim",
      ),
    ).toHaveLength(1);
  });

  it("does NOT warn on a concept with NO local `code is` (source-only or pure-derived)", () => {
    // source-only: no `code is`, so it derives no local case feature here → skipped regardless of type
    expect(
      emitCapWarnings(
        `library "T".\nconcept "Sourced":\n- value type is boolean.\n- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is boolean.\n`,
      ),
    ).toHaveLength(0);
    // pure-derived: `defined as` over coded operands — the derived concept itself has no local code → skipped
    expect(
      emitCapWarnings(
        `library "T".\nconcept "A":\n- type is Observation.\n- value type is boolean.\n- code is \`a\`.\nconcept "B":\n- type is Observation.\n- value type is boolean.\n- code is \`b\`.\nconcept "Derived":\n- value type is boolean.\n- defined as ( "A" sem-or "B" ).\n`,
        "Derived",
      ),
    ).toHaveLength(0);
  });

  it("does NOT warn on a patient-age concept (Patient-backed / supplied, classified by the shared age authority)", () => {
    const ageSrc =
      `library "T".\nconcept "Adult":\n- value type is boolean.\n- code is \`adult\`.\n` +
      `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`;
    expect(emitCapWarnings(ageSrc, "Adult")).toHaveLength(0);
  });
});
