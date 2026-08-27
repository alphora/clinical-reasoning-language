/**
 * CRE — CRL Clinical Reasoning Engine (#115), v1.
 *
 * A headless, authoring-time interpreter: evaluate a CRL `decision` over a CEL
 * `case`'s facts, produce a recommendation set + trace, and check the case's
 * `result is` assertion (the oracle). It MIRRORS the FHIR/CQL engine at the
 * CRL/CEL level for fast authoring feedback — it is NOT the engine.
 *
 * SCOPE:
 *  - Concept satisfaction is ASSERTED + COMPOSED (REFACTOR:grounded — #189 Piece 2 + (a), disc 508/510/511):
 *      • asserted — a concept with a REPRESENTATION (a local `code is`, or a `coded from`/`source representation`
 *        binding) is satisfied when ≥1 of the case's (non-subject) facts is `defined by` it. For a LOCAL concept the
 *        fact's CODE is the membership input: it populates the concept whose `{system, code}` set it belongs to
 *        (compartment-global, byte-matching the CQL retrieve — Piece 2), NOT merely the concept it names. A
 *        RESOURCELESS-DERIVED concept (no `code is` AND no source binding — a pure `defined as`, a code-less
 *        reduction, or null-forever) is READ-ONLY: it has no FHIR resource, so a fact CANNOT assert it and doing so
 *        is a per-case run error — `$apply` has no equivalent (#189 (a) removed the old asserted-by-name magic).
 *      • composed (#126) — a concept with a `defined as` body is satisfied when
 *        its boolean composition over operand concepts evaluates true:
 *        `sem-and` = all, `sem-or` = any, `sem-not` = not (closed-world: absence
 *        ⇒ operand false), bare alias = the aliased concept, nesting supported.
 *      A concept that is BOTH directly assertable (`code is`) AND `defined as` — a CODED composite — is satisfied if
 *      EITHER holds (asserted ∪ composed); the composition is still walked on the asserted path so its trace +
 *      diagnostics surface. This union survives ONLY for a coded composite; a resourceless composite has no asserted
 *      arm at all (read-only, above).
 *    Operand refs: a BARE operand resolves within the DEFINING concept's library
 *      (CRL's local-namespace rule); cross-library operands must be qualified. An
 *      operand resolving to neither a concept nor a fact emits a diagnostic
 *      (silent-false under `sem-not` would invert to a spurious `true`). Cyclic
 *      `defined as` (validator-rejected) terminates with a diagnostic and is not
 *      memoized. EVALUATED (#270 Slice 0a-cre): `defined as exists ("X")` and a named `definition is
 *      exists "X"` reduction — closed-world existence over X (`refTrace`). REFUSED loud (run marked error,
 *      never a fabricated presence answer): a `count ... at least N` / `most recent this` reduction. Still
 *      NOT evaluated (deferred): a NAMED `most recent "X"` / temporal / value `definition is` predicate
 *      (presence-evaluated under the general rule), `coded from` / external value sets.
 *  - Decision walk: `first:` (ordered, first match wins, short-circuit),
 *    `all:` (every matching branch fires), `any:`/`all:` over actions (members
 *    enter the produced set; qualifier recorded), `otherwise` (catch-all), and
 *    the per-action guards `unless "C"` / `only when "C"`.
 *  - Oracle: a decision-leaf `result is` passes iff the expected branch is in
 *    the produced set (membership — a case asserts one valid disposition).
 *  - `use decision` is EVALUATED transitively (#166 same-library; #172 cross-library):
 *    a RESOLVABLE target is recursed in place — the sub-decision's body is walked
 *    under the use-decision action's nodeId and its RecommendActivity determinations
 *    bubble into the SAME produced set (so the oracle sees the delegated disposition).
 *    A BARE target binds in the CURRENT frame's library; a QUALIFIED (cross-library)
 *    target binds in its explicit library and recurses in a NEW frame
 *    `{ currentLib: resolved.lib, currentFilePath: resolved.filePath }` — so the sub's
 *    OWN bare `when`/guard concepts resolve in ITS library (closed-world; the
 *    satisfying CEL fact must be `defined by "SubLib"."C"`) and its trace spans point
 *    at its file. The sub-decision NAME is NOT produced (a delegation is not a
 *    disposition — REPLACE semantics; the bubbled name is the sub's BARE activity
 *    name). An UNRESOLVED cross-library target (lib/sub not in the graph) → a distinct
 *    `unresolved-cross-lib` diagnostic; an unresolved same-library bare target → a
 *    distinct not-found diagnostic. Delegation is cycle-guarded keyed `(lib,name)` (a
 *    target already on the delegation path → a runtime-error status + a cycle
 *    diagnostic, no hang) so cross-library `A.Sub`/`B.Sub` can't false-collide.
 */
import { childId, idOf, nameOf } from "../ast/decisionSpine";
import type {
  ActionGuard,
  ActionStatement,
  BlockBody,
  BlockMember,
  BlockQualifier,
  BranchBlock,
  CompositionExpression,
  Concept,
  CRL,
  Decision,
  DefinedAsBareRef,
  DefinedAsBooleanComposition,
  DefinedAsComposition,
  DefinedAsExists,
  Location,
  ReferenceName,
  WhenBlockBody,
} from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { soleRef, describeBranchCondition } from "../ast/branchCondition";
import type { BranchCondition } from "../ast/types";
// #236 — the CRE evaluates a decision's criterion-guard refs BY REFERENCE (memoized per case),
// never by up-front expansion. `runCel` runs NO semantic validation, so a cyclic/undefined
// criterion table can reach the evaluator directly; it degrades to closed-world false + a
// diagnostic (never a throw). The per-library criterion TABLES are the only shared wiring with the
// view-model (`buildCriterionTablesForGraph`), so run + render resolve criteria from the SAME
// source and their `op:"criterion"` traces/spines stay zip-consistent.
import type { CriterionTable } from "../ast/criterionExpansion";
import { buildCriterionTablesForGraph } from "./criterionTables";
import type {
  CELCase,
  CELCodeField,
  CELDefinedByField,
  CELFact,
  CELResultField,
  CELValueField,
} from "../cel/ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import { classifyCanonicalToken } from "../cel/canonicalToken";
import { isValueReadingBooleanConcept } from "../template-match/recencyValueConcept";
import { isResourcelessDerived } from "../emit/conceptDatumSignals";
import {
  makeLocalDomainContext,
  localMemberOfConcept,
  memberKey,
  type LocalConceptMember,
} from "../cel/localMembership";
import { sourceMembersOfConcept } from "../cel/sourceMembership";
import type { LsLocation } from "../language-services/contracts";
import { toZeroBasedRange } from "../language-services/contracts";
// childId + idOf/nameOf are single-sourced in ast/ (natural layer direction); re-exported here for existing consumers
// (viewModel, etc.). idOf is the shared (lib,name) identity used by the global decision resolver and all 4 cycle keys;
// nameOf is its tested inverse, used to render the delegation-cycle chain by name (byte-identical to the pre-#172 text).

import {
  buildGlobalDecisionMap,
  makeResolveDecision,
  type ResolvedDecision,
} from "./decisionResolver";
export { childId };

type Id = string;
const labelOf = (lib: string, name: string): string => `"${lib}"."${name}"`;

export interface ProducedRec {
  recommendation: string;
  viaWhen: string | null;
  qualifier: BlockQualifier | null;
}

/** Sub-evaluation of a `defined as` composition — so the trace shows WHY a
 *  composite was (un)satisfied (which operand failed), for adversarial review.
 *  `sem-and`/`sem-or`/`sem-not` are the semantic-inference (record-space) ops; `and`/`or`/`not` are the
 *  #189 Slice 0b BOOLEAN-composition ops (over SEPARATE boolean facts) — same shape, distinct semantics. */
export interface CompositionTrace {
  op: "sem-and" | "sem-or" | "sem-not" | "and" | "or" | "not" | "ref";
  satisfied: boolean;
  concept?: string; // op === "ref"
  operands?: CompositionTrace[]; // op === "sem-and" | "sem-or" | "and" | "or"
  operand?: CompositionTrace; // op === "sem-not" | "not"
  composition?: CompositionTrace; // op === "ref" to a composite — its own sub-evaluation
}

/** Sub-evaluation of a COMPOUND decision guard (`when A and (B or C)`) — the
 *  decision-layer analogue of `CompositionTrace` (do NOT conflate: `sem-*`
 *  inference vs decision `and`/`or`). Named `conditionTrace` on TraceNode to
 *  avoid colliding with `TraceNode.guard` (the action-guard). A ref leaf carries
 *  a STRUCTURED identity (cross-library same-name operands stay distinct), its
 *  own `defined as` `CompositionTrace` if it is a composite, and its own facts.
 *  Present ONLY for a compound guard; a single-ref `when` keeps the legacy
 *  `concept` + `composition` fields and omits this. */
export type BranchConditionTrace =
  | { op: "and" | "or"; satisfied: boolean; operands: BranchConditionTrace[] }
  // #224 iii.2: a decision-guard `not`. `satisfied` is the CLOSED-WORLD negation of its
  // operand (`!operand.satisfied`) — "the negated concept is NOT established", which is exactly
  // the emit-side `not Coalesce(<sat>, false)` two-valued semantics (iii.1). NOT three-valued
  // CQL null-logic. The flow/questionnaire panes render this node; precise blocking attribution
  // under negation is iii.3b.
  | { op: "not"; satisfied: boolean; operand: BranchConditionTrace }
  | {
      op: "ref";
      satisfied: boolean;
      concept: { name: string; libraryName?: string };
      composition?: CompositionTrace;
      facts?: string[];
    }
  // #236: a decision-guard `criterion` ref — evaluated by REFERENCE to the criterion's boolean
  // body (memoized per case), NOT inline-expanded. THREE shapes: (1) the FIRST occurrence of a
  // given `(lib, name)` per case that RESOLVES carries the full `body` sub-trace; (2) a LATER
  // occurrence of that same criterion sets `reference: true` and omits `body`, so the serialized
  // trace stays LINEAR in DISTINCT criteria — the run_decision analog of the emit DAG (a criterion
  // referenced N times, or a doubling DAG, does not re-bloat the trace); (3) an UNDEFINED or CYCLIC
  // criterion (no body anywhere, closed-world false) carries NEITHER `body` nor `reference` — an
  // opaque/error node. So `reference: true` ALWAYS implies a `body` shown at an earlier occurrence.
  | {
      op: "criterion";
      satisfied: boolean;
      criterion: { name: string; libraryName: string };
      body?: BranchConditionTrace;
      reference?: boolean;
      facts?: string[];
    };

