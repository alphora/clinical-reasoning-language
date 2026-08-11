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
