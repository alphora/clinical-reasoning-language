// Shared traversal for decision branch-condition guards (#224).
//
// A `WhenBlock.condition` is a boolean expression over concept refs (`and`/`or`/
// `not`, parens; #224 iii.3). Every subsystem that reads guard refs MUST go through
// these helpers so no consumer silently drops operands when the guard is a
// compound. In slice i.1 the grammar produces only single-ref conditions, but
// the helpers are written multi-ref-correct so i.2+ need no re-touch.

import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionOr,
  BranchConditionRef,
  BranchConditionCriterionRef,
  BranchConditionNot,
  BranchConditionLiteral,
  BranchConditionNegatedLiteral,
  ReferenceName,
} from "./types";
import { getRefName } from "./types";
import {
  expandGuardOrRecord,
  containsCriterionRef,
  expandedSize,
  type CriterionTable,
  type ExpandedSize,
  type ExpansionReason,
} from "./criterionExpansion";

// #224 ii: an un-expanded `BranchConditionCriterionRef` reaching a SEMANTIC guard
// consumer (DNF / arm-count / eval / emit) means the criterion-expansion seam was
// missed — a bug, never a valid state post-expansion. Throw LOUDLY (the tripwire)
// rather than mis-handle it as a concept. SOURCE-side consumers (refs, describe,
// well-formedness, structure sig) handle it directly — it is expected there.
function unexpandedCriterion(node: BranchConditionCriterionRef, where: string): never {
  throw new Error(
    `internal: un-expanded criterion reference "${String(node.ref)}" reached ${where} — criterion expansion must run before this seam`,
  );
}

/**
 * Structure-preserving fold. Each callback receives the node plus the
 * already-folded results of its children — no call site recurses by hand.
 * Directly supports labelling, evaluation, and DNF conversion in later slices.
 */
export function visitBranchCondition<T>(
  c: BranchCondition,
  v: {
    ref: (node: BranchConditionRef) => T;
    and: (node: BranchConditionAnd, operands: T[]) => T;
    or: (node: BranchConditionOr, operands: T[]) => T;
    /** #224 ii: a criterion-ref leaf (source-side). REQUIRED so every fold caller
     *  decides explicitly rather than silently mis-folding it as a concept ref. */
    criterionRef: (node: BranchConditionCriterionRef) => T;
    /** #224 iii.2: a `not` node, with its already-folded operand result. REQUIRED so no
     *  fold caller silently drops the negated subtree (the tolerant-walker hazard). */
    not: (node: BranchConditionNot, operand: T) => T;
  },
): T {
  switch (c.type) {
    case "BranchConditionRef":
      return v.ref(c);
    case "BranchConditionCriterionRef":
      return v.criterionRef(c);
    case "BranchConditionNot":
      return v.not(c, visitBranchCondition(c.operand, v));
    case "BranchConditionAnd":
      return v.and(
        c,
        c.operands.map((o) => visitBranchCondition(o, v)),
      );
    case "BranchConditionOr":
      return v.or(
        c,
        c.operands.map((o) => visitBranchCondition(o, v)),
      );
  }
}

/**
 * All CONCEPT ref LEAVES in left-to-right order, duplicates PRESERVED. Returns the
 * ref nodes (not bare names) so callers keep each occurrence's own `location`.
 *
 * #224 ii: a `BranchConditionCriterionRef` is EXPLICITLY EXCLUDED — it is NOT a
 * concept ref (it resolves via criterion expansion, not concept resolution). Only
 * SOURCE-side callers that legitimately want concept-refs-only (the reference
 * resolver; the source-side provenance/index refKey collectors, which defer criterion
 * indexing to ii.4) use this. A SEMANTIC consumer (emit / CQL interface / closure)
 * that runs POST-expansion and must never SILENTLY drop a criterion ref uses
 * `branchConditionConceptRefsStrict` — else a missed expansion vanishes without a
 * diagnostic (the exact silent-omission the distinct node exists to prevent).
 */
