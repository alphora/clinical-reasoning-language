// #189 T5 — boolean-totality classifier + emitted-define enrollment ledger + whole-boundary proof.
//
// Design of record: `docs/emit-189-boolean-totality.md` (this module IS that spec's §1–5) and
// `docs/emit-consistency-189-design.md` §3 rule 5, under the charter `docs/CRL-NORTH-STAR.md`
// (null-safety by construction — every emitted boolean define is TOTAL: it evaluates to true/false,
// never null, on any case). Emit-lane (the proof is emit/test-time; no validator consumes totality),
// mirroring T1's `emit/` → `template-match` import precedent.
//
// The proof checks a TRANSITION, not an AST label (§1):
//   1. AST phase — the OBLIGATION. `classifyBooleanTotality(concept)` records what a form OWES
//      (intrinsically-total / requires-boundary / composite / not-applicable / rejected / unclassified),
//      a claim about the §2/§7 lowering CONTRACT.
//   2. Lowering phase — the DISCHARGE. T5 emit records how the emitted CQL satisfied the obligation
//      (`{ booleanEffect: "total", dischargedBy }`), enrolled into the ledger alongside the emitted text.
//   3. Proof phase — the CHECK. `proveWholeBoundaryTotality` verifies every boolean define reaches
//      `booleanEffect: "total"` via a discharge that MATCHES its obligation AND its origin, that every
//      composite's operands are themselves proven total (no vacuous cycles), and that the ledger covers
//      every emitted boolean define header (no path emitted a define without enrolling).
//
// STEP-1 SCOPE (build order §8.1): the AST-obligation phase + the ledger types/API + the proof are built
// here and unit-tested standalone. The lowering DISCHARGE is produced by T5's reduction emit (§8.4); the
// enrollment WIRING that routes the two `define`-header sites (CQLEmitter.emitConcept, emitCriterionDefine)
// through `DefineLedger.appendDefine` lands as producers are enrolled (§8.4/§8.5). Until then this module is
// INERT (imported by nothing in prod). NOT independently committable — lands atomically at T7 (design §9).
//
// Revised per crl-emit panel disc 429 (both arms): E1 forms now classify `rejected` (the enrolled-rejected
// proof guard was decorative otherwise); age routes through `resolveAgeConcept` (not narrative coincidence);
// composite proof is a fixed-point (cycles no longer pass vacuously); the subject set is result-type-only
// (discharge metadata cannot exempt a Boolean define); the `?? "list"` catalog default fails CLOSED to
// `unclassified`; `DischargeMetadata` is a discriminated union; the completeness backstop compares ALL
// emitted define headers as a multiset (a bare `define "X":` header carries no result type).

import type {
  CompositionExpression,
  Concept,
  NarrativeClause,
  ReferenceName,
} from "../ast/types";
import { refDisplay } from "../ast/types";
import { branchConditionConceptRefsStrict } from "../ast/branchCondition";
import { matchNarrative } from "../template-match/matcher";
import { resolveAgeConcept } from "../template-match/recencyProjectionOverride";
import {
  resolveRecencyValueConcept,
  isMemberExistenceInterface,
} from "../template-match/recencyValueConcept";
import {
  PATTERN_RETURN_SHAPE,
  type PatternReturnShape,
} from "../cql-emitter/patternReturnShape";

// ===========================================================================
// §1–2. The obligation — what a boolean form OWES (a claim about the lowering contract)
// ===========================================================================

/**
 * A structured discriminant on the `rejected` arm (§4 reject seam). The T5 reject seam fires ONLY on the
 * MIGRATION cells — the bare-scalar `code is` (`bare-scalar`) and the three E1 both-rep forms (`e1-*`) — and
 * carries a #257/migration prompt. The remaining codes tag `rejected` verdicts that are ALREADY caught by
 * other validation (malformed value-type/age, non-boolean exists/count/composition, trivial threshold,
 * boolean-with-no-definition); the seam must NOT sweep them, so they get their own codes rather than sharing
 * a migration cell. A free-text `reason` still accompanies every code.
 */
export type BooleanRejectCode =
  // ── The four T5 reject-seam cells (fire the emit-boundary reject + migration prompt) ──
  | "bare-scalar" // bare Scalar `code is`, no reduction/shape — the `no-bare-scalar-code` flip form (retiring 2e)
  | "e1-defined-as" // `code is` + `defined as` (both-rep fold) — #257
  | "e1-coded-from" // `code is` + `coded from` (local + external source) — #257
  | "e1-source-rep" // `code is` + `source representation` (local + source multi-rep) — #257
  // ── Pre-existing invalid forms (NOT swept by the seam; caught by other validation) ──
  | "malformed-age" // malformed patient-age concept
  | "malformed-value-type" // 0 or >1 value types in boolean position
  | "non-boolean-exists" // `exists` produces boolean but concept declares a non-boolean value type
  | "count-threshold-trivial" // `count … at least 0` — always true (emit-count-threshold-trivial)
  | "non-boolean-count" // `count` produces boolean but concept declares a non-boolean value type
  | "non-boolean-composition" // `defined as` boolean composition but concept is not Scalar boolean
  | "boolean-no-definition"; // boolean Scalar with no definition/reduction — nothing to make total

/**
 * The totality obligation a concept's boolean form owes, per `docs/emit-189-boolean-totality.md` §2.
 * `rejected` (invalid-in-boolean-position) and `unclassified` (a boolean form the emitter may emit but the
 * classifier cannot yet certify) are DISTINCT (§2): the proof enumerates-and-reports `unclassified` (the
 * result is INCOMPLETE, not proven) whereas an enrolled `rejected` is a hard FAILURE (it must never reach
 * emit at all).
 */