export interface TraceNode {
  node: string;
  /** Decision-relative structural path id (e.g. "when[0]/action[1]", "otherwise", "when[1]/when[0]") —
   *  stable across re-runs of an unchanged decision; the key the scenario view-model aligns run-state
   *  onto the AST by. Single-sourced with the view-model walker via the same index-path scheme. */
  nodeId: string;
  kind: "when" | "otherwise" | "action";
  /** Source span of the originating CRL AST node, in the CURRENT frame's file (the covered/root file for same-library;
   *  the sub-decision's own file when a cross-library `use decision` recurses — sourced from `frame.currentFilePath`). */
  source: LsLocation;
  concept?: string;
  satisfied?: boolean;
  evaluated: boolean;
  guardedOut?: boolean;
  guard?: {
    polarity: "unless" | "only-when";
    concept: string;
    satisfied: boolean;
    composition?: CompositionTrace;
  };
  facts?: string[];
  /** Present when the `when`/guard concept is `defined as` a composition. */
  composition?: CompositionTrace;
  /** Present ONLY for a COMPOUND `when` guard (`and`/`or`); mutually exclusive
   *  with the single-ref `concept`/`composition` fields. Discriminator for a
   *  compound branch: `conditionTrace !== undefined`. */
  conditionTrace?: BranchConditionTrace;
  children?: TraceNode[];
}

/** A per-concept case answer (#187 Todo 2) — the case's truth for concept `(lib,name)`. `satisfied` is the concept's
 *  OVERALL evaluation (a direct fact OR its `defined as` composition), the SAME value whether the concept was on- or
 *  off-path. Fully qualified: same-name concepts in different libraries are distinct rows. Read-only + additive. */
export interface ConceptTruthRow {
  lib: string;
  name: string;
  satisfied: boolean;
}

export interface CaseRun {
  case: string;
  decision: string | null;
  status: "pass" | "fail" | "error";
  expected: { leaf: string; branch: string } | null;
  produced: ProducedRec[];
  trace: TraceNode[];
  diagnostics: string[];
  /** The case's per-concept truth over the whole closure (#187 Todo 2). Lets the Medical-Validation panes show a
   *  case-derived answer for an OFF-path (preempted) concept that `:first` never evaluated. Empty on an error run.
   *  CONTRACT: an ABSENT `(lib,name)` (a concept outside this list) is UNKNOWN — render blank, never as `false`. */
  conceptTruth: ConceptTruthRow[];
}

export interface CelRunResult {
  success: boolean;
  runs: CaseRun[];
  errors: string[];
}

interface ConceptEntry {
  node: Concept;
  lib: string;
  // #189 Piece 2 (disc 508) — the owning-library identity the local-domain resolver needs to derive this concept's
  // local `{system, code}` set (byte-matching the emitter/CQL lane). `filePath` drives the primary-seed
  // disambiguation; `entryName` is the `RegistryEntry.name` the resolver keys on; `fallbackLib` is
  // `ast.library.name` (the metadata-less domain id).
  filePath: string;
  entryName: string | null;
  fallbackLib: string;
}

/** #189 Piece 2 (disc 508) — the CRE's local membership index. Population is CODE-DRIVEN / compartment-global (§4:
 *  "there is no selector — the code, and which sets it is a member of, is the whole story"): a fact's effective
 *  `(fhirType, {system,code})` is looked up in `reverse` to find WHICH local concept it populates (possibly not the
 *  one it names), exactly as `$apply` populates by `(type, coding)`. `forward` gives a named concept's own set (for
 *  the bare-fact degenerate default). `underivable` is set when a local concept's set could not be derived (missing
 *  `canonicalBase`) — a local fact then fails the run LOUD rather than fabricating a member/non-member verdict. */
interface LocalMembershipIndex {
  forward: Map<Id, LocalConceptMember>;
  reverse: Map<string, Id>;
  /** `(fhirType, system, code)` keys claimed by ≥2 DISTINCT concepts. `concepts` is built from the whole registry
   *  (broader than the emitted closure `emit-duplicate-local-code` guards), so an unrelated same-domain/type/code
   *  concept could otherwise silently steal a reverse entry. A fact resolving to a collided key fails the run LOUD
   *  rather than last-writer-wins. */
  collisions: Set<string>;
  /** Whether the graph is a real PROJECT (`projectRoot` set) — an emit/`$apply` lane exists, so an underivable
   *  local set is a MISCONFIGURATION (run error). An inline/projectless graph has no emit lane to diverge from, so
   *  membership can't be computed and the CRE falls back to name-based presence (pre-Piece-2 behavior). */
  hasProject: boolean;
}

interface ConceptEval {
  sat: boolean;
  composition?: CompositionTrace;
}

interface Ctx {
  /** Concepts directly satisfied by a case fact (`defined by`). */
  directFacts: Set<Id>;
  factsByConcept: Map<Id, string[]>;
  /** #189 Piece 3 (Option C, disc 512) — the ids of VALUE-READING boolean concepts (member-existence interfaces): the
   *  ones whose emitted CQL own-arm reads `.value as FHIR.boolean` rather than presence. For these, `evalConcept`
   *  reads the retained own boolean value instead of `directFacts` presence, so the CRE matches `$apply`. */
  valueReadingIds: Set<Id>;
  /** #189 Piece 3 (Option C) — the BOOLEAN own values a value-reading concept was populated with (a fact carrying a
   *  boolean `value is`, code-driven onto whichever concept it is a member of). `evalConcept` reads the value: 0 → false
   *  (no own record), all-agree → that value; CONFLICTING true+false → refuse loud (the collision posture — the
   *  newest-wins pick would need the emitted date+id sort the CRE deliberately does not replicate). */
  ownBoolValues: Map<Id, boolean[]>;
  /** All concept definitions in the closure, by id, with their owning library. */
  concepts: Map<Id, ConceptEntry>;
  // NOTE: the covered-library identity + file moved off Ctx in the #172 frame migration — the library is now `rootLib`
  // and the per-node file is `frame.currentFilePath` (the root file for same-lib; the sub's file once todo-2 recurses).
  /** Per-case memo of concept satisfaction (composition can re-reference). */
  cache: Map<Id, ConceptEval>;
  /** Concepts currently on the evaluation stack — cycle guard. */
  stack: Set<Id>;
  /** Count of cycle-breaks; a node whose subtree hit a cycle is not memoized. */
  cycleHits: number;
  /** Operand ids already reported unresolvable (dedup diagnostics). */
  reportedUnresolved: Set<Id>;
  produced: ProducedRec[];
  trace: TraceNode[];
  diagnostics: string[];
  /** Shared `(callerLib, ref) → ResolvedDecision` resolver over the WHOLE graph (#172) — the ONLY decision lookup the
   *  recursion uses. A same-library lookup returns the identical Decision the old flat covered-library map did; a
   *  cross-library qualified ref resolves its sub in its own library. (The root-decision lookup in `runCase` reads its
   *  own `decisions` map BEFORE Ctx is built, so no per-library decision map is stored on Ctx.) */
  resolveDecision: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined;
  /** #236 — per-library criterion tables (`name → Criterion`), for reference-and-evaluate: a
   *  criterion guard resolves its body HERE instead of being inline-expanded up front. Keyed by library. */
  criterionTables: Map<string, CriterionTable>;
  /** Per-case memo of criterion satisfaction — a criterion referenced N times (or a doubling DAG)
   *  evaluates ONCE. Keyed `idOf(lib,name)`; mirrors `cache`. Carries the body sub-trace for
   *  first-occurrence tracing; not memoized through a cycle-break (mirrors `cache`). */
  criterionCache: Map<Id, { sat: boolean; facts: string[]; body: BranchConditionTrace }>;
  /** Criteria currently on the evaluation stack — cycle guard (mirrors `stack`). */
  criterionStack: Set<Id>;
  /** `(lib,name)` of criteria already emitted with a FULL body sub-trace this case; later
   *  occurrences trace as references (`op:"criterion", reference:true`) to keep the trace linear. */
  tracedCriteria: Set<Id>;
  /** The ROOT (covered) library — the frame `currentLib` is seeded with it; a cross-library sub pushes its OWN lib. */
  rootLib: string;
  /** `(lib,name)` keys on the current delegation path (cycle guard; seeded with `idOf(rootLib, rootDecisionName)`).
   *  Re-keyed from bare names to `(lib,name)` so a future cross-library `A.Sub`/`B.Sub` can't false-collide (#172). */
  delegationStack: Set<Id>;
  /** Set when delegation hit a cycle — the case run reports `status: "error"` (no pass/fail) rather than a partial result. */
  runtimeError: boolean;
}

/**
 * Per-frame recursion state threaded through walkBranches/executeBody/emitAction (like `delegationStack`), NOT stored on
 * the shared `Ctx` singleton — so a cross-library sub-frame carries its OWN lib/file without leaking across sibling
 * branches. The root frame is `{ currentLib: rootLib, currentFilePath: <covered file> }`. A same-library recursion keeps
 * the frame unchanged (`resolved.lib === currentLib`) — the BARE same-lib form is byte-identical to pre-#172; a
 * SELF-qualified same-lib target (`"SQ"."Sub"` inside SQ) now RESOLVES + evaluates too (a deliberate new evaluation, was
 * deferred pre-#172), still in the same frame. A cross-library `use decision` pushes `{ currentLib: resolved.lib,
 * currentFilePath: resolved.filePath }` for the sub's body (#172).
 */
interface Frame {
  /** Resolves a BARE `when`/guard concept ref (run.ts conceptSatisfied) — the current sub-decision's library. */
  currentLib: string;
  /** The file a node's source span points at (spanOf) — the current sub-decision's file. */
  currentFilePath: string;
}

/**
 * Satisfaction of a concept by id: directly asserted (a fact `defined by` it) OR
 * its `defined as` composition evaluates true. Memoized per case; cycle-guarded
 * (the validator forbids cyclic concept refs, but guard defensively so an
 * un-revalidated input can't infinite-loop — and don't memoize a result computed
 * through a cycle-break, so it can't poison a node satisfiable on another path).
 */