export function branchConditionRefs(c: BranchCondition): BranchConditionRef[] {
  const out: BranchConditionRef[] = [];
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") out.push(n);
    else if (n.type === "BranchConditionCriterionRef") return; // EXPLICIT source-side skip (not a concept ref)
    // #224 iii.2: a `not` node carries `operand` (NOT `operands`), so it would fall
    // THROUGH the `Array.isArray(operands)` branch below and its refs would be SILENTLY
    // DROPPED. Handle it explicitly BEFORE the operands check; tolerate a missing operand
    // (malformed editor buffer) like the array guard tolerates a missing operands array.
    else if (n.type === "BranchConditionNot") {
      if (n.operand) walk(n.operand);
    }
    // `Array.isArray` guards the untyped boundary (`projectIndex` casts a
    // possibly-malformed editor-buffer node to BranchCondition) — a node with no
    // `operands` array is skipped, matching the pre-#224 tolerant behavior rather
    // than throwing on a partial parse.
    else if (Array.isArray((n as BranchConditionAnd | BranchConditionOr).operands))
      (n as BranchConditionAnd | BranchConditionOr).operands.forEach(walk);
  };
  walk(c);
  return out;
}

/**
 * #224 ii: concept ref leaves for a SEMANTIC consumer (emit / CQL interface / emit
 * closure) that runs on the POST-expansion guard. THROWS on an un-expanded
 * `BranchConditionCriterionRef` (the tripwire, via `unexpandedCriterion`) instead of
 * silently dropping it — so a missed expansion is a loud error at every semantic
 * seam, not just at DNF/eval. `where` names the calling seam for the message.
 */
export function branchConditionConceptRefsStrict(
  c: BranchCondition,
  where: string,
): BranchConditionRef[] {
  const out: BranchConditionRef[] = [];
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") out.push(n);
    else if (n.type === "BranchConditionCriterionRef") unexpandedCriterion(n, where);
    // #224 iii.2: explicit `not` handling (has `operand`, not `operands`) — see the note
    // in `branchConditionRefs`. A negated ref is STILL a concept ref for this seam.
    else if (n.type === "BranchConditionNot") {
      if (n.operand) walk(n.operand);
    } else if (Array.isArray((n as BranchConditionAnd | BranchConditionOr).operands))
      (n as BranchConditionAnd | BranchConditionOr).operands.forEach(walk);
  };
  walk(c);
  return out;
}

/**
 * #224 ii.1c — SOURCE-side concept refs of a guard, FOLLOWING criterion refs INTO their
 * bodies. For provenance reachability / gating: a concept referenced ONLY inside a criterion
 * body is still gating on / reached by the decision (the disc-300 closure argument, source-
 * side). Unlike `branchConditionConceptRefsExpanded` this does NOT materialize a fresh tree —
 * it walks the body in place and collects its concept-ref LEAVES (a criterion ref becomes its
 * body's concepts, recursively).
 *
 * The GLOBAL envelope still applies (a criterion DAG doubles: `C_k := C_{k-1} and C_{k-1}` →
 * 2^k leaf visits). Provenance runs on UNVALIDATED input (`buildProvenanceIndex` calls no
 * validator — the same reason `runCel` must gate), so a cyclic OR envelope-breaching table
 * would otherwise loop/hang the host. Gate on `expandedSize` first; a non-`ok` guard falls
 * back to its INLINE concept refs only (criteria skipped — the pre-ii.1c behavior: the
 * criterion-only concepts are under-reported for that one guard, not collected via an
 * unbounded walk). The `ok` path is then bounded by the atom cap (≤ CAP leaf visits). The
 * `active` cycle guard is retained as defence in depth even though `ok` implies acyclic.
 *
 * Name-level criterion DECLARATION indexing (find-refs / hover / rename on the criterion NAME
 * itself) stays deferred to ii.4; this covers only the concept-reachability correctness.
 */
