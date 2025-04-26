import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";
export declare class CustomParserErrorListener implements ANTLRErrorListener<Token> {
    private readonly errors;
    syntaxError(_recognizer: Recognizer<Token, ATNSimulator>, offendingSymbol: Token | undefined, line: number, charPositionInLine: number, msg: string, _e: RecognitionException | undefined): void;
    getErrors(): string[];
}
