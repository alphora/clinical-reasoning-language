import { describe, it, expect } from "vitest";

import {
  candidateCodeCql,
  componentStampCql,
  derivedStampCql,
  fhirBooleanFromSystemBoolean,
  fhirQuantityFromSystemQuantity,
  renderConstructorCall,
} from "../renderConstructorCall";

/**
 * ⭐ #189 — the producer stage's CALL SITE.
 *
 * ⚠ EVERY EXPECTATION HERE WAS EXECUTED against the real CQL engine before it was written down, not designed
 * and then pinned. The probes are `tmp/nullprobe/bmi/` (a Quantity producer + §5b stamps) and
 * `tmp/nullprobe/obese/` (a boolean producer + the heterogeneous projection arm), written up in
 * `tmp/NOTES-bmi-producer-target-verified.md` and `tmp/NOTES-obese-target-verified.md`.
 *
 * A byte-golden does NOT test translation. If a spelling here changes, re-run those probes.
 */
const CODE = { system: "http://example.org/bmi/CodeSystem/local", code: "bmi" };

describe("#189 — rendering a producer stage's constructed candidate", () => {
  it("⭐ the candidate is a LIST that is EMPTY when nothing was produced", () => {
    const cql = renderConstructorCall({
      functionName: "CRLConstructObservationQuantity",
      code: CODE,
      valueExpr: '"BMI As FHIR Quantity"',
      stampExpr: '"BMI Derived Stamp"',
      subjectExpr: '"Subj"',
      profile: "http://example.org/bmi/StructureDefinition/bmi",
    });
    // P2-D1's form, and it was PROBED: the bare `{ C }` yields `[null]` on a null value; this yields `[]`.
    expect(cql).toContain("where C is not null");
    expect(cql).toMatch(/^\(\{ CRLConstructObservationQuantity\(/);
    // Arg ORDER is the constructor's signature — code, value, recorded, subject, profile, evidence.
    const args = /CRLConstructObservationQuantity\(([\s\S]*?)\n  \) \}\)/.exec(cql)![1];
    const order = args.split(",\n").map((a) => a.trim());
    expect(order).toHaveLength(6);
    expect(order[0]).toContain("FHIR.CodeableConcept");
    expect(order[1]).toBe('"BMI As FHIR Quantity"');
    expect(order[2]).toBe('"BMI Derived Stamp"');
    expect(order[3]).toBe('"Subj"');
    expect(order[4]).toBe("'http://example.org/bmi/StructureDefinition/bmi'");
    expect(order[5]).toBe("{}"); // never null — an absent evidence list is empty, not missing
  });

  it("codes the candidate as the CONCEPT'S OWN local code", () => {
    // The candidate joins the concept's space, so it must be coded as that concept — not as whatever the
    // producer read from. Its operands' codes are irrelevant here.
    expect(candidateCodeCql(CODE)).toBe(
      "FHIR.CodeableConcept { coding: { FHIR.Coding { " +
        "system: FHIR.uri { value: 'http://example.org/bmi/CodeSystem/local' }, " +
        "code: FHIR.code { value: 'bmi' } } } }",
    );
  });

  it("⚠ converts System.Quantity -> FHIR.Quantity, because the two do NOT line up", () => {
    // MEASURED: passing a producer's System.Quantity straight into the constructor fails to translate —
    // `Could not resolve call to operator ToQuantity with signature (System.Quantity)`. FHIRHelpers.ToQuantity
    // is the WRONG direction (FHIR -> System), so the value is decomposed.
    const cql = fhirQuantityFromSystemQuantity('"BMI Computed"');
    expect(cql).toContain("FHIR.Quantity {");
    expect(cql).toContain("value: FHIR.decimal { value: (\"BMI Computed\").value }");
    expect(cql).toContain("unit:  FHIR.string  { value: (\"BMI Computed\").unit }");
    expect(cql).not.toContain("ToQuantity");
    // The null guard is not optional: constructing a FHIR.Quantity from a null crashes the engine the same
    // way a null recency stamp did, and a producer over absent operands yields null BY DESIGN — that is what
    // lets the tree PAUSE instead of denying.
    expect(cql).toMatch(/^if "BMI Computed" is null then null as FHIR\.Quantity/);
  });

  it("⚠ GUARDS the boolean too — a CQL instance with a null property is NOT a null instance", () => {
    // ⚠ THIS TEST REPLACES ONE THAT PINNED THE OPPOSITE. The bare `FHIR.boolean { value: X }` shipped under
    // the comment "a null System.Boolean stays null — the constructor drops it", and the test asserted that
    // exact string. Both were ASSERTED; neither was run. EXECUTED (`tmp/nullprobe/boolguard/`):
    //
    //     FHIR.boolean { value: null } is null           ->  FALSE
    //     (FHIR.boolean { value: null }).value is null   ->  true
    //     <the guarded form> is null                     ->  true
    //
    // So the constructor's `value is null` guard never fired, and a candidate with a null `valueBoolean` and
    // a REAL stamp was built. It is the NEWEST in the space, so it beats an older established `false` and
    // turns an owed DENY into a pause.
    const cql = fhirBooleanFromSystemBoolean('"Obese Computed"');
    expect(cql).toBe(
      'if "Obese Computed" is null then null as FHIR.boolean\n' +
        '  else FHIR.boolean { value: "Obese Computed" }',
    );
  });

  describe("§5b — a derived candidate's stamp is the NEWEST of the components that determine its value", () => {
    it("a FORMULA over several operands takes the MAX of their stamps", () => {
      // Executed: Weight @May, Height @Feb -> the candidate is stamped MAY. The operator's reasoning is that
      // a recalculation triggered by a newer input is a NEW claim, made as of that input.
      expect(derivedStampCql(['"W Stamp"', '"H Stamp"'])).toContain('Max({ "W Stamp", "H Stamp" })');
    });

    it("⚠⚠ ANY null component yields a NULL stamp — `Max` alone would silently ignore it", () => {
      // ⚠ THIS TEST REPLACES A BARE `Max({ … })` PIN. EXECUTED (`tmp/nullprobe/maxnull/`): CQL's aggregate
      // `Max` IGNORES nulls — `Max({ @2026-05-01, null })` returns `2026-05-01`, null only when ALL are.
      // Leaning on that default stamps a formula whose Height has a value but no `effective` with the
      // WEIGHT'S date alone, giving a partially-undated claim a confident place in the recency order. The
      // guarded form was executed in the same probe and returns null.
      //
      // Partially-unknown is unknown: any null component ⇒ null stamp ⇒ the constructor's `recorded is null`
      // guard drops the candidate. The asserted and recorded arms are untouched, so this does not over-pause.
      const cql = derivedStampCql(['"W Stamp"', '"H Stamp"']);
      expect(cql).toBe(
        'if "W Stamp" is null or "H Stamp" is null then null as System.DateTime\n' +
          '  else Max({ "W Stamp", "H Stamp" })',
      );
    });

    it("a THRESHOLD over ONE operand takes THAT operand's stamp — no Max wrapper", () => {
      expect(derivedStampCql(['"BMI Stamp"'])).toBe('"BMI Stamp"');
    });

    it("⚠ NO components -> a NULL stamp, never `Now()`", () => {
      // Evaluation time is forbidden: an invented stamp lets a stale calculation outrank a fresh assertion.
      // The null reaches the constructor's guard, which drops the candidate — which is the honest outcome.
      expect(derivedStampCql([])).toBe("null as System.DateTime");
      expect(derivedStampCql([])).not.toContain("Now()");
    });

    it("reads a component's stamp per the RESOURCE REGISTRY's cast, not by guessing", () => {
      // A choice element (`effective`) needs the cast; a plain one (`recordedDate`) does not. The registry is
      // the single authority for which — the charter now says so explicitly.
      expect(componentStampCql('"Weight"', "effective", "dateTime")).toBe(
        '(("Weight").effective as FHIR.dateTime).value',
      );
      expect(componentStampCql('"Cond"', "recordedDate", "none")).toBe('("Cond").recordedDate.value');
    });
  });
});