export function branchConditionConceptRefsFollowingCriteria(
  c: BranchCondition,
  table: CriterionTable,
): BranchConditionRef[] {
  // GLOBAL-envelope gate (see doc): a breaching/cyclic table falls back to inline refs only,
  // never an unbounded DAG walk. Criterion-free guards are `ok` with no walk (exempt).
  if (containsCriterionRef(c) && expandedSize(c, table).status !== "ok") {
    return branchConditionRefs(c);
  }
  const out: BranchConditionRef[] = [];
  const active = new Set<string>(); // criterion names on the current path (cycle guard)
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") {
      out.push(n);
      return;
    }
    if (n.type === "BranchConditionCriterionRef") {
      const name = getRefName(n.ref);
      const crit = table.get(name);
      if (!crit || active.has(name)) return; // undefined or cyclic → contribute nothing
      active.add(name);
      walk(crit.condition);
      active.delete(name);
      return;
    }
    // #224 iii.2: explicit `not` handling (has `operand`, not `operands`) — see the note
    // in `branchConditionRefs`. Concept reachability is polarity-agnostic; recurse in.
    if (n.type === "BranchConditionNot") {
      if (n.operand) walk(n.operand);
      return;
    }
    if (Array.isArray((n as BranchConditionAnd | BranchConditionOr).operands))
      (n as BranchConditionAnd | BranchConditionOr).operands.forEach(walk);
  };
  walk(c);
  return out;
}

/**
 * #224 ii.1c — the criterion-aware ref collector for the EMIT seams (closure, CQL
 * interface surface, case-features). It EXPANDS the guard's criterion refs (gated by the
 * GLOBAL envelope) against `table`, then collects the concept refs of the expanded tree
 * via `branchConditionConceptRefsStrict` — which therefore never trips (the expanded tree
 * holds no criterion ref). A criterion-free guard fast-paths to identity (no envelope).
 *
 * On a non-`ok` envelope status it returns `{ refs: [], overflow }` WITHOUT throwing — the
 * seam disposes of the overflow per its lane (closure/case-features: skip; CQL interface:
 * hard error). This is the single point where the emit seams cross the criterion boundary,
 * so the tripwire in `branchConditionConceptRefsStrict` stays a live backstop for any seam
 * that forgot to route through here.
 */
export function branchConditionConceptRefsExpanded(
  c: BranchCondition,
  table: CriterionTable,
  where: string,
): { refs: BranchConditionRef[]; overflow?: { status: ExpansionReason; detail?: ExpandedSize["detail"] } } {
  const g = expandGuardOrRecord(c, table);
  if (!g.ok) return { refs: [], overflow: { status: g.status, detail: g.detail } };
  return { refs: branchConditionConceptRefsStrict(g.cond, where) };
}

/** #224 iii.2: does the guard contain any `not` node? The fast-path predicate for `toNNF`
 *  — a guard with NONE is already in negation-normal form and is returned by identity. */
export function containsNot(c: BranchCondition): boolean {
  switch (c.type) {
    case "BranchConditionNot":
      return true;
    case "BranchConditionRef":
    case "BranchConditionCriterionRef":
      return false;
    case "BranchConditionAnd":
    case "BranchConditionOr":
      return c.operands.some(containsNot);
  }
}

