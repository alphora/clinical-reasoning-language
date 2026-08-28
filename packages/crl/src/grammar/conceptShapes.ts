import conceptShapesJson from "./generated/types/conceptShapes.json";

// Runtime allowlist of concept shapes, DERIVED from CRLLexer.g4's SHAPE_VALUE action by
// scripts/extractConceptShapes.js (the .g4 is the source of truth). Consumers that enumerate
// the shapes at runtime read this.
export const conceptShapes = conceptShapesJson as string[];

// The AST-level literal union. Hand-kept in lock-step with the grammar's `validShapes` (and thus
// conceptShapes.json): the three-value set is closed and load-bearing (it drives reduction
// obligation and, at the flip, emit), so it is typed as literals rather than the widened `string`
// the JSON import yields. `Scalar` is the default the builder normalizes an omitted `shape is` to.
export type ConceptShape = "Scalar" | "Record" | "RecordSet";

/**
 * ⚠ TRANSITIONAL — the ONE place the old "undeclared means Scalar" guess still lives (#189, 2026-08-28).
 *
 * The AST builder used to normalize an omitted `shape is` to `"Scalar"`, which destroyed the difference
 * between "the author declared Scalar" and "the author said nothing". That erasure is why the emitter could
 * not raise an author-time error and instead SYNTHESIZED a records define for the case-feature
 * `cpg-featureExpression` — a reduction no author wrote (charter §4.0).
 *
 * The default is gone from the builder. Until every concept in the corpus declares a shape, downstream code
 * that structurally requires a concrete shape routes through HERE, so the remaining guess is a single
 * greppable call site instead of ~50 implicit ones.
 *
 * ⚠ DO NOT add new callers, and do not reintroduce `?? "Scalar"` inline. The end state is a validator error
 * on an undeclared shape (`shape-not-declared`), after which a valid library never reaches this function and
 * it is DELETED. RETIRE:189-shape-declared — delete this when that rule ships and the corpus is migrated.
 */
export function assumedShapePreMigration(shape: ConceptShape | undefined): ConceptShape {
  return shape ?? "Scalar";
}
