import { CPGL } from "../ast/types";
import { ValidationError } from "./validator";
export declare class UnusedDeclarationsValidator {
    private readonly decisionDeclarations;
    private readonly conceptDeclarations;
    private readonly activityDeclarations;
    private readonly terminologyDeclarations;
    private readonly ast;
    constructor(ast?: CPGL);
    validate(ast?: CPGL): ValidationError[];
    private clear;
    private collectDeclarations;
    private processDeclarations;
    private processDecisionBody;
    private processWhenBlock;
    private processBlockBody;
    private processAction;
    private findDecision;
    private isAction;
    private generateResults;
}
