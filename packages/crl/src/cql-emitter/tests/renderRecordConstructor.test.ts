import { describe, it, expect } from "vitest";

import { resolveConstructor } from "../../emit/recordConstructor";
import { REQUIRED_STRUCTURAL_ELEMENTS, RESOURCE_EMIT_REGISTRY } from "../../emit/resourceEmitRegistry";
import { boundCodeCqlType, renderRecordConstructor } from "../renderRecordConstructor";

/**
 * #189 P1 step 3 — the CQL text of a generated record constructor.
 *
 * ⚠ THESE ARE SHAPE TESTS, NOT PROOF THAT THE CQL WORKS. Every constructor rendered here was also
 * EXECUTED through the CQL engine (design §10): translated, called, and its fields read back. A string
 * assertion cannot tell a valid resource literal from an invalid one — that is what the executed probe is
 * for, and one bug (an evidence reference missing its `ResourceType/` prefix) got through the string layer
 * and was caught only by running it with non-empty evidence.
 */

function render(resourceType: string, valueType?: string): string {
  const r = resolveConstructor(resourceType, valueType);
  if (r.kind !== "resolved") throw new Error(`expected resolved, got ${r.reason}`);
  return renderRecordConstructor(r.signature);
}

describe("boundCodeCqlType", () => {
  it("⚠ is NOT `FHIR.code`, and NOT the FHIR spec binding name", () => {
    // MEASURED: `FHIR.code` on Observation.status → "Expected an expression of type
    // 'FHIR.ObservationStatus'". And `FHIR.RequestStatus` — the real FHIR binding name — is rejected for
    // ServiceRequest.status, which wants `FHIR.ServiceRequestStatus`. The model info has its own naming.
    expect(boundCodeCqlType("Observation", "status")).toBe("FHIR.ObservationStatus");
    expect(boundCodeCqlType("ServiceRequest", "status")).toBe("FHIR.ServiceRequestStatus");
    expect(boundCodeCqlType("ServiceRequest", "intent")).toBe("FHIR.ServiceRequestIntent");
    expect(boundCodeCqlType("MedicationRequest", "status")).toBe("FHIR.MedicationRequestStatus");
    expect(boundCodeCqlType("Procedure", "status")).toBe("FHIR.ProcedureStatus");
  });

  it("⚠ every `kind: \"code\"` default in the registry has been EXECUTED against the engine", () => {
    // The `FHIR.<Resource><Element>` convention was inferred from two data points, and a FHIR-derived
    // guess was already measured wrong. So the set of code-defaults is pinned: if a new one appears, it
    // has NOT been probed, and this test is where that becomes visible.
    const codeDefaults: string[] = [];
    for (const [rt, required] of Object.entries(REQUIRED_STRUCTURAL_ELEMENTS)) {
      for (const r of required) {
        if (r.fulfillment.via === "default" && r.fulfillment.value.kind === "code") {
          codeDefaults.push(`${rt}.${r.element}`);
        }
      }
    }
    expect(codeDefaults.sort()).toEqual([
      "Encounter.status",
      "MedicationRequest.intent",
      "MedicationRequest.status",
      "Observation.status",
      "Procedure.status",
      "ServiceRequest.intent",
      "ServiceRequest.status",
    ]);
  });
});

