import { CRL } from "../ast/types";

import { ActionUniquenessValidator } from "./actionUniquenessValidator";
import { CycleDetector } from "./cycleDetector";
import { NameUniquenessValidator } from "./nameUniquenessValidator";
import { ReferenceResolver } from "./referenceResolver";
import { UnusedDeclarationsValidator } from "./unusedDeclarationsValidator";

export interface ValidationError {
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
  private readonly unusedDeclarationsValidator: UnusedDeclarationsValidator;
  private readonly nameUniquenessValidator: NameUniquenessValidator;
  private readonly actionUniquenessValidator: ActionUniquenessValidator;
  private readonly referenceResolver: ReferenceResolver;
  private readonly cycleDetector: CycleDetector;

  constructor() {
    this.unusedDeclarationsValidator = new UnusedDeclarationsValidator();
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.actionUniquenessValidator = new ActionUniquenessValidator();
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