export type BooleanTotalityObligation =
  // `exists`/`count`/`defined as exists`/catalog list pattern — total by construction (existence, or a bare
  // `Count(...) >= N`), no boundary needed. `form`/`cell` cite the §2 row for the proof/report.
  | { kind: "intrinsically-total"; form: string; cell: string }
  // `most recent this` boolean read, catalog boolean comparator (High/Low/AtLeast/…), patient age — a
  // nullable inner expression that the lowering MUST wrap (`Coalesce(<predicate>, false)`, §2 rule 2; or the
  // §5/§7 age-recency total rewrite).
  | { kind: "requires-boundary"; form: string; cell: string }
  // `defined as` composition / bare ref over a boolean parent — total iff EVERY resolved operand is total
  // (§2 rule 3, discharged architecturally at each operand's own boundary). Carries operands ONLY.
  | { kind: "composite"; operands: ReferenceName[]; cell: string }
  // Record / RecordSet / non-boolean scalar — produces no boolean define. `nullable` distinguishes a
  // nullable non-boolean scalar read (a later comparison must Coalesce the PREDICATE, not this value) from
  // a set/record result. Reading not-applicable as "consume anywhere" is the `Coalesce(X,0)` trap (§2).
  | { kind: "not-applicable"; nullable: boolean; reason: string }
  // Malformed in boolean position (0 or >1 value types; bare Scalar `code is`; a non-boolean `exists`/`count`)
  // OR an E1-deferred form the flip rejects with a #257 migration prompt (§4.7 both-rep fold; local+source
  // multi-rep). A flip validation/emit error; MUST NOT reach the ledger. `staging` (2b.4a) FORM-KEYS the ONE
  // still-live reject the scoped gate reports-not-fails (the pre-flip bare-scalar `code is`, retiring 2e); an
  // E1 #257 reject leaves it UNSET so the gate blocks it (the kind alone must not exempt — disc 454 gpt56 #1).
  | { kind: "rejected"; code: BooleanRejectCode; reason: string; staging?: StagingExclusion }
  // A boolean form the emitter may emit but the classifier cannot yet certify (unknown narrative; an
  // instance-shape catalog read whose value-vs-presence lowering is decided at T5, §4 gap 3; a known catalog
  // pattern absent from the return-shape table). ENUMERATED by the proof; renders the result INCOMPLETE (§2).
  | { kind: "unclassified"; reason: string };

/** True iff the concept declares exactly one value type and it is `boolean`. */
function isBooleanScalar(concept: Concept): boolean {
  return concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean";
}

/** Flatten a composition tree to its operand references (§2: operands ONLY, no `negated` flag; qualified
 *  refs preserved; `CompositionGroup` transparent). */
function collectCompositionRefs(expr: CompositionExpression, out: ReferenceName[]): void {
  switch (expr.type) {
    case "SemOrExpression":
    case "SemAndExpression":
      for (const t of expr.terms) collectCompositionRefs(t, out);
      return;
    case "SemNotExpression":
      collectCompositionRefs(expr.expression, out);
      return;
    case "CompositionGroup":
      collectCompositionRefs(expr.expression, out);
      return;
    case "CompositionRef":
      out.push(expr.ref);
      return;
  }
}

/** Classify a `definition is <narrative>` catalog-pattern concept by the matched pattern's return shape.
 *  Concept-aware (disc 429 C3): an instance-shape read (MostRecent/Last/…) on a BOOLEAN concept is the §4
 *  gap-3 value-vs-presence cell — the current catalog lowering emits `exists { <call> }` (PRESENCE), but a
 *  boolean concept means "the newest value is true"; certifying that intrinsically-total would ship
 *  presence-semantics as proven, so it is `unclassified` pending T5's §2 value-read decision. Fails CLOSED
 *  to `unclassified` for a known pattern absent from `PATTERN_RETURN_SHAPE` (disc 429 #10) rather than
 *  mirroring the emitter's `?? "list"` guess — a boolean-shape pattern missing from the table would
 *  otherwise be `exists`-wrapped AND certified total (a semantic inversion). */
function classifyCatalogPattern(concept: Concept, body: NarrativeClause): BooleanTotalityObligation {
  const call = matchNarrative(body);
  if (!call.known) {
    return {
      kind: "unclassified",
      reason: `\`definition is\` narrative matched no catalog pattern (soft-compile "${call.pattern}") — cannot certify totality`,
    };
  }
  const shape: PatternReturnShape | undefined = PATTERN_RETURN_SHAPE[call.pattern];
  if (shape === undefined) {
    return {
      kind: "unclassified",
      reason: `catalog pattern \`${call.pattern}\` has no PATTERN_RETURN_SHAPE entry — cannot certify totality (fail-closed, disc 429 #10)`,
    };
  }
  const boolean = isBooleanScalar(concept);
  switch (shape) {
    case "list":
      // List patterns (Has/WasPerformed/…) realize a boolean consumer as `exists <call>` — total presence.
      return {
        kind: "intrinsically-total",
        form: `catalog pattern \`${call.pattern}\` (list)`,
        cell: "§2 catalog pattern, list → exists <call>",
      };
    case "instance":
      // Instance patterns (MostRecent/Last/First/…) select a singleton. For a boolean concept this is the
      // value-read boundary case (§4 gap 3) — do NOT certify the presence-semantics `exists {…}` as total.
      if (boolean) {
        return {
          kind: "unclassified",
          reason: `instance-shape catalog read \`${call.pattern}\` on a boolean concept is the §4 gap-3 value-vs-presence cell — T5 decides its lowering (do not certify presence as total)`,
        };
      }
      // On a non-boolean concept an instance read produces no boolean define.
      return { kind: "not-applicable", nullable: true, reason: `instance-shape catalog read \`${call.pattern}\` on a non-boolean concept` };
    case "boolean":
      // Inherently-boolean comparators (High/Low/AtLeast/Between/…) lower to a NULLABLE CQL comparison — the
      // lowering owes `Coalesce(<predicate>, false)` (never `Coalesce(operand, 0) >= N`, §2 rule 2).
      return {
        kind: "requires-boundary",
        form: `catalog comparator \`${call.pattern}\``,
        cell: "§2 catalog pattern, inherently-boolean → Coalesce(<predicate>, false)",
      };
    case "other":
      // Period/Quantity/Interval-returning patterns are not boolean — no boolean define is produced here.
      return {
        kind: "not-applicable",
        nullable: true,
        reason: `catalog pattern \`${call.pattern}\` returns a non-boolean value (other)`,
      };
  }
}

/**
 * Classify a concept's boolean-totality obligation from its AST (§1–2). PURE over the AUTHORED concept
 * (pre-lowering): the emit DISCHARGE (which overload was selected, whether the Coalesce was emitted) is
 * recorded separately by T5 and checked against this obligation by `proveWholeBoundaryTotality`.
 *
 * Dispatch order matters (disc 429): value type / shape is keyed FIRST, then age (the code+posrep exception),
 * then the E1 rejects (the code+source deferrals #257), then the definition form.
 */
