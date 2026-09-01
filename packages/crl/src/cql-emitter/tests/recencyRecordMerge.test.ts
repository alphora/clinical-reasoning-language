import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../../imports/emit";

/**
 * ⭐ #189 — the both-representation RECORD merge.
 *
 * THE MODEL, in the operator's words: *"TWO ARMS ADD TO A COLLECTION AND A THIRD ARM WORKS ON THAT COLLECTION
 * STEPWISE."* This fixture is the GOAL's leaf shape (`fixtures/obesity/policy.crl`'s `Height`), and the emitted
 * merge is that sentence literally — `union` is the two arms adding, `Last(… sort by …)` is the stage working:
 *
 *     define "Height":
 *       Last( (LocalPrimitives."Height" union ExternalPrimitives."Height Source") O
 *               sort by (effective as FHIR.dateTime).value, id )
 *
 * ⚠ WHY THE UNION NEEDS NO CANDIDATE CONSTRUCTION HERE: both arms retrieve the concept's OWN `type is` resource
 * (the local `code is` records and the `coded from` source records are both `[Observation: …]`), so the union is
 * HOMOGENEOUS. A concept whose arms differ (a Condition posrep, or a DERIVED value) needs the record constructor
 * first; that is the next slice, and it is why this leaf is the smallest coherent one.
 *
 * EXECUTION-VERIFIED, not just emit-diffed (`tmp/nullprobe/hw-verify/`, run against the cqf CQL engine): with a
 * local answer dated January and a source record dated June, `Count(local union source) = 2` and the merge
 * selects the JUNE record — the newest across BOTH arms, not within one.
 */
const FIXTURE = path.resolve(__dirname, "fixtures/recency-record-merge/recency-record-merge.crl");

const emit = (): { success: boolean; cql: string; kinds: string[] } => {
  const r = emitCQLImports(FIXTURE) as unknown as {
    success: boolean;
    cqlByLibrary?: { libraryName: string; cql: string }[];
    errors?: { kind?: string }[];
  };
  return {
    success: r.success,
    cql: (r.cqlByLibrary ?? [])
      .filter((l) => !/CRLCommon|FHIRHelpers|CaseFeatureCommon/.test(l.libraryName))
      .map((l) => `--- ${l.libraryName}\n${l.cql}`)
      .join("\n"),
    kinds: (r.errors ?? []).map((e) => e.kind ?? "(none)"),
  };
};

