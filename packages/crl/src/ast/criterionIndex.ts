// #236/#274 — the CRITERION INDEX: the shared primitive that lets the emit / CQL / CRE
// seams LOWER a criterion reference to a NAMED define reference instead of INLINE-EXPANDING
// (materializing) its body into the DNF. One entry per distinct criterion; consumed by the
// three lowering seams (FHIR emit guard-lowering, CQL define emission, the CRE evaluator).
//
// Design of record: docs/emit-236-274-criterion-lowering-design.md §3 A/B.
//
// Contrast `criterionExpansion.ts`, which MATERIALIZES — it clones a fresh subtree per
// criterion use, so N uses of one criterion carrying an `or` multiply into the parent's
// DNF (the #236 exponential blow-up). This index does the OPPOSITE: it records, ONCE per
// distinct criterion, everything a consumer needs to emit/evaluate a REFERENCE to it —
// so N uses become N references to one define (tree → DAG collapse). Every derived figure
// here is computed with MEMOIZATION (each criterion analysed once), so a diamond/doubling
// DAG is LINEAR, not 2^k, and needs no atom cap to stay bounded (unlike the re-walking
// `branchConditionConceptRefsFollowingCriteria`).

import {
  buildCriterionTable,
  CRITERION_MAX_DEPTH,
  type CriterionTable,
} from "./criterionExpansion";
import type { BranchCondition, BranchConditionRef, Criterion, Statement } from "./types";
import { getRefName } from "./types";

/** Depth at which a criterion-dependency chain is FLAGGED `status: "depth-exceeded"`. Reuses the
 *  expansion engine's alias-chain bound; post-#236 the emit tree no longer materializes, so this is
 *  now only a DEGRADED-STATUS LABEL. It is computed POST-HOC (on unwind, `analyze`) — it does NOT
 *  truncate the closure (a `depth-exceeded` entry still carries its COMPLETE `recursiveAtomClosure`)
 *  and does NOT cap the recursion. Recursion depth is instead bounded by MEMOIZATION (each distinct
 *  criterion is analysed once) to O(longest simple dependency chain) ≤ the number of distinct
 *  criteria — single digits in real artifacts, and the intended nesting bound is this constant. A
 *  chain deeper than the JS call stack is therefore a THEORETICAL stack overflow on pathological
 *  unvalidated input, unreachable in practice and deliberately NOT capped, because provenance wants
 *  the complete closure (a hard depth cutoff would reintroduce the deep-concept under-reporting #236
 *  removed). disc 420. */
export const CRITERION_INDEX_MAX_DEPTH = CRITERION_MAX_DEPTH;

/** Why an entry's derived facts may be incomplete. `ok` = fully resolved. `cycle` = the
 *  criterion participates in a dependency cycle (also a validator `criterion-cycle` error —
 *  the index only needs to not hang and to flag it). `undefined-dependency` = the body
 *  references a criterion name absent from the table (also a `criterion-misuse`/unresolved
 *  error upstream). `depth-exceeded` = dependency nesting beyond `CRITERION_INDEX_MAX_DEPTH`.
 *  A non-`ok` entry still carries best-effort `recursiveAtomClosure`/`dependencyDepth`: a `cycle`
 *  skips the back-edge (so the walk terminates), while `depth-exceeded` is a post-hoc LABEL that
 *  skips nothing — its closure is complete (see `CRITERION_INDEX_MAX_DEPTH`). */
export type CriterionIndexStatus = "ok" | "cycle" | "undefined-dependency" | "depth-exceeded";

/** One distinct criterion, with everything the lowering seams need to emit/evaluate a
 *  REFERENCE to it (never its inline expansion). */