export function classifyBooleanTotality(
  concept: Concept,
  // #189 Piece 1 (disc 506) — OPTIONAL: reports whether a `defined as exists ("V")` referent name V is a both-rep
  // RECENCY-VALUE concept (only `buildAuthoredObligations` supplies it — it has the whole library; per-concept
  // callers leave it undefined and keep the deferred E1 reject). Needed because the member-existence fold's
  // totality depends on the REFERENT, which this per-concept classifier cannot otherwise resolve.
  memberExistenceReferent?: (referentName: string) => boolean,
): BooleanTotalityObligation {
  // Shape decides FIRST (§2): a record/record-set publishes records — no boolean define, whatever the
  // definition form (a reduction on a RecordSet is incoherent and T1 rejects it on its own axis).
  if (concept.shape === "RecordSet") {
    return { kind: "not-applicable", nullable: false, reason: "`shape is RecordSet` publishes its record set (no boolean define)" };
  }
  if (concept.shape === "Record") {
    return { kind: "not-applicable", nullable: false, reason: "`shape is Record` selects one record (no boolean read)" };
  }

  // Scalar. AGE is the code+posrep exception (charter §3) — route through the shared authority, NOT a
  // narrative coincidence (disc 429 C2). It is inherently a requires-boundary boolean (the §5/§7 recency
  // rewrite is its discharge), and it is EXEMPT from the E1 code+source reject below.
  const age = resolveAgeConcept(concept);
  if (age.kind === "error") {
    return { kind: "rejected", code: "malformed-age", reason: `malformed patient-age concept: ${age.errorKind}: ${age.message}` };
  }
  if (age.kind === "recency" || age.kind === "standalone") {
    return {
      kind: "requires-boundary",
      form: `patient age (${age.kind})`,
      cell: "§2/§5 patient-age recency → total-boolean rewrite",
    };
  }

  // #189 Piece 1 (disc 506) — the both-rep RECENCY-VALUE merge (`code is` + `most recent this` + a `coded from`
  // `source representation`, e.g. `Covered Device`) is EXEMPT from the E1 `e1-source-rep` reject below: it now
  // EMITS (a `Scalar<value-type>`-or-null recency merge), and it is NON-boolean, so it is `not-applicable{nullable}`
  // in the boolean subject (the interface reads member-EXISTENCE over its records, not this value). Shape-exact via
  // the SHARED resolver (the concept's OWN shape — no referent resolution), so this narrowing cannot widen the
  // reject. A boolean recency-value shape cannot occur (the resolver requires a non-boolean value type).
  if (resolveRecencyValueConcept(concept).kind === "recency-value") {
    return {
      kind: "not-applicable",
      nullable: true,
      reason: "`code is` + `most recent this` + `coded from` source rep is a non-boolean recency-value merge (the interface reads member-existence, not this value)",
    };
  }

  // E1 rejects (disc 429 C1) — a local `code is` PLUS a source arm (`defined as` both-rep fold; `coded from`;
  // or `source representation` posreps) is DEFERRED to #257 and rejected at the flip with a migration prompt
  // (§4.7). Without these cells the classifier could never produce `rejected` for an E1 form, leaving the
  // proof's enrolled-rejected guard decorative. Age was already exempted above.
  const hasCode = concept.code !== undefined;
  if (hasCode) {
    if (concept.definition?.type === "DefinedAsDefinition") {
      // #189 Piece 1 (disc 506/507) — a `defined as exists ("V")` over a both-rep RECENCY-VALUE referent V is the
      // ACTIVE value/interface MEMBER-EXISTENCE fold (a total boolean: `<own newest> or exists(LP."V") or
      // exists(EP."V Source")`, `emitMemberExistenceFold`). Gated by the SHARED shape-exact predicate (disc 507 A/B —
      // unqualified ref + recency-value referent + own arm a Scalar<boolean> Observation), so the obligation activates
      // on EXACTLY the shapes emit activates on (no obligation↔emit drift). Existence is intrinsically total →
      // `intrinsically-total`, reconciling with the emitted `member-existence-fold` discharge. Every other `code is` +
      // `defined as` (non-recency-value referent, composition, bare ref) stays the deferred E1 reject.
      if (
        memberExistenceReferent !== undefined &&
        isMemberExistenceInterface(concept, memberExistenceReferent)
      ) {
        const body = concept.definition.body;
        const refStr = body.type === "DefinedAsExists" ? refDisplay(body.ref) : "?";
        return {
          kind: "intrinsically-total",
          form: `defined as exists (${refStr}) [value/interface member-existence fold]`,
          cell: "§2 value/interface member-existence fold → own-newest or exists(LP) or exists(EP)",
        };
      }
      return { kind: "rejected", code: "e1-defined-as", reason: "`code is` + `defined as` (both-rep fold) is deferred to #257 — rejected at the flip (§4.7)" };
    }
    if (concept.definition?.type === "CodedFromDefinition") {
      return { kind: "rejected", code: "e1-coded-from", reason: "`code is` + `coded from` (local + external source) is deferred to #257 — rejected at the flip (§4.7)" };
    }
    if (concept.representations.length > 0) {
      return { kind: "rejected", code: "e1-source-rep", reason: "`code is` + `source representation` (local + source multi-rep) is deferred to #257 — rejected at the flip (§4.7)" };
    }
  }

  // A malformed value-type count is invalid in boolean position (§2 `rejected`).
  if (concept.valueTypes.length !== 1) {
    return {
      kind: "rejected",
      code: "malformed-value-type",
      reason: `Scalar concept declares ${concept.valueTypes.length} value types (needs exactly 1) — invalid in boolean position`,
    };
  }
  const boolean = isBooleanScalar(concept);
  const def = concept.definition;

  // A reduction over the concept's own / a named record set (§2 reduction rows).
  if (def?.type === "ReductionDefinition") {
    const r = def.reduction;
    switch (r.kind) {
      case "exists":
        // Existence over ANY set is null-total by CQL semantics (`exists(x)` is never null), regardless of
        // the target — disc 429 resolved the inter-arm split in favor of certifying intrinsic here (target
        // shape validity is the §4.5 lowering reject's axis, not the totality proof's). But a NON-boolean
        // declared value type contradicts `exists`'s boolean product (§2 validation error) — reject it
        // rather than certify (value type keyed first, disc 429 #3).
        return boolean
          ? {
              kind: "intrinsically-total",
              form: `exists ${r.target.type === "ThisRecords" ? "this" : refDisplay(r.target.ref)}`,
              cell: "§2 `exists this`/`exists \"X\"` → exists([R:X])",
            }
          : { kind: "rejected", code: "non-boolean-exists", reason: `\`exists\` produces a boolean, but the concept declares value type \`${concept.valueTypes.join("/") || "(none)"}\`` };
      case "count":
        if (r.atLeast <= 0) {
          return { kind: "rejected", code: "count-threshold-trivial", reason: "`count … at least 0` is always true — author error (§2)" };
        }
        return boolean
          ? {
              kind: "intrinsically-total",
              form: `count … at least ${r.atLeast}`,
              // ⚠ discharge `count-bare` is gated on the `Count(…) >= N` empty/null runtime pin (doc §4;
              // plan §3 discharge list) — do NOT trim that gate in step 8 (disc 429 C12).
              cell: "§2 `count this … at least N` → Count(…) >= N (bare; runtime-pin gated)",
            }
          : { kind: "rejected", code: "non-boolean-count", reason: `\`count\` produces a boolean, but the concept declares value type \`${concept.valueTypes.join("/") || "(none)"}\`` };
      case "mostRecent":
        // `most recent "X"` (named) is NOT normalized into a ReductionDefinition (builder keeps it a
        // `DefinitionIsDefinition`, ast/types.ts:844) — so a named target here is unreachable in practice;
        // surface it rather than default (disc 429 C3 notes this branch is defensive).
        if (r.target.type !== "ThisRecords") {
          return {
            kind: "unclassified",
            reason: `\`most recent ${refDisplay(r.target.ref)}\` needs the cross-lib target-metadata index to resolve its value type (§4.5)`,
          };
        }
        // `most recent this` on a Scalar boolean value carrier → nullable value read; the lowering owes
        // `Coalesce(<value read of newest>, false)` (§2). Non-boolean scalar → nullable, not-applicable
        // (a later comparison totalizes the predicate, not this value).
        return boolean
          ? {
              kind: "requires-boundary",
              form: "most recent this (boolean value read)",
              cell: "§2 `most recent this`, Scalar boolean → Coalesce(<value read>, false)",
            }
          : {
              kind: "not-applicable",
              nullable: true,
              reason: "`most recent this` on a non-boolean scalar is a nullable value read (comparison totalizes the predicate)",
            };
    }
  }

  // `defined as` — composition / bare ref / existence bridge (§2 composite + existence rows). A code+defined-as
  // both-rep fold was already rejected above; this is the pure-derived path.
  if (def?.type === "DefinedAsDefinition") {
    const b = def.body;
    if (b.type === "DefinedAsExists") {
      return {
        kind: "intrinsically-total",
        form: `defined as exists (${refDisplay(b.ref)})`,
        cell: "§2 `defined as exists (\"X\")` → existence bridge",
      };
    }
    if (b.type === "DefinedAsBareRef") {
      // A bare-ref alias is total iff its referent is total (delegated, §2 composite).
      return { kind: "composite", operands: [b.ref], cell: "§2 `defined as` bare ref (delegated to referent)" };
    }
    if (b.type === "DefinedAsBooleanComposition") {
      // #189 Slice 0b (banner G) — a boolean composition classifies `composite` (total iff every operand is a
      // total boolean) ONLY when the PARENT is a scalar boolean. A NON-Scalar parent (`shape is Record`/
      // `RecordSet`) already short-circuited to `not-applicable` at the shape gate above; this guard catches the
      // REMAINING case — a `Scalar` parent whose value type is NOT boolean (e.g. `Scalar<Quantity>`) — which
      // `emitCQLFromAST` (validator-free) could otherwise classify total. Mirrors the `exists`/`count` reduction
      // arms (reject a boolean produced under a non-boolean declaration). The emit pivot (`emitBooleanComposition`)
      // independently rejects BOTH non-scalar and non-boolean parents LOUD, so no incoherent CQL ships regardless;
      // this only keeps the obligation classifier from certifying a non-boolean-valued form as total.
      if (!boolean) {
        return {
          kind: "rejected",
          code: "non-boolean-composition",
          reason:
            "`defined as` boolean composition produces one scalar boolean, but the concept is not a " +
            `\`Scalar\` \`boolean\` (shape \`${concept.shape ?? "(none)"}\`, value type \`${concept.valueTypes?.join("/") || "(none)"}\`)`,
        };
      }
      // Total iff every operand is a total boolean (delegate, §2 composite). Collect operand refs from the
      // BranchCondition tree — the SAME strict collector the emit-side family predicate uses (Slice 0b).
      const boolOperands: ReferenceName[] = [];
      for (const r of branchConditionConceptRefsStrict(b.expression, "booleanTotality"))
        boolOperands.push(r.ref);
      return {
        kind: "composite",
        operands: boolOperands,
        cell: "§2 `defined as` boolean composition (every operand total)",
      };
    }
    // DefinedAsComposition — sem-or/sem-and/sem-not over refs; total iff every resolved operand is total.
    const operands: ReferenceName[] = [];
    collectCompositionRefs(b.expression, operands);
    return { kind: "composite", operands, cell: "§2 `defined as` composition (every operand total)" };
  }

  // `definition is <narrative>` — a catalog-matchable predicate (concept-aware, disc 429 C3).
  if (def?.type === "DefinitionIsDefinition") {
    return classifyCatalogPattern(concept, def.body);
  }

  // A pure hand-authored `coded from` (no local code) — an external source arm, deferred at the flip
  // (design §10); no LOCAL boolean define in v1. (code + coded-from was rejected above as an E1 form.)
  if (def?.type === "CodedFromDefinition") {
    return { kind: "not-applicable", nullable: false, reason: "`coded from` is an external source arm (deferred, design §10)" };
  }

  // No definition. A boolean Scalar with nothing to reduce is malformed in boolean position (a bare Scalar
  // `code is` — §2 "no bare scalar code is"); a source-only concept (no code) is a deferred external arm.
  if (hasCode) {
    return {
      kind: "rejected",
      code: "bare-scalar",
      reason: "bare Scalar `code is` with no reduction — invalid in boolean position (§2)",
      // 2b.4a — the pre-flip `no-bare-scalar-code` form; the scoped gate REPORTS it (does not fail) until 2e
      // flips it. Form-keyed here so an E1 #257 reject (which leaves `staging` unset) still blocks.
      staging: { code: "legacy-bare-scalar", retiresAt: "2e (bare-scalar reduction retirement)" },
    };
  }
  if (concept.representations.length > 0) {
    return { kind: "not-applicable", nullable: false, reason: "source-only concept (no local `code is`) — deferred external arm (design §10)" };
  }
  return boolean
    ? { kind: "rejected", code: "boolean-no-definition", reason: "boolean Scalar with no definition/reduction — nothing to make total" }
    : { kind: "not-applicable", nullable: false, reason: "non-boolean Scalar with no reduction (no boolean define)" };
}

