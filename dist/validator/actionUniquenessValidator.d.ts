import { CRL } from "../ast/types";
import { ValidationError } from "./validator";
export declare class ActionUniquenessValidator {
    private ast;
    validate(ast: CRL): ValidationError[];
    private validateDecisionBody;
    private validateWhenBlock;
    private validateBlockBody;
    private validateActionStatement;
    private buildActionGraph;
    private collectActions;
    private processActionDependencies;
    private findContainingDecision;
    private findCycles;
    private dfs;
    private findActionLocation;
    private findActionInBody;
    private collectDefinedActions;
    private checkUndefinedActions;
}
