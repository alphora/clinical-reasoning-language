import { CRL } from "../ast/types";

import { ActionUniquenessValidator } from "./actionUniquenessValidator";
//import { CycleDetector } from './cycleDetector';
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

export class Validator {
  private readonly unusedDeclarationsValidator: UnusedDeclarationsValidator;
  private readonly nameUniquenessValidator: NameUniquenessValidator;
  private readonly actionUniquenessValidator: ActionUniquenessValidator;
  private readonly referenceResolver: ReferenceResolver;
  //private cycleDetector: CycleDetector;

  constructor() {
    this.unusedDeclarationsValidator = new UnusedDeclarationsValidator();
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.actionUniquenessValidator = new ActionUniquenessValidator();
    this.referenceResolver = new ReferenceResolver();
    //this.cycleDetector = new CycleDetector();
  }

  public validate(ast: CRL): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for unused declarations
    // const unusedResult = this.unusedDeclarationsValidator.validate(ast);
    // warnings.push(...unusedResult);

    // Check for duplicate names (v0.5: concept + inference share a namespace)
    const nameResult = this.nameUniquenessValidator.validate(ast);
    errors.push(...nameResult);

    // Check that every concept ref in inferred-from bodies resolves to a
    // declared concept or inference (v0.5: shared namespace).
    const refResult = this.referenceResolver.validate(ast);
    errors.push(...refResult);

    // Check for duplicate actions
    // const actionResult = this.actionUniquenessValidator.validate(ast);
    // errors.push(...actionResult);

    // TODO: Check for cycles
    // const cycleResult = this.cycleDetector.validate(ast);
    // errors.push(...cycleResult);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
