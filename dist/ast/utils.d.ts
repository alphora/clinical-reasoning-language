import { ASTNode } from './types';
interface ASTComparison {
    lineCountsMatch: boolean;
    whitespaceNormalizedMatch: boolean;
    structureMatch: boolean;
    generatedLineCount: number;
    expectedLineCount: number;
    maxLines: number;
    generatedLines: string[];
    expectedLines: string[];
}
export declare function printAST(node: ASTNode, indent?: number): string;
export declare function compareASTs(generatedAST: string, expectedAST: string): ASTComparison;
export {};
