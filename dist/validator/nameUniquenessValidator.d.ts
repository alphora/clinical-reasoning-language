import { CRL } from "../ast/types";
import { ValidationError } from "./validator";
export declare class NameUniquenessValidator {
    validate(ast: CRL): ValidationError[];
}
