import { CRL } from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import { CycleDetector } from "./cycleDetector";
import { DecisionShapeValidator } from "./decisionShapeValidator";
import { NameUniquenessValidator } from "./nameUniquenessValidator";
import { ReferenceResolver } from "./referenceResolver";

/**
 * Stable, machine-readable discriminator for validation errors. Lets
 * consumers (CLI, extension, MCP) filter or specialize on the kind without
 * grepping message text.
 *
 * Kinds:
 *   - "empty-name"                      — declaration name is blank
 *   - "duplicate-name"                  — two declarations of the same kind
 *                                         share a name within the same library
 *   - "unresolved-reference"            — bare ref target doesn't exist
 *                                         in the local namespace
 *   - "reference-cycle"                 — concept refs form a cycle
 *   - "external-library-not-included"   — qualified ref `"Pkg"."X"` to a
 *                                         package library that the current
 *                                         file did not `include`, or to an
 *                                         unknown library
 *   - "qualified-ref-unresolved"        — qualified ref `"Lib"."X"` where
 *                                         Lib is in scope but X isn't
 *                                         declared there for the requested
 *                                         kind
 */
export type ValidationErrorKind =
  | "empty-name"
  | "duplicate-name"
  | "unresolved-reference"
  | "reference-cycle"
  | "decision-delegation-cycle"
  | "external-library-not-included"
  | "qualified-ref-unresolved"
  | "decision-shape";

/**
 * The specific decision-shape rule a `decision-shape` error violates. Lets
 * consumers specialize without parsing message text. See docs/decision-shapes.md.
 */
export type DecisionShapeRule =
  | "qualifier-required"
  | "qualifier-on-single-member"
  | "any-over-branches"
  | "first-over-actions"
  | "otherwise-misplaced"
  | "otherwise-required"
  | "otherwise-only"
  | "guard-on-single-action";

interface ValidationErrorBase {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  severity: "error" | "warning";
  // Source attribution — populated by source-aware validators (multi-file
  // path). Absent in single-file `validateCRL` mode where the ast doesn't
  // carry file/library identity.
  libraryName?: string;
  filePath?: string;
}

export interface EmptyNameError extends ValidationErrorBase {
  kind: "empty-name";
}
export interface DuplicateNameError extends ValidationErrorBase {
  kind: "duplicate-name";
}
export interface UnresolvedReferenceError extends ValidationErrorBase {
  kind: "unresolved-reference";
}
export interface ReferenceCycleError extends ValidationErrorBase {
  kind: "reference-cycle";
}
// T02 / #96. Validator-side decision-delegation cycle. The FHIR-emitter side
// emits a separate `circular-decision-reference` kind (see fhir-emitter/types.ts)
// from its own SCC classification — distinct kind, distinct message shape,
// distinct call path; callers filtering by kind may need to handle both.
export interface DecisionDelegationCycleError extends ValidationErrorBase {
  kind: "decision-delegation-cycle";
}
export interface ExternalLibraryNotIncludedError extends ValidationErrorBase {
  kind: "external-library-not-included";
  // The library name in the offending qualified ref `"<targetLibrary>"."X"`.
  targetLibrary: string;
}
export interface QualifiedRefUnresolvedError extends ValidationErrorBase {
  kind: "qualified-ref-unresolved";
  // The library name in the offending qualified ref `"<targetLibrary>"."<targetName>"`.
  targetLibrary: string;
  targetName: string;
}
// Decision-shape structural rule violation (first/any/all/otherwise legality).
// Never demoted under `soft` — a malformed decision shape is a structural
// defect, not incomplete-but-fixable authoring state.
export interface DecisionShapeError extends ValidationErrorBase {
  kind: "decision-shape";
  rule: DecisionShapeRule;
}

export type ValidationError =
  | EmptyNameError
  | DuplicateNameError
  | UnresolvedReferenceError
  | ReferenceCycleError
  | DecisionDelegationCycleError
  | ExternalLibraryNotIncludedError
  | QualifiedRefUnresolvedError
  | DecisionShapeError;

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validator options.
 *
 * `soft`: when true, RELAXED checks demote certain "would-be-error" findings
 * to warnings so authoring can continue with incomplete state. The kinds
 * that demote are listed in `SOFT_DEMOTABLE_KINDS` below; structural
 * diagnostics like `external-library-not-included` and cycles never demote.
 */
export interface ValidatorOptions {
  soft?: boolean;
}

/**
 * The set of validation kinds that downgrade to warnings under `soft` mode.
 * These represent incomplete-but-fixable authoring state, not structural
 * defects in the source.
 */
const SOFT_DEMOTABLE_KINDS: ReadonlySet<ValidationErrorKind> = new Set([
  "unresolved-reference",
  "qualified-ref-unresolved",
]);

function demote(e: ValidationError): ValidationError {
  return { ...e, severity: "warning" } as ValidationError;
}

export class Validator {
  private readonly nameUniquenessValidator: NameUniquenessValidator;
  private readonly referenceResolver: ReferenceResolver;
  private readonly cycleDetector: CycleDetector;
  private readonly decisionShapeValidator: DecisionShapeValidator;

  constructor() {
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.referenceResolver = new ReferenceResolver();
    this.cycleDetector = new CycleDetector();
    this.decisionShapeValidator = new DecisionShapeValidator();
  }

  /**
   * Validate a CRL AST.
   *
   * Single-file mode (`sources` absent): validators treat `ast` as the only
   * library; `Concept`/`Decision`/`Activity`/`Terminology` names form a flat
   * local namespace; bare refs resolve against that namespace; qualified refs
   * to non-self libraries emit `external-library-not-included`.
   *
   * Multi-file mode (`sources` present): validators use per-statement scope
   * context to enforce per-library uniqueness, per-library bare-ref
   * resolution, and qualified-ref resolution against the target library's
   * scope.
   */
  public validate(
    ast: CRL,
    options: ValidatorOptions = {},
    sources?: SourceContext[],
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const pushSplit = (results: ValidationError[]): void => {
      for (const e of results) {
        if (options.soft && SOFT_DEMOTABLE_KINDS.has(e.kind)) {
          warnings.push(demote(e));
        } else {
          errors.push(e);
        }
      }
    };

    // Duplicate names — always an error (never demoted)
    const nameResult = this.nameUniquenessValidator.validate(ast, sources);
    errors.push(...nameResult);

    // Reference resolution — per-kind demotion via SOFT_DEMOTABLE_KINDS
    const refResult = this.referenceResolver.validate(ast, sources);
    pushSplit(refResult);

    // Cycles — always an error (structural defect)
    const cycleResult = this.cycleDetector.validate(ast, sources);
    errors.push(...cycleResult);

    // Decision-shape structural rules — always an error (never demoted)
    const shapeResult = this.decisionShapeValidator.validate(ast, sources);
    errors.push(...shapeResult);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
