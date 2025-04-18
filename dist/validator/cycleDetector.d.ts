import { ValidationError } from './validator';
interface DecisionDeclaration {
    id: string;
    decisionReferences?: string[];
    conceptInferences?: string[];
}
export declare class CycleDetector {
    private readonly decisionAdjacencyList;
    private readonly conceptAdjacencyList;
    validate(declarations: DecisionDeclaration[]): ValidationError[];
    private detectCycles;
}
export {};