function evalConcept(id: Id, ctx: Ctx): ConceptEval {
  const cached = ctx.cache.get(id);
  if (cached) return cached;
  if (ctx.stack.has(id)) {
    const e = ctx.concepts.get(id);
    ctx.diagnostics.push(
      `composition cycle detected at concept ${e ? labelOf(e.lib, e.node.name) : id} — treated as unsatisfied`,
    );
    ctx.cycleHits++;
    return { sat: false };
  }
  ctx.stack.add(id);
  const cyclesBefore = ctx.cycleHits;
  const entry = ctx.concepts.get(id);
  // `runtimeErrorBefore` is captured at the TOP, before BOTH error-capable arms (the composition/reduction refuse and
  // the value-reading direct-arm conflict refuse below), so an error raised while evaluating THIS node (directly or via
  // a consumed operand) excludes it from memoization. ⚠ It is a monotonic boolean, not a per-eval counter: if a PRIOR
  // sibling eval already set `ctx.runtimeError`, this eval's own refuse is masked (`erroredThisEval` false) and the
  // result can memoize — harmless in the main run (the case is already `error`), a pre-existing limitation for the
  // `truthOf` scratch-cache path (a robust event/counter is a separate follow-up). (disc 513, both arms.)
  const runtimeErrorBefore = ctx.runtimeError;
  let composition: CompositionTrace | undefined;
  let composed = false;
  const def = entry?.node.definition;
  if (def && def.type === "DefinedAsDefinition") {
    composition = walkDefinedAs(def.body, entry!.lib, ctx);
    composed = composition.satisfied;
  } else if (def && def.type === "ReductionDefinition") {
    const red = def.reduction;
    if (red.kind === "exists" && red.target.type === "ReductionConceptRef") {
      // #270 Slice 0a-cre (disc 462 code review, both arms) — a NAMED `definition is exists "X"` reduction IS
      // existence of X: identical to `defined as exists ("X")` and to its CQL lowering `exists(<X>)`. Evaluate
      // the TARGET (via `refTrace`), NOT `directFacts.has(self)` — the case asserts X's records, not this
      // derived concept, so a presence answer here is always-false: a silent Deny of every eligible case, the
      // exact fabrication the count/most-recent arm below refuses. (`exists this` — a `ThisRecords` target — is
      // the concept's OWN records, sound as `directFacts` presence, so it needs no arm and falls through.)
      composition = refTrace(red.target.ref, entry!.lib, ctx);
      composed = composition.satisfied;
    } else if (red.kind === "count" || red.kind === "mostRecent") {
      // A `count ... at least N` / `most recent this` reduction CANNOT be soundly evaluated by the presence
      // model (count needs record COUNTS — present/absent would pass a sub-threshold case; `most recent` needs
      // record-level value/recency). Mark the run ERROR rather than FABRICATE a presence answer (charter
      // no-fabricated-authority), mirroring the boolean-composition precedent below.
      // ⚠ SPELLING ASYMMETRY (disc 462, both arms): a NAMED `most recent "X"` deliberately stays a
      // `DefinitionIsDefinition` (`types.ts:979`), NOT a `ReductionDefinition`, so it does NOT reach this arm —
      // it presence-evaluates under the general "`definition is` predicates deferred" rule (file header) and is
      // silently false. Distinguishing a value-read `most recent "X"` from a sound list-pattern records concept
      // needs the narrative matcher + pattern-return-shape classification (the emit-side machinery); a full CRE
      // value-read/reduction evaluation is a deferred effort. Documented here rather than half-built.
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `\`definition is ${red.kind === "count" ? "count" : "most recent"}\` reduction concept ` +
          `${labelOf(entry!.lib, entry!.node.name)} is not evaluated by run_decision — a count/most-recent ` +
          `reduction needs record-level evaluation the engine's presence model does not provide; run marked ` +
          `error rather than fabricate a presence-based answer.`,
      );
    }
    // `exists this` (ThisRecords) → no arm; for a CODED concept (`code is` + `definition is exists this`)
    // `directFacts` presence (the case asserting the concept's own records) IS its existence, so it is sound.
    // A code-LESS `exists this` (no `code is`, no source) is resourceless-derived: #189 (a) refuses a direct
    // name-assertion of it (the directFacts loop errors before it can populate), so its presence is always empty
    // and it computes false — the null-forever (#291) case, no longer a silent presence fabrication.
  }

  // #189 Piece 3 (Option C, disc 512) — the DIRECT-arm contribution, computed AFTER `composed` so the OR union is
  // honored. For a value-reading boolean concept (a member-existence interface) the emitted CQL own-arm reads the
  // newest own record's VALUE (not presence); the CRE mirrors that from the retained own boolean value. Every other
  // concept keeps PRESENCE (`directFacts.has`) — a valueless record (Condition/`exists this`) has no value to read;
  // existence IS its truth.
  let direct: boolean;
  if (ctx.valueReadingIds.has(id)) {
    const vals = ctx.ownBoolValues.get(id) ?? [];
    if (vals.length === 0) {
      direct = false; // no own boolean record → own-arm `Last(...).value` = null → `is true` = false
    } else if (vals.every((v) => v === vals[0])) {
      direct = vals[0]; // agreeing own values → unambiguous; matches `$apply`'s newest-wins under ANY ordering
    } else if (composed) {
      // Conflicting own values, BUT the composed `exists` arm is already satisfied → the OR union is true regardless
      // of which own value `$apply` picks; the conflict is NOT decisive, so no refuse (`sat = direct || composed`).
      direct = false;
    } else {
      // DECISIVE conflict: composed is false, so the own-arm alone decides — and `$apply` would pick the newest by
      // (effective, id), a sort the CRE does not replicate (charter §4 no-magic — the id is an emitter hash). Refuse
      // loud, the same posture as a local-membership collision — a LOUD non-decision, never a silent wrong verdict.
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `value-reading concept ${entry ? labelOf(entry.lib, entry.node.name) : id} was directly asserted with ` +
          `CONFLICTING own values (both \`value is true\` and \`value is false\`) and no composed evidence; the ` +
          `newest-wins determination cannot be resolved without the emitted record dating — run marked error rather ` +
          `than fabricate a verdict.`,
      );
      direct = false;
    }
  } else {
    direct = ctx.directFacts.has(id);
  }
  ctx.stack.delete(id);
  const result: ConceptEval = { sat: direct || composed, ...(composition ? { composition } : {}) };
  // Memoize only cycle-free AND non-runtimeError-tainted evals (disc 462 Claude #2). A cached tainted result
  // would mask the per-concept unevaluable signal `truthOf`/`collectConceptTruth` read off the scratch
  // `runtimeError` to OMIT the row (never publish a fabricated presence answer). `runtimeErrorBefore` scopes
  // this to errors raised DURING this eval (directly or via a consumed operand — transitive), mirroring the
  // existing cycle-taint exclusion; a tainted eval is on the error path and never trusted, so not caching it
  // costs only a re-eval.
  const erroredThisEval = ctx.runtimeError && !runtimeErrorBefore;
  if (ctx.cycleHits === cyclesBefore && !erroredThisEval) ctx.cache.set(id, result);
  return result;
}

function walkDefinedAs(
  body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition | DefinedAsBooleanComposition,
  lib: string,
  ctx: Ctx,
): CompositionTrace {
  // #270 (Slice 0a-cre) — `defined as exists ("X")` is CLOSED-WORLD existence over X's records: X exists
  // iff it is directly asserted by a case fact OR its own definition evaluates satisfied (`evalConcept`,
  // via `refTrace`). In the closed-world fact model, existence of a records concept IS its satisfaction —
  // exactly the CQL bare `exists(<X>)` the emitter lowers (`emitExistsBridge`), which is total (never
  // null). So NO `runtimeError`: an existence determination is now authoritative, matching the emit lane.
  // It traces as `op:"ref"` ("X is present") — the trace op union has no distinct `exists` node; a
  // dedicated one can ride 0b's viewModel schema bump. (The emit refuses `exists` over a scalar boolean /
  // reduction operand — `emitExistsBridge` guard (2) — so a well-formed exists target is a records/refinement
  // concept, for which `refTrace`'s satisfaction is the presence answer.)
  //
  // ⚠ REFINEMENT-TARGET DIVERGENCE (disc 462, gpt56 G1 / Claude): when X is a `defined as (A sem-and B)` /
  // `sem-not` refinement, CRE approximates record INTERSECTION/COMPLEMENT by boolean presence conjunction
  // (`walkExpr`), so `exists(X)` can read true where the emitted CQL `exists(A intersect B)` is empty
  // (disjoint records). This is a PRE-EXISTING systemic model coarseness — it applies to EVERY consumer of a
  // refinement concept's satisfaction (a plain `when "X"` guard over a refinement already approximates), not
  // to `exists` specifically — so `exists` inheriting it consistently is correct; loud-erroring only the
  // `exists` cell would be incoherent. Record-level refinement evaluation is a deferred CRE effort.
  if (body.type === "DefinedAsExists") {
    // #189 Piece 3 (v7 §3) — via `existsTrace`, so `exists` over a `most recent this` / `count` value concept reads
    // record EXISTENCE instead of erroring on the value reduction (the `Covered Device` both-rep coverage gate).
    return existsTrace(body.ref, lib, ctx);
  }
  if (body.type === "DefinedAsBooleanComposition") {
    // #189 Slice 0b — CLOSED-WORLD eval of a `defined as` BOOLEAN composition (`("A" and "B")`): `and`/`or`/
    // `not` over the evaluated operand booleans (each operand a concept ref → `refTrace`). REPLACES the T1 loud
    // sentinel. ⚠ SCOPE (disc 464, both arms — it matches the emitted CQL for VALIDATOR-CLEAN, same-lib content
    // over EVALUABLE operands, NOT unconditionally):
    //   - a `runtimeError`-writing operand (a `count`/`most recent` reduction, or the criterion arm in
    //     `walkBoolExpr`) DOES propagate → run status "error";
    //   - an UNRESOLVED or CYCLIC operand degrades CLOSED-WORLD-FALSE (`refTrace`/`evalConcept` set no
    //     `runtimeError`) — the SAME posture as a decision guard / `sem-*` composition; the validator owns them
    //     (a composition over an unresolved operand is T2-rejected);
    //   - a boolean COMPARATOR / value-read operand inherits the presence-model approximation (backlog #283),
    //     IDENTICAL to a plain `when "X"` guard over the same operand — not worsened here. Documented, not loud,
    //     consistent with the operator-affirmed G1 stance (single-cell loud-erroring would contradict the rest
    //     of the CRE). Full record/value-level CRE eval is the deferred #283 effort.
    return walkBoolExpr(body.expression, lib, ctx);
  }
  return body.type === "DefinedAsBareRef"
    ? refTrace(body.ref, lib, ctx)
    : walkExpr(body.expression, lib, ctx);
}

