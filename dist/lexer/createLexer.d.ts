import { CPGLLexer } from "../grammar/generated/antlr/CPGLLexer";
import { CPGLLexerErrorListener } from "./CPGLLexerErrorListener";
export declare function createLexer(input: string): {
    lexer: CPGLLexer;
    errorListener: CPGLLexerErrorListener;
};
