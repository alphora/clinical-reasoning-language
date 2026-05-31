import { ParseTree } from "antlr4ts/tree/ParseTree";
import { CRL } from "./ast/types";
import { CRLError } from "./types/errors";
export { emitCQL } from "./emitter";
export type { EmitOptions, EmitResult } from "./emitter";
export interface Token {
    line: number;
    column: number;
    type: string;
    text: string;
}
export interface ParseResult<T> {
    success: boolean;
    result?: T;
    errors?: CRLError[];
}
export declare function tokenizeCRL(input: string): ParseResult<Token[]>;
export declare function parseCRL(input: string): ParseResult<ParseTree>;
export declare function buildCRL(input: string): ParseResult<CRL>;
export interface ValidateOptions {
    soft?: boolean;
}
export interface ValidationResultEnvelope extends ParseResult<CRL> {
    warnings?: CRLError[];
}
export declare function validateCRL(input: string, options?: ValidateOptions): ValidationResultEnvelope;
