import { CPGL } from "../ast/types";
import { ValidationError } from "./validator";
export declare class NameUniquenessValidator {
    validate(ast: CPGL): ValidationError[];
}
