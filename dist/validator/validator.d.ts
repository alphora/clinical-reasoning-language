import { CRL } from "../ast/types";
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
    severity: "error" | "warning";
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}
export interface ValidatorOptions {
    soft?: boolean;
}
export declare class Validator {
    private readonly unusedDeclarationsValidator;
    private readonly nameUniquenessValidator;
    private readonly actionUniquenessValidator;
    private readonly referenceResolver;
    private readonly cycleDetector;
    constructor();
    validate(ast: CRL, options?: ValidatorOptions): ValidationResult;
}