/**
 * Off-path case truth for a concept (#187 Todo 2). Evaluates `id` through the SAME `evalConcept` the run uses, but in
 * an ISOLATED scratch ctx — fresh `diagnostics`/`stack`/`cycleHits` and a COPIED `reportedUnresolved` — so computing a
 * preempted concept's answer cannot change the case's status/produced/trace/diagnostics. ONLY `cache` is intentionally
 * shared, and that is safe: `evalConcept` is MONOTONIC (early-returns on any existing entry; only ever ADDS a cycle-free
 * result; never overwrites) and the main run already completed, so added cache entries cannot alter produced/trace.
 * LOAD-BEARING INVARIANT: this routes ONLY through `evalConcept`. `walkBranches`/`emitAction`/`executeBody` are the
 * writers of `produced`/`trace`/`delegationStack`; `runtimeError` has additional writers reachable from `evalConcept`
 * — `walkBoolExpr`'s criterion-operand arm sets it for a criterion inside a `defined as` boolean composition (#189
 * Slice 0b), and `evalConcept` itself sets it for a `count`/`most recent` reduction concept (#270 Slice 0a-cre).
 * (`defined as exists`, a named `exists "X"` reduction, and a boolean composition over EVALUABLE operands now
 * EVALUATE, so they no longer write it.) Isolation still holds: the scratch ctx
 * below RESETS `runtimeError` to a fresh `false`, so an off-path unevaluable node marks the SCRATCH errored and never
 * the real run. Any NEW `runtimeError` writer reachable from `evalConcept` inherits this isolation — keep it that way.
 *
 * The reset also makes the scratch `runtimeError` a per-concept "this off-path answer is NON-AUTHORITATIVE" signal:
 * `collectConceptTruth` reads it to OMIT the row (the `ConceptTruthRow` "absent ⇒ unknown" contract) rather than
 * publish a fabricated presence `false` for a concept the engine refuses to evaluate (disc 462 Claude #2 / gpt56 G4).
 */
function truthOf(id: Id, ctx: Ctx): { eval: ConceptEval; authoritative: boolean } {
  const scratch: Ctx = {
    ...ctx,
    diagnostics: [],
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(ctx.reportedUnresolved),
    runtimeError: false, // fresh — detect ONLY this off-path eval's unevaluable verdict
  };
  const ev = evalConcept(id, scratch);
  return { eval: ev, authoritative: !scratch.runtimeError };
}

/**
 * The case's per-concept truth over the WHOLE closure (#187 Todo 2) — eval-all-closure. Every DECLARED concept in
 * `ctx.concepts` (root + local + package libs; the whole cross-lib closure) gets its overall satisfaction, so a
 * preempted/off-path concept that `:first` never evaluated still has a case answer for the panes — no frame-aware
 * structure walk needed (`ctx.concepts` already spans delegated sub-decisions). Records the RETURNED `sat` (NOT a cache
 * snapshot: a cycle-tainted eval is deliberately not memoized, so a snapshot would omit exactly the abnormal false cases).
 *
 * COVERAGE = declared Concepts. This is exactly the set the panes can DISPLAY (their `ConceptShapeIndex` is built from
 * the same `Concept` declarations), so a fact-only name asserted via `defined by` but with NO `Concept` declaration —
 * satisfiable-true but absent from `ctx.concepts` — is intentionally absent here AND never a displayed concept, so the
 * "absent ⇒ unknown" contract cannot mislead a pane. PRECEDENCE: `ctx.concepts` is keyed by `(lib,name)`, and a same-name
 * local+package collision resolves to the local/covered concept (added last in `runCel`) — the shape model resolves the
 * same way, so the row matches what the pane shows.
 *
 * BOUND: O(all declared concepts in the closure) rows, per case, and this array is JSON-serialized by `run_decision`. At
 * authoring scale (a policy + a few shared libs) that is small; a covered lib importing a very large shared package
 * library is the pathological case — if it ever bites, scope collection to the covered decision's reachable concept set
 * (deferred; the frame-aware reachability walk was the option disc 191 rejected in favor of this simpler closure form).
 *
 * Rows are sorted by `(lib, name)` for deterministic output (so a future `run_decision` golden can't accidentally encode
 * the registry iteration order). Order is NOT part of the contract — consumers join by `(lib,name)`, never by position.
 */
function collectConceptTruth(ctx: Ctx): ConceptTruthRow[] {
  const rows: ConceptTruthRow[] = [];
  for (const [id, entry] of ctx.concepts) {
    const { eval: ev, authoritative } = truthOf(id, ctx);
    // OMIT a non-authoritative concept (a `count`/`most recent` reduction, or a boolean composition over a
    // criterion operand, that the engine refuses to evaluate) — an ABSENT row is UNKNOWN (render blank), never a fabricated `false`
    // (disc 462 Claude #2 / gpt56 G4). Publishing false would tell a pane a `count≥2` determination is
    // authoritatively unmet on a case that may satisfy it.
    if (!authoritative) continue;
    rows.push({ lib: entry.lib, name: entry.node.name, satisfied: ev.sat });
  }
  rows.sort((a, b) => a.lib.localeCompare(b.lib) || a.name.localeCompare(b.name));
  return rows;
}

/** A composition operand reference resolves against the DEFINING concept's
 *  library when unqualified (`lib`), or its explicit qualifier when present. */
function refTrace(ref: ReferenceName, lib: string, ctx: Ctx): CompositionTrace {
  const refLib = getRefLibrary(ref) ?? lib;
  const name = getRefName(ref);
  const id = idOf(refLib, name);
  if (!ctx.concepts.has(id) && !ctx.directFacts.has(id) && !ctx.reportedUnresolved.has(id)) {
    // Resolves to neither a concept nor a fact — unresolvable. Flag it: a silent
    // false under `sem-not` would invert to a spurious `true`. (A bare operand is
    // LOCAL to the defining library; cross-library operands must be qualified.)
    ctx.reportedUnresolved.add(id);
    ctx.diagnostics.push(
      `composition operand ${labelOf(refLib, name)} resolves to no concept or fact`,
    );
  }
  const ev = evalConcept(id, ctx);
  return {
    op: "ref",
    concept: name,
    satisfied: ev.sat,
    ...(ev.composition ? { composition: ev.composition } : {}),
  };
}

/** #189 Piece 3 (v7 §3) — the existence reach-through for `defined as exists ("X")`. `exists(X)` = "does a member
 *  record of X exist". When X is a VALUE concept whose datum is a `most recent this` / `count` reduction (the
 *  both-rep `Covered Device` shape), the reduction selects/aggregates a VALUE over X's OWN records — it does NOT
 *  gate their EXISTENCE. `evalConcept` marks such a reduction a `runtimeError` (it cannot evaluate the value), which
 *  would poison an existence read that never needed the value. So here existence is X's `directFacts` presence
 *  (a local- or source-member fact populated it), computed WITHOUT evaluating the reduction — matching the emitted
 *  CQL `exists(<X records>)`, which is total. Every OTHER target (plain records, `exists this`, `exists "Y"`, a
 *  `defined as` composition) does not error in `evalConcept`, so it keeps the existing `refTrace` presence answer. */
function existsTrace(ref: ReferenceName, lib: string, ctx: Ctx): CompositionTrace {
  const refLib = getRefLibrary(ref) ?? lib;
  const name = getRefName(ref);
  const id = idOf(refLib, name);
  const def = ctx.concepts.get(id)?.node.definition;
  if (def?.type === "ReductionDefinition" && (def.reduction.kind === "count" || def.reduction.kind === "mostRecent")) {
    return { op: "ref", concept: name, satisfied: ctx.directFacts.has(id) };
  }
  return refTrace(ref, lib, ctx);
}

function walkExpr(expr: CompositionExpression, lib: string, ctx: Ctx): CompositionTrace {
  switch (expr.type) {
    case "SemAndExpression": {
      const operands = expr.terms.map((t) => walkExpr(t, lib, ctx));
      return { op: "sem-and", operands, satisfied: operands.every((o) => o.satisfied) };
    }
    case "SemOrExpression": {
      const operands = expr.terms.map((t) => walkExpr(t, lib, ctx));
      return { op: "sem-or", operands, satisfied: operands.some((o) => o.satisfied) };
    }
    case "SemNotExpression": {
      const operand = walkExpr(expr.expression, lib, ctx);
      return { op: "sem-not", operand, satisfied: !operand.satisfied };
    }
    case "CompositionGroup":
      return walkExpr(expr.expression, lib, ctx); // parentheses are transparent
    case "CompositionRef":
      return refTrace(expr.ref, lib, ctx);
  }
}

/** #189 Slice 0b — closed-world eval of a `defined as` BOOLEAN composition's `BranchCondition` tree:
 *  `and`/`or`/`not` over evaluated operand booleans, mirroring the emitted CQL `and`/`or`/`not`. The
 *  decision-guard analogue is `evalBranchCondition` (which also handles criteria + the decision frame); this
 *  is the `defined as` (concept) analogue, producing a `CompositionTrace` so `conceptTruth` / the cockpit
 *  renders the operands. Operand existence/refinement inherits `refTrace`'s closed-world verdict. */
function walkBoolExpr(expr: BranchCondition, lib: string, ctx: Ctx): CompositionTrace {
  switch (expr.type) {
    case "BranchConditionAnd": {
      const operands = expr.operands.map((t) => walkBoolExpr(t, lib, ctx));
      return { op: "and", operands, satisfied: operands.every((o) => o.satisfied) };
    }
    case "BranchConditionOr": {
      const operands = expr.operands.map((t) => walkBoolExpr(t, lib, ctx));
      return { op: "or", operands, satisfied: operands.some((o) => o.satisfied) };
    }
    case "BranchConditionNot": {
      const operand = walkBoolExpr(expr.operand, lib, ctx);
      return { op: "not", operand, satisfied: !operand.satisfied };
    }
    case "BranchConditionRef":
      // #189 Slice 0c — a boolean-composition operand may be a CROSS-LIBRARY qualified ref (`"Sib"."Sib Flag"`).
      // `refTrace` resolves it against its explicit qualifier over the loaded closure (the registry-built concept
      // map, ~line 1155) and evaluates it CLOSED-WORLD. POSTURE (operator-affirmed G1 "document, not loud"): the
      // EMIT lane proves the operand total from the WHOLE-closure `DeclaredResultIndex`, so emit succeeds; a
      // `run_decision` invoked WITHOUT the foreign library in scope cannot resolve the operand and `refTrace`
      // pushes an UNRESOLVED DIAGNOSTIC. Two honest caveats on that diagnosed-unresolved verdict (disc 466, both
      // arms) — both PRE-EXISTING closed-world limits (backlog #283), NOT 0c regressions, and identical to a bare
      // unresolved operand: (1) the operand still evaluates to closed-world FALSE, so under `not` it INVERTS to a
      // diagnosed `true` that can drive a recommendation — a diagnosed false, not a prevented one; (2) `refTrace`
      // resolves the qualifier by RAW token (`idOf(refLib, name)`), NOT scope-first like emit, so under
      // `local-package-same-name` the CRE can evaluate a DIFFERENT library's concept than emit. The CRE is a
      // presence-model approximation, not the shipped artifact — these are documented, not loud-gated.
      return refTrace(expr.ref, lib, ctx);
    case "BranchConditionCriterionRef":
      // A criterion is NOT a boolean-composition operand (emit's `branchConditionConceptRefsStrict` rejects it);
      // the closed-world evaluator cannot treat a decision-guard construct as a boolean fact. Mark the run error
      // rather than fabricate a presence answer (charter no-fabricated-authority), mirroring the emit refusal.
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `\`defined as\` boolean composition references criterion "${getRefName(expr.ref)}" — a criterion is a ` +
          "decision-guard construct, not a boolean fact; run marked error rather than fabricate a boolean.",
      );
      return { op: "ref", concept: getRefName(expr.ref), satisfied: false };
  }
}

