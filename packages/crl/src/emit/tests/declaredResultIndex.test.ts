import { buildCRL } from "../../index";
import type { CRL, Concept, ReferenceName } from "../../ast/types";
import {
  buildDeclaredResultIndex,
  makeDeclaredResultResolver,
  resultTypeOf,
  type LibraryConcepts,
  type ResolveRawLibrary,
} from "../declaredResultIndex";

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