/**
 * #224 iii.2 — Negation-normal form: push every `not` down to the ref LEAVES via De Morgan
 * (`not(A or B)` → `not A and not B`; `not(A and B)` → `not A or not B`; `not not A` → `A`),
 * so the result has a `Not` ONLY DIRECTLY over a `BranchConditionRef` (a signed literal).
 * This is what lets `branchConditionDNF` produce arms of SINGLE signed literals — the
 * load-bearing "negation never lowers to one compound CQL boolean" invariant.
 *
 * SEMANTIC / POST-EXPANSION: a `BranchConditionCriterionRef` reached at ANY polarity THROWS
 * `unexpandedCriterion` — NNF cannot push through a criterion whose body is unknown, so
 * expansion must run first (classify → expand → NNF → DNF). (A `not`-FREE tree fast-paths to
 * identity, so a stray criterion ref there is caught downstream by the DNF/armCount switch
 * instead; a not-free tree trivially satisfies "every `not` on a leaf".)
 *
 * IDENTITY on a `not`-free tree (fast path — refs and `and`/`or` nodes returned UNCHANGED,
 * so a positive guard's DNF is byte-identical to the pre-iii.2 output; zero golden drift).
 * Idempotent (NNF of an NNF tree is itself).
 *
 * MARKER TRANSFER (ii.1b): each rewritten node transfers its OWN `sourcedFromCriterion` onto
 * the replacement root; coincident outer/inner markers resolve OUTERMOST-wins (the outer
 * transfer overwrites last — matching `materialize`'s boundary rule). LOCATION: a flipped
 * `and`/`or` keeps the rewritten node's OWN location; a synthesized `Not(ref)` leaf takes the
 * underlying REF's location (per-operand diagnostic precision). NOTE: DNF output for a
 * `not`-containing guard therefore holds SYNTHESIZED nodes not present in the source AST —
 * consumers must not assume arm atoms map 1:1 to source spans.
 */
export function toNNF(c: BranchCondition): BranchCondition {
  // Identity fast path for an already-NNF tree — BUT honor the criterion tripwire: a not-free
  // tree carrying a stray (unexpanded) criterion ref must still throw (the public contract),
  // never slip through as identity. A not-free AND criterion-free tree returns by identity
  // (byte-stable for positive guards); anything else runs the recursion (which throws on a
  // criterion ref at any polarity).
  if (!containsNot(c) && !containsCriterionRef(c)) return c;
  const nnf = (n: BranchCondition, negated: boolean): BranchCondition => {
    // Transfer THIS source node's criterion marker onto the produced root (outermost wins,
    // since the outer call's transfer runs after the inner). Only clones when a marker is
    // present, so unmarked positive refs keep object identity.
    // `out` is never a `BranchConditionCriterionRef` here (those throw), so stamping a marker
    // is always type-sound; the cast keeps the generic return type through the spread.
    const withMarker = <T extends BranchCondition>(out: T): T =>
      n.sourcedFromCriterion ? ({ ...out, sourcedFromCriterion: n.sourcedFromCriterion } as T) : out;
    switch (n.type) {
      case "BranchConditionCriterionRef":
        return unexpandedCriterion(n, "toNNF");
      case "BranchConditionRef":
        if (!negated) return withMarker(n); // positive literal — marker stays on the ref
        // Negated literal: HOIST the marker onto the new `Not` (the boundary root), and DROP it
        // from the embedded ref — a marker must sit on the boundary root ONLY, never be
        // duplicated onto an inner node (else an iii.3 attribution collector double-counts the
        // criterion). The ref is re-wrapped in a fresh `Not` regardless, so no identity is lost.
        return withMarker({
          type: "BranchConditionNot",
          operand: { type: "BranchConditionRef", ref: n.ref, location: n.location },
          location: n.location,
        });
      case "BranchConditionNot":
        // `not X` flips polarity; the Not's own marker transfers onto whatever X produces.
        return withMarker(nnf(n.operand, !negated));
      case "BranchConditionAnd":
      case "BranchConditionOr": {
        // De Morgan: under negation `and`↔`or` and each operand is negated.
        const flipTo =
          negated && n.type === "BranchConditionAnd"
            ? "BranchConditionOr"
            : negated && n.type === "BranchConditionOr"
              ? "BranchConditionAnd"
              : n.type;
        return withMarker({
          type: flipTo,
          operands: n.operands.map((o) => nnf(o, negated)),
          location: n.location,
        });
      }
    }
  };
  return nnf(c, false);
}

