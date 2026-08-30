import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept } from "../../ast/types";
import { lowerLocalCodes as lowerLocalCodesRaw } from "../lowerLocalCodes";

const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });

/**
 * #189 P2 — a `record-union` twin's space is LISTED, not derived.
 *
 * The union used to be implicit: exactly TWO terms whose define names the emitter derived from a fold-in
 * name (`<foldIn>` and `<foldIn> Source`). That cannot express the space P2 needs —
 * `local ∪ n posreps ∪ n constructed candidates` (design P2-D3), where a posrep whose `type is` differs
 * from the concept's is PROJECTED into a constructed candidate rather than unioned raw.
 *
 * ⚠ Emitted text is UNCHANGED for the two-term case; the cql-emitter goldens are what pin that. This file
 * pins the CONTRACT the next slice builds on: the terms are on the twin, in order, correctly layered.
 */

const SRC = [
  'library "T".',
  'terminology "Height VS":',
  "- valueset is `http://example.org/vitals/ValueSet/height`.",
  'concept "Height":',
  "- shape is RecordSet.",
  "- type is Observation.",
  "- value type is Quantity.",
  "- code is `height`.",
  "- source representation:",
  "  - type is Observation.",
  '  - coded from "Height VS".',
  "",
].join("\n");

function unionTwin(): Concept {
  const built = buildCRL(SRC) as unknown as { success: boolean; result?: CRL };
  expect(built.success).toBe(true);
  const lowered = lowerLocalCodes(built.result!) as unknown as {
    errors?: unknown[];
    ast?: CRL;
    result?: CRL;
  };
  expect(lowered.errors ?? []).toEqual([]);
  const ast = (lowered.ast ?? lowered.result) as CRL;
  const twin = (ast.statements as Concept[]).find(
    (s) => s.__bothRepMerge === "record-union",
  );
  if (twin === undefined) throw new Error("no record-union twin was lowered — the fixture changed");
  return twin;
}

describe("record-union terms", () => {
  it("⭐ the twin LISTS its space, in order, with the layer of each term", () => {
    const twin = unionTwin();
    expect(twin.__recordUnionTerms).toEqual([
      { kind: "local-primitives", define: "Height" },
      { kind: "external-primitives", define: "Height Source" },
    ]);
  });

  it("⚠ the LAYER is part of the term, because it decides the include qualifier", () => {
    // A LocalPrimitives define and an ExternalPrimitives define are reached through different library
    // qualifiers. Deriving the layer from the name (`… Source` ⇒ external) is exactly the implicitness
    // P2 removes — it works only while there is exactly one posrep with exactly that suffix.
    const terms = unionTwin().__recordUnionTerms!;
    expect(terms.map((t) => t.kind)).toEqual(["local-primitives", "external-primitives"]);
    expect(new Set(terms.map((t) => t.kind)).size).toBe(2);
  });

  it("the local term names the concept itself — the LP retrieve twin shares the author's name", () => {
    const terms = unionTwin().__recordUnionTerms!;
    const local = terms.find((t) => t.kind === "local-primitives");
    expect(local).toEqual({ kind: "local-primitives", define: "Height" });
  });

  it("⚠ the marker and the terms are set in LOCK-STEP", () => {
    // The emitter throws on a `record-union` marker with no terms rather than falling back to the derived
    // pair. A silent fallback would re-hide the implicitness this replaces, and would do it at the exact
    // moment a third term was added and forgotten.
    const twin = unionTwin();
    expect(twin.__bothRepMerge).toBe("record-union");
    expect(twin.__recordUnionTerms).toBeDefined();
    expect(twin.__recordUnionTerms!.length).toBeGreaterThan(0);
  });
});
