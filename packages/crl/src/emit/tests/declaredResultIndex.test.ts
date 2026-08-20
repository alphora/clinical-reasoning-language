import { buildCRL } from "../../index";
import type { CRL, Concept, ReferenceName } from "../../ast/types";
import {
  buildDeclaredResultIndex,
  makeDeclaredResultResolver,
  makeTotalityFamilyResolver,
  resultTypeOf,
  type LibraryConcepts,
  type ResolveRawLibrary,
} from "../declaredResultIndex";
import { sameLayerResolver } from "../../cql-emitter/totalScalarBoolean";

// #189 Slice C 2b.3a — unit tests for the pre-emit cross-library DECLARED-RESULT index (the `ResultType`
// compatibility half + the scope-resolved resolver). This slice is UNCONSUMED (byte-invariant); these tests are the
// non-tautological proof the index/resolver are correct BEFORE the flip (2b.3b) consumes them. The lane-aware
// TOTALITY verdict is NOT part of 2b.3a (byte-coupled to the flip) and is tested there.

function parse(body: string): CRL {
  const r = buildCRL('# fixture\nlibrary "Fixture".\n\n' + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
}

function conceptOf(body: string, name: string): Concept {
  const crl = parse(body);
  const c = crl.statements.find((s) => s.type === "Concept" && s.name === name) as Concept | undefined;
  if (!c) throw new Error(`concept "${name}" not found`);
  return c;
}

function conceptsOf(body: string): Concept[] {
  return parse(body).statements.filter((s): s is Concept => s.type === "Concept");
}

const BOOL_SCALAR = conceptOf(
  `concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.
`,
  "R",
);

const RECORDSET = conceptOf(
  `concept "Recs":
- type is Condition.
- shape is RecordSet.
- code is \`recs\`.
`,
  "Recs",
);

const qref = (libraryName: string, name: string): ReferenceName =>
  ({ type: "QualifiedReference", libraryName, name, location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } } as ReferenceName);

