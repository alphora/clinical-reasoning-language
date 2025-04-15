import { File } from '../ast/types';

export class Validator {
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];

  validate(ast: File): ValidationResult {
    // TODO: Implement validation logic
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  message: string;
  location: SourceLocation;
  severity: ErrorSeverity;
  context?: any;
}

export interface ValidationWarning {
  message: string;
  location: SourceLocation;
  context?: any;
}

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export enum ErrorSeverity {
  Error = 'error',
  Warning = 'warning',
}
