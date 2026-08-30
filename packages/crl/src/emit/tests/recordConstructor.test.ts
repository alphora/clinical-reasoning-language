import { describe, it, expect } from "vitest";

import {
  CONSTRUCTOR_NAME_PREFIX,
  capabilityFromRow,
  constructorCapability,
  constructorFunctionName,
  isConstructorName,
  resolveConstructor,
  type ConstructorImpossibility,
} from "../recordConstructor";
import {
  RESOURCE_EMIT_REGISTRY,
  requiredStructuralElements,
  type StructuralRequiredElement,
} from "../resourceEmitRegistry";

/**
 * #189 P1 — record-construction CAPABILITY + SIGNATURE.
 *
 * ⚠ These pin the DERIVATION from the registry, never a hand-copied table. Where a case asserts a concrete
 * resource's outcome it also asserts the registry fact it derives from, so a registry change that should
 * have changed the outcome fails here instead of drifting silently.
 *
 * The behavioural claims about CQL (that these shapes translate and evaluate) are NOT tested here — they
 * were executed against the CQL engine and are recorded in the design's §8. This file tests the shape
 * decision; that measurement tested the target language.
 */

/** Narrow a resolution/capability to its refusal reason, failing loudly if it did not refuse. */
function refusalOf(r: { kind: string } & Partial<ConstructorImpossibility>): string {
  expect(r.kind).toBe("impossible");
  return r.reason as string;
}

describe("constructorCapability — refusals", () => {
  it("fails closed on a resource with no registry row", () => {
    expect(refusalOf(constructorCapability("Flurble", "Quantity"))).toBe("unsupported-resource");
  });

  it("⭐ refuses a CEL-writer-only row, and the registry says Encounter is one", () => {
    // The registry marks Encounter `caseFeature: false`, and the definition lane refuses to profile an SD
    // for it. A constructed record with no case-feature profile to instantiate is incoherent.
    expect(RESOURCE_EMIT_REGISTRY.Encounter.caseFeature).toBe(false);
    expect(refusalOf(constructorCapability("Encounter"))).toBe("not-a-case-feature-datum");
  });

  it("⭐ SPELLING ≠ LEGALITY — refuses a value variant the resource does not admit", () => {
    // `date` and `Attachment` are in the CRL-wide value-type list but are NOT legal on R4
    // `Observation.value[x]`. Gating only on that list reported `constructible` for CQL that cannot
    // translate — which is the deferred-to-a-translator-error failure the design forbids.
    expect(RESOURCE_EMIT_REGISTRY.Observation.valueless).toBe(false);
    expect(refusalOf(constructorCapability("Observation", "date"))).toBe("value-variant-uncertified");
    expect(refusalOf(constructorCapability("Observation", "Attachment"))).toBe("value-variant-uncertified");
    // ...while the variants the goal fixture needs ARE admitted.
    expect(constructorCapability("Observation", "Quantity")).toEqual({ kind: "constructible" });
    expect(constructorCapability("Observation", "boolean")).toEqual({ kind: "constructible" });
  });

  it("refuses a value type that is not a CRL value type at all — distinctly from an uncertified one", () => {
    expect(refusalOf(constructorCapability("Observation", "Flurble"))).toBe("value-type-unmappable");
    expect(refusalOf(constructorCapability("Observation"))).toBe("value-type-unmappable");
  });

  it("⭐ EXERCISES the `authored` refusal with a synthetic requirement, not just an empty-set pin", () => {
    // Unreachable from the live registry today — so the derivation is parameterized precisely so this
    // branch's diagnostic can execute. A refusal that has never once run is asserted, not tested.
    const synthetic: StructuralRequiredElement[] = [
      { element: "occurrence[x]", fulfillment: { via: "authored" } },
    ];
    const cap = capabilityFromRow(
      "Observation",
      RESOURCE_EMIT_REGISTRY.Observation,
      synthetic,
      "Quantity",
    );
    expect(refusalOf(cap)).toBe("authored-requirement");
    if (cap.kind === "impossible") expect(cap.detail).toContain("occurrence[x]");
  });

  it("⭐ EXERCISES the dotted-recency refusal — Encounter's real row, minus the caseFeature gate", () => {
    // Encounter's `period.start` is the live instance of a dotted recency path, but the caseFeature gate
    // refuses it first. Flip that one field so the SECOND guard is the one under test.
    const cap = capabilityFromRow(
      "Encounter",
      { ...RESOURCE_EMIT_REGISTRY.Encounter, caseFeature: true },
      requiredStructuralElements("Encounter") ?? [],
    );
    expect(refusalOf(cap)).toBe("recency-not-constructible");
    if (cap.kind === "impossible") expect(cap.detail).toContain("period.start");
  });

  it("⚠ no registry row today is `authored` — the tripwire that says when the branch goes live", () => {
    // If this fails, a resource gained an `authored` requirement and the refusal became REACHABLE. That is
    // the moment to check its diagnostic in context, NOT to relax the assertion.
    const authored = Object.keys(RESOURCE_EMIT_REGISTRY).filter((rt) =>
      (requiredStructuralElements(rt) ?? []).some((r) => r.fulfillment.via === "authored"),
    );
    expect(authored).toEqual([]);
  });
});