describe("#189 — the both-rep RECORD merge (`shape is Record` + `code is` + posrep + `most recent this`)", () => {
  it("lowers at all — it used to be refused `emit-reduction-not-active`", () => {
    const { success, kinds } = emit();
    // The posrep was the disqualifier: `code is` + `most recent this` with NO representation already lowered,
    // and adding one arm made the whole concept unbuildable. That is the shape the GOAL is built on.
    expect(kinds).toEqual([]);
    expect(success).toBe(true);
  });

  // ⚠ `\s*` around `union` rather than a literal space: the merge's space is now rendered by the
  // SHARED `renderSpaceTerms`, which joins terms with a newline exactly as the record-union twin
  // always did. That is the POINT of one renderer — a two-arm merge and an n-arm one are the same
  // code path, so the separator cannot be one thing here and another there. Nothing about the
  // SEMANTICS moved; pinning the old single-line spacing would only pin which function happened to
  // build the string.
  // ⭐⭐ AND FILTERS NON-CONFORMING ROWS. A valueless record must never win the selection
  // (operator, 2026-08-31: "there should never be valueless observations at all"). The VALUE merge
  // always did this — "a newer non-conforming row must not mask an older conforming one" (disc 506)
  // — and the RECORD branch could not until the descriptor learned the record's carrier
  // (`answerCarrier`). ⚠ Scoped to a DECLARED carrier: an `exists this` concept's SD has no
  // `value[x]` at all (its answer IS presence), so no filter is emitted there.
  it("⭐ emits the two arms UNIONED into one collection, with the stage selecting over it", () => {
    // ⚠⚠ THE SELECT MOVED TO THE HELPER DEFINE, and that is the #189 BOUNDARY TRANSFORM, not drift. This
    // fixture is `code is` + an UNPROJECTED posrep, so its space CAN publish a record that is not the
    // concept's case feature — the bare source retrieve. Charter §3 (operator, 2026-09-01): *"a consumer has
    // to see a CF"*, and consumer-independently, so the concept's OWN define normalises and the raw select
    // moves to `"<X> Selected"`.
    //
    // The union and the stage are UNCHANGED — the operator's *"two arms add to a collection and a third arm
    // works on that collection"* still reads literally here; it just reads on the helper.
    const { cql } = emit();
    expect(cql).toMatch(
      /define "Height Selected":\s*\n\s*Last\(\s*\n\s*\(\S*LocalPrimitives\."Height"\s*\n?\s*union \S*ExternalPrimitives\."Height Source"\) O\s*\n\s*where O\.value is FHIR\.Quantity\s*\n\s*sort by \(effective as FHIR\.dateTime\)\.value, id\s*\n\s*\)/,
    );
  });

  it("⭐⭐ the concept's OWN define carries the boundary transform — check, then replace", () => {
    // ⚠ THE TRANSFORM IS HERE, not on the helper. Had it sat on a side define that only the
    // `cpg-featureExpression` targeted, the questionnaire would see a case feature while every other CQL
    // consumer — a cross-library ref, the Interface re-export, a downstream reduction — read the raw record.
    // Both panel arms caught that inversion (disc 532 Q5).
    //
    // EXECUTED (`tmp/NOTES-boundary-transform-executed.md`): an EXTERNAL winner comes back CONSTRUCTED
    // (`id` null, local code, case-feature profile, and the SOURCE record's stamp and value preserved); a
    // LOCAL winner is returned untouched WITH its `id`.
    const { cql } = emit();
    expect(cql).toMatch(/define "Height":\s*\n\s*if "Height Selected" is null then null/);
    expect(cql).toMatch(/else if "Height Selected"\.code ~ FHIR\.CodeableConcept/);
    expect(cql).toMatch(/then "Height Selected"/);
    expect(cql).toMatch(/else CRLConstructObservationQuantity\(/);
  });

  it("publishes each arm as its own retrieve — local by CODE, source by VALUE SET", () => {
    const { cql } = emit();
    expect(cql).toMatch(/define "Height":\s*\n\s*\[Observation: \S*LocalConcepts\."Height"\]/);
    expect(cql).toMatch(/define "Height Source":\s*\n\s*\[Observation: \S*ExternalConcepts\."Height VS"\]/);
  });

  it("⚠ emits NO `undefined` — the value-merge path would have interpolated one", () => {
    // MEASURED before the record branch existed: a `shape is Record` concept routed through the VALUE merge,
    // whose descriptor has no `valueElement`/`datumValueType`, and emitted `where O.undefined is FHIR.undefined`
    // under `success: true`. Untranslatable CQL reported as success is the worst failure mode there is, so this
    // pins the absence rather than trusting the branch to stay taken.
    const { cql } = emit();
    expect(cql).not.toContain("undefined");
    expect(cql).not.toMatch(/FHIR\.undefined/);
  });

  it("⚠ does NOT read a value — a Record publishes the record, and the guard reads the value later", () => {
    // A `shape is Scalar` merge of the same arms publishes `(<newest>).value as FHIR.<T>`. Declaring `Record`
    // must publish the RECORD; collapsing it to a value here would silently change what the concept publishes
    // from what its author declared (charter §3 — cardinality is authoritative).
    const { cql } = emit();
    const merge = /define "Height":\s*\n\s*Last\([\s\S]*?\n\s*\)/.exec(cql)?.[0] ?? "";
    expect(merge).not.toContain(".value as FHIR.");
    // And no per-operand totalisation anywhere on the merge path — totality belongs at the arm.
    expect(cql).not.toContain("Coalesce");
  });
});
