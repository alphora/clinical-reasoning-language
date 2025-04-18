import { ANTLRErrorListener, RecognitionException, Recognizer } from 'antlr4ts';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';
export declare class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
    ERROR_TOKEN_TYPE: number;
    private errors;
    private validConceptTypes;
    private validConceptValueTypes;
    syntaxError<T extends number>(_recognizer: Recognizer<T, ATNSimulator>, _offendingSymbol: T | undefined, line: number, charPositionInLine: number, msg: string, _e: RecognitionException | undefined): void;
    getErrors(): string[];
    reportCustomError(line: number, column: number, message: string, details?: any): void;
}