/**
 * Disjunctive Normal Form of a guard: the list of ARMS, each an ordered list of SIGNED
 * LITERAL atoms (a conjunction). Each arm lowers to ONE `PlanDefinition.action` with N ANDed
 * `condition[kind=applicability]` (#224 i.3 structural emit); a NEGATED literal lowers to the
 * `not Coalesce(...)` carrier (#224 iii.1), a positive one to a bare `text/cql-identifier`.
 *
 * `toNNF` runs FIRST (so `not` sits only on ref leaves), then:
 *   - ref        → `[[ref]]`                    (positive literal)
 *   - not(ref)   → `[[not(ref)]]`               (negated literal; asserted single-atom)
 *   - and(ops)   → cartesian PRODUCT of the operands' DNFs (atoms concatenated, order kept)
 *   - or(ops)    → CONCATENATION (union) of the operands' DNFs
 * A POSITIVE-only guard yields only `BranchConditionRef` atoms — byte-identical to the
 * pre-iii.2 `BranchConditionRef[][]` output (positive goldens never drift). Atom order within
 * an arm is deterministic left-to-right; duplicate atoms are PRESERVED (dedup is a display
 * concern). Callers that lower to FHIR MUST first guard on `branchConditionArmCount` — this
 * fully materializes the product and is unbounded for a pathological guard.
 *
 * PRECONDITION: a WELL-FORMED condition (every `and`/`or` has >= 2 operands; every `not` a
 * single operand — the builder/grammar invariant, `assertWellFormedBranchCondition`). Unlike
 * `branchConditionRefs` (which tolerates a malformed node for projectIndex), this structural
 * transform assumes valid input — the emitter only runs on a parse-success AST.
 */
export function branchConditionDNF(c: BranchCondition): BranchConditionLiteral[][] {
  const dnf = (n: BranchCondition): BranchConditionLiteral[][] => {
    switch (n.type) {
      case "BranchConditionRef":
        return [[n]];
      case "BranchConditionNot": {
        // Post-`toNNF` invariant: a `not` wraps EXACTLY a ref (the single-atom boundary that
        // keeps every arm free of a compound CQL boolean). A `Not` over anything else means
        // `toNNF` did not run / failed — a loud internal error, never silent mis-emit.
        if (n.operand.type !== "BranchConditionRef") {
          throw new Error(
            `internal: branchConditionDNF saw a non-normalized negation over ${n.operand.type} — toNNF must run first`,
          );
        }
        return [[n as BranchConditionNegatedLiteral]];
      }
      case "BranchConditionCriterionRef":
        return unexpandedCriterion(n, "branchConditionDNF");
      case "BranchConditionOr":
        return n.operands.flatMap((o) => dnf(o));
      case "BranchConditionAnd": {
        // Cartesian product: start with one empty arm, extend by each operand's arms.
        let arms: BranchConditionLiteral[][] = [[]];
        for (const operand of n.operands) {
          const opArms = dnf(operand);
          const next: BranchConditionLiteral[][] = [];
          for (const arm of arms) for (const opArm of opArms) next.push([...arm, ...opArm]);
          arms = next;
        }
        return arms;
      }
    }
  };
  return dnf(toNNF(c));
}

/**
 * The number of DNF arms `branchConditionDNF` WOULD produce, SATURATING at `cap + 1` so a
 * pathological `and`-of-`or`s (2^N arms) can never allocate exponentially. The emitter checks
 * this against the expansion cap (16) BEFORE calling `branchConditionDNF`, so a bad editor
 * buffer bundled into crl-vscode reports a compile error instead of hanging/OOM.
 *   - ref      → 1
 *   - not(ref) → 1   (#224 iii.2: post-NNF a negated single literal is one arm)
 *   - and(ops) → product of children (saturating)
 *   - or(ops)  → sum of children (saturating)
 * #224 iii.2: counts on `toNNF(c)` so De Morgan (which can RAISE the arm count, e.g.
 * `not(A and B)` = 2 arms) is reflected. `toNNF` materializes the NNF tree (linear — De
 * Morgan does not blow up node count), but NOT the exponential DNF product; so this stays a
 * cheap saturating count over the normalized tree, and `armCount === DNF.length` by
 * construction (both consume the same `toNNF` output).
 */
