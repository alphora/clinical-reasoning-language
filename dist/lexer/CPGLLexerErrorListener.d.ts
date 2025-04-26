import { ANTLRErrorListener, RecognitionException, Recognizer } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";
export declare class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
    ERROR_TOKEN_TYPE: number;
    private readonly errors;
    private readonly validActivityTypes;
    private readonly validConceptTypes;
    private readonly validConceptValueTypes;
    private parseErrorText;
    private parseQuotedString;
    private getSpecificMessage;
    syntaxError<T extends number>(recognizer: Recognizer<T, ATNSimulator>, offendingSymbol: T | undefined, line: number, charPositionInLine: number, msg: string, _e: RecognitionException | undefined): void;
    getErrors(): string[];
    reportCustomError(line: number, column: number, message: string, details?: any): void;
}
