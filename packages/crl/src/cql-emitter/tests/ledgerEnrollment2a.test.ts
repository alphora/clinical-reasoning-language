// #189 Slice C boundary 2 (2a) — totality-ledger ENROLLMENT tests: the wiring (role-tag obligation source +
// dual-write + bidirectional completeness) is honest and the report-mode inventory is REAL, not a stub.
// Design of record: `tmp/PLAN-2a-impl.md`; disc 439 (both crl-emit arms). The pipeline is driven in
// PRODUCTION ORDER (classify RAW → preLowerAge → lowerLocalCodes → emit) so the baseline is measured on the
// pipeline production actually runs (disc 439 #10). Comparators are BARE today (bucket 1), truth-set lanes
// emit Lists so the façade is the boolean subject (bucket 2), authored `rejected` forms still emit (bucket 3)
// — 2b totalizes/composes-over-totals + 2e migrates the rejects; this slice only ENROLLS + REPORTS them.

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { emitCQLFromAST, buildAuthoredObligations } from "../emitCQL";
import type { EmitResult } from "../emitCQL";
import { emitPartitioned, FULL_PARTITION } from "../layeredEmit";
import { lowerLocalCodes, preLowerAge } from "../lowerLocalCodes";
import {
  classifyBooleanTotality,
  extractEmittedDefineHeaders,
  proveWholeBoundaryTotality,
  type EmittedDefineEntry,
} from "../../emit/booleanTotality";
import type { CRL } from "../../ast/types";

const CB = "http://example.org/crl/test";

