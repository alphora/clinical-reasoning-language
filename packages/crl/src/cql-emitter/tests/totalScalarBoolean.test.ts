import { buildCRL } from "../../index";
import { emitsTotalScalarBoolean, sameLayerResolver } from "../totalScalarBoolean";
import type { CRL, Concept } from "../../ast/types";

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

const resolverFor = (m: Map<string, Concept>) => sameLayerResolver((name: string) => m.get(name));

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

  it("an alias to a plain `code is` boolean (a LocalSource retrieve, NOT a reduction) is NOT total", () => {
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