// ===========================================================================
// §3. The enrollment ledger — completeness-enforced record of every emitted define
// ===========================================================================

/** The provenance of an emitted define, used by the proof's origin-matching + coverage model (§3). The enum
 *  is closed so "compare the ledger against ALL emitted define headers" has a bounded origin space. */
export type DefineOrigin =
  | "authored" // an authored concept's define (classified by `classifyBooleanTotality`)
  | "interface-facade" // `define "X": Inferences."X"` — total iff the aliased define is total
  | "age-helper" // an age-recency synthesized define/helper — §5/§7 total-boolean boundary is the discharge
  | "criterion-axiom" // a #236 criterion define — per-operand-totalized by construction (axiom)
  | "catalog-axiom"; // CRLCommon/CaseFeatureCommon/FHIRHelpers library define (total by construction)

/** The mechanism by which the emitted CQL made a boolean define total (§1 step 2). */
export type DischargeKind =
  | "intrinsic-exists" // `exists(...)` / `exists <call>` — discharges intrinsically-total
  | "null-presence" // `(<X> is not null)` — #189 B3: existence of a SCALAR-VALUE operand; total by construction
  //                    (`is not null` is never null); discharges intrinsically-total. NOT `exists(<scalar>)`
  //                    (ill-typed — disc 496). NOTE (disc 507): the value/interface boolean interface is NOT this —
  //                    it is the MEMBER-EXISTENCE fold (`member-existence-fold` discharge, design v7); a no-`code is`
  //                    `defined as exists` over a recency-value referent is refused loud in `emitExistsBridge`, so
  //                    null-presence stays INERT (no corpus operand is scalar-value on this lane).
  | "count-bare" // `Count(...) >= N` — discharges intrinsically-total (count)
  | "boundary-coalesce" // `Coalesce(<predicate>, false)` — discharges requires-boundary
  | "age-recency-total" // the §5/§7 age-recency total-boolean rewrite — discharges requires-boundary (age)
  | "composite-delegated" // boolean `or`/`and`/`not` over total operands — discharges composite
  | "facade-delegated" // bare `Inferences."X"` re-export — total IFF X is (delegated); discharges composite
  | "facade-satisfied" // `…satisfied()` = `exists(truths)` (CaseFeatureCommon) — total by its OWN existence
  //                       wrapper, INDEPENDENT of the truth-set operand's totality; discharges intrinsically-total
  | "member-existence-fold" // #189 Piece 1 (disc 506): the value/interface three-leg fold — `<own newest value>
  //                            is true or exists(LP."V") or exists(EP."V Source")`. Total by construction (each leg
  //                            is `is true`/`exists`, never null → the OR is never null); discharges
  //                            intrinsically-total. A DEDICATED kind (not `intrinsic-exists`, which is a single
  //                            `exists(...)` the text-check keys on) so the compound OR is not mis-checked (Claude #8).
  | "axiom"; // criterion / catalog define, total by construction

