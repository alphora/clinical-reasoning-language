/**
 * CRE — CRL Clinical Reasoning Engine (#115), v1.
 *
 * A headless, authoring-time interpreter: evaluate a CRL `decision` over a CEL
 * `case`'s facts, produce a recommendation set + trace, and check the case's
 * `result is` assertion (the oracle). It MIRRORS the FHIR/CQL engine at the
 * CRL/CEL level for fast authoring feedback — it is NOT the engine.
 *
 * SCOPE:
 *  - Concept satisfaction is ASSERTED + COMPOSED:
 *      • asserted — a concept is satisfied when ≥1 of the case's (non-subject)
 *        facts is `defined by` it (resolved to a (library, name) identity);
 *      • composed (#126) — a concept with a `defined as` body is satisfied when
 *        its boolean composition over operand concepts evaluates true:
 *        `sem-and` = all, `sem-or` = any, `sem-not` = not (closed-world: absence
 *        ⇒ operand false), bare alias = the aliased concept, nesting supported.
 *      A concept that is BOTH directly `defined by` a fact AND `defined as` is
 *      satisfied if EITHER holds (asserted ∪ composed); the composition is still
 *      walked on the asserted path so its trace + diagnostics surface.
 *    Operand refs: a BARE operand resolves within the DEFINING concept's library
 *      (CRL's local-namespace rule); cross-library operands must be qualified. An
 *      operand resolving to neither a concept nor a fact emits a diagnostic
 *      (silent-false under `sem-not` would invert to a spurious `true`). Cyclic
 *      `defined as` (validator-rejected) terminates with a diagnostic and is not
 *      memoized. Still NOT evaluated (deferred): `definition is` predicates
 *      (count/temporal/value), `coded from` / external value sets.
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
  DefinedAsComposition,
  DefinedAsExists,
  Location,
  ReferenceName,
  WhenBlockBody,
} from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { soleRef, describeBranchCondition } from "../ast/branchCondition";
import type { BranchCondition } from "../ast/types";
// #224 ii.1c — expand a decision's criterion-guard refs before evaluation. The envelope is
// GLOBAL (materialization bounds eval too, and `runCel` runs NO semantic validation — a
// cyclic/undefined table can reach here directly), so a breach degrades GRACEFULLY to
// status:"error" rather than throwing out of the run. The wiring is SHARED with the view-
// model (expandDecisions.ts) so run + render expand from the SAME table source (the
// both-sides-expanded trace-zip invariant, disc 303 Q3).
import type { CriterionExpansionError } from "../ast/criterionExpansion";
import {
  buildCriterionTablesForGraph,
  expandCoveredDecisions,
  wrapResolveWithExpansion,
} from "./expandDecisions";
import type { CELCase, CELDefinedByField, CELFact, CELResultField } from "../cel/ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
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
 *  composite was (un)satisfied (which operand failed), for adversarial review. */
export interface CompositionTrace {
  op: "sem-and" | "sem-or" | "sem-not" | "ref";
  satisfied: boolean;
  concept?: string; // op === "ref"
  operands?: CompositionTrace[]; // op === "sem-and" | "sem-or"
  operand?: CompositionTrace; // op === "sem-not"
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
}

interface ConceptEval {
  sat: boolean;
  composition?: CompositionTrace;
}

interface Ctx {
  /** Concepts directly satisfied by a case fact (`defined by`). */
  directFacts: Set<Id>;
  factsByConcept: Map<Id, string[]>;
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
  /** #224 ii.1c — sub-decisions whose criterion guard breached the GLOBAL envelope (populated
   *  by `wrapResolveWithExpansion` as `resolveDecision` is called). Keyed `idOf(lib,name)`. A
   *  `use decision` whose target is here is an OVERFLOW (status:"error"), NOT a not-found. */
  subExpansionErrors: Map<string, CriterionExpansionError>;
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
  const direct = ctx.directFacts.has(id);
  let composition: CompositionTrace | undefined;
  let composed = false;
  const def = entry?.node.definition;
  if (def && def.type === "DefinedAsDefinition") {
    composition = walkDefinedAs(def.body, entry!.lib, ctx);
    composed = composition.satisfied;
  }
  ctx.stack.delete(id);
  const result: ConceptEval = { sat: direct || composed, ...(composition ? { composition } : {}) };
  if (ctx.cycleHits === cyclesBefore) ctx.cache.set(id, result); // memoize cycle-free evals only
  return result;
}

