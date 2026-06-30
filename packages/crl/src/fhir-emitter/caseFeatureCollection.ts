/**
 * Recursive `code is` collection in INFERENCE ORDER (the truth-set case-feature
 * FHIR lane).
 *
 * For a decision `when` condition concept C, the case-feature inputs + profiles
 * are the transitive closure of `code is` (LocalSource) concepts reachable from C
 * by walking C's inference tree:
 *
 *   - START at C. If C has a lowered local code (`code is`), it is the FIRST entry
 *     (the condition closest to the Interface comes first — a both-representation
 *     concept that carries BOTH `code is` AND `defined as` lists its OWN code
 *     before its operands).
 *   - Then, if C is `defined as`, recurse its operands LEFT-TO-RIGHT (written
 *     order): a bare ref, or a parenthesized composition over `sem-or`/`sem-and`/
 *     `sem-not`. Each operand concept is visited the same way (pre-order).
 *   - An intermediate concept with NO `code is` (e.g. an `A And B` that only
 *     `defined as` two leaves) is WALKED THROUGH — it produces no entry but its
 *     own operands are still recursed.
 *
 * So:
 *   - direct  (V1): C has `code is`, no `defined as` → [C].
 *   - semand      : `A And B` (no code) = A sem-and B → [A, B].
 *   - nested (V3) : `Top` (no code) = (A And B) sem-or C; `A And B` (no code) =
 *                   A sem-and B → [A, B, C].
 *   - bothrep     : C (code) = Estrogen sem-or Estradiol → [C, Estrogen, Estradiol].
 *
 * Dedup is BY CONCEPT NAME within ONE condition (first occurrence wins): a
 * condition that references the same leaf twice (via two operands) yields ONE
 * entry. A CYCLE guard (`visiting`/`visited`) makes the walk total even on a
 * malformed `A defined as B`, `B defined as A` graph — the FHIR lane is an emit
 * boundary and must not assume the validator pre-eliminated cycles.
 *
 * Cross-library refs: a `when`/operand ref that, AFTER same-library normalization,
 * is still qualified (a genuine `OtherLib."X"`) is SKIPPED — cross-library
 * case-features are unsupported in v0 (mirrors the decision/concept resolvers).
 */

import type { CompositionExpression, Concept, ReferenceName } from "../ast/types";
import { getRefLibrary, getRefName, isQualifiedRef } from "../ast/types";

/** One collected `code is` concept, in inference order. */
export interface CollectedCodeIsConcept {
  name: string;
  code: string;
}

/**
 * Same-library qualified-ref normalization (mirrors closureOrchestrator /
 * decision.ts `normalizeLocalRef`): a `ThisLib."X"` ref inside `ThisLib` becomes
 * bare `X`; a genuine `OtherLib."X"` stays qualified (and is then skipped as a
 * cross-library ref).
 */
function normalizeLocalRef(ref: ReferenceName, libraryName: string): ReferenceName {
  if (!isQualifiedRef(ref)) return ref;
  if (getRefLibrary(ref) === libraryName) return getRefName(ref);
  return ref;
}

/**
 * Collect the `code is` concepts reachable from a decision condition `conditionRef`
 * in inference order (pre-order, operands left-to-right), deduped by name.
 *
 * @param conditionRef   the (raw) `when` condition concept ref.
 * @param libraryName    the source library (for same-library normalization).
 * @param definedAsByName  concept name → the concept carrying its `defined as`
 *   (when one exists). For a both-representation concept (split by
 *   `lowerLocalCodes` into a LocalSource retrieve twin + an Inferred fold-in
 *   twin), this MUST be the twin carrying the `DefinedAsDefinition` so the
 *   operands are recursed.
 * @param codeByConcept  concept name → its lowered local code (from
 *   `lowerLocalCodes().localCodes`). Presence here is the eligibility test
 *   (LocalSource ⟺ a lowered `code is`).
 */
export function collectCodeIsConceptsInInferenceOrder(
  conditionRef: ReferenceName,
  libraryName: string,
  definedAsByName: ReadonlyMap<string, Concept>,
  codeByConcept: ReadonlyMap<string, string>,
): CollectedCodeIsConcept[] {
  const ordered: CollectedCodeIsConcept[] = [];
  const appended = new Set<string>(); // dedup by name (first wins)
  const visiting = new Set<string>(); // cycle guard for the current traversal
  const visited = new Set<string>(); // F4 — memo: a fully-walked subtree is never re-walked

  const visitName = (name: string): void => {
    if (visiting.has(name)) return; // cycle — stop, do not re-traverse
    // F4 (impl-review) — diamond memoization. A concept reachable by two paths
    // (e.g. `Top defined as (A And B) sem-or A`, where A is shared) would
    // otherwise re-walk A's whole subtree on the second visit. The `appended`
    // dedup keeps the OUTPUT correct, but the walk was superlinear on diamond-
    // shaped inference graphs. Memoizing fully-completed names makes it linear.
    if (visited.has(name)) return;
    visiting.add(name);

    // PRE-ORDER: the concept's OWN code first (a both-rep concept lists itself
    // before its operands).
    const code = codeByConcept.get(name);
    if (code !== undefined && !appended.has(name)) {
      appended.add(name);
      ordered.push({ name, code });
    }

    // Then recurse this concept's `defined as` operands, left-to-right.
    const defined = definedAsByName.get(name);
    if (defined?.definition?.type === "DefinedAsDefinition") {
      const body = defined.definition.body;
      if (body.type === "DefinedAsBareRef") {
        visitRef(body.ref);
      } else {
        visitComposition(body.expression);
      }
    }

    visiting.delete(name);
    visited.add(name); // F4 — fully walked; memoize so a later path skips it
  };

  const visitRef = (ref: ReferenceName): void => {
    const normalized = normalizeLocalRef(ref, libraryName);
    if (isQualifiedRef(normalized)) return; // cross-library — unsupported in v0
    visitName(getRefName(normalized));
  };

  const visitComposition = (expr: CompositionExpression): void => {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) visitComposition(term);
        return;
      case "SemNotExpression":
        visitComposition(expr.expression);
        return;
      case "CompositionGroup":
        visitComposition(expr.expression);
        return;
      case "CompositionRef":
        visitRef(expr.ref);
        return;
    }
  };

  visitRef(conditionRef);
  return ordered;
}