/** How the emitted CQL discharged its obligation. A DISCRIMINATED UNION (disc 429 #12): only a `total`
 *  define carries a `dischargedBy` mechanism, so impossible states (`not-boolean` + `boundary-coalesce`) are
 *  unrepresentable. A `nullable` non-boolean read and a `not-boolean` set/record result enroll honestly
 *  without inventing a boolean mechanism. */
export type DischargeMetadata =
  | { booleanEffect: "total"; dischargedBy: DischargeKind }
  | { booleanEffect: "nullable"; reason: string }
  | { booleanEffect: "not-boolean" };

/** #189 Slice C 2b.0 — the discriminated result of an emitted define, for the §4.5 metadata index. This is the
 *  EMITTED define's result (derived at enrollment from the LOWERED concept + role), NOT the authored `shape` —
 *  a lowered impl twin retains authored `shape:"Scalar"` boolean but emits a record retrieve. The `opaque` arm
 *  holds every form the concrete arms cannot HONESTLY describe: the pre-flip truth-set `List<Boolean>`, a
 *  legacy refinement composition (element resource type is operand-derived / possibly cross-lib → not locally
 *  known), an omitted-`type is` derived record (`c.conceptType` undefined) — the emitter never fabricates a
 *  resource type it did not declare (charter §3–§4). The opaque arm RETIRES at the 2b.3/2b.4 flip when
 *  truth-sets die; `form` reuses the `non-Boolean(<form>)` token so it round-trips with `resultType`. */
export type DefineResult =
  | { shape: "Scalar"; valueType: string }
  | { shape: "Record"; resourceType: string }
  | { shape: "RecordSet"; resourceType: string }
  | { shape: "opaque"; form: string };

/** #189 Slice C 2b.0 — the routing visibility of an emitted define. Public-reference routing must distinguish
 *  the PUBLIC determination other CRL references denote (the Inferences determination wins over its
 *  LocalPrimitives/Records implementation twin, per `buildNameLayerMaps`) from its `impl` twin (never a routing
 *  target) and its Interface `facade`. Derived from `Concept.__loweringRole` at enrollment; an untagged
 *  authored concept and a criterion define are `public`, and a façade is `facade` ONLY under the same
 *  `caseFeature.kind === "interface"` gate `enrollConcept` uses for façade treatment (else it emitted a legacy
 *  body as an ordinary authored concept → `public`). */
export type DefineVisibility = "public" | "impl" | "facade";

/** One enrolled emitted define. `resultType` is the discriminated CQL result-type token (e.g. `"Boolean"`,
 *  `"List<Condition>"`) determined at emit — the proof's boolean SUBJECT SET is `resultType === "Boolean"`
 *  ALONE (discharge metadata is evidence about a subject, never authority to remove it, disc 429 #1). The
 *  emitted `cql` body is stored ON the entry (disc 429 C8) so the classifier↔lowering agreement test can
 *  check the discharge against the actual text without reconstructing the pairing. `library` + `name` are
 *  the emitted identity — the ledger keys by BOTH (a bare name conflates the LocalPrimitives RecordSet twin and
 *  the Inferences Scalar twin, §4.5). */
