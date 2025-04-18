import { CPGL } from '../ast/types';
export interface ValidationError {
    message: string;
    location: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };
    severity: 'error' | 'warning';
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}
export declare class Validator {
    private readonly unusedDeclarationsValidator;
    private readonly nameUniquenessValidator;
    private readonly actionUniquenessValidator;
    constructor();
    validate(ast: CPGL): ValidationResult;
}