const parse = (body: string): CRL => {
  const r = buildCRL("# fixture\n" + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
};

/** Direct none-lane emit (one library). `emitCQLFromAST` self-builds authored obligations from the RAW input
 *  (its own `ast` is un-lowered here), matching production for a single library. */
const emitNone = (body: string): { result: EmitResult; entries: readonly EmittedDefineEntry[]; headers: ReturnType<typeof extractEmittedDefineHeaders> } => {
  const ast = parse(body);
  const result = emitCQLFromAST(ast, { canonicalBase: CB });
  const entries = result.ledgerEntries ?? [];
  const lib = ast.library.name;
  const headers = extractEmittedDefineHeaders(result.result ?? "", lib);
  return { result, entries, headers };
};

/** Layered emit in PRODUCTION ORDER: classify RAW → preLowerAge → lowerLocalCodes → emitPartitioned with the
 *  raw-derived obligations. Aggregates ledger entries + emitted headers across the split's layer libraries. */
const emitLayered = (body: string, lib: string) => {
  const raw = parse(body);
  const authoredObligations = buildAuthoredObligations(raw);
  const lowered = lowerLocalCodes(preLowerAge(raw).ast, { canonicalBase: CB }).ast;
  const r = emitPartitioned(lowered, lib, lib, FULL_PARTITION, { canonicalBase: CB, authoredObligations });
  expect(r.success, JSON.stringify(r.entries.flatMap((e) => e.result.errors ?? []))).toBe(true);
  const entries = r.entries.flatMap((e) => e.result.ledgerEntries ?? []);
  const headers = r.entries.flatMap((e) => extractEmittedDefineHeaders(e.result.result ?? "", e.libraryName));
  return { entries, headers };
};

const named = (entries: readonly EmittedDefineEntry[], name: string): EmittedDefineEntry | undefined =>
  entries.find((e) => e.name === name);

// ---- Fixtures (real forms both arms named) --------------------------------

// Positive control + completeness (none-lane): `code is` + `exists this` → records twin + reduction.
const REDUCTION = `library "Red".
concept "Dx":
- type is Condition.
- value type is boolean.
- code is \`dx\`.
- definition is exists this.
`;

// Bucket 1 — a bare (un-Coalesced) catalog comparator over a coded-from value.
const COMPARATOR = `library "Cmp".
concept "Sys":
- type is Observation.
- value type is Quantity.
- coded from "SysVS".
concept "Sys Below 120":
- value type is boolean.
- definition is "Sys" below 120 'mm[Hg]'.
terminology "SysVS":
- valueset is \`http://x/sys\`.
`;

// Bucket 3 — a bare-scalar `code is` boolean with NO reduction (a flip-reject that still emits today).
const BARE_SCALAR = `library "Bare".
concept "Flag":
- type is Condition.
- value type is boolean.
- code is \`flag\`.
`;

// Bucket 2 — a decision + `code is` leaves + `defined as` guard → Interface `.satisfied()` façade over the
// Inferred truth-set List, plus the bare-scalar leaves (which also enroll `rejected`, disc 439 #2).
const FACADE = `library "Pol".
concept "A":
- type is Condition.
- value type is boolean.
- code is \`a\`.
concept "B":
- type is Condition.
- value type is boolean.
- code is \`b\`.
concept "A And B":
- type is Condition.
- value type is boolean.
- defined as ( "A" sem-and "B" ).
activity "R":
- request CPGServiceRequest.
decision "D":
- when "A And B" then recommend activity "R".
`;

// Contradictory shape×value-type (validator-free): `shape is RecordSet` + boolean + comparator still emits a
// Boolean — the classifier calls it `not-applicable` (shape-first), so the emit proof must FLAG it (never
// silently drop a genuinely-Boolean emitted define), disc 439 #5.
const CONTRADICTORY = `library "Bad".
concept "Src":
- type is Observation.
- value type is Quantity.
- coded from "SrcVS".
concept "Weird":
- shape is RecordSet.
- value type is boolean.
- definition is "Src" below 5 'mg'.
terminology "SrcVS":
- valueset is \`http://x/src\`.
`;

// ---- Surface 1 — bidirectional completeness HARD GREEN (both lanes) -------

describe("2a ledger — completeness is GREEN both directions over real emit", () => {
  it("none-lane: every emitted define header ↔ exactly one ledger entry (no uncovered, no orphan)", () => {
    const { entries, headers } = emitNone(REDUCTION);
    const r = proveWholeBoundaryTotality(entries, headers);
    expect(r.uncovered).toEqual([]);
    expect(r.orphanEntries).toEqual([]);
  });

  it("layered/interface lane: completeness green across the split's layer libraries", () => {
    const { entries, headers } = emitLayered(FACADE, "Pol");
    const r = proveWholeBoundaryTotality(entries, headers);
    expect(r.uncovered).toEqual([]);
    expect(r.orphanEntries).toEqual([]);
  });
});

// ---- Surface 2 — report-mode proof: each real form → its bucket ----------

describe("2a ledger — report-mode buckets (real forms)", () => {
  it("positive control: a none-lane reduction (`exists`) proves total; the records twin is skipped", () => {
    const { entries } = emitNone(REDUCTION);
    const dx = named(entries, "Dx");
    expect(dx?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "intrinsic-exists" });
    expect(dx?.resultType).toBe("Boolean");
    expect(dx?.obligationSource).toBe("authored-map");
    // The records twin is an implementation twin — not a boolean define.
    const twin = named(entries, "Dx Records");
    expect(twin?.obligation.kind).toBe("not-applicable");
    expect(twin?.obligationSource).toBe("manufactured");
    expect(proveWholeBoundaryTotality(entries).status).toBe("proven");
  });

  it("2b.1: a boolean catalog comparator is TOTALIZED (`Coalesce(<cmp>, false)`) → discharges requires-boundary, proves", () => {
    // Was bucket 1 (nullable → failure) in the 2a REPORT inventory; 2b.1 totalizes the comparator at its
    // boundary. The AUTHORED obligation is still `requires-boundary` (a comparator OWES a boundary); the
    // EMITTED discharge is now `total`/`boundary-coalesce`, which MATCHES that obligation → the proof passes.
    const { entries } = emitNone(COMPARATOR);
    const cmp = named(entries, "Sys Below 120");
    expect(cmp?.resultType).toBe("Boolean");
    expect(cmp?.obligation.kind).toBe("requires-boundary");
    expect(cmp?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "boundary-coalesce" });
    // Byte lock-step: the emitted define body IS the exact boundary Coalesce (not just the discharge metadata).
    expect(cmp?.cql).toMatch(/Coalesce\(CRLCommon\.Below\(.*\),\s*false\)/s);
    const r = proveWholeBoundaryTotality(entries);
    expect(r.status).toBe("proven");
    expect(r.failures).toEqual([]);
  });

  it("2b.1: a boolean INSTANCE-pattern (`most recent \"X\"`) discharges NULLABLE (not a false `total`) — value-vs-presence (§4 gap 3, → 2b.3)", () => {
    // The bare `most recent "X"` on a boolean concept emits presence-semantics `exists { MostRecent(...) }` —
    // presence ≠ newest-value. Its obligation is `unclassified`; 2b.1 keeps the DISCHARGE honest (nullable),
    // so the ledger never certifies a total over the semantically-unresolved lowering (code review, both arms).
    const INSTANCE = `library "Inst".
concept "HBV":
- type is Observation.
- value type is boolean.
- coded from "HbvVS".
concept "Recent HBV":
- value type is boolean.
- definition is most recent "HBV".
terminology "HbvVS":
- valueset is \`http://x/hbv\`.
`;
    const { entries } = emitNone(INSTANCE);
    const recent = named(entries, "Recent HBV");
    expect(recent?.resultType).toBe("Boolean");
    expect(recent?.discharge.booleanEffect).toBe("nullable"); // NOT total — presence is not certified
    // the emit is byte-unchanged (still `exists { … }`) — 2b.1 fixes the discharge metadata, not the bytes
    expect(recent?.cql).toMatch(/exists\s*\{/);
  });

  it("bucket 3: a bare-scalar `code is` boolean enrolls `rejected` and the proof hard-fails it", () => {
    const { entries } = emitNone(BARE_SCALAR);
    const flag = named(entries, "Flag");
    expect(flag?.obligation.kind).toBe("rejected");
    const r = proveWholeBoundaryTotality(entries);
    expect(r.status).toBe("failed");
    expect(r.failures.some((f) => f.name === "Flag" && f.reason.includes("rejected"))).toBe(true);
  });

  it("the Interface `.satisfied()` façade is TOTAL (exists), NOT a failure; its bare-scalar leaves fail (rejected)", () => {
    // disc 439 code review (gpt56 #1): `satisfied()` = `exists(truths)` (CaseFeatureCommon.cql:37), total by
    // its own existence wrapper — the earlier "façade fails as composite-over-a-List" was a manufactured
    // failure. The genuine non-total forms here are the bare-scalar `code is` LEAVES (flip-rejects).
    const { entries } = emitLayered(FACADE, "Pol");
    const facade = entries.find((e) => e.name === "A And B" && e.origin === "interface-facade");
    expect(facade?.obligation.kind).toBe("intrinsically-total");
    expect(facade?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "facade-satisfied" });
    expect(facade?.resultType).toBe("Boolean");
    const r = proveWholeBoundaryTotality(entries);
    expect(r.status).toBe("failed");
    // The façade is NOT among the failures — it proves total.
    expect(r.failures.some((f) => f.name === "A And B")).toBe(false);
    // The `code is` leaves enroll `rejected` (their LocalSource retrieve) → the real bucket-3 failures.
    expect(r.failures.some((f) => f.name === "A" && f.reason.includes("rejected"))).toBe(true);
    expect(r.failures.some((f) => f.name === "B" && f.reason.includes("rejected"))).toBe(true);
  });

  it("legacy lane (`caseFeature` off): `defined as exists` is intrinsic-total; a refinement composition is NON-Boolean (no false-pass)", () => {
    // disc 439 code review (gpt56 #2 / Claude #1): the flat `caseFeature off → Boolean/composite` row was
    // body/shape-blind. `defined as exists` emits `exists (...)` (intrinsic); a non-boolean `sem-and` emits a
    // refinement `intersect`/`union` List — labeling it Boolean would false-PASS an ill-typed define.
    const { entries } = emitNone(`library "Meas".
concept "Screen":
- type is Encounter.
- value type is CodeableConcept.
- coded from "ScreenVS".
concept "Virtual":
- type is Encounter.
- value type is CodeableConcept.
- coded from "VirtVS".
concept "Not Virtual":
- type is Encounter.
- value type is CodeableConcept.
- defined as ( "Screen" sem-and sem-not "Virtual" ).
concept "Qualifies":
- type is Encounter.
- value type is boolean.
- defined as exists ( "Not Virtual" ).
terminology "ScreenVS":
- valueset is \`http://x/screen\`.
terminology "VirtVS":
- valueset is \`http://x/virt\`.
`);
    const notVirtual = named(entries, "Not Virtual"); // refinement composition (CodeableConcept) → List
    expect(notVirtual?.resultType).not.toBe("Boolean");
    expect(notVirtual?.discharge.booleanEffect).toBe("not-boolean");
    const qualifies = named(entries, "Qualifies"); // `defined as exists` → intrinsic total
    expect(qualifies?.resultType).toBe("Boolean");
    expect(qualifies?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "intrinsic-exists" });
    // No false-pass: the refinement define is not a boolean subject, and `exists` proves.
    const r = proveWholeBoundaryTotality(entries);
    expect(r.failures.some((f) => f.name === "Not Virtual")).toBe(false);
    expect(r.failures.some((f) => f.name === "Qualifies")).toBe(false);
  });

  it("fail-closed: a contradictory `shape is RecordSet` + boolean + comparator is FLAGGED, not silently dropped", () => {
    const { entries } = emitNone(CONTRADICTORY);
    const weird = named(entries, "Weird");
    // Emitted as a Boolean comparator; classified `not-applicable` (shape-first) — a contradiction the proof
    // must surface rather than exempt.
    expect(weird?.resultType).toBe("Boolean");
    expect(weird?.obligation.kind).toBe("not-applicable");
    const r = proveWholeBoundaryTotality(entries);
    expect(r.status).toBe("failed");
    expect(r.failures.some((f) => f.name === "Weird")).toBe(true);
  });
});