export type EmittedDefineEntry = {
  library: string;
  name: string;
  resultType: string;
  obligation: BooleanTotalityObligation;
  discharge: DischargeMetadata;
  origin: DefineOrigin;
  cql: string;
  /** #189 Slice C 2a (round 2, disc 439 code review) — provenance of the OBLIGATION. `"manufactured"` =
   *  role-derived (impl twin / façade, never from the authored map); `"authored-map"` = looked up in
   *  `EmitOptions.authoredObligations`; `"in-place"` = the last-resort `classifyBooleanTotality` on the
   *  in-hand form when no map entry existed — UNSOUND as a production obligation source (a lowered form loses
   *  `rejected`/E1). 2b's HARD gate must refuse to certify over `"in-place"`.
   *
   *  ⚠ SCOPE (round-2 #3, both arms): `"authored-map"` records only that the obligation came FROM the map —
   *  it does NOT prove the map was built from a RAW (pre-lowering) AST. `EmitOptions.authoredObligations` is
   *  an arbitrary `ReadonlyMap`, so a caller that built it from LOWERED forms gets the same `"authored-map"`
   *  tag; the ledger carries no evidence to distinguish that. In-repo callers are honest (production builds it
   *  at the raw seam — `imports/emit.ts` before `preLowerAge`, and `emitCQLFromAST` from its raw input), so
   *  this is a hardening gap, not a live bug. **2b's gate must own raw-map construction** (or take a branded
   *  raw-only map type) rather than trusting `"authored-map"` for the raw claim — `obligationSource` alone is
   *  insufficient for it. Optional so hand-constructed test entries stay valid. */
  obligationSource?: "manufactured" | "authored-map" | "in-place";
  /** #189 Slice C 2b.0 — the EMITTED define's discriminated result + its routing visibility, captured at
   *  enrollment for the §4.5 `CloseIndex` (metadata) and public-reference routing map. Optional so 2a's entries
   *  and hand-constructed test entries stay valid; `enrollConcept`/`enrollCriterion` always populate them. */
  result?: DefineResult;
  visibility?: DefineVisibility;
  /** #189 Slice C 2b.4a — a FORM-KEYED staging exemption from the HARD boundary-totality gate. Present ONLY on
   *  a still-live emit form the flip has not yet reached, SET at the exact producing branch lock-step with the
   *  non-total emit (disc 454, both arms — NOT keyed on `obligation.kind`/`discharge` signature, which
   *  over-excludes; NOT define-name pinning, which puts fixture content in production code and silently decides
   *  the family's reject-with-migration for future authors). The gate REPORTS (does not fail) an entry carrying
   *  one; each `code` has a `retiresAt` slice at which its producing branch is retired and the exemption asserted
   *  VACUOUS. A T7-blocking condition is that NO entry carries one at commit (§6). */
  stagingExclusion?: StagingExclusion;
};

/** #189 Slice C 2b.4a — a FORM-KEYED still-live non-total boolean form the scoped gate REPORTS rather than fails,
 *  pending a named death point (disc 454 §4/§6). Form-keyed so it dies naturally at retirement and can be asserted
 *  vacuous at its `retiresAt`. **Empirically (probe over every imports fixture, 2026-08-16) the ONLY family on the
 *  GATED closure path (`emitCQLImports`) is `legacy-bare-scalar`** — the refinement-boolean-comparator (cms69) and
 *  the instance-pattern forms live on the UNGATED single-library `emitPartitioned` golden path (§5), so they never
 *  reach the gate and need no marker here; their correctness is resolved by the reject-migration LANGUAGE guard
 *  (fires on BOTH paths) + the cms69 re-author (their death-step), not a gate exemption. */
export type StagingExclusion = {
  /** `legacy-bare-scalar` = a bare Scalar `code is` with no reduction — invalid in boolean position
   *  (`booleanTotality.ts` classifier); the pre-flip `no-bare-scalar-code` form. Retires at 2e. A composite that
   *  fails ONLY because it delegates (transitively) to such a leaf is excused by the gate's proven-through-
   *  excluded pass (disc 454 gpt56 #2 — probe-confirmed: `layered-name-collision`/`partial-concepts-name-collision`),
   *  not by a marker of its own. */
  code: "legacy-bare-scalar";
  retiresAt: string;
};

/** A header of an emitted define, for the ledger-vs-emitted completeness cross-check (§3). Carries ONLY
 *  `{library, name}` — an emitted `define "X":` header has NO result type in its syntax (disc 429 #2/C5), so
 *  completeness is an IDENTITY multiset check over ALL emitted defines; the boolean filtering happens on the
 *  ledger entries (which carry `resultType` from enrollment), never on headers. */
export type EmittedDefineHeader = { library: string; name: string };

// ESCAPE-AWARE (disc 439 #8): the quoted arm allows escaped chars (`(?:[^"\\]|\\.)*`) so a delimited
// identifier containing a `\"` or `\\` (as `cqlQuotedIdentifier` renders it) is captured WHOLE, not
// truncated at the first escaped quote. The bare arm is a plain CQL simple identifier.
const DEFINE_HEADER_RE = /^\s*define\s+(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*))\s*:/;

/** UNESCAPE a captured delimited-identifier body back to its raw name — the exact reverse of
 *  `cqlQuotedIdentifier` (which escapes `\`→`\\` then `"`→`\"`). `\X` → `X` reverses both (the quoter emits
 *  only `\\` and `\"`), so `entry.name` round-trips and `appendDefine`'s guard no longer false-throws. */
function unescapeDelimitedIdentifier(body: string): string {
  return body.replace(/\\(.)/g, "$1");
}

/** Extract every emitted `define` header identity from rendered CQL text — an INDEPENDENT source (the
 *  emitted string), NOT the totality metadata (disc 429 C5), so the completeness cross-check is not circular.
 *  `library` is the emitted library identity the text belongs to. */
export function extractEmittedDefineHeaders(cql: string, library: string): EmittedDefineHeader[] {
  const out: EmittedDefineHeader[] = [];
  for (const line of cql.split("\n")) {
    const m = DEFINE_HEADER_RE.exec(line);
    if (m) out.push({ library, name: m[1] !== undefined ? unescapeDelimitedIdentifier(m[1]) : m[2] });
  }
  return out;
}

/**
 * The central emitted-define ledger (§3). Emit routes EVERY define through `appendDefine` and every
 * non-define statement through `appendStatement`, so a define cannot reach the output text without a ledger
 * entry. `appendDefine` OWNS enrollment: it stores the `entry` (with its `cql`) and appends the same text,
 * and it REJECTS an entry whose stored `cql` does not actually declare `entry.name` (disc 429 G6/C8 — a
 * producer cannot enroll one identity while emitting another). `appendStatement` REJECTS any text containing
 * a top-level `define` (a define must go through `appendDefine`). Making the two raw string-concat define
 * sites route through here is the step-4/5 wiring; this class is that single API.
 */
export class DefineLedger {
  private readonly parts: string[] = [];
  private readonly enrolled: EmittedDefineEntry[] = [];

  /** Append an emitted `define` AND enroll its totality entry — the only sanctioned way to emit a define. */
  appendDefine(entry: EmittedDefineEntry): void {
    const declared = extractEmittedDefineHeaders(entry.cql, entry.library);
    if (!declared.some((h) => h.name === entry.name)) {
      throw new Error(
        `DefineLedger.appendDefine: enrolled entry "${entry.name}" but its cql declares no such define ` +
          `(declares: ${declared.map((h) => h.name).join(", ") || "(none)"}) — entry/text mismatch`,
      );
    }
    this.enrolled.push(entry);
    this.parts.push(entry.cql);
  }

  /** Append a non-define statement (`using`/`include`/`parameter`/`context`/comment). REJECTS a `define`. */
  appendStatement(cql: string): void {
    if (extractEmittedDefineHeaders(cql, "").length > 0) {
      throw new Error(`DefineLedger.appendStatement: text contains a top-level \`define\` — use appendDefine`);
    }
    this.parts.push(cql);
  }

