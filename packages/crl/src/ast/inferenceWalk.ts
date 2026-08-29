/**
 * Neutral, single-authority pre-order walk over a concept's DEPENDENCY graph.
 *
 * This is the ONE traversal shared by the FHIR case-feature lane
 * (`fhir-emitter/caseFeatureCollection`) and the Medical-Validation concept-shape model
 * (`provenance`, #187 Todo 1b), so the MV panes' question surface cannot drift from what the
 * emitted PlanDefinition asks under `$apply`. It encodes the ordering + guard rules ONCE:
 *
 *   - START at the root ref (normalized same-lib; a still-qualified root is skipped).
 *   - PRE-ORDER: a concept's OWN code fires `onEnter(name, code)` FIRST, then its operands recurse
 *     (a both-representation concept lists itself before its operands).
 *   - Operands are supplied by the CALLER (`operandsOf`), which both production callers take from the ONE
 *     edge function `ast/conceptDependencies` — a `defined as` body's refs, a `definition is` narrative's
 *     concept arguments, or a reduction's named target. LEFT-TO-RIGHT (inline sem-or/and/not/group flattened —
 *     the operators do not affect leaf order; both lanes collect refs positionally).
 *   - An intermediate concept with no code but a `defined as` is WALKED THROUGH (no leaf, operands recurse).
 *   - A cross-library operand (still qualified AFTER same-library normalization, e.g. `OtherLib."X"`) is
 *     observed via `onCrossLib` and NOT recursed — cross-library case-features are unsupported in v0.
 *   - Cycle guard (`visiting`) + diamond memo (`visited`): every name is ENTERED at most once, so the walk
 *     is total on a malformed `A defined as B`, `B defined as A` graph and linear on diamond graphs.
 *
 * Callers supply the ADJACENCY (`codeOf` + `operandsOf`) and observe the walk via hooks; they do NOT
 * re-implement the ordering/guard rules. The FHIR lane builds its adjacency from `lowerLocalCodes`
 * (`codeByConcept`/`definedAsByName`); the provenance lane builds it from the concept layer.
 */
import type {
  CompositionExpression,
  DefinedAsBareRef,
  DefinedAsBooleanComposition,
  DefinedAsComposition,
  DefinedAsExists,
  ReferenceName,
} from "./types";
import { getRefName, isQualifiedRef, normalizeLocalRef } from "./types";
import { branchConditionConceptRefsStrict } from "./branchCondition";

/**
 * Flatten a `defined as` body to its operand refs, left-to-right. A bare-ref body → `[ref]`; an inline
 * composition is flattened positionally (sem-or/and/not/group are structurally transparent to leaf order —
 * every `CompositionRef` is collected in written order). Mirrors the FHIR lane's prior `visitComposition`.
 */
export function flattenDefinedAsBody(
  body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition | DefinedAsBooleanComposition,
): ReferenceName[] {
  // Bare ref and `exists ("X")` both name a single concept operand — its reference is the
  // one leaf, tracked so the inference-order walk (FHIR case-feature + provenance lanes)
  // surfaces it. (`exists` lowering itself is Todo 2/3; the operand still walks.)
  if (body.type === "DefinedAsBareRef") return [body.ref];
  if (body.type === "DefinedAsExists") return [body.ref];
  // T1 boolean composition (`("A" and "B")`): operands are tracked like refs (no lowering here). Collect
  // ALL concept refs from the BranchCondition tree, left-to-right; the strict collector throws on any
  // (unclassified) criterion ref — criterion refs are illegal at the `defined as` site.
  if (body.type === "DefinedAsBooleanComposition") {
    return branchConditionConceptRefsStrict(body.expression, "flattenDefinedAsBody").map((r) => r.ref);
  }
  const refs: ReferenceName[] = [];
  const visit = (expr: CompositionExpression): void => {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) visit(term);
        return;
      case "SemNotExpression":
        visit(expr.expression);
        return;
      case "CompositionGroup":
        visit(expr.expression);
        return;
      case "CompositionRef":
        refs.push(expr.ref);
        return;
      default: {
        // Exhaustiveness guard: now that this is the SINGLE authority for operand order, a new
        // CompositionExpression variant is a compile error here, not a silently-dropped operand.
        const _exhaustive: never = expr;
        return _exhaustive;
      }
    }
  };
  visit(body.expression);
  return refs;
}

/** The adjacency + observers the shared walk drives. `name` args are always BARE, same-library concept names. */
export interface InferenceWalkHooks {
  /** A concept's eligible local code, or `undefined` when it is not an emitted leaf (no code /
   *  representation-bearing / whatever eligibility the caller enforces). Presence ⇒ a leaf, order-first. */
  codeOf(name: string): string | undefined;
  /** A concept's `defined as` operand refs, left-to-right; `[]` when the concept is not `defined as`. */
  operandsOf(name: string): readonly ReferenceName[];
  /** A concept ENTERED in pre-order (after the cycle/diamond guards). Fires exactly once per unique name;
   *  `code` is its eligible code (`undefined` ⇒ a walked-through intermediate). */
  onEnter?(name: string, code: string | undefined): void;
  /** The matching POST-order exit. Fires once per unique name, so an enter/exit stack reconstructs the
   *  (root-relative, diamond-collapsed) tree structure the flat list drops. PROVISIONAL 1b seam: the
   *  Todo-1b subtree may need richer context (parent/cross-lib edges) — do NOT treat this as the settled
   *  1b contract until 1b validates it against real subtree materialization. */
  onExit?(name: string, code: string | undefined): void;
  /** A normalized operand ref that is STILL cross-library (unsupported in v0): observed, NOT recursed. The
   *  parent is the node currently being visited (the enter/exit stack top); no parent context is passed —
   *  another PROVISIONAL 1b seam (a cross-lib stub node under its parent may want it). */
  onCrossLib?(ref: ReferenceName): void;
}

/**
 * Walk the inference graph rooted at `rootRef` in pre-order, driving `hooks`. See the module doc for the exact
 * contract. Returns nothing — callers accumulate whatever shape they need (flat list, subtree) via the hooks.
 */
export function walkInferenceOrder(
  rootRef: ReferenceName,
  libraryName: string,
  hooks: InferenceWalkHooks,
): void {
  const visiting = new Set<string>(); // cycle guard for the current path
  const visited = new Set<string>(); // diamond memo — a fully-walked subtree is never re-walked

  const visitName = (name: string): void => {
    if (visiting.has(name)) return; // cycle — stop, do not re-traverse
    if (visited.has(name)) return; // already fully walked on another path
    visiting.add(name);

    const code = hooks.codeOf(name);
    hooks.onEnter?.(name, code);

    for (const ref of hooks.operandsOf(name)) {
      const normalized = normalizeLocalRef(ref, libraryName);
      if (isQualifiedRef(normalized)) {
        hooks.onCrossLib?.(normalized); // cross-library — observe, do not recurse
        continue;
      }
      visitName(getRefName(normalized));
    }

    hooks.onExit?.(name, code);
    visiting.delete(name);
    visited.add(name);
  };

  const root = normalizeLocalRef(rootRef, libraryName);
  if (isQualifiedRef(root)) {
    hooks.onCrossLib?.(root); // a cross-library root contributes nothing (v0)
    return;
  }
  visitName(getRefName(root));
}