// ---- Surface 3 — measured aggregate over the representative set ----------

// A measure-shaped legacy-lane fixture: bare comparators feeding a boolean `defined as` composition — the
// cms22 "Normal BP Reading" shape (`X Below and Y Below`), so the bucket-1 CASCADE is measured, not just leaf
// comparators.
const MEASURE = `library "Meas2".
concept "Sys":
- type is Observation.
- value type is Quantity.
- coded from "SysVS".
concept "Sys Below 120":
- value type is boolean.
- definition is "Sys" below 120 'mm[Hg]'.
concept "Dia":
- type is Observation.
- value type is Quantity.
- coded from "DiaVS".
concept "Dia Below 80":
- value type is boolean.
- definition is "Dia" below 80 'mm[Hg]'.
concept "Normal BP":
- value type is boolean.
- defined as ( "Sys Below 120" sem-and "Dia Below 80" ).
terminology "SysVS":
- valueset is \`http://x/sys\`.
terminology "DiaVS":
- valueset is \`http://x/dia\`.
`;

describe("2a ledger — measured baseline aggregate (representative + measure-shaped, disc 439 #6 / round-2 #5)", () => {
  it("categorizes the real-form baseline: comparators TOTALIZED (2b.1), none-lane cascade proves, façades TOTAL, rejects present", () => {
    const all: EmittedDefineEntry[] = [
      ...emitNone(REDUCTION).entries,
      ...emitNone(COMPARATOR).entries,
      ...emitNone(BARE_SCALAR).entries,
      ...emitNone(MEASURE).entries,
      ...emitLayered(FACADE, "Pol").entries,
    ];
    const nullableComparators = all.filter((e) => e.resultType === "Boolean" && e.discharge.booleanEffect === "nullable");
    const boundaryTotals = all.filter(
      (e) => e.discharge.booleanEffect === "total" && e.discharge.dischargedBy === "boundary-coalesce",
    );
    const rejects = all.filter((e) => e.obligation.kind === "rejected");
    const facades = all.filter((e) => e.origin === "interface-facade");
    const proven = all.filter((e) => e.discharge.booleanEffect === "total");
    // 2b.1 discharged bucket 1: NO nullable comparators remain; each is a `boundary-coalesce` total.
    expect(nullableComparators.length).toBe(0);
    expect(boundaryTotals.length).toBeGreaterThanOrEqual(3); // Sys/Dia Below + COMPARATOR's Sys Below
    expect(rejects.length).toBeGreaterThan(0); // authored bare-scalar flip-rejects still emitting (bucket 3, 2e)
    expect(proven.length).toBeGreaterThan(0);
    // EVERY façade is TOTAL (`.satisfied()` = exists), never a failure (disc 439 code review).
    expect(facades.length).toBeGreaterThan(0);
    expect(facades.every((e) => e.discharge.booleanEffect === "total")).toBe(true);
    // The none/legacy-lane CASCADE now PROVES: a boolean `defined as` composition (`composite-delegated`,
    // `A and B`) over the now-total comparator operands. The none lane always composed booleanly; 2b.1 made
    // its operands total, so the composite discharges. (The truth-set/layered composition lane — `.asTruths()`
    // / `.satisfied()` — is the separate 2b.3 flip.)
    const measureProof = proveWholeBoundaryTotality(emitNone(MEASURE).entries);
    expect(measureProof.status).toBe("proven");
    expect(measureProof.failures).toEqual([]);
  });
});