describe("buildDeclaredResultIndex — #189 Slice C 2b.3a", () => {
  it("a boolean Scalar concept indexes as Scalar<boolean>", () => {
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [BOOL_SCALAR] }]);
    expect(idx.lookup("Lib", "R")).toEqual({ kind: "hit", result: { shape: "Scalar", valueType: "boolean" } });
  });

  it("a RecordSet concept indexes as RecordSet<resource>", () => {
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [RECORDSET] }]);
    expect(idx.lookup("Lib", "Recs")).toEqual({ kind: "hit", result: { shape: "RecordSet", resource: "Condition" } });
  });

  it("an INDETERMINATE scalar (0 or >1 value types) → `indeterminate` (distinct from miss)", () => {
    const zero: Concept = { ...BOOL_SCALAR, name: "Zero", valueTypes: [] };
    const two: Concept = { ...BOOL_SCALAR, name: "Two", valueTypes: ["boolean", "Quantity"] };
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [zero, two] }]);
    expect(idx.lookup("Lib", "Zero")).toEqual({ kind: "indeterminate" });
    expect(idx.lookup("Lib", "Two")).toEqual({ kind: "indeterminate" });
  });

  it("a miss (unknown source or name) → `miss` (distinct from indeterminate)", () => {
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [BOOL_SCALAR] }]);
    expect(idx.lookup("Other", "R")).toEqual({ kind: "miss" });
    expect(idx.lookup("Lib", "Nope")).toEqual({ kind: "miss" });
  });

  it("keys do NOT collide across spaced identity/name boundaries (JSON key, not a delimiter)", () => {
    // `keyOf("A B","C")` must NOT equal `keyOf("A","B C")` — every real concept/layer name has spaces.
    const c1: Concept = { ...BOOL_SCALAR, name: "C" };
    const c2: Concept = { ...RECORDSET, name: "B C" };
    const idx = buildDeclaredResultIndex([
      { sourceIdentity: "A B", concepts: [c1] },
      { sourceIdentity: "A", concepts: [c2] },
    ]);
    expect(idx.lookup("A B", "C")).toEqual({ kind: "hit", result: { shape: "Scalar", valueType: "boolean" } });
    expect(idx.lookup("A", "B C")).toEqual({ kind: "hit", result: { shape: "RecordSet", resource: "Condition" } });
    // The cross pair is a genuine MISS, not a wrong pick.
    expect(idx.lookup("A B C", "")).toEqual({ kind: "miss" });
  });

  describe("winner rule — public-determination wins its same-name impl twin", () => {
    it("a `source-impl` twin is EXCLUDED; the same-name `public-determination` wins", () => {
      const sourceImpl: Concept = { ...RECORDSET, name: "X", __loweringRole: "source-impl" };
      const publicDet: Concept = { ...BOOL_SCALAR, name: "X", __loweringRole: "public-determination" };
      const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [sourceImpl, publicDet] }]);
      expect(idx.lookup("Lib", "X")).toEqual({ kind: "hit", result: { shape: "Scalar", valueType: "boolean" } });
    });

    it("order-independent: `public-determination` first, `source-impl` second — still the determination", () => {
      const publicDet: Concept = { ...BOOL_SCALAR, name: "X", __loweringRole: "public-determination" };
      const sourceImpl: Concept = { ...RECORDSET, name: "X", __loweringRole: "source-impl" };
      const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [publicDet, sourceImpl] }]);
      expect(idx.lookup("Lib", "X")).toEqual({ kind: "hit", result: { shape: "Scalar", valueType: "boolean" } });
    });

    it("an Interface re-export façade (flag) is NOT a candidate", () => {
      const facade: Concept = { ...BOOL_SCALAR, name: "F", __interfaceReexport: true };
      const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [facade] }]);
      expect(idx.lookup("Lib", "F")).toEqual({ kind: "miss" });
    });

    it("an `interface-facade` ROLE (no flag) is NOT a candidate", () => {
      const facade: Concept = { ...BOOL_SCALAR, name: "F", __loweringRole: "interface-facade" };
      const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [facade] }]);
      expect(idx.lookup("Lib", "F")).toEqual({ kind: "miss" });
    });

    it("a `records-impl` twin alone (no public twin) is NOT a candidate", () => {
      const recordsImpl: Concept = { ...RECORDSET, name: "Y", __loweringRole: "records-impl" };
      const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [recordsImpl] }]);
      expect(idx.lookup("Lib", "Y")).toEqual({ kind: "miss" });
    });

    it("two DISTINCT public candidates for one {source,name} → `ambiguous` (fail-safe, not a wrong pick)", () => {
      const a: Concept = { ...BOOL_SCALAR, name: "Dup" };
      const b: Concept = { ...RECORDSET, name: "Dup" };
      const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [a, b] }]);
      expect(idx.lookup("Lib", "Dup")).toEqual({ kind: "ambiguous" });
    });
  });

  it("an untagged authored foreign concept IS public (indexed)", () => {
    expect(BOOL_SCALAR.__loweringRole).toBeUndefined();
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Foreign", concepts: [BOOL_SCALAR] }]);
    expect(resultTypeOf(idx.lookup("Foreign", "R"))).toEqual({ shape: "Scalar", valueType: "boolean" });
  });
});

