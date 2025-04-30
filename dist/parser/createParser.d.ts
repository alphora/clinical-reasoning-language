import { CRLParser } from "../grammar/generated/antlr/CRLParser";
import { CustomParserErrorListener } from "./CustomParserErrorListener";
export declare function createParser(input: string): {
    parser: CRLParser;
    parserErrorListener: CustomParserErrorListener;
    lexerErrorListener: import("../lexer/CRLLexerErrorListener").CRLLexerErrorListener;
};