export interface CriterionIndexEntry {
  /** The criterion's declared name (library-local; cross-library criterion refs are a
   *  `criterion-misuse` validation error, so a bare name is unambiguous within a library). */
  readonly name: string;
  /** The CQL define identifier this criterion lowers to. The BARE name — mirroring a
   *  `defined as` concept's define (`emitConcept` uses `cqlQuotedIdentifier(c.name)`; the
   *  quoting is applied at emit, so this is the un-quoted identifier). Collision-safe against
   *  concepts by the `nameUniquenessValidator` concept-XOR-criterion bucket; a residual
   *  criterion-vs-parameter/terminology collision is a preflight concern of the emit seam. */
  readonly defineId: string;
  /** The criterion body guard, UNEXPANDED (criterion refs inside it stay refs). */
  readonly sourceCondition: BranchCondition;
  /** Every concept-ref leaf reachable through the body, FOLLOWING sub-criteria into their
   *  bodies — deduped by name, first-occurrence node kept (for its location), deterministic
   *  order. This is the criterion's DTR case-feature closure (§2d `input[]`). */
  readonly recursiveAtomClosure: readonly BranchConditionRef[];
  /** The DIRECT sub-criterion names the body references (deduped, source order). Edges of the
   *  dependency DAG — used for cycle detection and `dependencyDepth`. NOT for ordering define
   *  emission: `emitCriteria` emits criteria in SOURCE order and relies on the CQL translator's
   *  verified forward-reference tolerance (commit 8f35539), so no topological sort is performed. */
  readonly criterionDependencies: readonly string[];
  /** Max criterion-nesting depth BELOW this criterion (0 = references no sub-criteria).
   *  Saturates at `CRITERION_INDEX_MAX_DEPTH + 1` on a cycle / over-deep chain. */
  readonly dependencyDepth: number;
  /** Resolution status of the derived facts (see `CriterionIndexStatus`). */
  readonly status: CriterionIndexStatus;
}

/** The built index: entries keyed by criterion name, plus the ordered name list (source
 *  order of the declarations) for deterministic iteration. */
export interface CriterionIndex {
  get(name: string): CriterionIndexEntry | undefined;
  has(name: string): boolean;
  /** Entries in DECLARATION (source) order — deterministic. */
  readonly entries: readonly CriterionIndexEntry[];
}

const DEPTH_SENTINEL = CRITERION_INDEX_MAX_DEPTH + 1;

/** Worst-severity wins when combining a body's own status with its dependencies'. */
const STATUS_RANK: Record<CriterionIndexStatus, number> = {
  ok: 0,
  "depth-exceeded": 1,
  "undefined-dependency": 2,
  cycle: 3,
};
function worseStatus(a: CriterionIndexStatus, b: CriterionIndexStatus): CriterionIndexStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

/** Direct concept-ref leaves (source order) and direct criterion-ref names (source order,
 *  deduped) of ONE guard — a single structural walk that does NOT descend into a criterion's
 *  body (the recursive part is done by the memoized closure). `not` is polarity-agnostic for
 *  reachability, so we recurse into its operand. */
function directRefs(cond: BranchCondition): { concepts: BranchConditionRef[]; criteria: string[] } {
  const concepts: BranchConditionRef[] = [];
  const criteria: string[] = [];
  const seenCriteria = new Set<string>();
  const walk = (n: BranchCondition): void => {
    switch (n.type) {
      case "BranchConditionRef":
        concepts.push(n);
        return;
      case "BranchConditionCriterionRef": {
        const name = getRefName(n.ref);
        if (!seenCriteria.has(name)) {
          seenCriteria.add(name);
          criteria.push(name);
        }
        return;
      }
      case "BranchConditionNot":
        if (n.operand) walk(n.operand);
        return;
      case "BranchConditionAnd":
      case "BranchConditionOr":
        n.operands.forEach(walk);
        return;
    }
  };
  walk(cond);
  return { concepts, criteria };
}

/**
 * Build the criterion index from a library's statements. Memoized + cycle-guarded, so a
 * cyclic or doubling-DAG criterion table is analysed in time linear in the number of
 * distinct criteria — never the 2^k of a per-use materialization. A criterion whose
 * dependency subgraph cycles / references an undefined criterion / nests past the depth
 * bound gets a non-`ok` `status` and best-effort derived facts. A cycle can NEVER hang (the
 * `onStack` back-edge skip terminates it); recursion depth is bounded by memoization to
 * O(distinct criteria) (see `CRITERION_INDEX_MAX_DEPTH` for the one residual, unreachable-in-
 * practice deep-chain stack caveat). provenance builds this on UNVALIDATED input.
 */
