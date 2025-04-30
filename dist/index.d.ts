import { ParseTree } from "antlr4ts/tree/ParseTree";
import { CRL } from "./ast/types";
export interface Token {
    line: number;
    column: number;
    type: string;
    text: string;
}
export interface ParseResult<T> {
    success: boolean;
    result?: T;
    errors?: string[];
}
export declare function tokenizeCRL(input: string): ParseResult<Token[]>;
export declare function parseCRL(input: string): ParseResult<ParseTree>;
export declare function buildCRL(input: string): ParseResult<CRL>;
export declare function validateCRL(input: string): ParseResult<CRL>;
