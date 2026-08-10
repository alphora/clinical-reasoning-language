import { describe, it, expect } from "vitest";

import { emitCQL } from "../emitCQL";

/**
 * #265 — `defined as exists ( "X" )` CQL lowering (standard lane).
 *
 * A `defined as exists` concept is a boolean existence DETERMINATION over concept
 * X's define (a resource / refinement list): it lowers to `exists (<X>)`. Before
 * #265 the emitter guarded loud (`definedAsExistsNotLowered`) because no content
 * used it; CMS69's `Active Pregnancy Diagnosis` is the first real consumer (its
 * byte-exact emit is pinned by the cms69 golden). This file pins the standalone
 * lowering + asserts the loud guard no longer fires on the standard lane.
 */
describe("#265 — `defined as exists` lowering (standard lane)", () => {
  const src = [
    "# T",
    'library "T".',
    "",
    'terminology "VS":',
    "- valueset is `http://example.org/vs`.",
    "",
    'concept "Overweight Diagnoses":',
    "- type is Condition.",
    "- value type is CodeableConcept.",
    '- coded from "VS".',
    "",
    'concept "Has Overweight":',
    "- type is Observation.",
    "- value type is boolean.",
    '- defined as exists ( "Overweight Diagnoses" ).',
    "",
  ].join("\n");

  const r: any = emitCQL(src, { libraryName: "T" });

  it("emits without errors (no loud `not yet lowered` guard on the standard lane)", () => {
    expect(r.success).toBe(true);
    expect(r.result ?? "").not.toContain("not yet lowered");
  });

  it("lowers `defined as exists (\"X\")` to a boolean `exists (<X>)`", () => {
    expect(r.result ?? "").toMatch(/define "Has Overweight":\s*\n\s*exists \("Overweight Diagnoses"\)/);
  });

  // A CROSS-LIB exists operand is qualified by the same `crossLibraryOf` / `cqlQualifiedRef` path
  // as the bare-ref lane (byte-parallel in `emitDefinedAs`), so `exists ( "Lib"."X" )` →
  // `exists (<Lib>."X")` follows from the bare-ref cross-lib coverage (measure lane) + the wrap above.
  // A dedicated positive cross-lib emit fixture is not added: a cross-lib `defined as` ref into any
  // LAYERED/splitting operand library is guard-rejected up front (`emit-cross-library-ref-into-split-
  // library`) — the exists lowering inherits that guard, so a positive case needs an inferred-layer
  // resource operand and is covered transitively rather than via a bespoke fixture.
});
