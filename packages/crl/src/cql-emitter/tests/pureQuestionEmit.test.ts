import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { emitCQLImports } from "../../imports/emit";
import { emitCQLFromAST } from "../emitCQL";

/**
 * #189 null/pause — the PURE QUESTION emits a THREE-STATE read.
 *
 * `asTruths().satisfied()` collapses three distinct states into one: no answer record, a record valued
 * `false`, and a valueless record all become the empty set, hence `false`. That makes an UNANSWERED question
 * indistinguishable from one answered "no", so a decision DENIES where it must PAUSE and ask — the #189
 * null/pause defect, verified against two unaltered reference PA IGs (`tmp/NOTES-apply-null-behavior.md`).
 *
 * A pure question (local `code is` + `value type is boolean`, NO derivation, NO source rep) has nothing that
 * could compute it, so it reads `answeredValue()`: true / false / **null**. Deliberately NOT `Coalesce`d —
 * totality belongs at the ARM, never per operand (design of record §3.3).
 */
const FIXTURE = path.resolve(__dirname, "fixtures/pure-question/pure-question.crl");

const cqlFor = (libSuffix: string): string => {
  const r = emitCQLImports(FIXTURE);
  expect(r.success).toBe(true);
  const lib = (r.cqlByLibrary ?? []).find((l) => l.libraryName.endsWith(libSuffix));
  expect(lib, `library *${libSuffix} not emitted`).toBeDefined();
  return lib!.cql;
};

