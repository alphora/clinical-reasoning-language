import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { resolveCelImports } from "../../cel/imports";
import { resolveConstructor } from "../../emit/recordConstructor";
import {
  REQUIRED_STRUCTURAL_ELEMENTS,
  recencyStampJsonName,
  resourceCodingPlacement,
  valueJsonName,
  RESOURCE_EMIT_REGISTRY,
} from "../../emit/resourceEmitRegistry";
import { renderRecordConstructor } from "../renderRecordConstructor";

/**
 * #189 P1 build step 5 — ⭐ THE D6 PARITY INVARIANT, EXECUTED ACROSS BOTH LANES.
 *
 * The design's strongest claim is that a CONSTRUCTED record (the CQL lane, at evaluation time) and a
 * CEL-WRITTEN record (the instance lane, test data) for the SAME concept agree — because both derive their
 * shape from `resourceEmitRegistry`. If they disagree, a retrieve can see one and not the other, and the
 * lanes stop being consistent.
 *
 * ⚠ The claim was NOT true when first measured. Two divergences fell out immediately:
 *
 *   1. Constructed Observations carried NO `subject`. The registry marks `Observation.subject` 0..1, so it
 *      is not a STRUCTURAL requirement and the constructor's wired list omitted it — while the CEL writer
 *      emits it on every Observation and `caseFeatureProfileShape` declares `subjectElementPath` for every
 *      resource. FIXED: a constructor always takes and writes `subject`.
 *   2. `meta.profile` differs — the CEL writer stamps the QI-Core BASE profile; design D6a says the
 *      case-feature SD canonical. NOT resolved here: `profile` is a constructor PARAMETER, so the
 *      constructor is neutral and the choice belongs to the call site (build step 4). Recorded in the
 *      design (§11) as an open question rather than settled by whichever lane was written first.
 *
 * This file therefore asserts parity on the REGISTRY-DERIVED fields — the narrowed D6 invariant — and not
 * on "any filter", which round 1 established was overclaimed.
 */

const FIXTURE = path.resolve(__dirname, "../../tests/fixtures/obesity/cases.cel");

/** The CEL-written body for the concept coded `obese` (an `Observation`, `value type is boolean`). */
function celWrittenObeseBody(): Record<string, unknown> {
  const graph = resolveCelImports(FIXTURE);
  const result = emitCelToFhir(graph) as unknown as {
    emittedCases: Array<{ resources: Array<Record<string, unknown>> }>;
  };
  for (const emitted of result.emittedCases) {
    for (const resource of emitted.resources) {
      const body = (resource["body"] ?? resource) as Record<string, unknown>;
      if (body["resourceType"] !== "Observation") continue;
      const code = body["code"] as { coding?: Array<{ code?: string }> } | undefined;
      if (code?.coding?.[0]?.code === "obese") return body;
    }
  }
  throw new Error("no CEL-written `obese` Observation found — the fixture changed");
}

describe("⭐ D6 — a CONSTRUCTED record and a CEL-WRITTEN record agree on the registry-derived fields", () => {
  it("the CEL lane really does write the fields this test compares against", () => {
    // Assert the SOURCE of the comparison, so a CEL-writer change that should have broken parity fails
    // here rather than making the test vacuously pass against an empty body.
    const body = celWrittenObeseBody();
    expect(Object.keys(body).sort()).toEqual(
      [
        "category",
        "code",
        "effectiveDateTime",
        "id",
        "meta",
        "resourceType",
        "status",
        "subject",
        "valueBoolean",
      ].sort(),
    );
  });

  it("⭐ every registry-derived element the CEL lane writes is also written by the constructor", () => {
    const body = celWrittenObeseBody();
    const r = resolveConstructor("Observation", "boolean");
    if (r.kind !== "resolved") throw new Error(`expected resolved, got ${r.reason}`);
    const cql = renderRecordConstructor(r.signature);

    // The three registry resolvers that give the CEL lane its JSON names. The constructor must write an
    // element at each corresponding CQL site.
    const coding = resourceCodingPlacement("Observation");
    const value = valueJsonName("value", "boolean");
    const recency = recencyStampJsonName(RESOURCE_EMIT_REGISTRY.Observation.recency);
    expect(coding).toBeDefined();
    expect("jsonName" in value && "jsonName" in recency).toBe(true);

    // CEL writes these JSON names; the constructor writes the CQL element they are spellings OF.
    expect(body).toHaveProperty(coding!.jsonName); // `code`
    expect(cql).toContain(`${r.signature.codingElement.element}: code`);

    expect(body).toHaveProperty((value as { jsonName: string }).jsonName); // `valueBoolean`
    expect(cql).toContain(`${r.signature.valueElement}: value`);

    expect(body).toHaveProperty((recency as { jsonName: string }).jsonName); // `effectiveDateTime`
    expect(cql).toContain(`${r.signature.recency.sortExpr}: FHIR.dateTime { value: recorded }`);

    // Every structural required element the registry declares.
    for (const required of r.signature.requiredElements) {
      expect(body, `CEL lane missing ${required.element}`).toHaveProperty(required.element);
      expect(cql, `constructor missing ${required.element}`).toContain(`${required.element}:`);
    }
  });

  it("⚠ REGRESSION GUARD — the constructor writes `subject`, which the registry does NOT require", () => {
    // This is the defect parity found. `Observation.subject` is 0..1, so nothing in
    // `REQUIRED_STRUCTURAL_ELEMENTS` demands it — but a case-feature record with no subject is not
    // attributable to a patient, and the CEL lane writes one. Gating on the registry alone brought it back.
    expect(
      REQUIRED_STRUCTURAL_ELEMENTS.Observation.some((e) => e.element === "subject"),
    ).toBe(false);

    expect(celWrittenObeseBody()).toHaveProperty("subject");
    for (const rt of Object.keys(RESOURCE_EMIT_REGISTRY)) {
      const r = resolveConstructor(rt, "boolean");
      if (r.kind !== "resolved") continue;
      expect(r.signature.params.map((p) => p.name), rt).toContain("subject");
      expect(renderRecordConstructor(r.signature), rt).toContain("subject: subject");
    }
  });

  it("⚠ the KNOWN divergences are stated, not silently tolerated", () => {
    const body = celWrittenObeseBody();
    const r = resolveConstructor("Observation", "boolean");
    if (r.kind !== "resolved") throw new Error("expected resolved");
    const cql = renderRecordConstructor(r.signature);

    // 1. `id` — the CEL lane assigns one; a constructed record deliberately has none (design D4: identity
    //    is CONTENT, and CQL has no hash to compress a content key into a 64-char FHIR id).
    expect(body).toHaveProperty("id");
    expect(cql).not.toContain("id:");

    // 2. `derivedFrom` — the constructor records evidence linkage; a CEL-written assertion has no
    //    derivation to link, so the element is absent there. Not a parity break: it is present exactly
    //    when there IS evidence.
    expect(cql).toContain("derivedFrom: evidence");
    expect(body).not.toHaveProperty("derivedFrom");

    // 3. `meta.profile` — OPEN (design §11). Both lanes stamp meta, but with different canonicals; the
    //    constructor takes `profile` as a parameter, so the call site decides (build step 4).
    expect(body).toHaveProperty("meta");
    expect(cql).toContain("meta: FHIR.Meta { profile: { FHIR.canonical { value: profile } } }");
  });
});
