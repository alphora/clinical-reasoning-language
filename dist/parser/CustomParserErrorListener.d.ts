import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";
export declare class CustomParserErrorListener implements ANTLRErrorListener<Token> {
    private errors;
    syntaxError(recognizer: Recognizer<Token, ATNSimulator>, offendingSymbol: Token | undefined, line: number, charPositionInLine: number, msg: string, e: RecognitionException | undefined): void;
    getErrors(): string[];
}
