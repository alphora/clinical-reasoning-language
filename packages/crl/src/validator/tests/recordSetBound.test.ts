import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { Validator, type ValidationResult } from "../validator";

/**
 * ⭐⭐ #189 — a `shape is RecordSet` concept that never restricts its set (`recordset-unbounded`).
 *
 * RULED (operator, 2026-09-01): *"A history-only record set is a performance smell. We should emit a
 * warning on validation. Not an error of course but a warning."*
 *
 * ⚠⚠ THE SEVERITY IS THE POINT AND IS PINNED HERE. An unbounded coded history is LEGAL — the goal's own
 * Layered authoring option publishes `Weight Records` as exactly that, deliberately, and charter §3 keeps
 * all three authoring options canonical. So `isValid` MUST stay true and the finding MUST land in
 * `warnings`. A future refactor that "tightens" this into an error would make the goal fixture invalid.
 *
 * ⭐ WHY THE COST IS REAL, in two tiers. ALWAYS: the full history is retrieved and carried through every
 * downstream stage — the operator's actual claim, true of any unbounded set. ADDITIONALLY FOR A CODED
 * CONCEPT: the case-feature transform happens at the concept BOUNDARY (charter §3), which for a RecordSet
 * is the WHOLE set, so it is n constructions — and no placement changes that, because the boundary IS the
 * collection. ⚠ Tier two is scoped — *"it only applies to concepts that have a `code is`"* — and the
 * message must not claim it for an uncoded concept. A restriction is the only lever either way.
 */

const HEAD = ['# P', 'library "L".', 'terminology "W VS":', "- valueset is `http://example.org/v/ValueSet/w`."];

function validate(conceptSrc: string): ValidationResult {
  const built = buildCRL([...HEAD, conceptSrc].join("\n"));
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  return new Validator().validate(built.result!);
}

const kinds = (r: ValidationResult, bucket: "errors" | "warnings"): string[] => r[bucket].map((e) => e.kind);

describe("#189 — recordset-unbounded", () => {
  it("⭐ an unrestricted RecordSet history WARNS, and stays VALID", () => {
    const r = validate(
      ['concept "Weight Records":', "- shape is RecordSet.", "- type is Observation.", "- value type is Quantity.", "- code is `weight`."].join("\n"),
    );
    expect(kinds(r, "warnings")).toContain("recordset-unbounded");
    // ⚠ The severity assertion, not a formality: this is the goal's Layered shape.
    expect(kinds(r, "errors")).not.toContain("recordset-unbounded");
    expect(r.isValid).toBe(true);
  });

  it("⭐ a RESTRICTED RecordSet does NOT warn — a single (non-pipeline) filtering narrative counts", () => {
    // ⚠ Regression guard: `matchNarrativeStages` reports `not-a-pipeline` here, so a rule that read ONLY
    // the staged result would warn on a concept that plainly does restrict.
    const r = validate(
      [
        'concept "Recent Weights":',
        "- shape is RecordSet.",
        "- type is Observation.",
        "- value type is Quantity.",
        "- code is `weight`.",
        '- definition is "Weight Records" within last 6 months.',
        'concept "Weight Records":',
        "- shape is RecordSet.",
        "- type is Observation.",
        "- value type is Quantity.",
        "- code is `weight`.",
      ].join("\n"),
    );
    const warned = r.warnings.filter((w) => w.kind === "recordset-unbounded").map((w) => (w as { conceptName: string }).conceptName);
    expect(warned).not.toContain("Recent Weights");
    // …and the unrestricted twin it reduces over still warns on its own account.
    expect(warned).toContain("Weight Records");
  });

  it("a `shape is Record` concept is never judged — the boundary there is ONE record", () => {
    const r = validate(
      ['concept "Weight":', "- shape is Record.", "- type is Observation.", "- value type is Quantity.", "- code is `weight`."].join("\n"),
    );
    expect(kinds(r, "warnings")).not.toContain("recordset-unbounded");
  });

  it("⭐⭐ the MESSAGE states the case-feature cost only for a CODED concept", () => {
    // ⚠⚠ THE REASON MATTERS AS MUCH AS THE FINDING. Charter §3 (operator, 2026-09-01): the boundary
    // case-feature transform *"only applies to concepts that have a `code is`"* — a case feature IS a local
    // identity, and an uncoded concept has none to publish. MEASURED: 14 of the 32 in-tree hits are UNCODED
    // (`Medical Reasons` is `coded from` a value set and nothing else), so a message that claimed n
    // constructions for all of them would be a stale rule shipped in an author-facing string.
    //
    // The warning still fires for both — an unbounded history is retrieved and carried at full length
    // regardless, which is the operator's actual claim and reason enough on its own.
    const coded = validate(
      ['concept "Coded Hx":', "- shape is RecordSet.", "- type is Observation.", "- value type is Quantity.", "- code is `weight`."].join("\n"),
    );
    const uncoded = validate(
      [
        'concept "Uncoded Hx":',
        "- shape is RecordSet.",
        "- type is Observation.",
        "- value type is Quantity.",
        "- source representation:",
        "  - type is Observation.",
        '  - coded from "W VS".',
      ].join("\n"),
    );
    const msg = (r: ValidationResult): string =>
      r.warnings.filter((w) => w.kind === "recordset-unbounded").map((w) => w.message).join(" ");

    expect(msg(coded)).toContain("case feature");
    expect(msg(uncoded)).toMatch(/retrieved and carried/);
    expect(msg(uncoded)).not.toContain("case feature");
  });

  it("⚠ an OMITTED shape is an open question, not a RecordSet — it must not warn", () => {
    // `Concept.shape` is optional BY DESIGN and `assumedShapePreMigration` defaults it to Scalar. Warning
    // on an undeclared shape would launder that migration crutch into an author-facing finding.
    const r = validate(
      ['concept "Weight":', "- type is Observation.", "- value type is Quantity.", "- code is `weight`."].join("\n"),
    );
    expect(kinds(r, "warnings")).not.toContain("recordset-unbounded");
  });
});