function conceptSatisfied(
  ref: ReferenceName,
  ctx: Ctx,
  frame: Frame,
): { sat: boolean; facts: string[]; composition?: CompositionTrace } {
  // A bare `when`/guard ref resolves against the CURRENT decision's library (the frame). Same-library is the degenerate
  // case `frame.currentLib === ctx.rootLib`; a cross-library sub carries its own lib so its bare refs bind there (#172).
  const id = idOf(getRefLibrary(ref) ?? frame.currentLib, getRefName(ref));
  const ev = evalConcept(id, ctx);
  return {
    sat: ev.sat,
    facts: ctx.factsByConcept.get(id) ?? [],
    ...(ev.composition ? { composition: ev.composition } : {}),
  };
}

/** Evaluate a COMPOUND `when` guard (`and`/`or` over concept refs). FULL-evaluate
 *  every operand (NO short-circuit) so the trace shows which conjunct failed:
 *  `and` = all satisfied, `or` = any. Facts = ordered first-occurrence union over
 *  the evaluated ref leaves. A single-ref guard does NOT come here — walkBranches
 *  keeps its legacy `concept`+`composition` trace path (no golden drift). Note:
 *  full evaluation may surface DIAGNOSTICS from a non-decisive operand (e.g. the
 *  second operand of a satisfied `or`); intentional, for a complete trace. */
function evalBranchCondition(
  cond: BranchCondition,
  ctx: Ctx,
  frame: Frame,
): { sat: boolean; facts: string[]; trace: BranchConditionTrace } {
  if (cond.type === "BranchConditionRef") {
    const { sat, facts, composition } = conceptSatisfied(cond.ref, ctx, frame);
    // Structured RESOLVED identity: a bare ref resolves against the current frame
    // (a delegated cross-library decision → the sub's lib), so two same-named
    // bare leaves in different frames stay distinguishable in the trace.
    const lib = getRefLibrary(cond.ref) ?? frame.currentLib;
    return {
      sat,
      facts,
      trace: {
        op: "ref",
        satisfied: sat,
        concept: { name: getRefName(cond.ref), libraryName: lib },
        ...(composition ? { composition } : {}),
        ...(facts.length > 0 ? { facts } : {}),
      },
    };
  }
  if (cond.type === "BranchConditionCriterionRef") {
    // #236: evaluate a criterion by REFERENCE to its boolean body (memoized per case), NOT by
    // inline expansion. A criterion is library-local (cross-library criterion refs are a
    // validation error), so it resolves in the current frame's library.
    const name = getRefName(cond.ref);
    const lib = getRefLibrary(cond.ref) ?? frame.currentLib;
    const cid = idOf(lib, name);
    const crit = ctx.criterionTables?.get(lib)?.get(name);
    const critTrace = (
      sat: boolean,
      facts: string[],
      body?: BranchConditionTrace,
    ): { sat: boolean; facts: string[]; trace: BranchConditionTrace } => {
      // FIRST occurrence per (lib,name) with a RESOLVED body carries the body sub-trace; a LATER
      // occurrence of that same (already-bodied) criterion is a `reference` (body shown once — the
      // linearity that keeps the serialized trace linear in DISTINCT criteria). An UNDEFINED or
      // CYCLIC criterion has NO body anywhere, so it emits NEITHER body nor reference — an
      // opaque/error node — NOT a spurious `reference` (which would promise a first-occurrence body
      // that never exists, breaking the contract MCP/schema consumers code against). disc 419: both
      // review arms (gpt-5.6 #10 / Fable N1) flagged the no-body `reference:true`.
      const bodied = ctx.tracedCriteria.has(cid);
      const first = body !== undefined && !bodied;
      if (body !== undefined) ctx.tracedCriteria.add(cid);
      return {
        sat,
        facts,
        trace: {
          op: "criterion",
          satisfied: sat,
          criterion: { name, libraryName: lib },
          ...(first ? { body } : bodied ? { reference: true } : {}),
          ...(facts.length > 0 ? { facts } : {}),
        },
      };
    };
    if (!crit) {
      // Undefined criterion → LOUD (deduped) + closed-world false. A SILENT false would invert to
      // a spurious TRUE under `not <criterion>`, so it must be diagnosed (mirrors an unresolved
      // concept). Validated emit forbids this; the CRE runs on un-revalidated input, so guard here.
      if (!ctx.reportedUnresolved.has(cid)) {
        ctx.reportedUnresolved.add(cid);
        ctx.diagnostics.push(`criterion "${name}" resolves to no definition in ${lib} — treated as unsatisfied`);
      }
      return critTrace(false, []);
    }
    const cached = ctx.criterionCache.get(cid);
    if (cached) return critTrace(cached.sat, cached.facts, cached.body);
    if (ctx.criterionStack.has(cid)) {
      // Cycle-break: closed-world false, diagnosed, NOT memoized (mirrors evalConcept).
      ctx.diagnostics.push(`criterion cycle detected at "${name}" (${lib}) — treated as unsatisfied`);
      ctx.cycleHits++;
      return critTrace(false, []);
    }
    ctx.criterionStack.add(cid);
    const cyclesBefore = ctx.cycleHits;
    const inner = evalBranchCondition(crit.condition, ctx, { ...frame, currentLib: lib });
    ctx.criterionStack.delete(cid);
    if (ctx.cycleHits === cyclesBefore) {
      ctx.criterionCache.set(cid, { sat: inner.sat, facts: inner.facts, body: inner.trace });
    }
    return critTrace(inner.sat, inner.facts, inner.trace);
  }
  if (cond.type === "BranchConditionNot") {
    // #224 iii.2/iii.3: closed-world negation — `not X` is satisfied iff X is NOT established.
    // This matches the emit-side `not Coalesce(<sat>, false)` (iii.1) two-valued semantics — NOT
    // three-valued CQL null-logic. `not` is a first-class guard as of iii.3 (validated + emitted).
    // Facts of the operand ARE the evidence consulted, so they propagate (the reason it holds).
    const inner = evalBranchCondition(cond.operand, ctx, frame);
    return {
      sat: !inner.sat,
      facts: inner.facts,
      trace: { op: "not", satisfied: !inner.sat, operand: inner.trace },
    };
  }
  const op: "and" | "or" = cond.type === "BranchConditionAnd" ? "and" : "or";
  const results = cond.operands.map((o) => evalBranchCondition(o, ctx, frame));
  const sat = op === "and" ? results.every((r) => r.sat) : results.some((r) => r.sat);
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const r of results) {
    for (const f of r.facts) {
      if (!seen.has(f)) {
        seen.add(f);
        facts.push(f);
      }
    }
  }
  return { sat, facts, trace: { op, satisfied: sat, operands: results.map((r) => r.trace) } };
}


export function recName(action: ActionStatement["action"]): string {
  return action.type === "RecommendActivity"
    ? getRefName(action.activityName)
    : getRefName(action.decisionName);
}

/** A guard EXCLUDES an item when `unless C` and C holds, or `only when C` and C does not hold. */
function evalGuard(
  guard: ActionGuard | undefined,
  ctx: Ctx,
  frame: Frame,
): { excluded: boolean; info?: TraceNode["guard"] } {
  if (!guard) return { excluded: false };
  const { sat, composition } = conceptSatisfied(guard.conceptName, ctx, frame);
  const excluded = guard.polarity === "unless" ? sat : !sat;
  return {
    excluded,
    info: {
      polarity: guard.polarity,
      concept: getRefName(guard.conceptName),
      satisfied: sat,
      ...(composition ? { composition } : {}),
    },
  };
}

/** Source span of an AST node in the CURRENT frame's library file (the covered file at root; the sub's file when a
 *  cross-library `use decision` recurses). Carried per-frame, not from the shared Ctx, so a sub's spans point at ITS file. */
const spanOf = (loc: Location, frame: Frame): LsLocation => ({
  filePath: frame.currentFilePath,
  range: toZeroBasedRange(loc),
});

/**
 * Emit one action node (already past its guard) at `nodeId`. A `recommend activity` is a leaf disposition: its name
 * enters `produced`. A `use decision` DELEGATES (#166 same-library, #172 cross-library):
 *  - RESOLVABLE target (BARE in the current frame's lib, or QUALIFIED in its explicit lib), not on the delegation path →
 *    recurse the sub-decision's body UNDER this action's nodeId (children), pushing a NEW frame
 *    `{ currentLib: resolved.lib, currentFilePath: resolved.filePath }` so the sub's bare when/guard resolve in ITS
 *    library and its trace spans point at its file. The `(resolved.lib, name)` key is pushed on the delegation stack.
 *    The sub's RecommendActivity names bubble into the SAME `ctx.produced` (the oracle sees the delegated disposition).
 *    The sub-name itself is NOT produced (REPLACE).
 *  - target on the delegation path (cycle) → set `ctx.runtimeError` + a cycle diagnostic; not recursed.
 *  - UNRESOLVED: a QUALIFIED target whose lib/sub is not in the graph → an `unresolved-cross-lib` diagnostic; a BARE
 *    target not found in the current library → a distinct not-found diagnostic. Leaf; not produced.
 * Returns whether this action contributed at least one production to `ctx.produced` (for the all-guarded-out diagnostic).
 */