describe("constructorCapability — bindings", () => {
  it("⭐ Observation has no WIRED requirement — yet its constructor still takes a subject", () => {
    // The capability reports the registry's structural obligations, and Observation has none that are
    // `wired`. The SIGNATURE nonetheless carries `subject`, because the case-feature contract requires it
    // independently (design §11a). These two facts must not be collapsed into one.
    expect(
      (requiredStructuralElements("Observation") ?? []).some((r) => r.fulfillment.via === "wired"),
    ).toBe(false);
    expect(constructorCapability("Observation", "Quantity")).toEqual({ kind: "constructible" });
  });

  it("reports the `wired` binding for every resource whose registry row demands one", () => {
    expect(constructorCapability("Condition")).toEqual({
      kind: "requires-context",
      bindings: ["case-subject"],
    });
    for (const resourceType of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const required = requiredStructuralElements(resourceType);
      if (required === undefined) continue;
      const cap = constructorCapability(resourceType, "Quantity");
      if (cap.kind === "impossible") continue; // asserted exhaustively below
      const wants = required.some((r) => r.fulfillment.via === "wired");
      expect(cap.kind === "requires-context", `${resourceType} wired=${wants}`).toBe(wants);
    }
  });
});

describe("⭐ the WHOLE registry, classified — every row, with its reason", () => {
  it("pins the complete expected outcome per row, so a new row cannot slip through as a skip", () => {
    const actual: Record<string, string> = {};
    for (const resourceType of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const cap = constructorCapability(resourceType, "Quantity");
      actual[resourceType] = cap.kind === "impossible" ? `impossible:${cap.reason}` : cap.kind;
    }
    expect(actual).toEqual({
      // value-bearing, no wired requirement
      Observation: "constructible",
      // valueless existence records; all four wire the case subject
      Condition: "requires-context",
      Procedure: "requires-context",
      ServiceRequest: "requires-context",
      MedicationRequest: "requires-context",
      // ⭐ CEL-writer-only. Refused BEFORE its dotted `period.start` recency is even reached.
      Encounter: "impossible:not-a-case-feature-datum",
    });
  });

  it("⚠ Patient has a STRUCTURAL schema but no EMIT row — so it refuses, as it must", () => {
    // Patient supplies its own resource (charter §2): it is READ, never constructed. The two registry
    // tables do not have the same key set, and assuming they did is what this pins.
    expect(requiredStructuralElements("Patient")).toEqual([]);
    expect(Object.keys(RESOURCE_EMIT_REGISTRY)).not.toContain("Patient");
    expect(refusalOf(constructorCapability("Patient"))).toBe("unsupported-resource");
  });
});

