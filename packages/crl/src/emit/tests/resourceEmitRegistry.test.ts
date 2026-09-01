import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import type { Concept } from "../../ast/types";
import { CASE_FEATURE_EMITTABLE_TYPES } from "../../fhir-model/caseFeatureResources";
import {
  deriveEffectiveRepresentations,
  type OwningLibraryMetadata,
} from "../effectiveRepresentation";
import {
  RESOURCE_EMIT_REGISTRY,
  REQUIRED_STRUCTURAL_ELEMENTS,
  caseFeatureProfileShape,
  codingJsonName,
  valueJsonName,
  recencyStampJsonName,
  requiredStructuralElements,
  defaultValueJson,
  resourceCodingPlacement,
  QICORE_BASE_PROFILE,
  qicoreBaseProfile,
  renderCodingIdentityCheck,
  resourceEmitRow,
} from "../resourceEmitRegistry";

// T2 — the JSON-write-name resolvers. These derive the serialized-JSON write name from a T1 read row via the
// one FHIR polymorphic-element spelling rule. The pins below prove the derivation against known-correct names;
// the fail-closed cells prove T2 refuses (never guesses) beyond its boundary and defers legality to T3.

// The DEFINITION-lane / value-read matrices (recency-stamp write-names, SD-model) pin only `caseFeature: true`
// rows — a row whose case-feature cells are not established profiles no SD. ⚠ No LIVE row is on that side any
// more (Encounter, the last one, flipped 2026-08-30), so those matrices now cover the whole registry.
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
    // ⚠ Encounter has NO flat stamp — its `period.start` is nested and is written by `applyDateField`
    // (`period -> { start: iso }`), not by the flat-name resolver. Pinned as an ERROR below, not here.
    Encounter: { coding: "type", stamp: "" },
  };

  it("EXPECTED covers exactly the registry rows — a new row cannot ship without a pinned name pair", () => {
    // The matrix iterates EXPECTED, so it pins mutations and deletions but would NOT pin an ADDITION — a 6th
    // registry row would ride only the generic totality loop (non-error, not a correct NAME). That is exactly
    // the hole derive-over-store was argued to need covered (plan). Force every new row to arrive with its pin.
    expect(CASE_FEATURE_ROWS).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [resourceType, expected] of Object.entries(EXPECTED)) {
    it(`${resourceType} → coding \`${expected.coding}\`, recency stamp \`${expected.stamp || "(nested)"}\``, () => {
      const row = RESOURCE_EMIT_REGISTRY[resourceType];
      expect(row, `${resourceType} must be a registry row`).toBeDefined();
      expect(codingJsonName(row.coding)).toBe(expected.coding);
      const stamp = recencyStampJsonName(row.recency);
      // An EMPTY pinned stamp means the row's recency is NESTED, so it has no flat JSON name by design and
      // the resolver returns a typed error — `applyDateField` writes it (`Encounter -> period`).
      if (expected.stamp === "") expect(stamp, JSON.stringify(stamp)).toHaveProperty("errorKind");
      else expect(stamp, JSON.stringify(stamp)).toEqual({ jsonName: expected.stamp });
    });
  }

  it("every case-feature row resolves coding + recency stamp to a NON-error (totality over the definition subset)", () => {
    // ⚠ A NESTED recency path has no flat JSON name by design — that is the instance-WRITE lane's contract,
    // not a statement that the row is unsupported. `applyDateField` writes it (`Encounter -> period`), and the
    // CQL lane constructs the nesting. The per-row branch below is what keeps those two facts apart.
    for (const [resourceType, row] of Object.entries(RESOURCE_EMIT_REGISTRY)) {
      if (!row.caseFeature) continue;
      expect(typeof codingJsonName(row.coding), resourceType).toBe("string");
      // ⚠ A recency stamp resolves to a FLAT JSON name only for a flat path. A NESTED one
      // (`Encounter.period.start`) is deliberately OUT of this resolver's contract — it cannot be spelled as
      // one key — and is written by `applyDateField` instead (`Encounter -> period`, `{ start: iso }`). The
      // resolver returns a typed ERROR rather than undefined, so a future consumer fails closed.
      const stamp = recencyStampJsonName(row.recency);
      if (row.recency.sortExpr.includes(".")) {
        expect(stamp, resourceType).toHaveProperty("errorKind");
      } else {
        expect(stamp, resourceType).toHaveProperty("jsonName");
      }
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
  // ⭐ The SD derives from QI-CORE, not base FHIR (operator, 2026-08-30). The CEL instance lane already
  // stamped `qicoreBaseProfile(...)` on the records it writes, so a base-FHIR SD meant the two lanes
  // disagreed about the base a case-feature record conforms to. Deriving from QI-Core also makes `subject`
  // a requirement OF THE BASE rather than something the D6 parity diff had to discover.
  const EXPECTED_MODEL: Record<string, { coding: string; recency: string; base: string }> = {
    Observation: { coding: "code", recency: "effective[x]", base: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-simple-observation" },
    Condition: { coding: "code", recency: "recordedDate", base: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-condition-problems-health-concerns" },
    Procedure: { coding: "code", recency: "performed[x]", base: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-procedure" },
    ServiceRequest: { coding: "code", recency: "authoredOn", base: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-servicerequest" },
    MedicationRequest: { coding: "medication[x]", recency: "authoredOn", base: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-medicationrequest" },
    // ⭐ Encounter joined the case-feature rows (operator, 2026-08-30). Its coding is the `type[]` ARRAY and
    // its recency is the NESTED `period.start` — both measured to construct and round-trip in CQL. The dotted
    // recency is unspellable as a flat JSON name, which is the instance-WRITE lane's problem, not the SD's.
    Encounter: { coding: "type", recency: "period.start", base: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-encounter" },
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

  it("⚠ the SD base MATCHES what the CEL instance lane stamps — one base, both lanes", () => {
    // The inconsistency this closes: the writer stamped QI-Core on instances while the SD derived from base
    // FHIR. Asserting them EQUAL is what keeps them from drifting apart again.
    for (const resourceType of CASE_FEATURE_ROWS) {
      expect(caseFeatureProfileShape(resourceType)!.baseDefinition, resourceType).toBe(
        qicoreBaseProfile(resourceType),
      );
    }
  });

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
    // ⚠ Encounter used to be the example here. It is now a case-feature row, so the example had to become a
    // genuinely unlisted resource — using a DEFERRED row to demonstrate "unlisted" conflated two things.
    expect(caseFeatureProfileShape("Immunization")).toBeUndefined();
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

  it("the Encounter row is a CASE-FEATURE row: caseFeature:true, type[] coding, valueless", () => {
    const enc = RESOURCE_EMIT_REGISTRY.Encounter;
    expect(enc).toBeDefined();
    expect(enc.caseFeature).toBe(true);
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

  it("A′ gate: caseFeatureProfileShape returns undefined for any caseFeature:false row", () => {
    // ⭐ Encounter was the ONLY `caseFeature: false` row, and it flipped to `true` (operator, 2026-08-30) —
    // its exclusion was an empirical deferral ("no case-feature has `type is Encounter`"), not a category
    // rule, and both mechanics it was assumed to lack were measured to work.
    //
    // So the GATE is still pinned, but generically: whatever rows are `caseFeature: false` profile no SD, and
    // every `true` row does. Pinning it against one named resource is what let the gate and the reason for
    // the gate drift apart.
    for (const [resourceType, row] of Object.entries(RESOURCE_EMIT_REGISTRY)) {
      const shape = caseFeatureProfileShape(resourceType);
      if (row.caseFeature) expect(shape, `${resourceType} profiles`).toBeDefined();
      else expect(shape, `${resourceType} does NOT profile`).toBeUndefined();
    }
    expect(caseFeatureProfileShape("Condition")).toBeDefined();
  });

});

// ── #189 remote-channel: required STRUCTURAL-element schema (homeostasis-core, disc 493) ──────────────────────
describe("required structural-element schema (Patient + ServiceRequest)", () => {
  it("ServiceRequest: status/intent are code defaults; subject is wired to the case Patient", () => {
    expect(requiredStructuralElements("ServiceRequest")).toEqual([
      { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "active" } } },
      { element: "intent", fulfillment: { via: "default", value: { kind: "code", code: "order" } } },
      { element: "subject", fulfillment: { via: "wired", binding: "case-subject" } },
    ]);
  });

  it("Encounter (emit-floor-only): status defaults finished; class defaults to the OBSENC Coding", () => {
    expect(requiredStructuralElements("Encounter")).toEqual([
      { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "finished" } } },
      {
        element: "class",
        fulfillment: {
          via: "default",
          value: {
            kind: "coding",
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: "OBSENC",
            display: "observation encounter",
          },
        },
      },
    ]);
  });

  it("Patient: no structural required elements — genuinely [] (birthDate is concept-required, descriptor-derived)", () => {
    expect(requiredStructuralElements("Patient")).toEqual([]);
  });

  it("the R4 status/intent defaults per resource type", () => {
    const codeDefaultOf = (rt: string, element: string): string | undefined => {
      const e = requiredStructuralElements(rt)?.find((x) => x.element === element);
      return e?.fulfillment.via === "default" && e.fulfillment.value.kind === "code"
        ? e.fulfillment.value.code
        : undefined;
    };
    expect(codeDefaultOf("Observation", "status")).toBe("final");
    expect(codeDefaultOf("Procedure", "status")).toBe("completed");
    expect(codeDefaultOf("MedicationRequest", "status")).toBe("active");
    expect(codeDefaultOf("MedicationRequest", "intent")).toBe("order");
    // Condition has no status default (base R4 requires only subject).
    expect(codeDefaultOf("Condition", "status")).toBeUndefined();
  });

  it("exact coverage: every fact-emitted resource type is schema'd for R4 (a new row must update this pin)", () => {
    expect(Object.keys(REQUIRED_STRUCTURAL_ELEMENTS).sort()).toEqual([
      "Condition",
      "Encounter",
      "MedicationRequest",
      "Observation",
      "Patient",
      "Procedure",
      "ServiceRequest",
    ]);
  });

  it("every RESOURCE_EMIT_REGISTRY row has a structural schema (fact-emitted resources are R4-complete)", () => {
    for (const resourceType of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      expect(requiredStructuralElements(resourceType), `${resourceType} must be schema'd`).toBeDefined();
    }
  });

  it("every structural element has a well-formed fulfillment (default carries a non-empty code/coding)", () => {
    for (const [resourceType, elems] of Object.entries(REQUIRED_STRUCTURAL_ELEMENTS)) {
      for (const e of elems) {
        const where = `${resourceType}.${e.element}`;
        if (e.fulfillment.via === "default") {
          const v = e.fulfillment.value;
          if (v.kind === "code") {
            expect(v.code.length, `${where} code default must be non-empty`).toBeGreaterThan(0);
          } else if (v.kind === "codeable-concept-array") {
            expect(v.concepts.length, `${where} codeable-concept-array must be non-empty`).toBeGreaterThan(0);
            for (const c of v.concepts) {
              expect(c.system.length, `${where} array coding system`).toBeGreaterThan(0);
              expect(c.code.length, `${where} array coding code`).toBeGreaterThan(0);
            }
          } else {
            expect(v.system.length, `${where} coding system`).toBeGreaterThan(0);
            expect(v.code.length, `${where} coding code`).toBeGreaterThan(0);
          }
        } else if (e.fulfillment.via === "wired") {
          expect(e.fulfillment.binding, `${where} wired binding`).toBe("case-subject");
        }
      }
    }
  });

  it("defaultValueJson: code → bare string; coding → {system,code,display}; codeable-concept → {coding:[...]}", () => {
    expect(defaultValueJson({ kind: "code", code: "finished" })).toBe("finished");
    expect(
      defaultValueJson({ kind: "coding", system: "http://x", code: "OBSENC", display: "observation encounter" }),
    ).toEqual({ system: "http://x", code: "OBSENC", display: "observation encounter" });
    expect(defaultValueJson({ kind: "coding", system: "http://x", code: "c" })).toEqual({
      system: "http://x",
      code: "c",
    }); // display omitted when absent
    expect(
      defaultValueJson({ kind: "codeable-concept", system: "http://x", code: "active", display: "Active" }),
    ).toEqual({ coding: [{ system: "http://x", code: "active", display: "Active" }] });
    // codeable-concept-array (category, 1..*) → an ARRAY of CodeableConcepts, each one coding.
    expect(
      defaultValueJson({
        kind: "codeable-concept-array",
        concepts: [{ system: "http://x", code: "survey" }],
      }),
    ).toEqual([{ coding: [{ system: "http://x", code: "survey" }] }]);
  });

  it("Condition: subject wired + clinicalStatus=active + verificationStatus=confirmed (CodeableConcepts)", () => {
    const req = requiredStructuralElements("Condition");
    expect(req?.map((e) => e.element)).toEqual([
      "subject",
      "category",
      "clinicalStatus",
      "verificationStatus",
    ]);
    const cs = req?.find((e) => e.element === "clinicalStatus");
    expect(cs?.fulfillment.via === "default" && cs.fulfillment.value).toEqual({
      kind: "codeable-concept",
      system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
      code: "active",
      display: "Active",
    });
  });

  it("an unlisted resource fails closed (undefined), NOT an empty list", () => {
    // Absence ("no schema modeled yet") must be distinguishable from `[]` ("known, no structural required")
    // so a caller can't silently ship an incomplete resource for an unmodeled type. DiagnosticReport is a real
    // FHIR type we don't fact-emit (no registry row).
    expect(requiredStructuralElements("DiagnosticReport")).toBeUndefined();
    expect(requiredStructuralElements("toString")).toBeUndefined(); // prototype-pollution guard
  });
});

// #189 / disc 495 Q6 — the CONSISTENCY BRIDGE between the emit registry's per-row `caseFeature` flags and the
// lane-neutral `CASE_FEATURE_EMITTABLE_TYPES` set that the VALIDATE lane reads (the validate lane may not import
// this registry — enforced by the effectiveRepresentation import-boundary test — so the neutral set is a
// SEPARATE representation, and this test is the only thing that keeps the two from drifting).
describe("case-feature-emittable set ↔ registry caseFeature flags (lane-neutral bridge, disc 495 Q6)", () => {
  it("the neutral set equals exactly the registry rows with caseFeature: true", () => {
    const registryCaseFeatureTypes = new Set(
      Object.entries(RESOURCE_EMIT_REGISTRY)
        .filter(([, row]) => row.caseFeature)
        .map(([type]) => type),
    );
    // Bidirectional equality: every neutral-set member is a caseFeature:true row, and every caseFeature:true row
    // is in the neutral set — so a future row (or a flipped flag) can't silently diverge from what validate sees.
    expect([...CASE_FEATURE_EMITTABLE_TYPES].sort()).toEqual([...registryCaseFeatureTypes].sort());
  });

  it("⭐ Encounter is in BOTH the registry and the neutral set — the flip moved them together", () => {
    // The two representations exist because an enforced import boundary stops them sharing code, so a flag
    // flip that moved only one would put validate and emit into silent disagreement. That is the whole
    // reason this bridge test exists.
    expect(RESOURCE_EMIT_REGISTRY.Encounter.caseFeature).toBe(true);
    expect(CASE_FEATURE_EMITTABLE_TYPES.has("Encounter")).toBe(true);
  });
});

// #189 base QI-Core (disc 495) — the instance `meta.profile` stamping map.
describe("QICORE_BASE_PROFILE — base QI-Core profile per stamped resource type", () => {
  it("covers every fact-emitted registry row + Patient (the stamped set)", () => {
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      expect(qicoreBaseProfile(rt), `${rt} must have a base QI-Core profile`).toBeDefined();
    }
    expect(qicoreBaseProfile("Patient"), "Patient (no registry row) is stamped").toBeDefined();
  });

  it("returns undefined for an unlisted type (stays unstamped) + prototype-pollution guard", () => {
    expect(qicoreBaseProfile("DiagnosticReport")).toBeUndefined();
    expect(qicoreBaseProfile("toString")).toBeUndefined();
  });

  it("every canonical is an UNVERSIONED qicore StructureDefinition URL (disc 495 Q3)", () => {
    for (const url of Object.values(QICORE_BASE_PROFILE)) {
      expect(url).toMatch(/^http:\/\/hl7\.org\/fhir\/us\/qicore\/StructureDefinition\/qicore-/);
      expect(url, "wire canonical is unversioned (no |version)").not.toContain("|");
    }
  });
});


describe("#189 — renderCodingIdentityCheck: the boundary transform's identity check, per coding strategy", () => {
  // ⭐⭐ EVERY EXPECTATION HERE WAS EXECUTED on the cqf engine before being written down
  // (`tmp/NOTES-kernel-spellings-executed.md`) — one external-coded and one local-coded record per cell.
  //
  // ⚠⚠ THE REASON THIS TEST EXISTS: I measured the `codeable-concept` cell ALONE and generalised it into a
  // universal `<alias>.code ~ <code>` kernel. That is wrong for two of the five `caseFeature: true`
  // resources. It fails at COMPILE time rather than silently — "Could not resolve call to operator
  // Equivalent with signature (list<FHIR.CodeableConcept>, System.Code)" — but a compile failure of the
  // whole emitted library is still a shipped defect.
  //
  // ⚠ `codingCqlElement` CANNOT serve this: it flattens to `{ element, array }`, collapsing
  // `codeable-concept` and `choice-codeable-concept` into the same shape — and the choice is precisely the
  // cell that needs the `as` cast.

  it("codeable-concept (Observation/Condition/Procedure/ServiceRequest) — a direct `~`", () => {
    expect(renderCodingIdentityCheck({ kind: "codeable-concept", field: "code" }, "O", '"Local"')).toBe(
      'O.code ~ "Local"',
    );
  });

  it("⭐ choice-codeable-concept (MedicationRequest.medication[x]) — REQUIRES the `as` cast", () => {
    expect(
      renderCodingIdentityCheck({ kind: "choice-codeable-concept", field: "medication" }, "M", '"Local"'),
    ).toBe('(M.medication as FHIR.CodeableConcept) ~ "Local"');
  });

  it("⭐ codeable-concept-array (Encounter.type[]) — REQUIRES `exists`, not `~` on the list", () => {
    expect(renderCodingIdentityCheck({ kind: "codeable-concept-array", field: "type" }, "E", '"Local"')).toBe(
      'exists (E.type CFC where CFC ~ "Local")',
    );
  });

  it("⚠ every `caseFeature: true` resource resolves to a spelling — no silent gap", () => {
    // The registry is the authority on which resources the case-feature lane admits. If a row is added or
    // its `caseFeature` flipped (Encounter WAS flipped, 2026-08-30), this fails until the cell is measured.
    for (const rt of ["Observation", "Condition", "Procedure", "ServiceRequest", "MedicationRequest", "Encounter"]) {
      const row = resourceEmitRow(rt);
      expect(row, rt).toBeDefined();
      const rendered = renderCodingIdentityCheck(row!.coding, "X", '"L"');
      expect(rendered, rt).toContain('"L"');
      expect(rendered.length, rt).toBeGreaterThan(0);
    }
  });
});
