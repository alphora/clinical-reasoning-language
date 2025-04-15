import { File } from '../ast/types';

import { ActionUniquenessValidator } from './actionUniquenessValidator';
import { CycleDetector } from './cycleDetector';
import { NameUniquenessValidator } from './nameUniquenessValidator';
import { UnusedDeclarationsValidator } from './unusedDeclarationsValidator';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  severity: 'error';
}

export interface ValidationWarning {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export class Validator {
  private nameUniquenessValidator: NameUniquenessValidator;
  private actionUniquenessValidator: ActionUniquenessValidator;
  private cycleDetector: CycleDetector;
  private unusedDeclarationsValidator: UnusedDeclarationsValidator;

  constructor() {
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.actionUniquenessValidator = new ActionUniquenessValidator();
    this.cycleDetector = new CycleDetector();
    this.unusedDeclarationsValidator = new UnusedDeclarationsValidator();
  }

  validate(ast: File): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for duplicate names
    errors.push(...this.nameUniquenessValidator.validate(ast));

    // Check for duplicate actions in blocks
    errors.push(...this.actionUniquenessValidator.validate(ast));

    // Check for cycles
    errors.push(...this.cycleDetector.validate(ast));

    // Check for unused declarations
    warnings.push(...this.unusedDeclarationsValidator.validate(ast));

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
