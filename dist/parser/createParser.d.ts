import { CPGLParser } from "../grammar/generated/antlr/CPGLParser";
import { CustomParserErrorListener } from "./CustomParserErrorListener";
export declare function createParser(input: string): {
    parser: CPGLParser;
    parserErrorListener: CustomParserErrorListener;
    lexerErrorListener: import("../lexer/CPGLLexerErrorListener").CPGLLexerErrorListener;
};
