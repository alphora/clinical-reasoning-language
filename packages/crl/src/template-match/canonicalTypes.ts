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
  | TerminologyRefArg
  | SubsetRefArg
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

/**
 * ⭐⭐ A named TERMINOLOGY reference — a value set, NOT a concept.
 *
 * ⚠⚠ IT IS A SEPARATE ARG TYPE ON PURPOSE, and passing one as a `ConceptRefArg` would be a real defect,
 * not a cosmetic one: every consumer of `ConceptRefArg` treats it as a concept that must resolve in
 * `siblingsByName` AND as a determinant CONTRIBUTING A RECENCY STAMP to a producer candidate
 * (`emit/producerCandidate.ts`). A value set has neither an identity in that map nor a date. The
 * membership predicate (`"X" in "VS"`) is the first pattern whose operands live in DIFFERENT namespaces,
 * so the distinction has to be in the type rather than in each consumer's head.
 *
 * ⚠ Only the DATUM operand stamps the candidate; a `TerminologyRefArg` never enters `operandStamps`.
 */
export interface TerminologyRefArg {
  type: "TerminologyRefArg";
  value: string;
  /** Library qualifier from the source `"Lib"."VS"` form; absent for bare refs. */
  library?: string;
  location: Location;
}

/**
 * ⭐⭐ A SUBSET of the SUBJECT's own inline answer options — `"X" in qualifying` (#189).
 *
 * ⚠⚠ IT IS NOT A `TerminologyRefArg`, AND REUSING ONE WOULD BE A REAL DEFECT. A terminology ref resolves
 * in the TERMINOLOGY namespace; `qualifying` resolves against THE SUBJECT CONCEPT'S OWN declaration. Passing
 * it as a terminology would send the resolver looking for a value set named "qualifying", and two different
 * subjects each with a `qualifying` subset would be indistinguishable — the same namespace confusion that
 * made `TerminologyRefArg` a separate type from `ConceptRefArg` in the first place.
 *
 * ⚠ THE COMPARAND'S REAL IDENTITY IS `(owning concept, subset name)`. Only the NAME is carried here because
 * the owning concept is the membership call's FIRST arg — the subject. Resolution therefore happens against
 * `args[0]`, never against a global table. Do not "helpfully" add a library or terminology field.
 *
 * ⚠ Like `TerminologyRefArg`, this never stamps a producer candidate: only the DATUM operand does.
 */
export interface SubsetRefArg {
  type: "SubsetRefArg";
  /** The subset's name. Today always `"qualifying"` — the only spelling the grammar enables. */
  value: string;
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