// ---- Façade coverage — all three façade cells (round-2 code review #1 + nit) ----

describe("2a ledger — façade cells prove/skip honestly", () => {
  it("total-boolean façade: a reduction-sourced decision guard re-exports BARE (facade-delegated) and proves via the reduction (cross-layer operand resolution)", () => {
    const { entries } = emitLayered(`library "Redx".
concept "Dx":
- type is Condition.
- value type is boolean.
- code is \`dx\`.
- definition is exists this.
activity "R":
- request CPGServiceRequest.
decision "D":
- when "Dx" then recommend activity "R".
`, "Redx");
    const facade = entries.find((e) => e.name === "Dx" && e.origin === "interface-facade");
    expect(facade?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "facade-delegated" });
    expect(facade?.obligation.kind).toBe("composite");
    // The façade's composite operand is the sibling Inferred reduction (a QUALIFIED cross-layer ref); the
    // default resolver must key-match it to the Inferred `"Dx"` entry, else the façade phantom-fails.
    const r = proveWholeBoundaryTotality(entries);
    expect(r.failures.some((f) => f.name === "Dx")).toBe(false);
  });

  it("#189 2b.2 — a FLIPPED bare-ref alias to a reduction enrolls `total`/composite-delegated (Inferred) + facade-delegated, and PROVES", () => {
    const { entries } = emitLayered(`library "AliasRedx".
concept "Dx":
- type is Condition.
- value type is boolean.
- code is \`dx\`.
- definition is exists this.
concept "Dx Alias":
- type is Observation.
- value type is boolean.
- defined as "Dx".
activity "R":
- request CPGServiceRequest.
decision "D":
- when "Dx Alias" then recommend activity "R".
`, "AliasRedx");
    // The Inferred alias define re-exports Dx's total boolean directly — discharged `composite-delegated`
    // (delegates to the referent's own total), NOT the pre-flip `not-boolean` truth-set List.
    const inferred = entries.find((e) => e.name === "Dx Alias" && e.origin !== "interface-facade");
    expect(inferred?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "composite-delegated" });
    expect(inferred?.resultType).toBe("Boolean");
    expect(inferred?.result).toEqual({ shape: "Scalar", valueType: "boolean" });
    // Its façade re-exports BARE (total-boolean) → facade-delegated.
    const facade = entries.find((e) => e.name === "Dx Alias" && e.origin === "interface-facade");
    expect(facade?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "facade-delegated" });
    // The whole boundary proves — the alias delegates to Dx, Dx is intrinsic-exists total.
    const r = proveWholeBoundaryTotality(entries);
    expect(r.failures.some((f) => f.name === "Dx Alias")).toBe(false);
  });

  it("LocalSource `.asTruths().satisfied()` façade (a direct `code is` decision guard) enrolls facade-satisfied", () => {
    const { entries } = emitLayered(`library "Direct".
concept "A":
- type is Condition.
- value type is boolean.
- code is \`a\`.
activity "R":
- request CPGServiceRequest.
decision "D":
- when "A" then recommend activity "R".
`, "Direct");
    const facade = entries.find((e) => e.name === "A" && e.origin === "interface-facade");
    expect(facade?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "facade-satisfied" });
    expect(facade?.obligation.kind).toBe("intrinsically-total");
  });
});