  /** The enrolled entries, for the proof. */
  entries(): readonly EmittedDefineEntry[] {
    return this.enrolled;
  }

  /** Render the accumulated CQL. */
  render(separator = "\n\n"): string {
    return this.parts.join(separator);
  }
}

const BOOLEAN_RESULT_TYPE = "Boolean";

/** The proof's SUBJECT SET (disc 429 #1): a define is a boolean-proof subject iff its emitted result type is
 *  `Boolean`, INDEPENDENT of discharge metadata. A `not-boolean`/`nullable` discharge on a `Boolean` entry is
 *  a contradiction the proof FAILS (it cannot be used to exempt the define from proof). */
function isBooleanSubject(entry: EmittedDefineEntry): boolean {
  return entry.resultType === BOOLEAN_RESULT_TYPE;
}

// ===========================================================================
// §1 step 3. The proof — every boolean define reaches `total` via a MATCHING discharge (fixed-point)
// ===========================================================================

export type ProofFailure = {
  library: string;
  name: string;
  reason: string;
  obligation: BooleanTotalityObligation;
  discharge?: DischargeMetadata;
};

export type ProofResult = {
  /** proven = whole boundary certified total; incomplete = unclassified boolean defines remain (report,
   *  don't ship); failed = a hard failure or a coverage hole (disc 429 #9/C6). */
  status: "proven" | "incomplete" | "failed";
  /** True ONLY when status === "proven" (no failures, no uncovered, no unclassified). A caller must not ship
   *  on `ok` while `unclassified` is non-empty — hence `ok` folds unclassified in. */
  ok: boolean;
  /** Hard failures — a boolean define not provably total, an enrolled `rejected`, a contradictory discharge,
   *  or a composite cycle. */
  failures: ProofFailure[];
  /** `unclassified` boolean defines — ENUMERATED and reported (§2); makes the result INCOMPLETE, not failed. */
  unclassified: ProofFailure[];
  /** Emitted define headers with NO (or too few) matching ledger entries — the emitted-text→ledger direction
   *  of the completeness multiset (a path emitted a define without enrolling it). */
  uncovered: EmittedDefineHeader[];
  /** ENROLLED entries with NO (or too few) matching emitted headers — the ledger→emitted-text direction
   *  (disc 439 #3). Under DUAL-WRITE, enrollment and output assembly are separate operations, so an entry
   *  enrolled but then OMITTED from the emitted string is exactly the divergence dual-write can introduce;
   *  the forward `uncovered` check alone would not catch it. A non-empty list makes `status` `failed`. */
  orphanEntries: EmittedDefineHeader[];
};

/** Resolve a composition operand to the emitted-identity `{library, name}` it references. A bare operand is
 *  same-library; a qualified operand's raw library name may differ from the emitted identity, so a
 *  `resolveOperand` seam is threaded at wiring time (§4.5). Without it, a qualified operand resolves to its
 *  literal `{libraryName, name}` and simply fails to match if that identity is not enrolled — the SAFE
 *  interim (disc 429 #11/C9: fail, never silently treat as same-library). */
export type OperandResolver = (fromLibrary: string, ref: ReferenceName) => { library: string; name: string };

function defaultResolveOperand(fromLibrary: string, ref: ReferenceName): { library: string; name: string } {
  return typeof ref === "string"
    ? { library: fromLibrary, name: ref }
    : { library: ref.libraryName, name: ref.name };
}

/** Which discharge mechanism legitimately satisfies each obligation kind (requires the `total` variant). */
function dischargeKindMatchesObligation(ob: BooleanTotalityObligation, d: DischargeKind): boolean {
  switch (ob.kind) {
    case "intrinsically-total":
      // `facade-satisfied` (`…satisfied()` = `exists(truths)`) is intrinsically total — its own existence
      // wrapper, not a delegation to the truth-set operand (disc 439 code review, gpt56 #1). `null-presence`
      // (`<X> is not null`, #189 B3) is likewise intrinsically total by construction.
      return (
        d === "intrinsic-exists" ||
        d === "null-presence" ||
        d === "count-bare" ||
        d === "axiom" ||
        d === "facade-satisfied" ||
        d === "member-existence-fold" // #189 Piece 1 — the value/interface three-leg fold, total by construction
      );
    case "requires-boundary":
      return d === "boundary-coalesce" || d === "age-recency-total";
    case "composite":
      return d === "composite-delegated" || d === "facade-delegated";
    default:
      return false;
  }
}

/** Which origins legitimately claim each discharge mechanism (disc 429 #8/C7 — an authored form cannot claim
 *  `axiom` or `facade-delegated`; `age-recency-total` is an authored age concept or a synthesized helper). */
function originMatchesDischarge(origin: DefineOrigin, d: DischargeKind): boolean {
  switch (d) {
    case "axiom":
      return origin === "criterion-axiom" || origin === "catalog-axiom";
    case "facade-delegated":
    case "facade-satisfied":
      return origin === "interface-facade";
    case "age-recency-total":
      return origin === "authored" || origin === "age-helper";
    case "intrinsic-exists":
    case "null-presence":
    case "count-bare":
    case "boundary-coalesce":
    case "composite-delegated":
    case "member-existence-fold":
      return origin === "authored";
  }
}

/** True iff the entry's discharge is `total`, its mechanism matches its obligation kind, AND its origin may
 *  claim that mechanism. This is the local (non-recursive) proof of a single node. Exported for the gate's
 *  proven-through-excluded pass (`closeIndex.ts`), which must re-check that a composite fails ONLY on its
 *  operands (its OWN discharge is locally total) before it may be excused — a composite that fails on its own
 *  metadata (`nullable`/mismatched discharge) is a producer bug the staging scope does not explain. */
export function nodeLocallyTotal(entry: EmittedDefineEntry): boolean {
  const d = entry.discharge;
  if (d.booleanEffect !== "total") return false;
  return dischargeKindMatchesObligation(entry.obligation, d.dischargedBy) && originMatchesDischarge(entry.origin, d.dischargedBy);
}

/**
 * Prove the whole-boundary totality invariant (§1 step 3, §3 coverage) over the enrolled ledger:
 *   - the boolean SUBJECT SET is every `resultType === "Boolean"` entry (discharge cannot exempt it);
 *   - an enrolled `rejected` obligation is a hard FAILURE (guards a lowering regression re-emitting an E1
 *     fold the classifier now labels `rejected`);
 *   - a contradictory discharge (`Boolean` entry with `nullable`/`not-boolean` effect) is a hard FAILURE;
 *   - a `composite` is proven by a FIXED POINT — proven only after every operand is itself proven; a cycle
 *     (self-alias, mutual alias) FAILS rather than passing vacuously (disc 429 #5/C10);
 *   - `unclassified` boolean defines are enumerated → status `incomplete`;
 *   - every emitted define header (if provided) has a matching ledger entry, as a MULTISET (duplicates and
 *     un-enrolled defines are holes, disc 429 #2/#7/C5).
 */
