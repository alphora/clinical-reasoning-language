import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { CPGL } from './ast/types';
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
export declare function tokenizeCPGL(input: string): ParseResult<Token[]>;
export declare function parseCPGL(input: string): ParseResult<ParseTree>;
export declare function buildCPGL(input: string): ParseResult<CPGL>;
export declare function validateCPGL(input: string): ParseResult<CPGL>;
