import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import type { Concept } from "../../ast/types";
import {
  deriveEffectiveRepresentations,
  type OwningLibraryMetadata,
} from "../effectiveRepresentation";
import {
  RESOURCE_EMIT_REGISTRY,
  caseFeatureProfileShape,
  codingJsonName,
  valueJsonName,
  recencyStampJsonName,
  resourceCodingPlacement,
} from "../resourceEmitRegistry";

// T2 — the JSON-write-name resolvers. These derive the serialized-JSON write name from a T1 read row via the
// one FHIR polymorphic-element spelling rule. The pins below prove the derivation against known-correct names;
// the fail-closed cells prove T2 refuses (never guesses) beyond its boundary and defers legality to T3.

// The DEFINITION-lane / value-read matrices (recency-stamp write-names, SD-model) pin only `caseFeature: true`
// rows: a CEL-writer-only row (`caseFeature: false`, e.g. Encounter — #189 CEL-writer T2) has no case-feature SD,
// and its recency (nested Period) is a T4 concern. Its CEL-relevant surface — coding PLACEMENT — is pinned
// separately (the `resourceCodingPlacement` block below).
const CASE_FEATURE_ROWS = Object.entries(RESOURCE_EMIT_REGISTRY)
  .filter(([, row]) => row.caseFeature)
  .map(([rt]) => rt)
  .sort();

