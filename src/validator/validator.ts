import { CRL } from "../ast/types";

import { CycleDetector } from "./cycleDetector";
import { NameUniquenessValidator } from "./nameUniquenessValidator";
import { ReferenceResolver } from "./referenceResolver";

/**
 * Stable, machine-readable discriminator for validation errors. Lets
 * consumers (CLI, extension, MCP) filter or specialize on the kind without
 * grepping message text. Add new variants here when a new validator pass
 * introduces a structurally distinct error class.
 *
 * Existing kinds:
 *   - "empty-name"           — declaration name is blank
 *   - "duplicate-name"       — two declarations of the same kind share a name
 *   - "unresolved-reference" — ref target doesn't exist in the local namespace
 *   - "reference-cycle"      — concept refs form a cycle
 *
 * Reserved (producers land in commit 2e, when per-library scoping fires
 * qualified-ref diagnostics from `validateCRLImports`):
 *   - "external-library-not-included" — qualified ref `"Pkg"."X"` to a package
 *     library that the current file did not `include`.
 *   - "qualified-ref-unresolved"      — qualified ref `"Lib"."X"` where Lib is
 *     in scope but X isn't declared there for the requested kind.
 *
 * Import-graph diagnostics (`alias-not-yet-supported`, `redundant-local-include`)
 * are `ImportDiagnostic`s, not `ValidationError`s — see `src/imports/types.ts`.
 */
export type ValidationErrorKind =
  | "empty-name"
  | "duplicate-name"
  | "unresolved-reference"
  | "reference-cycle"
  | "external-library-not-included"
  | "qualified-ref-unresolved";

export interface ValidationError {
  /**
   * Stable discriminator. See {@link ValidationErrorKind}. The human-readable
   * `message` is for display; consumers that want to specialize behavior
   * should switch on `kind` instead of parsing `message`.
   */
  kind: ValidationErrorKind;
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  severity: "error" | "warning";
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validator options.
 *
 * `soft`: when true, RELAXED checks demote certain "would-be-error" findings
 * to warnings so authoring can continue with incomplete state. Currently:
 *   - Reference-target-exists checks (unresolved concepts / terminologies)
 *     become warnings instead of errors.
 *   - Future: cardinality "required" checks (e.g. `type is` required for
 *     asserted concepts) will also be relaxed under soft mode.
 *
 * Name uniqueness and cycle detection always stay as errors — these are
 * structural defects, not just unresolved state.
 */
export interface ValidatorOptions {
  soft?: boolean;
}

export class Validator {
  private readonly nameUniquenessValidator: NameUniquenessValidator;
  private readonly referenceResolver: ReferenceResolver;
  private readonly cycleDetector: CycleDetector;

  constructor() {
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.referenceResolver = new ReferenceResolver();
    this.cycleDetector = new CycleDetector();
  }

  public validate(ast: CRL, options: ValidatorOptions = {}): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Duplicate names — always an error
    const nameResult = this.nameUniquenessValidator.validate(ast);
    errors.push(...nameResult);

    // Reference resolution — demoted to warnings in soft mode
    const refResult = this.referenceResolver.validate(ast);
    if (options.soft) {
      warnings.push(...refResult.map((e) => ({ ...e, severity: "warning" as const })));
    } else {
      errors.push(...refResult);
    }

    // Cycles — always an error (structural defect)
    const cycleResult = this.cycleDetector.validate(ast);
    errors.push(...cycleResult);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