export function proveWholeBoundaryTotality(
  entries: readonly EmittedDefineEntry[],
  emittedHeaders?: readonly EmittedDefineHeader[],
  resolveOperand: OperandResolver = defaultResolveOperand,
): ProofResult {
  const failures: ProofFailure[] = [];
  const unclassified: ProofFailure[] = [];

  const keyOf = (library: string, name: string): string => JSON.stringify([library, name]);
  const byKey = new Map<string, EmittedDefineEntry>();
  for (const e of entries) byKey.set(keyOf(e.library, e.name), e);

  const fail = (e: EmittedDefineEntry, reason: string): void => {
    failures.push({ library: e.library, name: e.name, reason, obligation: e.obligation, discharge: e.discharge });
  };

  // Fixed-point prover for composite delegation: an entry is proven only after every operand is proven; a
  // node re-entered while VISITING is a cycle → failed.
  const state = new Map<string, "visiting" | "proven" | "failed">();
  const proveTotal = (k: string): boolean => {
    const e = byKey.get(k);
    if (!e) return false;
    const s = state.get(k);
    if (s === "proven") return true;
    if (s === "failed") return false;
    if (s === "visiting") return false; // cycle — not vacuously total
    state.set(k, "visiting");
    let ok = false;
    if (e.discharge.booleanEffect === "total" && nodeLocallyTotal(e)) {
      if (e.obligation.kind === "composite") {
        ok = e.obligation.operands.every((op) => {
          const r = resolveOperand(e.library, op);
          return proveTotal(keyOf(r.library, r.name));
        });
      } else {
        ok = true; // intrinsically-total / requires-boundary discharged locally
      }
    }
    state.set(k, ok ? "proven" : "failed");
    return ok;
  };

  for (const e of entries) {
    // An enrolled `rejected` obligation must never have been emitted (§3 — E1 forms fail by non-enrollment).
    if (e.obligation.kind === "rejected") {
      fail(e, `rejected form was emitted: ${e.obligation.reason}`);
      continue;
    }
    if (!isBooleanSubject(e)) continue; // not-applicable/non-boolean defines are outside the boolean proof
    // A Boolean subject with a non-total discharge effect is a contradiction (disc 429 #1/C4): the metadata
    // claims the define is not a total boolean, but its result type says it is. Never an exemption.
    if (e.discharge.booleanEffect === "not-boolean") {
      fail(e, "Boolean-typed define enrolled with a `not-boolean` discharge effect — contradictory metadata");
      continue;
    }
    if (e.obligation.kind === "unclassified") {
      unclassified.push({ library: e.library, name: e.name, reason: e.obligation.reason, obligation: e.obligation, discharge: e.discharge });
      continue;
    }
    if (!proveTotal(keyOf(e.library, e.name))) {
      let why: string;
      if (e.obligation.kind === "composite") {
        // Distinguish a RESOLUTION miss (an operand the resolver could not route to an enrolled define — a
        // fail-closed sentinel, whose `name` carries the `[missing]`/`[ambiguous]` detail) from a totality
        // miss (every operand resolved to an enrolled define, but one is not total / a cycle). Naming the
        // unresolved operands is the R3 failure-enrichment (disc 441), done WITHOUT loosening `ProofFailure`
        // or importing the resolver's sentinel — "resolved identity absent from `byKey`" IS the miss signal.
        const unresolved = e.obligation.operands
          .map((op) => resolveOperand(e.library, op))
          .filter((r) => !byKey.has(keyOf(r.library, r.name)))
          .map((r) => `${r.library}."${r.name}"`);
        why =
          unresolved.length > 0
            ? `composite is not provably total — operand(s) did not resolve to an enrolled define: ${unresolved.join(", ")}`
            : "composite is not provably total — an operand is not a total boolean define (or a cycle)";
      } else {
        why = `discharge ${JSON.stringify(e.discharge)} does not satisfy a \`${e.obligation.kind}\` obligation for origin \`${e.origin}\``;
      }
      fail(e, why);
    }
  }

  // Completeness: the emitted define headers and the ledger entries must be the SAME multiset, checked in
  // BOTH directions (§3, disc 429 #2/#7 forward; disc 439 #3 reverse). `uncovered` = emitted-more-than-
  // enrolled (a path emitted a define without enrolling it); `orphanEntries` = enrolled-more-than-emitted
  // (dual-write enrolled a define whose text never reached the output).
  const uncovered: EmittedDefineHeader[] = [];
  const orphanEntries: EmittedDefineHeader[] = [];
  if (emittedHeaders) {
    const enrolledCount = new Map<string, number>();
    for (const e of entries) enrolledCount.set(keyOf(e.library, e.name), (enrolledCount.get(keyOf(e.library, e.name)) ?? 0) + 1);
    const headerCount = new Map<string, { header: EmittedDefineHeader; n: number }>();
    for (const h of emittedHeaders) {
      const k = keyOf(h.library, h.name);
      const cur = headerCount.get(k);
      if (cur) cur.n += 1;
      else headerCount.set(k, { header: h, n: 1 });
    }
    for (const [k, { header, n }] of headerCount) {
      if ((enrolledCount.get(k) ?? 0) < n) uncovered.push(header); // emitted, un-enrolled or under-enrolled
    }
    // Reverse direction: an enrolled identity emitted FEWER times than enrolled (including never) is an
    // orphan — the dual-write divergence the forward check cannot see. Reported once per excess enrollment.
    for (const [k, n] of enrolledCount) {
      const emitted = headerCount.get(k)?.n ?? 0;
      const e = byKey.get(k)!;
      for (let i = emitted; i < n; i++) orphanEntries.push({ library: e.library, name: e.name });
    }
    // A duplicate ENROLLED identity is itself a hole (two defines claiming one identity).
    for (const [k, n] of enrolledCount) {
      if (n > 1) {
        const e = byKey.get(k)!;
        fail(e, `duplicate enrolled define identity (${n} entries for one {library, name})`);
      }
    }
  }

  const status: ProofResult["status"] =
    failures.length > 0 || uncovered.length > 0 || orphanEntries.length > 0
      ? "failed"
      : unclassified.length > 0
        ? "incomplete"
        : "proven";
  return { status, ok: status === "proven", failures, unclassified, uncovered, orphanEntries };
}
