import { describe, it, expect } from "vitest";

import { emitCQL } from "../emitCQL";

/**
 * #189 flip — Slice A: activate emission of a `definition is exists "X"` reduction (a `ReductionDefinition`
 * over a NAMED RecordSet operand) → `exists (<X>)`, mirroring the `defined as exists` lane. Before the flip a
 * reduction was validate-only and `emitConceptBody` failed loud (`reductionNotEmittable`). This pins the
 * standalone named-exists lowering; `this` (ThisRecords) + the value-read forms (`count`/`most recent`) stay
 * loud until later slices.
 *
 * Existence is null-total by CQL semantics regardless of the operand's shape (disc 429), so a named `exists`
 * emits identically to `defined as exists` — this is the smallest reduction cell and needs no `lowerLocalCodes`
 * change (the operand is an ordinary coded-from RecordSet).
 */
describe("#189 Slice A — `definition is exists \"X\"` reduction emit (none lane)", () => {
  const src = [
    "# T",
    'library "T".',
    "",
    'terminology "VS":',
    "- valueset is `http://example.org/vs`.",
    "",
    'concept "Overweight Diagnoses":',
    "- type is Condition.",
    "- shape is RecordSet.",
    '- coded from "VS".',
    "",
    'concept "Has Overweight":',
    // No `type is` — a representation-free named derivation owns no records of its own; its boolean is
    // derived entirely from "Overweight Diagnoses" (crl-emit disc 430, charter §3 datum/result distinction).
    "- value type is boolean.",
    '- definition is exists "Overweight Diagnoses".',
    "",
  ].join("\n");

  const r: any = emitCQL(src, { libraryName: "T" });

  it("emits without errors (no loud `not yet lowered` / reduction guard)", () => {
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    expect(r.result ?? "").not.toContain("not yet lowered");
    expect(r.result ?? "").not.toContain("emit-reduction-not-active");
  });

  it("lowers `definition is exists \"X\"` to a boolean `exists (<X>)`", () => {
    expect(r.result ?? "").toMatch(/define "Has Overweight":\s*\n\s*exists \("Overweight Diagnoses"\)/);
  });
});