describe("#189 null/pause — pure-question three-state read", () => {
  it("a PURE QUESTION reads `answeredValue()` (true / false / null), never the truth-set collapse", () => {
    // T5 step 2b — the read lives on the INFERENCES determination, so a `defined as` composition can see it
    // (`LAYER_ORDER` forbids Inferences -> Interface, so a read that lived only on the facade was invisible to
    // every composition and could only be lowered by the collapse this slice retires).
    const inferences = cqlFor("Inferences");
    expect(inferences).toMatch(
      /define "Can Use Equipment At Home":\s*\n\s*\S+\."Can Use Equipment At Home Records"\.answeredValue\(\)/,
    );
    // The collapse is what folds "unanswered" into "false" — it must not be on this concept, on any layer.
    expect(inferences).not.toMatch(/"Can Use Equipment At Home[^"]*"\.asTruths\(\)/);
  });

  it("the facade re-exports the question BARE — a `.satisfied()` there would re-manufacture the false", () => {
    const iface = cqlFor("Interface");
    // BARE is what propagates the null to the branch guard. `.satisfied()` is `exists(truths)`, which is total
    // by its own existence wrapper — applying it here would deny an unanswered question all over again.
    expect(iface).toMatch(/define "Can Use Equipment At Home":\s*\n\s*\S+\."Can Use Equipment At Home"\s*\n/);
    expect(iface).not.toMatch(/"Can Use Equipment At Home"\.satisfied\(\)/);
    expect(iface).not.toMatch(/"Can Use Equipment At Home[^"]*"\.asTruths\(\)/);
  });

  // ⭐ THE DIRECT (UNLAYERED) PATH. This is the measurement the whole lowering design rests on, so it is pinned
  // rather than left to a probe. A question is the canonical `when`-guard shape, but it does not REQUIRE a
  // decision — a library may declare questions and no decision at all, so it also routes the per-CRL path,
  // where there are no layers to separate same-named twins. The converged design said to reuse the
  // both-representation SAME-NAME twin; on this path that emits a DUPLICATE `define "X"` (plus an empty library
  // qualifier) and the emit is refused `emit-both-rep-requires-case-feature-lane`. Distinct names — the records
  // twin the `exists this` family already uses — work on BOTH paths with ONE mechanism.
  describe("the DIRECT (unlayered) emit path", () => {
    const directEmit = (src: string): { success: boolean; result?: string; errors?: { kind?: string }[] } => {
      const built = buildCRL(src);
      expect(built.success).toBe(true);
      return emitCQLFromAST(built.result!, { canonicalBase: "http://example.org/crl/test" }) as never;
    };

    const QUESTION = `library "T".
concept "Present":
- type is Observation.
- value type is boolean.
- shape is Scalar.
- code is \`present\`.`;

    it("emits the twin + the three-state read, each define exactly ONCE", () => {
      const r = directEmit(QUESTION);
      expect(r.errors ?? []).toEqual([]);
      expect(r.success).toBe(true);
      const cql = r.result ?? "";
      // Exactly one define of each name — the duplicate-define collision is what ruled out the same-name design.
      expect(cql.match(/^define "Present":/gm) ?? []).toHaveLength(1);
      expect(cql.match(/^define "Present Records":/gm) ?? []).toHaveLength(1);
      expect(cql).toMatch(/define "Present":\s*\n\s*"Present Records"\.answeredValue\(\)/);
      expect(cql).toMatch(/define "Present Records":\s*\n\s*\[Observation: "Present Code"\]/);
      // An EMPTY library qualifier (`""."Present"`) is what the same-name design produced here.
      expect(cql).not.toContain('""."');
      // No collapse, and no per-operand totalisation.
      expect(cql).not.toContain("asTruths()");
      expect(cql).not.toContain("satisfied()");
      expect(cql).not.toContain("Coalesce");
    });

    it("declares the `answeredValue()` fluent's library — the direct path has the case-feature lane OFF", () => {
      // Without this the emitted CQL calls a fluent from a library the header never includes, and the
      // translator cannot resolve it. The layered lane includes CaseFeatureCommon for a different reason
      // (`caseFeature.kind !== "off"`), so this path needs its own trigger.
      expect(directEmit(QUESTION).result ?? "").toContain("include CaseFeatureCommon called CFH");
    });

    it("composes two questions in the BOOLEAN lane — bare leaves, so an unanswered operand stays unknown", () => {
      const r = directEmit(`library "T".
concept "Present":
- type is Observation.
- value type is boolean.
- shape is Scalar.
- code is \`present\`.
concept "Other":
- type is Observation.
- value type is boolean.
- shape is Scalar.
- code is \`other\`.
concept "Both":
- value type is boolean.
- shape is Scalar.
- defined as ( "Present" and "Other" ).`);
      expect(r.success).toBe(true);
      // BARE operands: CQL `and`/`or` are strong Kleene, so `null and true` is null and the guard PAUSES.
      // A `Coalesce` on either leaf — totality per operand rather than at the arm — is the pause→deny flip.
      expect(r.result ?? "").toMatch(/define "Both":\s*\n\s*"Present" and "Other"/);
      expect(r.result ?? "").not.toContain("Coalesce");
    });

    it("REFUSES when the synthesized `\"<X> Records\"` name is already taken, rather than colliding silently", () => {
      const r = directEmit(`library "T".
concept "Present":
- type is Observation.
- value type is boolean.
- shape is Scalar.
- code is \`present\`.
concept "Present Records":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`taken\`.
- definition is exists this.`);
      expect(r.success).toBe(false);
      expect((r.errors ?? []).map((e) => e.kind)).toContain("emit-records-twin-name-collision");
    });
  });

  it("`exists this` is a DERIVATION, not a question — absence stays closed-world false", () => {
    const iface = cqlFor("Interface");
    // Its truth is `exists` over its own records: computable, so it never pauses. Unchanged behavior.
    expect(iface).not.toMatch(/"Has EDS Evidence"\.answeredValue\(\)/);
  });

  it("the pure question's records retrieve is unchanged in SHAPE — it moves to the `Records` twin", () => {
    // T5 step 2b — the retrieve itself is byte-identical apart from its name. The question now lowers the same
    // way `code is` + `definition is exists this` already did (a `"<X> Records"` retrieve + a determination
    // under `"<X>"`), which is what lets ONE mechanism serve the layered AND the direct emit paths.
    expect(cqlFor("LocalPrimitives")).toMatch(
      /define "Can Use Equipment At Home Records":\s*\n\s*\[Observation: \S+\."Can Use Equipment At Home"\]/,
    );
  });
});
