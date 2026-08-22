import { buildCRL } from "../../index";
import { emitsTotalScalarBoolean, sameLayerResolver, uniformResolvers } from "../totalScalarBoolean";
import type { Resolvers, ReferenceResolver } from "../totalScalarBoolean";
import type { CRL, Concept } from "../../ast/types";
import { getRefLibrary } from "../../ast/types";

// #189 Slice C 2b.2 — unit tests for the shared totality predicate. These pin the reduction/instance leaves, the
// same-layer bare-ref alias RECURSION (incl. chains) with its cycle guard, the alias's OWN-declaration gate
// (charter §3–§4, code review #2), cross-lib/qualified exclusion, and the non-reduction/composition negatives. The
// comparator/list LEAF arms mirror `emittedDischargeAndType`'s gates (same `matchNarrative` + `PATTERN_RETURN_SHAPE`)
// and are additionally exercised end-to-end (façade + ledger + FHIR gate) in `layeredEmit`/`ledgerEnrollment2a`/
// `closureOrchestrator`.

function parse(body: string): CRL {
  const r = buildCRL('# fixture\nlibrary "Fixture".\n\n' + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
}

function conceptsOf(crl: CRL): Map<string, Concept> {
  const m = new Map<string, Concept>();
  for (const s of crl.statements) if (s.type === "Concept" && s.name) m.set(s.name, s);
  return m;
}

// #189 Slice 0c — the predicate now takes a `{legacy, family}` resolver PAIR (per-arm family switch). A same-layer
// unit test drives both arms with the SAME same-layer resolver (`uniformResolvers`), byte-for-byte the pre-0c
// behavior; the cross-library `family` resolver is exercised in the emit-level fixtures (`booleanCompositionCrossLib`).
const resolverFor = (m: Map<string, Concept>) => uniformResolvers(sameLayerResolver((name: string) => m.get(name)));

describe("emitsTotalScalarBoolean — #189 Slice C 2b.2 shared totality predicate", () => {
  it("a Scalar-boolean `exists` reduction is total", () => {
    const m = conceptsOf(
      parse(`concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.
`),
    );
    expect(emitsTotalScalarBoolean(m.get("R"), resolverFor(m))).toBe(true);
  });

  it("a MIXED boolean-composition ↔ sem-composition cycle is non-total, not a stack overflow (#189 Slice 0b, disc 464 gpt56 #2)", () => {
    // The 0b delegation (`branchCompositionAllOperandsTotal` → `refIsTotal` → `emitsTotalScalarBoolean`) shares
    // the ONE `visiting` guard with the sem-* recursion, so a cycle that crosses the two families
    // (`C` = boolean `( "D" and "E" )`, `D` = sem `( "C" sem-or "E" )`) terminates at the guard, non-total.
    const m = conceptsOf(
      parse(`concept "R":
- type is Observation.
- shape is RecordSet.
- code is \`r\`.

concept "E":
- value type is boolean.
- defined as exists ( "R" ).

concept "C":
- value type is boolean.
- defined as ( "D" and "E" ).

concept "D":
- value type is boolean.
- defined as ( "C" sem-or "E" ).
`),
    );
    expect(emitsTotalScalarBoolean(m.get("C"), resolverFor(m))).toBe(false);
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(false);
  });

  it("a same-layer bare-ref alias to a reduction is total (one hop)", () => {
    const m = conceptsOf(
      parse(`concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "D":
- type is Observation.
- value type is boolean.
- defined as "R".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(true);
  });

  it("a chained bare-ref alias (A → B → reduction) resolves total (recursion)", () => {
    const m = conceptsOf(
      parse(`concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "B":
- type is Observation.
- value type is boolean.
- defined as "R".

concept "A":
- type is Observation.
- value type is boolean.
- defined as "B".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("A"), resolverFor(m))).toBe(true);
  });

  it("a mutually-referential alias cycle is NOT total (cycle guard, no stack overflow)", () => {
    const m = conceptsOf(
      parse(`concept "A":
- type is Observation.
- value type is boolean.
- defined as "B".

concept "B":
- type is Observation.
- value type is boolean.
- defined as "A".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("A"), resolverFor(m))).toBe(false);
  });

  it("an alias to a plain `code is` boolean (a LocalPrimitives retrieve, NOT a reduction) is NOT total", () => {
    const m = conceptsOf(
      parse(`concept "Base":
- type is Observation.
- value type is boolean.
- code is \`base-code\`.

concept "Derived":
- type is Observation.
- value type is boolean.
- defined as "Base".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("Derived"), resolverFor(m))).toBe(false);
    expect(emitsTotalScalarBoolean(m.get("Base"), resolverFor(m))).toBe(false);
  });

  it("a NON-boolean-declared alias (Quantity) to a boolean reduction is NOT total (charter §3–§4: the alias's own declaration is authoritative)", () => {
    // code review #2 (both arms) — the predicate must not manufacture a boolean for a concept that declares a
    // non-boolean value type, even if its referent emits a boolean total.
    const m = conceptsOf(
      parse(`concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "Q":
- type is Observation.
- value type is Quantity.
- defined as "R".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("Q"), resolverFor(m))).toBe(false);
  });

  it("an alias to an INSTANCE-pattern boolean (`most recent`) is NOT total (presence, nullable — value-vs-presence rides 2b.3)", () => {
    // code review #5 (Claude) — the instance-pattern referent discharges nullable (presence ≠ newest value), so an
    // alias to it must NOT flip; it stays on the truth-set path. (The residual `.satisfied()`-on-a-nullable-Boolean
    // façade cell for this class is the value-read lowering deferred to 2b.3.)
    const m = conceptsOf(
      parse(`concept "HBV":
- type is Observation.
- value type is boolean.
- code is \`hbv\`.

concept "Recent HBV":
- value type is boolean.
- definition is most recent "HBV".

concept "Alias Recent":
- type is Observation.
- value type is boolean.
- defined as "Recent HBV".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("Recent HBV"), resolverFor(m))).toBe(false);
    expect(emitsTotalScalarBoolean(m.get("Alias Recent"), resolverFor(m))).toBe(false);
  });

  it("a `defined as` COMPOSITION over a reduction is NOT total (stays loud until 2b.3)", () => {
    const m = conceptsOf(
      parse(`concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "S":
- type is Observation.
- value type is boolean.
- code is \`s\`.

concept "Combo":
- type is Observation.
- value type is boolean.
- defined as ( "R" sem-or "S" ).
`),
    );
    expect(emitsTotalScalarBoolean(m.get("Combo"), resolverFor(m))).toBe(false);
  });

  it("a QUALIFIED (cross-layer/cross-lib) bare-ref alias is NOT total (deferred to §4.5)", () => {
    const m = conceptsOf(
      parse(`concept "D":
- type is Observation.
- value type is boolean.
- defined as "Other"."R".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(false);
  });

  it("a resolver MISS (referent not visible in this layer) is NOT total (fail-safe)", () => {
    const m = conceptsOf(
      parse(`concept "D":
- type is Observation.
- value type is boolean.
- defined as "NotHere".
`),
    );
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(false);
  });

  it("undefined concept / representations-only stub is NOT total", () => {
    const m = conceptsOf(
      parse(`concept "Stub":
- type is Observation.
- value type is boolean.
- code is \`stub\`.
`),
    );
    expect(emitsTotalScalarBoolean(undefined, resolverFor(m))).toBe(false);
    expect(emitsTotalScalarBoolean(m.get("Stub"), resolverFor(m))).toBe(false);
  });
});

// #189 Slice C 2b.3b.1 — the FLIP: a boolean-declared `defined as` COMPOSITION is total iff EVERY operand is total
// (recursion), a `"recency"` both-rep twin is total, `"union"` is not, and CARDINALITY is authoritative (a
// Record/RecordSet or multi-value-type parent never flips). Pins the branches the code review (both arms) flagged as
// untested: composition recursion (sem-and/sem-or/sem-not/group/nested), recency-vs-union kinds, the isScalarBoolean
// cardinality gate, and a composition cycle.
describe("emitsTotalScalarBoolean — #189 Slice C 2b.3b.1 composition + recency flip", () => {
  const reductions = `concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "S":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`s\`.
- definition is exists this.

concept "Bare":
- type is Observation.
- value type is boolean.
- code is \`bare\`.
`;

  it("a composition over ALL-total operands (sem-or of two reductions) is total", () => {
    const m = conceptsOf(parse(`${reductions}\nconcept "D":\n- type is Observation.\n- value type is boolean.\n- defined as ( "R" sem-or "S" ).\n`));
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(true);
  });

  it("a composition with ANY non-total operand (reduction sem-or a bare `code is` boolean) is NOT total", () => {
    const m = conceptsOf(parse(`${reductions}\nconcept "D":\n- type is Observation.\n- value type is boolean.\n- defined as ( "R" sem-or "Bare" ).\n`));
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(false);
  });

  it("NESTED all-total composition ( ( R sem-and S ) sem-or R ) recurses to total; sem-not of a total is total", () => {
    const m = conceptsOf(parse(`${reductions}\nconcept "D":\n- type is Observation.\n- value type is boolean.\n- defined as ( ( "R" sem-and "S" ) sem-or "R" ).\n\nconcept "N":\n- type is Observation.\n- value type is boolean.\n- defined as ( sem-not "R" ).\n`));
    expect(emitsTotalScalarBoolean(m.get("D"), resolverFor(m))).toBe(true);
    expect(emitsTotalScalarBoolean(m.get("N"), resolverFor(m))).toBe(true);
  });

  it("a composition cycle (A composes B, B composes A) is NOT total (cycle guard, no overflow)", () => {
    const m = conceptsOf(parse(`concept "A":\n- type is Observation.\n- value type is boolean.\n- defined as ( "B" sem-or "R0" ).\n\nconcept "B":\n- type is Observation.\n- value type is boolean.\n- defined as ( "A" sem-or "R0" ).\n\nconcept "R0":\n- type is Condition.\n- value type is boolean.\n- shape is Scalar.\n- code is \`r0\`.\n- definition is exists this.\n`));
    expect(emitsTotalScalarBoolean(m.get("A"), resolverFor(m))).toBe(false);
  });

  it("CARDINALITY is authoritative: a `shape is Record` boolean composition parent does NOT flip (isScalarBoolean gate)", () => {
    // (multi-value-type is not expressible in surface CRL — a single value type per `value type is`; the
    // multi-value-type branch of the isScalarBoolean gate is exercised via the hand-built recency concept below.)
    const rec = conceptsOf(parse(`${reductions}\nconcept "DRec":\n- type is Observation.\n- value type is boolean.\n- shape is Record.\n- defined as ( "R" sem-or "S" ).\n`));
    expect(emitsTotalScalarBoolean(rec.get("DRec"), resolverFor(rec))).toBe(false);
  });

  const mkConcept = (over: Partial<Concept>): Concept =>
    ({
      type: "Concept",
      name: "X",
      valueTypes: ["boolean"],
      shape: "Scalar",
      representations: [],
      location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
      ...over,
    }) as Concept;

  it("a `\"recency\"` both-rep twin is TOTAL (Scalar boolean); a `\"union\"` twin is NOT", () => {
    const empty = resolverFor(new Map<string, Concept>());
    expect(emitsTotalScalarBoolean(mkConcept({ __bothRepMerge: "recency" }), empty)).toBe(true);
    expect(emitsTotalScalarBoolean(mkConcept({ __bothRepMerge: "union" }), empty)).toBe(false);
  });

  it("a `\"recency\"` twin with NON-scalar or NON-boolean declaration is NOT total (cardinality/coherence gate — lock-step with emitRecencyMerge's throw)", () => {
    const empty = resolverFor(new Map<string, Concept>());
    expect(emitsTotalScalarBoolean(mkConcept({ __bothRepMerge: "recency", shape: "Record" }), empty)).toBe(false);
    expect(emitsTotalScalarBoolean(mkConcept({ __bothRepMerge: "recency", valueTypes: ["boolean", "Quantity"] }), empty)).toBe(false);
    expect(emitsTotalScalarBoolean(mkConcept({ __bothRepMerge: "recency", valueTypes: ["Quantity"] }), empty)).toBe(false);
  });
});

describe("emitsTotalScalarBoolean — #189 Slice 0c per-arm family switch (banner I containment)", () => {
  // An EAGER family resolver: it would prove ANY qualified operand total. The containment claim is that ONLY the
  // boolean-composition arm consults `family` — every LEGACY arm (bare-ref alias, sem-*) keeps the inert `legacy`
  // verdict — so a legacy concept's totality is UNCHANGED by the family resolver (a top-level `Numerator` in the
  // pre-0c golden corpus is byte-invariant). These pin that directly at the seam.
  const eagerFamily = (m: Map<string, Concept>): Resolvers => {
    const legacy = sameLayerResolver((n) => m.get(n));
    const family: ReferenceResolver = (ref) =>
      getRefLibrary(ref) !== null ? { kind: "total", total: true } : legacy(ref);
    return { legacy, family };
  };

  it("a bare-ref ALIAS to a qualified ref stays NON-total under an eager family resolver (alias arm = legacy)", () => {
    const m = conceptsOf(
      parse(`concept "Alias":
- shape is Scalar.
- value type is boolean.
- defined as "Other"."X".
`),
    );
    // The eager family WOULD say `"Other"."X"` is total — but the alias arm consults `legacy` (qualified ⇒ inert),
    // so the alias is non-total, exactly as under `uniformResolvers`. This is why a scalar-boolean bare alias to a
    // foreign total boolean does NOT flip (banner I).
    expect(emitsTotalScalarBoolean(m.get("Alias"), eagerFamily(m))).toBe(false);
  });

  it("a sem-* composition over a qualified operand stays NON-total under an eager family resolver (sem-* arm = legacy)", () => {
    const m = conceptsOf(
      parse(`concept "Sem Cross":
- shape is Scalar.
- value type is boolean.
- defined as ( "Other"."X" sem-or "Local" ).
concept "Local":
- type is Condition.
- value type is boolean.
- code is \`l\`.
- definition is exists this.
`),
    );
    // Only the boolean-composition arm changed in 0c; the sem-* arm keeps the legacy resolver, so a sem-* concept
    // never gains a cross-library totality proof — the direct-foreign-sem-* leaf stays legacy (banner I).
    expect(emitsTotalScalarBoolean(m.get("Sem Cross"), eagerFamily(m))).toBe(false);
  });

  it("a boolean COMPOSITION over the SAME qualified operand DOES read the family verdict (the one arm that changed)", () => {
    const m = conceptsOf(
      parse(`concept "Local":
- type is Condition.
- value type is boolean.
- code is \`l\`.
- definition is exists this.
concept "Bool Cross":
- value type is boolean.
- defined as ( "Other"."X" and "Local" ).
`),
    );
    // Contrast: the boolean-composition arm consults `family`, so with the eager family both operands are total →
    // total. (Under `uniformResolvers` this is false — the qualified operand is inert.) This is the asymmetry that
    // makes 0c's cross-lib proof work while leaving the legacy arms byte-invariant.
    expect(emitsTotalScalarBoolean(m.get("Bool Cross"), eagerFamily(m))).toBe(true);
    expect(emitsTotalScalarBoolean(m.get("Bool Cross"), resolverFor(m))).toBe(false);
  });
});