describe("makeDeclaredResultResolver — #189 Slice C 2b.3a token spaces", () => {
  const libs: LibraryConcepts[] = [
    { sourceIdentity: "Referrer", concepts: [{ ...BOOL_SCALAR, name: "Local" }] },
    { sourceIdentity: "RealTarget", concepts: [{ ...BOOL_SCALAR, name: "Sib" }] },
    // A source whose IDENTITY collides with an authored token, holding a DIFFERENT result — the shadowing hazard.
    { sourceIdentity: "Alias", concepts: [{ ...RECORDSET, name: "Sib" }] },
  ];
  const index = buildDeclaredResultIndex(libs);

  it("a QUALIFIED ref resolves its library token via the referrer's SCOPE, OVER a shadowing direct hit", () => {
    // Token "Alias" IS a direct source identity (→ RecordSet), but the referrer's scope maps it to "RealTarget".
    // Scope must WIN (→ Scalar<boolean>), never the shadowing direct hit — the `local-package-same-name` hazard.
    const resolveRawLibrary: ResolveRawLibrary = (from, raw) =>
      from === "Referrer" && raw === "Alias" ? "RealTarget" : undefined;
    const resolve = makeDeclaredResultResolver(index, resolveRawLibrary);
    expect(resolve("Referrer", qref("Alias", "Sib"))).toEqual({
      kind: "hit",
      result: { shape: "Scalar", valueType: "boolean" },
    });
  });

  it("scope miss WITH a resolver armed → `miss` (does NOT fall through to a raw token hit)", () => {
    // "Alias" is a direct source identity, but with a resolver armed and no scope answer the ref is unresolvable —
    // must NOT resolve the never-imported "Alias" source.
    const resolve = makeDeclaredResultResolver(index, () => undefined);
    expect(resolve("Referrer", qref("Alias", "Sib"))).toEqual({ kind: "miss" });
  });

  it("no resolver (default) → the qualified token is treated AS a source identity (direct hit)", () => {
    const resolve = makeDeclaredResultResolver(index);
    expect(resolve("Referrer", qref("RealTarget", "Sib"))).toEqual({
      kind: "hit",
      result: { shape: "Scalar", valueType: "boolean" },
    });
  });

  it("a self-qualified ref (libraryName === fromIdentity) resolves via the token-as-source default", () => {
    const resolve = makeDeclaredResultResolver(index);
    expect(resolve("Referrer", qref("Referrer", "Local"))).toEqual({
      kind: "hit",
      result: { shape: "Scalar", valueType: "boolean" },
    });
  });

  it("a BARE ref resolves in the referrer's OWN source library", () => {
    const resolve = makeDeclaredResultResolver(index);
    expect(resolve("Referrer", "Local")).toEqual({ kind: "hit", result: { shape: "Scalar", valueType: "boolean" } });
    expect(resolve("RealTarget", "Local")).toEqual({ kind: "miss" });
  });

  it("an unknown qualified token (no scope, no direct source) → `miss`", () => {
    const resolve = makeDeclaredResultResolver(index);
    expect(resolve("Referrer", qref("Ghost", "Sib"))).toEqual({ kind: "miss" });
  });
});

describe("lookupTotality — #189 Slice 0c (the lane-aware totality projection)", () => {
  it("a total scalar boolean (an `exists` reduction) → `{ total: true }`", () => {
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [BOOL_SCALAR] }]);
    expect(idx.lookupTotality("Lib", "R")).toEqual({ kind: "total", total: true });
  });

  it("a NON-total but coherent concept (a RecordSet) → `{ total: false }` (a hit, verdict false — NOT indeterminate)", () => {
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [RECORDSET] }]);
    expect(idx.lookupTotality("Lib", "Recs")).toEqual({ kind: "total", total: false });
  });

  it("a same-lib boolean COMPOSITION over same-lib total booleans → `{ total: true }`", () => {
    const concepts = conceptsOf(
      `concept "A":
- type is Condition.
- value type is boolean.
- code is \`a\`.
- definition is exists this.
concept "B":
- type is Condition.
- value type is boolean.
- code is \`b\`.
- definition is exists this.
concept "Comp":
- value type is boolean.
- defined as ( "A" and "B" ).
`,
    );
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts }]);
    expect(idx.lookupTotality("Lib", "Comp")).toEqual({ kind: "total", total: true });
  });

  it("CHAINED cross-lib: a boolean composition with its OWN qualified operand projects NON-total (Option-(a) conservative-loud, NOT a silent wrong verdict)", () => {
    // The projection runs `uniformResolvers` (both arms same-layer), so the qualified operand `"Foreign"."X"` is
    // terminal-inert → `Comp` reads non-total. A root referencing `Comp` in a boolean composition then gets a LOUD
    // `operand-not-total` (never a silent wrong emit) — the documented conservative behavior; Option-(b)'s
    // topological projection that would match emit exactly is deferred.
    const concepts = conceptsOf(
      `concept "Local Flag":
- type is Condition.
- value type is boolean.
- code is \`lf\`.
- definition is exists this.
concept "Comp":
- value type is boolean.
- defined as ( "Foreign"."X" and "Local Flag" ).
`,
    );
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts }]);
    expect(idx.lookupTotality("Lib", "Comp")).toEqual({ kind: "total", total: false });
  });

  it("preserves DISTINCT non-total causes: indeterminate / ambiguous / miss (NOT flattened to `total:false`)", () => {
    const zero: Concept = { ...BOOL_SCALAR, name: "Zero", valueTypes: [] };
    const dupA: Concept = { ...BOOL_SCALAR, name: "Dup" };
    const dupB: Concept = { ...RECORDSET, name: "Dup" };
    const idx = buildDeclaredResultIndex([{ sourceIdentity: "Lib", concepts: [zero, dupA, dupB] }]);
    expect(idx.lookupTotality("Lib", "Zero")).toEqual({ kind: "indeterminate" });
    expect(idx.lookupTotality("Lib", "Dup")).toEqual({ kind: "ambiguous" });
    expect(idx.lookupTotality("Lib", "Nope")).toEqual({ kind: "miss" });
    expect(idx.lookupTotality("Other", "R")).toEqual({ kind: "miss" });
  });
});