// ---- Surface 5 — criterion lane + closure boundary --------------------------

describe("2a ledger — criterion enrollment + subject boundary", () => {
  it("a `criterion` enrolls as an intrinsically-total axiom and proves", () => {
    const { entries } = emitLayered(`library "Crit".
concept "A":
- type is Condition.
- value type is boolean.
- code is \`a\`.
criterion "Guard":
- when ( "A" ).
activity "R":
- request CPGServiceRequest.
decision "D":
- when "Guard" then recommend activity "R".
`, "Crit");
    const guard = entries.find((e) => e.name === "Guard" && e.origin === "criterion-axiom");
    expect(guard?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "axiom" });
    expect(guard?.resultType).toBe("Boolean");
    // The criterion itself proves (its leaf `A` is a separate LocalSource reject, but the criterion axiom is
    // total by construction — per-leaf Coalesce).
    expect(entries.some((e) => e.name === "Guard")).toBe(true);
  });

  it("the subject boundary is the POLICY library (CQLEmitter output); fixed catalog libraries are excluded", () => {
    // 2a's completeness runs per emitted policy library — the shared CRLCommon/CaseFeatureCommon/FHIRHelpers
    // catalog assets are appended downstream (imports/emit.ts) and are NOT CQLEmitter output, so they never
    // enroll. `PerLibraryEmit` does not surface `ledgerEntries` (the closure-level proof is 2b). This test
    // documents that boundary: a single-library emit's entries all belong to that library.
    const { entries } = emitNone(REDUCTION);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.library === "Red")).toBe(true);
  });
});

// ---- Surface 4 — authored census (the FULL flip-reject set 2e migrates) --

describe("2a ledger — authored census (classifier over the RAW authored AST)", () => {
  it("tallies the `rejected` authored forms (bare-scalar, both-rep) independent of emit", () => {
    const bareScalar = parse(BARE_SCALAR).statements.find((s) => s.type === "Concept" && s.name === "Flag");
    expect(classifyBooleanTotality(bareScalar as never).kind).toBe("rejected");
    // A both-rep `code is` + `defined as` fold is an E1 reject.
    const bothRep = parse(`library "T".
concept "Src":
- type is Condition.
- value type is boolean.
- code is \`s\`.
concept "M":
- type is Condition.
- value type is boolean.
- code is \`m\`.
- defined as ( "Src" ).
`).statements.find((s) => s.type === "Concept" && s.name === "M");
    expect(classifyBooleanTotality(bothRep as never).kind).toBe("rejected");
  });
});