describe("T2 write-name resolvers — resource-keyed matrix (the per-cell pin)", () => {
  // Keyed by resourceType so a row mutation (e.g. Procedure.recency.sortExpr → "effective") fails the pin —
  // a bare "performedDateTime exists somewhere" test would not catch that (gpt56 R1 imp3). Each expectation is
  // resolved through the resolver FROM the live registry row, so the row is what is actually under test.
  const EXPECTED: Record<string, { coding: string; stamp: string }> = {
    Observation: { coding: "code", stamp: "effectiveDateTime" },
    Condition: { coding: "code", stamp: "recordedDate" },
    Procedure: { coding: "code", stamp: "performedDateTime" },
    ServiceRequest: { coding: "code", stamp: "authoredOn" },
    MedicationRequest: { coding: "medicationCodeableConcept", stamp: "authoredOn" },
  };

  it("EXPECTED covers exactly the registry rows — a new row cannot ship without a pinned name pair", () => {
    // The matrix iterates EXPECTED, so it pins mutations and deletions but would NOT pin an ADDITION — a 6th
    // registry row would ride only the generic totality loop (non-error, not a correct NAME). That is exactly
    // the hole derive-over-store was argued to need covered (plan). Force every new row to arrive with its pin.
    expect(CASE_FEATURE_ROWS).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [resourceType, expected] of Object.entries(EXPECTED)) {
    it(`${resourceType} → coding \`${expected.coding}\`, recency stamp \`${expected.stamp}\``, () => {
      const row = RESOURCE_EMIT_REGISTRY[resourceType];
      expect(row, `${resourceType} must be a registry row`).toBeDefined();
      expect(codingJsonName(row.coding)).toBe(expected.coding);
      const stamp = recencyStampJsonName(row.recency);
      expect(stamp, JSON.stringify(stamp)).toEqual({ jsonName: expected.stamp });
    });
  }

  it("every case-feature row resolves coding + recency stamp to a NON-error (totality over the definition subset)", () => {
    // caseFeature rows only: a CEL-writer-only row (Encounter) has a nested-Period recency the T2 stamp resolver
    // intentionally rejects until T4 — it is not part of this definition-lane totality.
    for (const [resourceType, row] of Object.entries(RESOURCE_EMIT_REGISTRY)) {
      if (!row.caseFeature) continue;
      expect(typeof codingJsonName(row.coding), resourceType).toBe("string");
      expect(recencyStampJsonName(row.recency), resourceType).toHaveProperty("jsonName");
    }
  });
});

describe("T2 write-name resolvers — codingJsonName", () => {
  it("plain codeable-concept → its own element name", () => {
    expect(codingJsonName({ kind: "codeable-concept", field: "code" })).toBe("code");
  });

  it("choice-codeable-concept → the CodeableConcept variant of the choice (complex-type first char is a no-op)", () => {
    expect(codingJsonName({ kind: "choice-codeable-concept", field: "medication" })).toBe(
      "medicationCodeableConcept",
    );
  });
});

describe("T2 write-name resolvers — valueJsonName (name axis; SPELLING, not legality)", () => {
  it("the only reachable cell today: value + boolean → valueBoolean", () => {
    expect(valueJsonName("value", "boolean")).toEqual({ jsonName: "valueBoolean" });
  });

  it("spells value + Quantity → valueQuantity (complex type already capital)", () => {
    expect(valueJsonName("value", "Quantity")).toEqual({ jsonName: "valueQuantity" });
  });

  it("value + date → valueDate is SPELLED — T3's model-info registry owns rejecting it as illegal on Observation.value[x] (spelling ≠ legality)", () => {
    // T2 must NOT read as a legality promise: it spells the name correctly; whether `Observation.value[x]`
    // (R4) admits `valueDate` (it does not) is the T3 legality gate. Pinning it here documents the seam.
    expect(valueJsonName("value", "date")).toEqual({ jsonName: "valueDate" });
  });

  it("fail-closed: an authored non-`value` element → value-element-unmappable (general element mapping is T3)", () => {
    const r = valueJsonName("interpretation", "boolean");
    expect(r).toHaveProperty("errorKind", "value-element-unmappable");
  });

  it("fail-closed: an unknown value type → value-element-unmappable", () => {
    expect(valueJsonName("value", "NotAType")).toHaveProperty(
      "errorKind",
      "value-element-unmappable",
    );
    expect(valueJsonName("value", undefined)).toHaveProperty(
      "errorKind",
      "value-element-unmappable",
    );
  });
});

describe("#189 2d — caseFeatureProfileShape (SD-model spelling, the THIRD spelling)", () => {
  // The SD-element model spelling per row — distinct from BOTH the JSON write name (`effectiveDateTime`) and the
  // CQL read (`effective`). A choice element keeps its `[x]`; a plain element is itself. Keyed by resourceType so
  // a row mutation fails the pin (same discipline as the T2 matrix above).
  const EXPECTED_MODEL: Record<string, { coding: string; recency: string; base: string }> = {
    Observation: { coding: "code", recency: "effective[x]", base: "http://hl7.org/fhir/StructureDefinition/Observation" },
    Condition: { coding: "code", recency: "recordedDate", base: "http://hl7.org/fhir/StructureDefinition/Condition" },
    Procedure: { coding: "code", recency: "performed[x]", base: "http://hl7.org/fhir/StructureDefinition/Procedure" },
    ServiceRequest: { coding: "code", recency: "authoredOn", base: "http://hl7.org/fhir/StructureDefinition/ServiceRequest" },
    MedicationRequest: { coding: "medication[x]", recency: "authoredOn", base: "http://hl7.org/fhir/StructureDefinition/MedicationRequest" },
  };

  it("EXPECTED_MODEL covers exactly the registry rows (a new row cannot ship without its SD-model pin)", () => {
    expect(Object.keys(EXPECTED_MODEL).sort()).toEqual(CASE_FEATURE_ROWS);
  });

  for (const [resourceType, expected] of Object.entries(EXPECTED_MODEL)) {
    it(`${resourceType} → coding element \`${expected.coding}\`, recency element \`${expected.recency}\``, () => {
      const shape = caseFeatureProfileShape(resourceType);
      expect(shape, `${resourceType} must produce a shape`).toBeDefined();
      expect(shape!.codingElementPath).toBe(expected.coding);
      expect(shape!.recencyElementPath).toBe(expected.recency);
      expect(shape!.baseDefinition).toBe(expected.base);
      expect(shape!.subjectElementPath).toBe("subject"); // invariant across the subset
    });
  }

  it("valueless-existence (no value datum) → NO value element", () => {
    const shape = caseFeatureProfileShape("Condition");
    expect(shape!.value).toBeUndefined();
  });

  it("a value-reading concept → a value[x] element carrying the datum type (spelling, not legality)", () => {
    const shape = caseFeatureProfileShape("Observation", { valueElement: "value", datumValueType: "boolean" });
    expect(shape!.value).toEqual({ elementPath: "value[x]", typeCode: "boolean" });
  });

  it("a non-standard value carrier is NOT mapped here (T3 model-info boundary) → no value element", () => {
    const shape = caseFeatureProfileShape("Observation", { valueElement: "interpretation", datumValueType: "boolean" });
    expect(shape!.value).toBeUndefined();
  });

  it("fail-closed: an unlisted resource → undefined (caller emits unsupported-casefeature-resource)", () => {
    expect(caseFeatureProfileShape("Encounter")).toBeUndefined();
    expect(caseFeatureProfileShape("DiagnosticReport", { valueElement: "value", datumValueType: "boolean" })).toBeUndefined();
  });
});

describe("T2 write-name resolvers — recencyStampJsonName (guard FIRST, both cast branches)", () => {
  it("plain top-level dateTime element (cast:none) → its own name", () => {
    expect(recencyStampJsonName({ sortExpr: "recordedDate", cast: "none" })).toEqual({
      jsonName: "recordedDate",
    });
  });

  it("choice element (cast:dateTime) → the dateTime variant", () => {
    expect(recencyStampJsonName({ sortExpr: "effective", cast: "dateTime" })).toEqual({
      jsonName: "effectiveDateTime",
    });
  });

  it("fail-closed: dotted sortExpr under cast:none (Patient meta.lastUpdated) → unsupported-recency-path", () => {
    expect(recencyStampJsonName({ sortExpr: "meta.lastUpdated", cast: "none" })).toHaveProperty(
      "errorKind",
      "unsupported-recency-path",
    );
  });

  it("fail-closed: dotted sortExpr under cast:dateTime (§2 Period `period.start`) → unsupported-recency-path (would else spell invalid `period.startDateTime`)", () => {
    expect(recencyStampJsonName({ sortExpr: "period.start", cast: "dateTime" })).toHaveProperty(
      "errorKind",
      "unsupported-recency-path",
    );
  });

  it("fail-closed: empty sortExpr → unsupported-recency-path under BOTH casts (guard is before the switch)", () => {
    expect(recencyStampJsonName({ sortExpr: "", cast: "dateTime" })).toHaveProperty(
      "errorKind",
      "unsupported-recency-path",
    );
    expect(recencyStampJsonName({ sortExpr: "", cast: "none" })).toHaveProperty(
      "errorKind",
      "unsupported-recency-path",
    );
  });
});

describe("T2 write-name resolvers — recency guard against the LIVE uncoded descriptor (not a hand-built copy)", () => {
  // The consumption contract says resolvers are called on fields of a derived descriptor. Pin the recency guard
  // against the ACTUAL uncoded-age descriptor's `.recency` (whose sortExpr is the catalog's recency timestamp),
  // so the guard stays correct even if the override catalog's path changes — a hand-built `meta.lastUpdated`
  // literal would keep passing against a stale value (Claude impl-R1 nit).
  const AGE_POSREP = `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`;
  const OWNING: OwningLibraryMetadata = {
    libraryName: "T",
    canonicalBase: "http://example.org/crl/t",
    localDomainId: "t",
  };

  it("the uncoded age descriptor's live recency field → unsupported-recency-path (dotted meta.lastUpdated)", () => {
    const src = `library "T".\nconcept "Adult":\n- value type is boolean.\n${AGE_POSREP}`;
    const c = parseInput(src).statements.find(
      (s) => s.type === "Concept" && s.name === "Adult",
    ) as Concept;
    const out = deriveEffectiveRepresentations(c, OWNING);
    expect(out.status).toBe("derived");
    if (out.status !== "derived") return;
    const uncoded = out.descriptors.find((d) => d.arm === "uncoded");
    expect(uncoded, "standalone age yields an uncoded descriptor").toBeDefined();
    // The resolver rejects the live catalog recency field, whatever it currently is (dotted today).
    expect(recencyStampJsonName(uncoded!.recency)).toHaveProperty(
      "errorKind",
      "unsupported-recency-path",
    );
  });
});

describe("#189 CEL-writer T2 — coding PLACEMENT + the Encounter (caseFeature:false) row", () => {
  it("resourceCodingPlacement writes each strategy on the natural element", () => {
    // plain CodeableConcept → the field itself, scalar
    expect(resourceCodingPlacement("Observation")).toEqual({ jsonName: "code", array: false });
    expect(resourceCodingPlacement("Condition")).toEqual({ jsonName: "code", array: false });
    expect(resourceCodingPlacement("ServiceRequest")).toEqual({ jsonName: "code", array: false });
    // choice element → the CodeableConcept variant, scalar (NOT `.code`)
    expect(resourceCodingPlacement("MedicationRequest")).toEqual({
      jsonName: "medicationCodeableConcept",
      array: false,
    });
    // array element → the field itself, ARRAY (Encounter.type[], NOT `.code`)
    expect(resourceCodingPlacement("Encounter")).toEqual({ jsonName: "type", array: true });
    // unlisted → undefined (CEL writer keeps `.code` / fails closed at T4)
    expect(resourceCodingPlacement("Task")).toBeUndefined();
    expect(resourceCodingPlacement("CommunicationRequest")).toBeUndefined();
  });

  it("codingJsonName covers the codeable-concept-array strategy", () => {
    expect(codingJsonName({ kind: "codeable-concept-array", field: "type" })).toBe("type");
  });

  it("the Encounter row is CEL-writer-only: caseFeature:false, type[] coding, valueless", () => {
    const enc = RESOURCE_EMIT_REGISTRY.Encounter;
    expect(enc).toBeDefined();
    expect(enc.caseFeature).toBe(false);
    expect(enc.coding).toEqual({ kind: "codeable-concept-array", field: "type" });
    expect(enc.valueless).toBe(true);
  });

  it("Encounter's recency stamp is pinned AS unsupported-recency-path — a RED pin T4 must consciously flip", () => {
    // The Encounter row carries the honest nested-Period read path `period.start`; T2's stamp resolver rejects
    // it by design, and T4 (nested-Period recency-write) is the named successor. Pinning the error (rather than
    // relying on a totality loop) forces T4 to flip a red pin, and keeps the row's recency out of the coding path.
    expect(recencyStampJsonName(RESOURCE_EMIT_REGISTRY.Encounter.recency)).toHaveProperty(
      "errorKind",
      "unsupported-recency-path",
    );
  });

  it("A′ gate: caseFeatureProfileShape returns undefined for a caseFeature:false row (Encounter)", () => {
    // Encounter is emitted by the CEL writer but is NEVER a case-feature datum — the definition lane must not
    // profile an SD for it, even though it has a registry row.
    expect(caseFeatureProfileShape("Encounter")).toBeUndefined();
    // a caseFeature:true row still profiles.
    expect(caseFeatureProfileShape("Condition")).toBeDefined();
  });
});