describe("makeTotalityFamilyResolver — #189 Slice 0c (the boolean-composition family arm)", () => {
  const foreignTotal = { ...BOOL_SCALAR, name: "X" };
  const foreignRecs = { ...RECORDSET, name: "Y" };
  const index = buildDeclaredResultIndex([
    { sourceIdentity: "Referrer", concepts: [{ ...BOOL_SCALAR, name: "Local" }] },
    { sourceIdentity: "ForeignId", concepts: [foreignTotal, foreignRecs] },
  ]);
  // The referrer's OWN same-layer map (bare refs recurse here, identical to the legacy arm).
  const localByName = new Map<string, Concept>([["Local", { ...BOOL_SCALAR, name: "Local" }]]);
  const sameLayer = sameLayerResolver((n) => localByName.get(n));
  const resolveRawLibrary: ResolveRawLibrary = (from, raw) =>
    from === "Referrer" && raw === "Foreign" ? "ForeignId" : undefined;

  it("a BARE ref recurses SAME-LAYER (returns a `concept` resolution, identical to the legacy arm)", () => {
    const resolve = makeTotalityFamilyResolver({ sameLayer, index, fromIdentity: "Referrer", resolveRawLibrary });
    expect(resolve("Local")).toEqual({ kind: "concept", concept: localByName.get("Local") });
  });

  it("a genuinely-FOREIGN qualified ref → the index totality verdict (total)", () => {
    const resolve = makeTotalityFamilyResolver({ sameLayer, index, fromIdentity: "Referrer", resolveRawLibrary });
    expect(resolve(qref("Foreign", "X"))).toEqual({ kind: "total", total: true });
  });

  it("a foreign qualified ref to a NON-total foreign concept → `{ total: false }`", () => {
    const resolve = makeTotalityFamilyResolver({ sameLayer, index, fromIdentity: "Referrer", resolveRawLibrary });
    expect(resolve(qref("Foreign", "Y"))).toEqual({ kind: "total", total: false });
  });

  it("a scope MISS with a resolver armed → `{ total: false }` (loud downstream, never a raw-token hit)", () => {
    const resolve = makeTotalityFamilyResolver({ sameLayer, index, fromIdentity: "Referrer", resolveRawLibrary });
    expect(resolve(qref("Ghost", "X"))).toEqual({ kind: "total", total: false });
  });

  it("a RENDERED-LAYER token (classified positively) → a SAME-SOURCE index lookup, NOT a foreign resolution", () => {
    // A cross-LAYER operand `"Referrer-LocalSource"."Local"` is same-SOURCE (Local is in the referrer's own
    // pre-split concepts) — classified positively BEFORE the cross-lib resolver so it does not scope-miss.
    const withLocalInIndex = buildDeclaredResultIndex([
      { sourceIdentity: "Referrer", concepts: [{ ...BOOL_SCALAR, name: "Local" }] },
    ]);
    const resolve = makeTotalityFamilyResolver({
      sameLayer,
      index: withLocalInIndex,
      fromIdentity: "Referrer",
      resolveRawLibrary,
      isRenderedLayerToken: (lib) => lib === "Referrer-LocalSource",
    });
    expect(resolve(qref("Referrer-LocalSource", "Local"))).toEqual({ kind: "total", total: true });
  });
});