function walkDefinedAs(
  body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition,
  lib: string,
  ctx: Ctx,
): CompositionTrace {
  // `exists ("X")` evaluation (existence over a possibly-non-boolean concept, closed-world) is
  // Todo 2/3 semantics, not increment 1. Do NOT throw — `walkDefinedAs` runs inside the
  // read-only `runCel` path, which has no converting catch, so a throw would crash
  // `run_decision`/viewModel. Instead set `runtimeError` (⇒ `status:"error"`, produced
  // discarded) so the run does NOT report an authoritative pass/fail derived from an
  // UNEVALUATED existence expression — a plain `satisfied:false` would let a caller reading
  // only `status` accept a fabricated result — plus a diagnostic, plus an unsatisfied leaf so
  // the trace is well-formed. On the OFF-path `truthOf` route this runs in an isolated scratch
  // ctx (runtimeError is a by-value boolean copied by the `{...ctx}` spread), so it never
  // pollutes the real run — the concept's off-path truth is just `false`. No current content
  // uses `exists`, so this never fires in practice.
  if (body.type === "DefinedAsExists") {
    ctx.runtimeError = true;
    ctx.diagnostics.push(
      `\`defined as exists\` (${labelOf(getRefLibrary(body.ref) ?? lib, getRefName(body.ref))}) is not yet ` +
        `evaluated — existence lowering lands in Todo 2/3 of the concept-model redesign; run marked error`,
    );
    return { op: "ref", concept: getRefName(body.ref), satisfied: false };
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
 * writers of `produced`/`trace`/`delegationStack`; `runtimeError` has ONE additional writer reachable from `evalConcept`
 * — `walkDefinedAs` sets it for an unlowered `defined as exists` (concept-model Todo 1). Isolation still holds: the
 * scratch ctx below spreads `{...ctx}`, so its `runtimeError` is a fresh by-value boolean — an off-path exists marks the
 * SCRATCH errored (discarded) and never the real run. So an eager off-path truth is unaffected (just `false`). Keep it
 * that way — any NEW `runtimeError` writer reachable from `evalConcept` must likewise be neutralized by this spread.
 */
function truthOf(id: Id, ctx: Ctx): ConceptEval {
  return evalConcept(id, {
    ...ctx,
    diagnostics: [],
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(ctx.reportedUnresolved),
  });
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
    rows.push({ lib: entry.lib, name: entry.node.name, satisfied: truthOf(id, ctx).sat });
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
    // #224 ii TRIPWIRE: a criterion ref must be replaced by its condition at the
    // expansion seam BEFORE evaluation. Reaching the CRE means the seam was missed —
    // throw LOUDLY rather than mis-evaluate it as an (absent → false, or a stray
    // fact → true) concept. This is exactly the silent-wrong-answer the distinct
    // node type exists to make impossible.
    throw new Error(
      `internal: un-expanded criterion reference "${getRefName(cond.ref)}" reached evalBranchCondition — criterion expansion must run before the CRE`,
    );
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

// #224 ii.2 — test-only export. `evalBranchCondition` is the highest-stakes STRICT tripwire
// site (run.ts:444 — the "silent-wrong-answer" case) and, unlike the three `branchCondition.ts`
// collector sites, is a non-exported function unreachable from the public API without bypassing
// the expansion seam. Exported solely so the ii.2 tripwire battery can pin that a raw
// un-expanded `BranchConditionCriterionRef` throws here. NOT for production use.
export const __evalBranchConditionForTest = evalBranchCondition;

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
    // #224 ii.1c — DISTINGUISH an envelope OVERFLOW from a genuine not-found: the resolver
    // returns `undefined` for both, but a sub whose guard breached the criterion envelope was
    // recorded in `subExpansionErrors` (keyed by the resolved owning lib — `refLib` for a
    // qualified ref, else the caller's frame). An overflow is a RUNTIME error (status:"error"),
    // not a missing target — report it precisely and stop the walk (mirrors the delegation-cycle
    // disposition), rather than silently evaluating the delegation as an empty production.
    const overflow = ctx.subExpansionErrors.get(idOf(refLib ?? frame.currentLib, name));
    if (overflow) {
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `\`use decision "${name}"\` cannot be evaluated: its guard exceeds the criterion-expansion envelope (${overflow.reason}${overflow.detail?.name ? `: "${overflow.detail.name}"` : ""})`,
      );
      return false;
    }
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
    // #224 ii.3 — MUST stay marker-BLIND (no `{ markerAware: true }`): this `label` flows to
    // `ProducedRec.viaWhen` (the EVAL-output path the authoring kit teaches KEs to assert
    // execution paths against). Name-replacing it would change `viaWhen` from the expansion to the
    // criterion name — an eval/identity change + silent breakage of existing path assertions. Only
    // the VM DISPLAY label (viewModel.ts) is marker-aware; the cockpit reads the VM, not this trace.
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

function runCase(
  c: CELCase,
  decisions: Map<string, Decision>,
  facts: Map<string, CELFact>,
  coveredLib: string,
  filePath: string,
  concepts: Map<Id, ConceptEntry>,
  resolveDecision: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined,
  // #224 ii.1c — covered decisions whose criterion guard breached the GLOBAL expansion
  // envelope; a case targeting one gets a precise status:"error" (not the generic
  // "not found", which the absent expanded entry would otherwise trigger).
  decisionExpansionErrors: Map<string, CriterionExpansionError>,
  // #224 ii.1c — SUB-decisions (`use decision` targets) whose guard breached the envelope
  // (populated lazily by the resolver wrapper); consulted in `emitAction` so an overflow
  // delegation reports status:"error" instead of a misleading not-found.
  subExpansionErrors: Map<string, CriterionExpansionError>,
): CaseRun {
  const diagnostics: string[] = [];
  let subjectFact: string | undefined;
  const factRefs: string[] = [];
  let result: CELResultField | undefined;
  for (const b of c.body) {
    if (b.type === "CELSubjectField") subjectFact = b.factName;
    else if (b.type === "CELFactRefField") factRefs.push(b.factName);
    else if (b.type === "CELResultField") result = b; // v1: single decision-result assertion
  }

  // Build the directly-asserted concept set from the case's clinical (non-subject) facts.
  const directFacts = new Set<Id>();
  const factsByConcept = new Map<Id, string[]>();
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
    const i = idOf(getRefLibrary(db.ref) ?? coveredLib, name);
    directFacts.add(i);
    const arr = factsByConcept.get(i) ?? [];
    arr.push(fn);
    factsByConcept.set(i, arr);
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
  // #224 ii.1c — a covered decision whose guard exceeded the criterion-expansion envelope
  // can't be evaluated; report it precisely (before the generic not-found path below).
  const expansionError = decisionExpansionErrors.get(decisionName);
  if (expansionError) {
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected: { leaf: decisionName, branch: expectedBranch },
      produced: [],
      trace: [],
      diagnostics: [
        ...diagnostics,
        `decision "${decisionName}" cannot be evaluated: its guard exceeds the criterion-expansion envelope (${expansionError.reason}${expansionError.detail?.name ? `: "${expansionError.detail.name}"` : ""})`,
      ],
      conceptTruth: [],
    };
  }
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
    concepts,
    cache: new Map(),
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(),
    produced: [],
    trace: [],
    diagnostics,
    resolveDecision,
    subExpansionErrors,
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

  // #224 ii.1c — per-library criterion tables + expand the top-level covered decisions'
  // criterion guards. The envelope is GLOBAL (`expandDecisionCriteria` materializes the tree
  // the CRE walks); a breach degrades to a per-case status:"error" (recorded in
  // `decisionExpansionErrors`, surfaced in runCase) rather than throwing. Criterion-free
  // decisions pass through by identity. Wiring shared with the view-model (expandDecisions.ts).
  const criterionTablesByLib = buildCriterionTablesForGraph(graph);
  const coveredTable = criterionTablesByLib.get(coveredLib) ?? new Map();
  const { decisions, errors: decisionExpansionErrors } = expandCoveredDecisions(rawDecisions, coveredTable);

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
  const { resolve: resolveDecision, errors: subExpansionErrors } = wrapResolveWithExpansion(
    makeResolveDecision(globalDecisionMap),
    criterionTablesByLib,
  );

  // Concept definitions across the resolved closure — needed to evaluate
  // `defined as` operands (bare = local to the defining library; qualified =
  // an explicit library). Built from the covered library (covers the inline-
  // graph path where crlRegistry is absent) plus every registry entry when
  // present. Precedence: package first, then local, then the covered library
  // last — so a local/covered concept wins over a same-named package library.
  const concepts = new Map<Id, ConceptEntry>();
  const addConcepts = (libName: string, ast: CRL): void => {
    for (const s of ast.statements) {
      if (s.type === "Concept") concepts.set(idOf(libName, s.name), { node: s, lib: libName });
    }
  };
  if (graph.crlRegistry) {
    for (const e of graph.crlRegistry.byNamePackage.values())
      if (e.name) addConcepts(e.name, e.ast);
    for (const e of graph.crlRegistry.byNameLocal.values()) if (e.name) addConcepts(e.name, e.ast);
  }
  addConcepts(coveredLib, graph.coversTarget.ast);

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
          resolveDecision,
          decisionExpansionErrors,
          subExpansionErrors,
        ),
      );
  }
  return { success: true, runs, errors };
}