describe("renderRecordConstructor", () => {
  it("⭐ Observation + Quantity renders the whole contract", () => {
    expect(render("Observation", "Quantity")).toBe(
      [
        "define function CRLConstructObservationQuantity(",
        "  code FHIR.CodeableConcept,",
        "  value FHIR.Quantity,",
        "  recorded System.DateTime,",
        "  subject FHIR.Reference,",
        "  profile System.String,",
        "  evidence List<FHIR.Reference>",
        "):",
        // ⚠ THE GUARD COVERS `recorded` TOO. MEASURED: with a non-null value and a NULL stamp the ENGINE THROWS
        // (`null cannot be cast to non-null type DateTime`) building `FHIR.dateTime { value: recorded }` — a null
        // timestamp kills the whole evaluation rather than yielding a null candidate. Reachable via §5b (a derived
        // stamp is the newest of its components, and a component may have none). Evaluation time is forbidden as a
        // fallback, so an un-datable candidate correctly contributes NOTHING.
        "  if value is null or recorded is null then",
        "    null as FHIR.Observation",
        "  else",
        "    FHIR.Observation {",
        "      meta: FHIR.Meta { profile: { FHIR.canonical { value: profile } } },",
        "      status: FHIR.ObservationStatus { value: 'final' },",
        "      category: { FHIR.CodeableConcept { coding: { FHIR.Coding { system: FHIR.uri { value: 'http://terminology.hl7.org/CodeSystem/observation-category' }, code: FHIR.code { value: 'survey' } } } } },",
        "      subject: subject,",
        "      code: code,",
        "      effective: FHIR.dateTime { value: recorded },",
        "      value: value,",
        "      derivedFrom: evidence",
        "    }",
      ].join("\n"),
    );
  });

  it("⭐ D0b — a valueless resource guards on the BOOLEAN and writes no value", () => {
    const cql = render("Condition");
    // `is not true` — so `false` AND null both yield no candidate. `is null` would let a computed false
    // through as a Condition, which is the thing a Condition cannot represent.
    // `is not true` — so `false` AND null both yield no candidate; plus the recency guard (see the contract test).
    expect(cql).toContain("if established is not true or recorded is null then");
    expect(cql).toContain("null as FHIR.Condition");
    expect(cql).not.toContain("value: value");
    // R4 Condition has no `derivedFrom` — nothing is written, though `evidence` is still received.
    expect(cql).not.toContain("derivedFrom");
    expect(cql).toContain("evidence List<FHIR.Reference>");
  });

  it("⚠ the wired subject renders as the PARAMETER, not a context expression", () => {
    // The constructor stays context-free; the caller resolves `Patient` once at the call site. A
    // constructor that reached for context would tie every generated function to a `context Patient`.
    const cql = render("Condition");
    expect(cql).toContain("subject: subject");
    expect(cql).not.toContain("Patient.id");
  });

  it("⭐ D3b — coding lands on the resource's own element", () => {
    expect(render("MedicationRequest")).toContain("medication: code");
    expect(render("Observation", "boolean")).toContain("code: code");
  });

  it("the recency stamp is PROPAGATED — no Now(), on any resource", () => {
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "Quantity");
      if (r.kind !== "resolved") continue;
      const cql = renderRecordConstructor(r.signature);
      expect(cql, rt).not.toContain("Now()");
      // ⚠ A NESTED recency path constructs its wrappers rather than naming a flat element. This assertion
      // used to demand the flat spelling for every row — and passed only because Encounter, the one row with
      // a dotted path, was refused upstream. A test that cannot reach its own case proves nothing.
      const segments = r.signature.recency.sortExpr.split(".");
      if (segments.length === 1) {
        expect(cql, rt).toContain(`${segments[0]}: FHIR.dateTime { value: recorded }`);
      } else {
        expect(cql, rt).toContain(`${segments[0]}: FHIR.`);
        expect(cql, rt).toContain(`${segments[segments.length - 1]}: FHIR.dateTime { value: recorded }`);
        expect(cql, rt).not.toContain(`${r.signature.recency.sortExpr}:`);
      }
    }
  });

  it("every resolved shape renders every required element it was validated against", () => {
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "Quantity");
      if (r.kind !== "resolved") continue;
      const cql = renderRecordConstructor(r.signature);
      for (const required of r.signature.requiredElements) {
        expect(cql, `${rt}.${required.element}`).toContain(`${required.element}:`);
      }
    }
  });

  it("the value-type suffix is capitalized, so the emitted name reads as a name", () => {
    expect(render("Observation", "boolean")).toContain("define function CRLConstructObservationBoolean(");
  });
});
