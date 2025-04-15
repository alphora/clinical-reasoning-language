import { File } from '../ast/types';

import { ActionUniquenessValidator } from './actionUniquenessValidator';
import { CycleDetector } from './cycleDetector';
import { NameUniquenessValidator } from './nameUniquenessValidator';
import { UnusedDeclarationsValidator } from './unusedDeclarationsValidator';

export interface ValidationError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class Validator {
  private unusedDeclarationsValidator: UnusedDeclarationsValidator;
  private nameUniquenessValidator: NameUniquenessValidator;
  private actionUniquenessValidator: ActionUniquenessValidator;
  private cycleDetector: CycleDetector;

  constructor() {
    this.unusedDeclarationsValidator = new UnusedDeclarationsValidator();
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.actionUniquenessValidator = new ActionUniquenessValidator();
    this.cycleDetector = new CycleDetector();
  }

  public validate(ast: File): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for unused declarations
    const unusedResult = this.unusedDeclarationsValidator.validate(ast);
    warnings.push(...unusedResult);

    // Check for duplicate names
    const nameResult = this.nameUniquenessValidator.validate(ast);
    errors.push(...nameResult);

    // Check for duplicate actions
    const actionResult = this.actionUniquenessValidator.validate(ast);
    errors.push(...actionResult);

    // Check for cycles
    const cycleResult = this.cycleDetector.validate(ast);
    errors.push(...cycleResult);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
