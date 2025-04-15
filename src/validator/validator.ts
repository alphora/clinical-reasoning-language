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

  public validate(ast: File): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for unused declarations
    const unusedResult = this.unusedDeclarationsValidator.validate(ast);
    warnings.push(
      ...unusedResult.warnings.map(message => ({
        message,
        location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      })),
    );

    // Check for duplicate names
    warnings.push(...this.nameUniquenessValidator.validate(ast));

    // Check for duplicate actions in blocks
    errors.push(...this.actionUniquenessValidator.validate(ast));

    // Check for cycles
    errors.push(...this.cycleDetector.validate(ast));

    return {
      isValid: warnings.length === 0 && errors.length === 0,
      warnings,
      errors,
    };
  }
}
