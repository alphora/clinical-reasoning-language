import { CRLLexer } from "../grammar/generated/antlr/CRLLexer";
import { CRLLexerErrorListener } from "./CRLLexerErrorListener";
export declare function createLexer(input: string): {
    lexer: CRLLexer;
    errorListener: CRLLexerErrorListener;
};