function emitAction(
  stmt: ActionStatement,
  viaWhen: string | null,
  qualifier: BlockQualifier | null,
  ctx: Ctx,
  frame: Frame,
  into: TraceNode[],
  nodeId: string,
  guardInfo?: TraceNode["guard"],
): boolean {
  const source = spanOf(stmt.location, frame);
  if (stmt.action.type === "RecommendActivity") {
    const name = recName(stmt.action);
    ctx.produced.push({ recommendation: name, viaWhen, qualifier });
    into.push({
      node: name,
      nodeId,
      kind: "action",
      source,
      evaluated: true,
      ...(guardInfo ? { guard: guardInfo } : {}),
    });
    return true;
  }
  // UseDecision.
  const name = recName(stmt.action);
  const node: TraceNode = {
    node: name,
    nodeId,
    kind: "action",
    source,
    evaluated: true,
    ...(guardInfo ? { guard: guardInfo } : {}),
    children: [],
  };
  into.push(node);
  // Resolve via the shared global resolver (#172). A BARE target resolves against `frame.currentLib`; a QUALIFIED one
  // against its explicit library, over the whole graph. For same-library this returns the byte-identical Decision the
  // old flat covered-library map did.
  const refLib = getRefLibrary(stmt.action.decisionName);
  const resolved = ctx.resolveDecision(frame.currentLib, stmt.action.decisionName);
  if (!resolved) {
    // #236 — no expansion-overflow disposition to distinguish any more (criteria are referenced,
    // not materialized, so a `use decision` target's guard can never "breach the envelope"); an
    // unresolved target is simply not-found.
    // Leaf + diagnostic (don't crash, don't produce a phantom disposition). THREE distinct messages:
    //  - a QUALIFIED target whose library/sub is not in the resolved graph → unresolved-cross-lib;
    //  - a BARE target not found in the CURRENT frame's library → not-found-in-current-lib. Naming `frame.currentLib`
    //    (not "the covered library") is load-bearing: a bare `use decision "Missing"` INSIDE a cross-library sub must
    //    blame the SUB's library, not the covered policy (FIX 2).
    if (refLib) {
      ctx.diagnostics.push(
        `cross-library \`use decision\` ${labelOf(refLib, name)}: target library or decision not found in the resolved graph`,
      );
    } else {
      ctx.diagnostics.push(
        `\`use decision "${name}"\` target not found in library \`${frame.currentLib}\``,
      );
    }
    return false;
  }
  // Cycle guard keyed `(lib,name)` of the RESOLVED owning library (#172) so cross-library `A.Sub`/`B.Sub` can't
  // false-collide. For same-library `resolved.lib === frame.currentLib`, a 1:1 rename of the old bare-name key.
  const subId = idOf(resolved.lib, resolved.decision.name);
  if (ctx.delegationStack.has(subId)) {
    ctx.runtimeError = true;
    // Render the chain by NAME (not the (lib,name) key) so the message is byte-identical to the pre-#172 same-lib text.
    ctx.diagnostics.push(
      `decision delegation cycle: ${[...ctx.delegationStack, subId].map(nameOf).join(" → ")}`,
    );
    return false;
  }
  // Recurse the sub-decision under this action's nodeId; its determinations bubble into ctx.produced. REPLACE: the
  // sub-name itself is NOT produced (a delegation is not a disposition). Push a NEW frame in the SUB'S library + file so
  // its own bare when/guard resolve there (closed-world; the satisfying fact must be qualified `defined by "SubLib"."C"`)
  // and its trace spans point at its file. For same-library the frame is unchanged → byte-identical. try/finally so a
  // throw in the recursion can't poison the delegation stack for sibling branches.
  const subFrame: Frame = { currentLib: resolved.lib, currentFilePath: resolved.filePath };
  const beforeCount = ctx.produced.length;
  ctx.delegationStack.add(subId);
  try {
    walkBranches(
      resolved.decision.body.qualifier,
      resolved.decision.body.statements,
      ctx,
      subFrame,
      node.children!,
      nodeId,
    );
  } finally {
    ctx.delegationStack.delete(subId);
  }
  return ctx.produced.length > beforeCount;
}

function executeBody(
  body: WhenBlockBody,
  viaWhen: string | null,
  ctx: Ctx,
  frame: Frame,
  into: TraceNode[],
  parentId: string,
): void {
  if (ctx.runtimeError) return; // a delegation cycle short-circuits the rest of the walk — no further productions/trace
  if (body.type === "ActionStatement") {
    // Inline single action — the grammar forbids a guard here.
    emitAction(body, viaWhen, null, ctx, frame, into, childId(parentId, "action[0]"));
    return;
  }
  const block: BlockBody = body;
  const isBranch = block.statements.some(
    (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
  );
  if (isBranch) {
    walkBranches(block.qualifier, block.statements as BranchBlock[], ctx, frame, into, parentId);
    return;
  }
  // Action menu (`any:` / `all:` / single).
  let produced = 0;
  let guardExcluded = 0;
  const items = block.statements as ActionStatement[];
  for (let j = 0; j < items.length; j++) {
    if (ctx.runtimeError) return; // a cycle in an earlier menu item short-circuits the rest (no further trace/diagnostic)
    const stmt = items[j];
    const name = recName(stmt.action);
    const nodeId = childId(parentId, `action[${j}]`);
    const g = evalGuard(stmt.guard, ctx, frame);
    if (g.excluded) {
      guardExcluded++;
      into.push({
        node: name,
        nodeId,
        kind: "action",
        source: spanOf(stmt.location, frame),
        evaluated: true,
        guardedOut: true,
        guard: g.info,
      });
      continue;
    }
    if (emitAction(stmt, viaWhen, block.qualifier ?? null, ctx, frame, into, nodeId, g.info))
      produced++;
  }
  // Distinguish "every member was GUARD-EXCLUDED" (a real guarding outcome) from "the menu determined no recommendation"
  // (e.g. a cyclic / unresolved `use decision`, or a sub that itself produced nothing). Only the former is a guarding claim.
  if (block.statements.length > 0 && produced === 0 && !ctx.runtimeError) {
    if (guardExcluded === block.statements.length) {
      ctx.diagnostics.push(
        `every option in the menu under "${viaWhen ?? "otherwise"}" was guarded out — branch produced nothing`,
      );
    } else {
      ctx.diagnostics.push(
        `no option in the menu under "${viaWhen ?? "otherwise"}" determined a recommendation`,
      );
    }
  }
}

function walkBranches(
  qualifier: BlockQualifier | undefined,
  branches: BranchBlock[],
  ctx: Ctx,
  frame: Frame,
  into: TraceNode[],
  parentId: string,
): void {
  if (ctx.runtimeError) return; // a delegation cycle short-circuits the rest of the walk — no further productions/trace
  // `all:` = every matching branch fires; `first:` (or a single-member block) = ordered, first match wins.
  const ordered = qualifier !== "all";
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      const node: TraceNode = {
        node: "otherwise",
        nodeId,
        kind: "otherwise",
        source: spanOf(b.location, frame),
        evaluated: true,
        children: [],
      };
      into.push(node);
      executeBody(b.body, null, ctx, frame, node.children!, nodeId);
      if (ordered) return;
      continue;
    }
    // #224 i.2: a single-ref guard keeps the LEGACY trace (`concept` +
    // `composition`) — byte-identical, no golden drift. A COMPOUND guard is
    // full-evaluated into a `conditionTrace` and OMITS `concept` (its label lives
    // in `node`). `label`/`viaWhen` = the rendered guard (bare name for a single
    // ref = legacy-identical).
    const nodeId = childId(parentId, `when[${i}]`);
    // #236: `describeBranchCondition` renders a criterion ref by its author NAME (it is not
    // expanded), so this `label` — which flows to `ProducedRec.viaWhen`, the EVAL-output path KEs
    // assert execution against — names the criterion (`Eligible`), consistent with the VM display
    // label. A criterion is a named unit end-to-end (eval trace + VM), never an inlined body.
    const label = describeBranchCondition(b.condition, getRefName);
    const soleR = soleRef(b.condition);
    let sat: boolean;
    let node: TraceNode;
    if (soleR) {
      const r = conceptSatisfied(soleR.ref, ctx, frame);
      sat = r.sat;
      node = {
        node: `when ${label}`,
        nodeId,
        kind: "when",
        source: spanOf(b.location, frame),
        concept: getRefName(soleR.ref),
        satisfied: sat,
        evaluated: true,
        facts: r.facts,
        ...(r.composition ? { composition: r.composition } : {}),
        children: [],
      };
    } else {
      const r = evalBranchCondition(b.condition, ctx, frame);
      sat = r.sat;
      node = {
        node: `when ${label}`,
        nodeId,
        kind: "when",
        source: spanOf(b.location, frame),
        satisfied: sat,
        evaluated: true,
        facts: r.facts,
        conditionTrace: r.trace,
        children: [],
      };
    }
    into.push(node);
    if (sat) {
      executeBody(b.body, label, ctx, frame, node.children!, nodeId);
      if (ordered) return; // first match wins — remaining branches are not evaluated.
    }
  }
}

/** #189 Piece 2 (disc 508) — derive the local `{fhirType, system, code}` set for every LOCAL concept in the closure
 *  and index it forward (by concept id) and reverse (by `(fhirType, system, code)`). A concept whose base is
 *  underivable flips `underivable` (a local fact then fails the run loud, never a fabricated verdict). */
function buildLocalMembershipIndex(
  concepts: Map<Id, ConceptEntry>,
  graph: ResolvedCelGraph,
): LocalMembershipIndex {
  const ctx = makeLocalDomainContext(graph);
  const forward = new Map<Id, LocalConceptMember>();
  const reverse = new Map<string, Id>();
  const collisions = new Set<string>();
  for (const [id, entry] of concepts) {
    const res = localMemberOfConcept(
      entry.node,
      { filePath: entry.filePath, entryName: entry.entryName, fallbackLib: entry.fallbackLib },
      ctx,
    );
    if ("notLocal" in res) continue;
    // An underivable concept (missing base) is simply absent from `forward` — a local fact naming it then hits the
    // per-fact "no derivable local code set" guard below (real project → error; inline → presence fallback).
    if ("error" in res) continue;
    forward.set(id, res.member);
    const key = memberKey(res.member.fhirType, res.member.system, res.member.code);
    const prior = reverse.get(key);
    if (prior !== undefined && prior !== id) collisions.add(key); // two DISTINCT concepts claim one set → ambiguous
    else reverse.set(key, id);
  }
  return { forward, reverse, collisions, hasProject: graph.projectRoot !== undefined };
}

/** #189 Piece 3 — the SOURCE-membership reverse index: `(fhirType, system, code)` → the concept id(s) whose source
 *  set contains it, derived from the SAME mechanical set the FHIR/CQL lane emits (`sourceMembersOfConcept`). A
 *  MULTIMAP (not single-owner like the local index): two concepts may legitimately `coded from` the same reference
 *  VS and share its stub coding — BOTH populate, matching `$apply`'s two independent retrieves (charter §4 "the code
 *  populates whichever rep(s) it is a member of"; the local-local collision refuse does NOT extend to source overlap,
 *  which is well-formed). The fhirType in the key is the POSREP's `type is` (e.g. ServiceRequest). */