describe("resolveConstructor", () => {
  it("Observation + Quantity — the D3 contract, coding on `code`, recency on `effective` WITH its cast", () => {
    const r = resolveConstructor("Observation", "Quantity");
    expect(r.kind).toBe("resolved");
    if (r.kind !== "resolved") return;
    const sig = r.signature;

    expect(sig.functionName).toBe("CRLConstructObservationQuantity");
    expect(sig.valueMode).toBe("value");
    expect(sig.guardParam).toBe("value");
    expect(sig.valueElement).toBe("value");
    expect(sig.codingElement).toEqual({ element: "code", array: false });
    // ⭐ the cast is CARRIED, not dropped — the renderer needs it for the D3c conversion
    expect(sig.recency).toEqual(RESOURCE_EMIT_REGISTRY.Observation.recency);
    expect(sig.recency.cast).toBe("dateTime");
    expect(sig.evidenceElement).toBe("derivedFrom");
    // ⭐ `case-subject` even though `Observation.subject` is 0..1 and NOT structurally required — the
    // case-feature contract is stricter than FHIR cardinality (parity finding, design §11a).
    expect(sig.bindings).toEqual(["case-subject"]);
    expect(sig.params.map((p) => `${p.name}:${p.cqlType}`)).toEqual([
      "code:FHIR.CodeableConcept",
      "value:FHIR.Quantity",
      "recorded:System.DateTime",
      "subject:FHIR.Reference",
      "profile:System.String",
      "evidence:List<FHIR.Reference>",
    ]);
  });

  it("⭐ D3c — every System-typed landing site carries its conversion", () => {
    const r = resolveConstructor("Observation", "Quantity");
    if (r.kind !== "resolved") throw new Error("expected resolved");
    const byName = Object.fromEntries(r.signature.params.map((p) => [p.name, p.conversion]));
    expect(byName.recorded).toEqual({ wrap: "FHIR.dateTime" });
    expect(byName.profile).toEqual({ wrap: "FHIR.canonical" });
    // already FHIR-typed — no conversion, and claiming one would be wrong
    expect(byName.code).toBeUndefined();
    expect(byName.value).toBeUndefined();
  });

  it("⭐ Condition existence — guards on the computed boolean, no value, recency on recordedDate", () => {
    const r = resolveConstructor("Condition");
    if (r.kind !== "resolved") throw new Error("expected resolved");
    const sig = r.signature;

    expect(sig.functionName).toBe("CRLConstructConditionExistence");
    expect(sig.valueMode).toBe("existence");
    expect(sig.guardParam).toBe("established");
    expect(sig.valueElement).toBeUndefined();
    expect(sig.recency.sortExpr).toBe("recordedDate");
    expect(sig.recency.cast).toBe("none");
    // ⚠ R4 Condition has no `derivedFrom`. The param is still passed (the id derives from it) but there is
    // nowhere to write it — the renderer must be told that, not left to guess.
    expect(sig.evidenceElement).toBeUndefined();
    expect(sig.bindings).toEqual(["case-subject"]);
    expect(sig.params.map((p) => p.name)).toEqual([
      "code",
      "established",
      "recorded",
      "subject",
      "profile",
      "evidence",
    ]);
  });

  it("⭐ D4 — identity is the CONTENT, and every key field is a real parameter", () => {
    // Operator, 2026-08-30: "the key being the thing … if they have the same key it's OK because they are
    // the same thing." A key naming a field the constructor never receives is unrealizable, which is the
    // trap the previous slug-based id fell into.
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "Quantity");
      if (r.kind !== "resolved") continue;
      const names = r.signature.params.map((p) => p.name);
      for (const field of r.signature.contentKey) {
        expect(names, `${rt} contentKey field ${field}`).toContain(field);
      }
    }
    const obs = resolveConstructor("Observation", "Quantity");
    if (obs.kind !== "resolved") throw new Error("expected resolved");
    expect(obs.signature.contentKey).toEqual(["code", "value", "recorded", "evidence"]);

    const cond = resolveConstructor("Condition");
    if (cond.kind !== "resolved") throw new Error("expected resolved");
    // An existence record's truth is the boolean, so THAT is the key field, not a value.
    expect(cond.signature.contentKey).toEqual(["code", "established", "recorded", "evidence"]);
  });

  it("⚠ MEASURED — no `slug` parameter, because the content key needs none", () => {
    // CQL defines no hash operator (spec: String Operators are Combine/Concatenate/…/Upper — no digest),
    // so a content key cannot be compressed into a 64-char FHIR id; measured 70 chars, 77 with UUID
    // evidence ids, and a timestamp carries `:` which FHIR ids disallow. The key therefore lives in
    // content comparison, not in `Resource.id` — and with no id to build, no slug is needed.
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "Quantity");
      if (r.kind !== "resolved") continue;
      expect(r.signature.params.map((p) => p.name)).not.toContain("slug");
    }
  });

  it("⭐ D3b — coding placement is NOT a universal `.code`", () => {
    const r = resolveConstructor("MedicationRequest");
    if (r.kind !== "resolved") throw new Error("expected resolved");
    // MedicationRequest codes on the `medication[x]` CHOICE. The CQL literal names the choice element
    // itself (`medication`), NOT the JSON variant spelling (`medicationCodeableConcept`).
    expect(r.signature.codingElement).toEqual({ element: "medication", array: false });
  });

  it("a refusal travels WITH its reason — it cannot be dropped by taking a different helper", () => {
    const r = resolveConstructor("Encounter");
    expect(r.kind).toBe("impossible");
    if (r.kind === "impossible") {
      expect(r.reason).toBe("not-a-case-feature-datum");
      expect(r.detail).toContain("caseFeature");
    }
  });

  it("⭐ D1 — the name is deterministic, so one SHAPE dedups to one function", () => {
    expect(constructorFunctionName("Observation", "value", "Quantity")).toBe(
      constructorFunctionName("Observation", "value", "Quantity"),
    );
    expect(constructorFunctionName("Observation", "value", "Quantity")).not.toBe(
      constructorFunctionName("Observation", "value", "boolean"),
    );
    // The obesity fixture needs exactly two constructors, not one per concept.
    const shapes = new Set([
      constructorFunctionName("Observation", "value", "Quantity"), // BMI
      constructorFunctionName("Observation", "value", "Quantity"), // a Weight-derived value
      constructorFunctionName("Observation", "value", "boolean"), // Obese
    ]);
    expect(shapes.size).toBe(2);
  });

  it("⭐ D1 — collision detection is LOAD-BEARING because the collision is REACHABLE", () => {
    // VERIFIED by parsing: `concept "CRLConstructObservationQuantity"` builds and keeps that name, so no
    // lexical rule protects the namespace. An authored define CAN collide.
    expect(isConstructorName("CRLConstructObservationQuantity")).toBe(true);
    expect(isConstructorName("Most Recent Weight")).toBe(false);
    expect(isConstructorName("BMI Records")).toBe(false);

    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "Quantity");
      if (r.kind !== "resolved") continue;
      expect(r.signature.functionName.startsWith(CONSTRUCTOR_NAME_PREFIX)).toBe(true);
    }
  });

  it("⚠ §5b — there is NO evaluation-time parameter anywhere in the contract", () => {
    // A `now`/`asOf` parameter would be the seam through which an INVENTED timestamp enters, and an
    // invented timestamp beats a fresh assertion in the recency merge. The absence IS the rule.
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "Quantity");
      if (r.kind !== "resolved") continue;
      const names = r.signature.params.map((p) => p.name.toLowerCase());
      expect(names).not.toContain("now");
      expect(names).not.toContain("asof");
      expect(names.filter((n) => n === "recorded")).toHaveLength(1);
    }
  });
});
