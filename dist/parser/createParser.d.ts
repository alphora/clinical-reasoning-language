import { CPGLParser } from "../grammar/generated/antlr/CPGLParser";
import { CustomParserErrorListener } from "./CustomParserErrorListener";
export declare function createParser(input: string): {
    parser: CPGLParser;
    lexerErrorListener: import("../lexer/CPGLLexerErrorListener").CPGLLexerErrorListener;
    parserErrorListener: CustomParserErrorListener;
};