function buildSourceMembershipIndex(
  concepts: Map<Id, ConceptEntry>,
  graph: ResolvedCelGraph,
): Map<string, Id[]> {
  const base = makeLocalDomainContext(graph).base;
  const registry = graph.crlRegistry;
  const reverse = new Map<string, Id[]>();
  for (const [id, entry] of concepts) {
    for (const m of sourceMembersOfConcept(entry.node, base, registry)) {
      const key = memberKey(m.fhirType, m.system, m.code);
      const arr = reverse.get(key) ?? [];
      arr.push(id);
      reverse.set(key, arr);
    }
  }
  return reverse;
}

function runCase(
  c: CELCase,
  decisions: Map<string, Decision>,
  facts: Map<string, CELFact>,
  coveredLib: string,
  filePath: string,
  concepts: Map<Id, ConceptEntry>,
  localIndex: LocalMembershipIndex,
  sourceIndex: Map<string, Id[]>,
  resolveDecision: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined,
  // #236 — per-library criterion tables for reference-and-evaluate (threaded onto Ctx; a criterion
  // guard resolves its body here at eval time instead of being inline-expanded up front).
  criterionTables: Map<string, CriterionTable>,
): CaseRun {
  const diagnostics: string[] = [];
  let subjectFact: string | undefined;
  const factRefs: string[] = [];
  // #189 Piece 2 (disc 508 D5(3)) — fact-refs carrying an `absent`/`negative` intent modifier. On a LOCAL
  // determination fact this silently inverts membership (the code still matches), so it is rejected loud below.
  const factRefsWithIntent = new Set<string>();
  let result: CELResultField | undefined;
  for (const b of c.body) {
    if (b.type === "CELSubjectField") subjectFact = b.factName;
    else if (b.type === "CELFactRefField") {
      factRefs.push(b.factName);
      if (b.intent !== undefined) factRefsWithIntent.add(b.factName);
    } else if (b.type === "CELResultField") result = b; // v1: single decision-result assertion
  }

  // #189 Piece 2 (disc 508) — build the directly-populated concept set by CODE-DRIVEN membership (compartment-global,
  // §4). A fact's `code` — not its `defined by` NAME — decides which local concept it populates (possibly a DIFFERENT
  // one than it names), exactly as `$apply` populates by `(type, coding)`. The name serves only to (a) default a bare
  // fact's code and (b) fix the fact's resource type. `directFacts`/`factsByConcept` are derived from the SAME
  // accepted result, so a dropped non-member never shows in the trace as concept evidence.
  const directFacts = new Set<Id>();
  const factsByConcept = new Map<Id, string[]>();
  // #189 Piece 3 (Option C, disc 512) — the value-reading boolean concepts (member-existence interfaces) in the
  // closure, and the boolean own values facts populate them with. Classification is the SHARED
  // `isValueReadingBooleanConcept` over each concept's OWN-LIBRARY siblings (the member-existence referent is
  // same-library), so the CRE agrees with the emitter/validator on which concepts read their value.
  const conceptsByLib = new Map<string, Concept[]>();
  for (const e of concepts.values()) {
    const arr = conceptsByLib.get(e.lib) ?? [];
    arr.push(e.node);
    conceptsByLib.set(e.lib, arr);
  }
  const valueReadingIds = new Set<Id>();
  for (const [cid, e] of concepts) {
    if (isValueReadingBooleanConcept(e.node, conceptsByLib.get(e.lib) ?? [])) valueReadingIds.add(cid);
  }
  const ownBoolValues = new Map<Id, boolean[]>();
  const populate = (id: Id, fn: string, boolVal?: boolean): void => {
    directFacts.add(id);
    const arr = factsByConcept.get(id) ?? [];
    arr.push(fn);
    factsByConcept.set(id, arr);
    // #189 Piece 3 (Option C, disc 512/513) — a value-reading concept's own-arm reads the fact's boolean value. Record
    // a boolean; a VALUELESS populate (bare fact, or a non-boolean `value is`) records nothing → the own-arm reads it
    // false (0 own values), exactly as `$apply`'s `Last(where O.value is FHIR.boolean)` = null → false, so both lanes
    // AGREE (Deny). It is an AUTHORING error, gated LOUD by the validator (+ emitter diagnostic) at author time — NOT a
    // runtime refusal here (that would diverge from `$apply`'s verdict). Surface a non-fatal debuggability diagnostic.
    if (valueReadingIds.has(id)) {
      if (boolVal !== undefined) {
        const vs = ownBoolValues.get(id) ?? [];
        vs.push(boolVal);
        ownBoolValues.set(id, vs);
      } else {
        const e = concepts.get(id);
        diagnostics.push(
          `fact "${fn}" populates value-reading concept ${e ? labelOf(e.lib, e.node.name) : id} with no boolean ` +
            `value — its own-arm reads false (matching \`$apply\`). State \`value is true\` / \`value is false\` to ` +
            `assert its determination (the validator errors on a bare/non-boolean direct assertion).`,
        );
      }
    }
  };
  let membershipError: string | undefined;
  for (const fn of factRefs) {
    if (fn === subjectFact) continue;
    const fact = facts.get(fn);
    if (!fact) {
      diagnostics.push(`unknown fact "${fn}"`);
      continue;
    }
    const db = fact.body.find((x): x is CELDefinedByField => x.type === "CELDefinedByField");
    if (!db) continue; // a fact with no `defined by` satisfies no concept
    const name = getRefName(db.ref);
    if (name === "Patient") continue; // subject-type fact never satisfies a clinical concept
    const namedId = idOf(getRefLibrary(db.ref) ?? coveredLib, name);
    const namedEntry = concepts.get(namedId);
    const isLocalShape =
      !!namedEntry &&
      typeof namedEntry.node.code === "string" &&
      namedEntry.node.code.trim() !== "" &&
      typeof namedEntry.node.conceptType === "string";
    const codeField = fact.body.find((x): x is CELCodeField => x.type === "CELCodeField");
    // #189 Piece 3 (Option C, disc 512) — the fact's boolean `value is`, if any (non-boolean → undefined). A
    // value-reading concept's own-arm reads this; a fact carrying it is recorded per populated concept in `populate`.
    const valueField = fact.body.find((x): x is CELValueField => x.type === "CELValueField");
    const boolVal = typeof valueField?.value === "boolean" ? valueField.value : undefined;

    // D5(3) backstop: an `absent`/`negative` intent modifier on a LOCAL determination fact inverts its clinical
    // meaning, but membership sees only the code → the concept would compute PRESENT (the opposite). Refuse loud
    // (negation semantics = #257); mirrors the validator error for a direct `run_decision` caller that skips it.
    if (isLocalShape && factRefsWithIntent.has(fn)) {
      membershipError =
        `fact "${fn}" names a local determination concept but is referenced with an intent modifier — a negated/` +
        `absent local fact would compute its concept PRESENT (the opposite); rejected (negation semantics = #257).`;
      break;
    }

    // #189 (a) (disc 510) backstop — a fact naming a RESOURCELESS DERIVED concept (no `code is`, no source binding)
    // is REJECTED: such a concept has no FHIR resource, so a direct name-assertion has no `$apply` equivalent (the
    // `asserted ∪ composed` magic this slice removes). The validator is the primary gate; the CRE backstops a direct
    // `run_decision` caller that skips it. The composite is still satisfiable via its COMPOSITION (assert its
    // operands) — only the direct name-assertion is refused. Loud (not silent don't-populate): a dropped assertion
    // would confuse.
    if (namedEntry && isResourcelessDerived(namedEntry.node)) {
      membershipError =
        `fact "${fn}" names concept "${name}", which is read-only — it has no representation (no \`code is\` and ` +
        `no source binding) and thus no FHIR resource, so it cannot be directly asserted; \`$apply\` has no ` +
        `equivalent. Assert its operands instead, or give it a \`code is\` + \`type is\` (asserted ∪ composed ` +
        `removed — #189).`;
      break;
    }

    // Remaining non-local facts — name-based population is preserved (Piece 2 does not change these). Three cells
    // reach here (panel disc 511, Claude #3): (1) a REMOTE fact (`coded from`/`source representation`, no `code is`)
    // — the Piece-3 lane, where a fact SUPPLIES a source record; (2) a BARE-TYPE fact (`defined by <FhirType>`,
    // `namedEntry` undefined); (3) a MALFORMED-LOCAL cell — a `code is` that is PRESENT-but-empty, or present with NO
    // `type is` (implicitly Observation per `IMPLICIT_LOCAL_TYPE`, which this CEL lane does not yet honor). Cells (1)
    // and (2) are correct. Cell (3) is a RESIDUAL CRE-vs-`$apply` divergence (the CRE satisfies it by name; the
    // emitter warns `unsupported-yet` / errors on empty-code and emits nothing) — pre-existing, NOT (a)'s scope (a
    // `code is` concept is assertable per charter §3; the fix is honoring the implicit type / rejecting empty code,
    // its own slice #299). Do NOT read this as "resource-bearing": cell (3) has a representation but no resource yet.
    if (!isLocalShape) {
      // #189 Piece 3 — SOURCE membership (compartment-global, the code decides): a fact carrying a coded token —
      // typically a bare `defined by "<FhirType>"` + `code is <member>`, whose fhirType is `name` — populates EVERY
      // concept whose SOURCE set contains `(name, system, code)`, the SAME mechanical set the FHIR ValueSet + CQL
      // retrieve use (a covered ServiceRequest → the `Covered Device` source rep). ADDITIVE: a fact that matches a
      // source set is intercepted here; anything else (a non-member code, or a top-level `coded from` concept whose
      // source membership is a later slice) falls through UNCHANGED to the existing name-population below — so a
      // non-covered ServiceRequest still leaves `Covered Device` unpopulated (name-populates a concept-less type id
      // that nothing reads → not covered), matching `$apply`, without regressing the pre-Piece-3 cells.
      if (codeField) {
        const scls = classifyCanonicalToken(codeField.value);
        if (scls.kind === "coded") {
          const owners = sourceIndex.get(memberKey(name, scls.parts.system ?? "", scls.parts.code));
          if (owners && owners.length > 0) {
            for (const o of owners) populate(o, fn, boolVal);
            continue;
          }
        }
      }
      populate(namedId, fn, boolVal);
      continue;
    }

    // LOCAL concept (bare OR coded): its `{system, code}` set must be DERIVABLE. `canonicalBase` is REQUIRED
    // (charter §4 — no exception, no name-presence fallback): a real PROJECT reads `crl.canonicalBase`; an INLINE/
    // projectless harness graph declares one (`graph.canonicalBase`) or gets the default `INLINE_HARNESS_BASE`, so
    // membership runs the SAME way everywhere. A concept whose member still cannot be derived (e.g. an empty
    // `code is`) fails the run LOUD — never a fabricated presence verdict.
    const namedMember = localIndex.forward.get(namedId);
    if (!namedMember) {
      membershipError =
        `local concept "${name}" has no derivable local code set (missing \`crl.canonicalBase\`, or empty ` +
        `\`code is\`); cannot evaluate fact "${fn}" — refusing to fabricate a verdict (canonicalBase is required, ` +
        `charter §4).`;
      break;
    }
    // BARE local fact (derivable base) — the DEGENERATE case: a member of the named concept by construction.
    if (!codeField) {
      populate(namedId, fn, boolVal);
      continue;
    }
    // AUTHORED code on a LOCAL fact = the membership/data input (code-driven, compartment-global lookup below).
    // PIECE-3: for a both-representation concept (`code is` + `source representation`) this checks the LOCAL-exact
    // set only; a source-set code is a non-member here (dropped). That is deferred-correct today (general source-rep
    // emit is deferred), but Piece 3 must add source-set membership so such a code populates via the source arm.
    const cls = classifyCanonicalToken(codeField.value);
    if (cls.kind !== "coded") {
      // Malformed (the emitter skips it → no resource → `$apply` false) or system-less (never matches a
      // system-qualified retrieve) → NON-member. The concept goes false (closed-world), matching `$apply`.
      diagnostics.push(
        `fact "${fn}" authors a ${cls.kind} code \`${codeField.value}\` — not a member of any local concept set; ` +
          `it populates nothing (closed-world → the named concept is false unless another fact populates it).`,
      );
      continue;
    }
    // Reverse-lookup by the EMITTED resource's `(type, system, code)` — type from the named concept (the fact is
    // emitted as that resource type), code the authored token. The owner may differ from the named concept.
    const key = memberKey(namedMember.fhirType, cls.parts.system ?? "", cls.parts.code);
    if (localIndex.collisions.has(key)) {
      // Two distinct concepts claim this set (a broader-than-closure registry ambiguity) — refuse rather than
      // last-writer-wins pick one arbitrarily.
      membershipError =
        `fact "${fn}" code \`${cls.parts.system}|${cls.parts.code}\` (type ${namedMember.fhirType}) is claimed by ` +
        `more than one local concept — ambiguous membership; refusing to fabricate a verdict.`;
      break;
    }
    const ownerId = localIndex.reverse.get(key);
    if (ownerId) {
      populate(ownerId, fn, boolVal);
    } else {
      diagnostics.push(
        `fact "${fn}" code \`${cls.parts.system}|${cls.parts.code}\` is not a member of any local concept set ` +
          `(named "${name}"); it populates nothing (closed-world → the named concept is false).`,
      );
    }
  }

  if (membershipError) {
    return {
      case: c.name,
      decision: null,
      status: "error",
      expected: null,
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, membershipError],
      conceptTruth: [],
    };
  }

  if (!result || result.value.type !== "CELBranchResult") {
    return {
      case: c.name,
      decision: null,
      status: "error",
      expected: null,
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, "v1 CRE supports only a decision-branch `result is`"],
      conceptTruth: [],
    };
  }
  const decisionName = result.leafName;
  const expectedBranch = result.value.branchName;
  // #236 — no criterion-expansion-overflow disposition any more: a criterion guard is evaluated by
  // reference (memoized), never materialized, so a decision can never "exceed the envelope".
  const decision = decisions.get(decisionName);
  if (!decision) {
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected: { leaf: decisionName, branch: expectedBranch },
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, `decision "${decisionName}" not found in the covered library`],
      conceptTruth: [],
    };
  }

  const ctx: Ctx = {
    directFacts,
    factsByConcept,
    valueReadingIds,
    ownBoolValues,
    concepts,
    cache: new Map(),
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(),
    produced: [],
    trace: [],
    diagnostics,
    resolveDecision,
    criterionTables,
    criterionCache: new Map(),
    criterionStack: new Set(),
    tracedCriteria: new Set(),
    rootLib: coveredLib,
    // Seed the delegation cycle guard with `(rootLib, rootDecisionName)` — the `(lib,name)` re-key (#172). For the
    // same-library recursion this is a 1:1 rename of the old bare-name seed.
    delegationStack: new Set([idOf(coveredLib, decisionName)]),
    runtimeError: false,
  };
  // Root frame: the covered library + its file. A same-library recursion keeps this frame; a cross-library `use
  // decision` pushes the sub's `{ currentLib, currentFilePath }` for its body (#172).
  const rootFrame: Frame = { currentLib: coveredLib, currentFilePath: filePath };
  walkBranches(decision.body.qualifier, decision.body.statements, ctx, rootFrame, ctx.trace, "");

  if (ctx.runtimeError) {
    // A delegation cycle (or other runtime fault) makes the produced set unreliable — report `error`, not pass/fail,
    // and DISCARD produced (a partial set would otherwise leak into the view-model's scenario summary).
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected: { leaf: decisionName, branch: expectedBranch },
      produced: [],
      trace: ctx.trace,
      diagnostics: ctx.diagnostics,
      conceptTruth: [], // a partial/unreliable state — a truth map off it would mislead
    };
  }

  const producedNames = new Set(ctx.produced.map((p) => p.recommendation));
  const status: CaseRun["status"] = producedNames.has(expectedBranch) ? "pass" : "fail";
  // #187 Todo 2: per-concept case truth. Computed AFTER the runtimeError check (produced/trace are complete + status
  // reads only ctx.produced) and via the isolated `truthOf`, so it cannot change any existing output.
  return {
    case: c.name,
    decision: decisionName,
    status,
    expected: { leaf: decisionName, branch: expectedBranch },
    produced: ctx.produced,
    trace: ctx.trace,
    diagnostics: ctx.diagnostics,
    conceptTruth: collectConceptTruth(ctx),
  };
}