export function branchConditionArmCount(c: BranchCondition, cap = 16): number {
  const ceiling = cap + 1;
  const go = (n: BranchCondition): number => {
    if (n.type === "BranchConditionRef") return 1;
    if (n.type === "BranchConditionNot") return 1; // post-NNF: `not` over a single ref = 1 arm
    if (n.type === "BranchConditionCriterionRef") return unexpandedCriterion(n, "branchConditionArmCount");
    if (n.type === "BranchConditionOr") {
      let sum = 0;
      for (const o of n.operands) {
        sum += go(o);
        if (sum >= ceiling) return ceiling;
      }
      return sum;
    }
    // and: product
    let product = 1;
    for (const o of n.operands) {
      product *= go(o);
      if (product >= ceiling) return ceiling;
    }
    return product;
  };
  return go(toNNF(c));
}

/**
 * Assert every `and`/`or` node carries >= 2 operands, and every `not` a single operand
 * (the grammar/builder invariant). i.2's builder and the semantic validator call this on
 * parsed / hand-built compounds. Throws on violation.
 */
export function assertWellFormedBranchCondition(c: BranchCondition): void {
  const check = (n: BranchCondition): void => {
    // A concept ref OR a criterion ref is a well-formed leaf (source-side; criterion
    // bodies + guards are validated pre-expansion, where criterion refs are expected).
    if (n.type === "BranchConditionRef" || n.type === "BranchConditionCriterionRef") return;
    // #224 iii.2: a `not` is a well-formed UNARY node — exactly one operand, recurse into it.
    if (n.type === "BranchConditionNot") {
      check(n.operand);
      return;
    }
    if (n.operands.length < 2) {
      throw new Error(`${n.type} requires >= 2 operands, got ${n.operands.length}`);
    }
    n.operands.forEach(check);
  };
  check(c);
}

/**
 * The sole ref IFF the condition is exactly a single ref leaf; else null.
 * NOTE: this is "kind is ref", NOT "exactly one ref exists anywhere" — a
 * malformed `and([ref])` must NOT collapse to atomic semantics.
 */
export function soleRef(c: BranchCondition): BranchConditionRef | null {
  return c.type === "BranchConditionRef" ? c : null;
}

/**
 * Human-readable guard label, e.g. `"A"`, `"A" and "B"`, `("A" or "B") and "C"`,
 * `not "A"`, `not ("A" or "B")`. `display` renders each ref — pass `getRefName` for bare
 * names or `refDisplay` for qualified display; the two call sites (cascade labels vs
 * unmatched-ref messages) need different renderings, so it is explicit, never defaulted.
 * Renders the SOURCE tree (pre-`toNNF`), so the author's own `not (...)` spelling is shown.
 */
export function describeBranchCondition(
  c: BranchCondition,
  display: (r: ReferenceName) => string,
): string {
  const go = (n: BranchCondition, parentOp: "and" | "or" | null): string => {
    // A concept ref OR a criterion ref renders via `display` (source-side label; a
    // criterion ref shows the criterion's own name — the name-preserving render).
    if (n.type === "BranchConditionRef" || n.type === "BranchConditionCriterionRef") return display(n.ref);
    // #224 iii.2: `not` binds tighter than `and`/`or`, so `not "A"` needs no parens, but a
    // compound operand does: `not ("A" or "B")`. Never needs outer parens from a parent op.
    if (n.type === "BranchConditionNot") {
      const compound =
        n.operand.type === "BranchConditionAnd" || n.operand.type === "BranchConditionOr";
      const inner = go(n.operand, null);
      return `not ${compound ? `(${inner})` : inner}`;
    }
    const op: "and" | "or" = n.type === "BranchConditionAnd" ? "and" : "or";
    const inner = n.operands.map((o) => go(o, op)).join(` ${op} `);
    // Parenthesize a sub-expression nested under a DIFFERENT operator so the
    // rendered precedence is never ambiguous.
    return parentOp !== null && parentOp !== op ? `(${inner})` : inner;
  };
  return go(c, null);
}
