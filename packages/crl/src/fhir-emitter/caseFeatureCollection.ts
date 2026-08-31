/**
 * Recursive `code is` collection in INFERENCE ORDER (the truth-set case-feature
 * FHIR lane).
 *
 * For a decision `when` condition concept C, the case-feature inputs + profiles
 * are the transitive closure of `code is` (LocalPrimitives) concepts reachable from C
 * by walking C's inference tree:
 *
 *   - START at C. If C has a lowered local code (`code is`), it is the FIRST entry
 *     (the condition closest to the Interface comes first — a both-representation
 *     concept that carries BOTH `code is` AND `defined as` lists its OWN code
 *     before its operands).
 *   - Then recurse WHATEVER C'S DEFINITION READS, LEFT-TO-RIGHT in written order
 *     (`ast/conceptDependencies`): a `defined as` composition's operands, a
 *     `definition is` narrative's concept arguments, or a reduction's NAMED
 *     target. Each is visited the same way (pre-order).
 *     ⚠ It followed `defined as` ONLY until 2026-08-29, so a `definition is`
 *     chain stopped at C — MEASURED on the obesity target as ONE question where
 *     four concepts carry codes. A dependency is whatever the definition READS.
 *   - An intermediate concept with NO `code is` (e.g. an uncoded `Most Recent
 *     Height`, or an `A And B` over two leaves) is WALKED THROUGH — it produces
 *     no entry but its own operands are still recursed.
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

import { walkInferenceOrder } from "../ast/inferenceWalk";
import { conceptRefsOfConcept } from "../ast/conceptDependencies";
import type { Concept, ReferenceName } from "../ast/types";

/** One collected `code is` concept, in inference order. */
export interface CollectedCodeIsConcept {
  name: string;
  code: string;
}

/**
 * Collect the `code is` concepts reachable from a decision condition `conditionRef`
 * in inference order (pre-order, operands left-to-right), deduped by name.
 *
 * A thin adapter over the neutral single-authority walk (`ast/inferenceWalk`): the ordering,
 * cycle/diamond guards, same-library normalization, and cross-library skip live there (SHARED with
 * the MV concept-shape model so the panes cannot drift from `$apply`). This lane supplies the FHIR
 * adjacency — `codeByConcept` presence = leaf-eligibility, `definedAsByName` = the operand edges —
 * and accumulates the flat leaf list. Dedup-by-name is inherent: the walk enters each name once.
 *
 * @param conditionRef   the (raw) `when` condition concept ref.
 * @param libraryName    the source library (for same-library normalization).
 * @param definedAsByName  concept name → the concept carrying its `defined as`
 *   (when one exists). For a both-representation concept (split by
 *   `lowerLocalCodes` into a LocalPrimitives retrieve twin + an Inferences fold-in
 *   twin), this MUST be the twin carrying the `DefinedAsDefinition` so the
 *   operands are recursed.
 * @param codeByConcept  concept name → its lowered local code (from
 *   `lowerLocalCodes().localCodes`). Presence here is the eligibility test
 *   (LocalPrimitives ⟺ a lowered `code is`).
 */
export function collectCodeIsConceptsInInferenceOrder(
  conditionRef: ReferenceName,
  libraryName: string,
  definedAsByName: ReadonlyMap<string, Concept>,
  codeByConcept: ReadonlyMap<string, string>,
): CollectedCodeIsConcept[] {
  const ordered: CollectedCodeIsConcept[] = [];
  walkInferenceOrder(conditionRef, libraryName, {
    codeOf: (name) => codeByConcept.get(name),
    // ⚠ EVERY definition form is an edge, not just `defined as`. The walk followed composition operands
    // only, so on a `definition is` chain it stopped at the first concept: MEASURED on the canonical target,
    // starting at `Obese` it reached ONE question where FOUR concepts carry codes, and the questionnaire
    // would have offered no way to answer with a height and a weight. A dependency is whatever the
    // definition READS (`ast/conceptDependencies`).
    // ⭐ #189 — the WHOLE concept's edges, definition AND lowered producer stages. A merge twin's definition
    // is a synthetic `most recent <self>`, so a producer's operands are invisible to a definition-only walk —
    // which silently truncated this walk the moment producers started lowering.
    operandsOf: (name) => conceptRefsOfConcept(definedAsByName.get(name)),
    // PRE-ORDER: a both-rep concept's own code is pushed before its operands. The walk enters each
    // name once (cycle/diamond guards), so a leaf referenced twice yields ONE entry.
    onEnter: (name, code) => {
      if (code !== undefined) ordered.push({ name, code });
    },
  });
  return ordered;
}
