/**
 * Canonical AST types — the typed pattern-call representation produced by
 * the template-match pass.
 *
 * Pipeline position:
 *   Structural AST (NarrativeClause + elements)
 *     → [this stage: template-match against catalog]
 *   → Canonical AST (CanonicalPatternCall trees)
 *     → [later: CRL→CQL emitter]
 *   → CQL output
 *
 * Each `CanonicalPatternCall` corresponds to one catalog pattern. Arguments
 * are typed per the catalog's canonical signature. Patterns can nest
 * (e.g. `Last(X, BeforeStartOf(1 'year', Y))`).
 *
 * For unknown narrative phrases (soft compile, Todo 4), `known` is false
 * and `pattern` carries the unmatched narrative text as a debugging hint.
 *
 * See:
 *   - src/cql-emitter/catalog/inference-pattern-catalog.md
 *   - docs/CRL Compilation Pipeline.md
 *   - memory: project_canonical-ast-intermediate
 */

import type { Location } from "../ast/types";

export interface CanonicalPatternCall {
  type: "CanonicalPatternCall";
  /** Canonical name like "WasPerformed", "Justified", "Last", "AtLeast". */
  pattern: string;
  /** Positional arguments matching the catalog's canonical signature. */
  args: CanonicalArg[];
  /** False when the matcher couldn't find a catalog template (soft compile). */
  known: boolean;
  location: Location;
}

export type CanonicalArg =
  | ConceptRefArg
  | QuantityArg
  | EnumArg
  | DisjunctionArg
  | ConjunctionArg
  | NestedPatternArg;

/** A named reference — concept, inference, or both (resolution at emit time). */
export interface ConceptRefArg {
  type: "ConceptRefArg";
  value: string;
  /**
   * Library qualifier from the source `"Lib"."X"` form. Present only when
   * the narrative ref was qualified; absent for bare refs (which resolve
   * in the owning library at emit time).
   */
  library?: string;
  location: Location;
}

/** A quantity literal (NUMBER + UCUM/time unit). */
export interface QuantityArg {
  type: "QuantityArg";
  value: number;
  unit: string;
  location: Location;
}

/** An open or closed enum value like "documented", "record-of", "admission". */
export interface EnumArg {
  type: "EnumArg";
  value: string;
  location: Location;
}

/** Disjunction<T> — `(A or B or C)` inside narrative. */
export interface DisjunctionArg {
  type: "DisjunctionArg";
  disjuncts: CanonicalArg[];
  location: Location;
}

/** Conjunction<T> — `(A and B and C)` inside narrative. */
export interface ConjunctionArg {
  type: "ConjunctionArg";
  conjuncts: CanonicalArg[];
  location: Location;
}

/** Nested pattern call — e.g. `BeforeStartOf(1 'year', X)` as Last's scope arg. */
export interface NestedPatternArg {
  type: "NestedPatternArg";
  pattern: CanonicalPatternCall;
  location: Location;
}
