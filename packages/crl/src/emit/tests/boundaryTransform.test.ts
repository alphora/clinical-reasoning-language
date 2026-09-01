import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import type { Concept } from "../../ast/types";
import { resolveBoundaryTransform } from "../producerCandidate";

/**
 * ⭐⭐ #189 — `resolveBoundaryTransform`: can a concept's published record be normalised to its case feature?
 *
 * The third sibling of `resolveProducerCandidates` / `resolveProjectedSource`, and resolved in the same
 * place for the same reason — the concept's code, its case-feature profile url, its constructor and its
 * coding strategy are facts about the concept and the registry, known at LOWERING.
 *
 * ⚠⚠ WHY THE PROFILE IS A REFUSAL AND NOT A DEFAULT: the constructed record's `meta.profile` must
 * BYTE-EQUAL the StructureDefinition url the FHIR lane emits, or the two lanes disagree about what the
 * record IS. The CQL emit site cannot derive that url (it is built from `CpgMetadata`), so re-deriving it
 * there would be a second reading of a cross-lane identity — which is how lanes drift. Refuse instead.
 */

const CODE = { system: "http://example.org/v/CodeSystem/l", code: "weight" };
const PROFILE = "http://example.org/v/StructureDefinition/l-weight";

function conceptFrom(src: string, name: string): Concept {
  const built = buildCRL(["# P", 'library "L".', src].join("\n"));
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  const c = (built.result?.statements ?? []).find(
    (s) => (s as { type?: string; name?: string }).type === "Concept" && (s as { name?: string }).name === name,
  );
  expect(c, `concept "${name}" not built`).toBeDefined();
  return c as Concept;
}

const OBS = [
  'concept "Weight":',
  "- shape is Record.",
  "- type is Observation.",
  "- value type is Quantity.",
  "- code is `weight`.",
].join("\n");

describe("#189 — resolveBoundaryTransform", () => {
  it("⭐ resolves a value-bearing Observation: constructor, coding strategy, carrier and recency", () => {
    const r = resolveBoundaryTransform({
      concept: conceptFrom(OBS, "Weight"),
      code: CODE,
      profile: PROFILE,
      carrier: { element: "value", valueType: "Quantity" },
    });
    expect(r.kind).toBe("resolved");
    if (r.kind !== "resolved") return;
    expect(r.spec.profile).toBe(PROFILE);
    expect(r.spec.code).toEqual(CODE);
    // The coding strategy comes from the REGISTRY, so the identity check is descriptor-driven — never a
    // hardcoded `.code` (which fails to compile on Encounter's `type[]`).
    expect(r.spec.coding).toEqual({ kind: "codeable-concept", field: "code" });
    // ⚠ The carrier's FHIR type is read off the RESOLVED SIGNATURE, not re-derived — so the carrier read
    // and the constructor's `value` parameter cannot disagree.
    expect(r.spec.carrier).toEqual({ element: "value", fhirType: "FHIR.Quantity" });
    expect(r.spec.recency.sortExpr.length).toBeGreaterThan(0);
    // Carried WHOLE: the emitter must both CALL and DEFINE this constructor. A boundary-demanded
    // constructor may be its ONLY demand — a source-only unprojected leaf has no producer and no
    // projection, so gathering from producer specs alone would emit a call to a function never defined.
    expect(r.spec.signature.functionName.length).toBeGreaterThan(0);
  });

  it("⚠ REFUSES with no policy id — the profile must byte-equal the FHIR lane's url, never be guessed", () => {
    const r = resolveBoundaryTransform({
      concept: conceptFrom(OBS, "Weight"),
      code: CODE,
      profile: "   ",
      carrier: { element: "value", valueType: "Quantity" },
    });
    expect(r.kind).toBe("refused");
    if (r.kind !== "refused") return;
    expect(r.refusal.message).toMatch(/policy id|byte-equal/i);
  });

  it("⚠ REFUSES a concept with no `type is` — there is nothing to construct into", () => {
    const src = ['concept "Bare":', "- shape is Record.", "- value type is Quantity.", "- code is `weight`."].join("\n");
    const r = resolveBoundaryTransform({
      concept: conceptFrom(src, "Bare"),
      code: CODE,
      profile: PROFILE,
      carrier: { element: "value", valueType: "Quantity" },
    });
    expect(r.kind).toBe("refused");
  });

  it("⭐ a VALUELESS concept resolves with NO carrier — its truth is the record's PRESENCE", () => {
    // A `type is Condition` existence concept carries no `value[x]`; the constructor takes its existence
    // mode instead. Resolving a carrier here would manufacture an answer slot the SD does not declare.
    const src = ['concept "Dx":', "- shape is Record.", "- type is Condition.", "- value type is boolean.", "- code is `dx`."].join("\n");
    const r = resolveBoundaryTransform({
      concept: conceptFrom(src, "Dx"),
      code: CODE,
      profile: PROFILE,
      carrier: undefined,
    });
    expect(r.kind).toBe("resolved");
    if (r.kind !== "resolved") return;
    expect(r.spec.carrier).toBeUndefined();
    expect(r.spec.coding).toEqual({ kind: "codeable-concept", field: "code" });
  });
});