export function buildCriterionIndex(statements: readonly Statement[]): CriterionIndex {
  const table: CriterionTable = buildCriterionTable(statements as Statement[]);

  // Memoized per-criterion analysis. `onStack` is the current DFS path (cycle guard +
  // stack-overflow guard in one). Only fully-resolved analyses are memoized; an entry
  // computed while a cycle edge was skipped is still deterministic (the back-edge simply
  // contributes nothing), so caching it is safe.
  const memo = new Map<string, Analysis>();
  const onStack = new Set<string>();

  interface Analysis {
    closure: BranchConditionRef[]; // deduped by name, deterministic order
    depth: number;
    status: CriterionIndexStatus;
    dependencies: string[];
  }

  const analyze = (name: string): Analysis => {
    const cached = memo.get(name);
    if (cached) return cached;

    const crit: Criterion | undefined = table.get(name);
    if (!crit) {
      // Referenced-but-undefined criterion. Not memoized (it is not a real node); the
      // referencing entry records `undefined-dependency`.
      return { closure: [], depth: 0, status: "undefined-dependency", dependencies: [] };
    }

    const { concepts, criteria } = directRefs(crit.condition);

    // Cycle guard: if any dependency is already on the current path, this criterion is in a
    // cycle — flag it and skip the back-edge (no recursion) so we cannot loop. (This guards
    // CYCLES, not depth: an acyclic chain still recurses to its full length — see the depth caveat
    // on CRITERION_INDEX_MAX_DEPTH.)
    onStack.add(name);
    const dedup = new Map<string, BranchConditionRef>(); // name → first-seen ref
    for (const c of concepts) {
      const cn = getRefName(c.ref);
      if (!dedup.has(cn)) dedup.set(cn, c);
    }
    let status: CriterionIndexStatus = "ok";
    let childDepth = 0;
    for (const dep of criteria) {
      if (onStack.has(dep)) {
        status = worseStatus(status, "cycle");
        continue; // back-edge — do not recurse
      }
      const sub = analyze(dep);
      status = worseStatus(status, sub.status === "ok" ? "ok" : sub.status);
      if (sub.depth > childDepth) childDepth = sub.depth;
      for (const ref of sub.closure) {
        const rn = getRefName(ref.ref);
        if (!dedup.has(rn)) dedup.set(rn, ref);
      }
    }
    onStack.delete(name);

    let depth = criteria.length === 0 ? 0 : childDepth + 1;
    if (depth > CRITERION_INDEX_MAX_DEPTH) {
      depth = DEPTH_SENTINEL;
      status = worseStatus(status, "depth-exceeded");
    }

    const analysis: Analysis = {
      closure: [...dedup.values()],
      depth,
      status,
      dependencies: criteria,
    };
    // Memoize only when this analysis did not sit under an active cycle edge involving it.
    // A `cycle`-status entry may be path-dependent, so recompute it (bounded by table size).
    if (status !== "cycle") memo.set(name, analysis);
    return analysis;
  };

  const entries: CriterionIndexEntry[] = [];
  const byName = new Map<string, CriterionIndexEntry>();
  // Declaration (source) order, first-write-wins — mirrors `buildCriterionTable` (a
  // duplicate criterion name is a `duplicate-name` validation error handled upstream).
  for (const s of statements) {
    if (s.type !== "Criterion" || !s.name || byName.has(s.name)) continue;
    const a = analyze(s.name);
    const entry: CriterionIndexEntry = {
      name: s.name,
      defineId: s.name,
      sourceCondition: s.condition,
      recursiveAtomClosure: a.closure,
      criterionDependencies: a.dependencies,
      dependencyDepth: a.depth,
      status: a.status,
    };
    entries.push(entry);
    byName.set(s.name, entry);
  }

  return {
    get: (name) => byName.get(name),
    has: (name) => byName.has(name),
    entries,
  };
}

/**
 * #236 — every CONCEPT ref a guard gates on, FOLLOWING criterion refs into their (recursive)
 * atom closure via the INDEX. The linear replacement for the materializing
 * `branchConditionConceptRefsExpanded`: a direct concept ref contributes itself; a criterion ref
 * contributes its `recursiveAtomClosure` (already memoized/deduped/bounded), so a doubling-DAG
 * criterion is bounded, never re-walked or atom-capped. Used by the three emit collectors
 * (interface surface, case-feature SDs, emit closure) so a criterion-only concept is surfaced
 * even for a criterion the old expansion walk would have refused. Duplicates across the direct
 * and closure sets are possible — callers dedupe (all three key by name/canonical first-seen).
 */
export function guardConceptClosure(
  cond: BranchCondition,
  index: CriterionIndex,
): BranchConditionRef[] {
  const out: BranchConditionRef[] = [];
  const walk = (n: BranchCondition): void => {
    switch (n.type) {
      case "BranchConditionRef":
        out.push(n);
        return;
      case "BranchConditionCriterionRef": {
        const entry = index.get(getRefName(n.ref));
        if (entry) out.push(...entry.recursiveAtomClosure);
        return;
      }
      case "BranchConditionNot":
        if (n.operand) walk(n.operand);
        return;
      case "BranchConditionAnd":
      case "BranchConditionOr":
        n.operands.forEach(walk);
        return;
    }
  };
  walk(cond);
  return out;
}