/** Run every case in a resolved CEL graph against its covered CRL decision(s). */
export function runCel(graph: ResolvedCelGraph): CelRunResult {
  const errors: string[] = [];
  if (!graph.cel) return { success: false, runs: [], errors: ["CEL did not parse"] };
  if (!graph.coversTarget)
    return { success: false, runs: [], errors: ["`covers` target unresolved"] };

  const coveredLib = graph.coversTarget.name;
  if (coveredLib === null) {
    return { success: false, runs: [], errors: ["covered library has no name"] };
  }
  const rawDecisions: Decision[] = [];
  for (const s of graph.coversTarget.ast.statements) {
    if (s.type === "Decision") rawDecisions.push(s);
  }

  // #236 — per-library criterion tables for REFERENCE-and-evaluate. NO up-front expansion: the
  // decisions are walked RAW (a criterion guard resolves its body via `ctx.criterionTables` at eval
  // time, memoized), so a doubling-DAG criterion no longer materializes the CRE walk tree. Threaded
  // into Ctx below; the view-model shares the same tables (expandDecisions.ts).
  const criterionTablesByLib = buildCriterionTablesForGraph(graph);
  // name → decision (RAW; no expansion). Mirrors the map the old `expandCoveredDecisions` returned,
  // minus the materialization — first-write-wins (a duplicate decision name is a validation error).
  const decisions = new Map<string, Decision>();
  for (const d of rawDecisions) if (!decisions.has(d.name)) decisions.set(d.name, d);

  // Global `(lib,name)` decision map + the shared resolver over the WHOLE graph (#172). LOCAL-FIRST precedence matches
  // the provenance indexer (indexer.ts:11-13). The covered library's own decisions are added last → authoritative for
  // its name (and the only source on the inline-graph path where crlRegistry is absent). The map holds RAW decisions;
  // `wrapResolveWithExpansion` expands each resolved sub-decision against its target library's table — so a same-library
  // `use decision` yields a STRUCTURALLY-identical guard to the top-level `decisions` map (fresh nodes; the trace zip is
  // structural, not identity-based, per disc 303 Q3), and a cross-library one binds in its own lib.
  const globalDecisionMap = buildGlobalDecisionMap({
    crlRegistry: graph.crlRegistry,
    coveredLib,
    coveredFilePath: graph.coversTarget.filePath,
    coveredStatements: rawDecisions,
  });
  // #236 — no expansion wrapper: sub-decisions resolve RAW; their criterion guards evaluate by
  // reference in the sub-frame (same as the root). `criterionTablesByLib` covers every library.
  const resolveDecision = makeResolveDecision(globalDecisionMap);

  // Concept definitions across the resolved closure — needed to evaluate
  // `defined as` operands (bare = local to the defining library; qualified =
  // an explicit library). Built from the covered library (covers the inline-
  // graph path where crlRegistry is absent) plus every registry entry when
  // present. Precedence: package first, then local, then the covered library
  // last — so a local/covered concept wins over a same-named package library.
  const concepts = new Map<Id, ConceptEntry>();
  const addConcepts = (libName: string, ast: CRL, filePath: string, entryName: string | null): void => {
    for (const s of ast.statements) {
      if (s.type === "Concept")
        concepts.set(idOf(libName, s.name), {
          node: s,
          lib: libName,
          filePath,
          entryName,
          fallbackLib: ast.library.name,
        });
    }
  };
  if (graph.crlRegistry) {
    for (const e of graph.crlRegistry.byNamePackage.values())
      if (e.name) addConcepts(e.name, e.ast, e.filePath, e.name);
    for (const e of graph.crlRegistry.byNameLocal.values())
      if (e.name) addConcepts(e.name, e.ast, e.filePath, e.name);
  }
  addConcepts(coveredLib, graph.coversTarget.ast, graph.coversTarget.filePath, graph.coversTarget.name);

  // #189 Piece 2 (disc 508) — build the local membership index ONCE: derive each local concept's `{system, code}`
  // set via the SAME resolver the emitter/CQL lane uses, so the tree lane and `$apply` agree by construction.
  const localIndex = buildLocalMembershipIndex(concepts, graph);
  const sourceIndex = buildSourceMembershipIndex(concepts, graph);

  const facts = new Map<string, CELFact>();
  for (const s of graph.cel.statements) {
    if (s.type === "CELFact") facts.set(s.name, s);
  }

  const filePath = graph.coversTarget.filePath;
  const runs: CaseRun[] = [];
  for (const s of graph.cel.statements) {
    if (s.type === "CELCase")
      runs.push(
        runCase(
          s,
          decisions,
          facts,
          coveredLib,
          filePath,
          concepts,
          localIndex,
          sourceIndex,
          resolveDecision,
          criterionTablesByLib,
        ),
      );
  }
  return { success: true, runs, errors };
}
