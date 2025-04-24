import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from 'antlr4ts';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';
import { CharStream } from 'antlr4ts/CharStream';

import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import activityTypesJson from '../grammar/generated/types/activityTypes.json';
import conceptTypesJson from '../grammar/generated/types/conceptTypes.json';
import conceptValueTypesJson from '../grammar/generated/types/conceptValueTypes.json';

export class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
  ERROR_TOKEN_TYPE = 27;

  private readonly errors: string[] = [];

  private readonly validActivityTypes = activityTypesJson as string[];
  private readonly validConceptTypes = conceptTypesJson as string[];
  private readonly validConceptValueTypes = conceptValueTypesJson as string[];

  private parseErrorText(input: CharStream): string {
    let errorText = '';
    let currentIndex = input.index;
    while (currentIndex < input.size) {
      const char = input.LA(1);
      if (char === -1 || char === 10 || char === 13) break;
      if (char === 32 || char === 9) {
        if (errorText.length > 0) break;
      } else {
        errorText += String.fromCharCode(char);
      }
      currentIndex++;
      input.consume();
    }
    return errorText;
  }

  private parseQuotedString(input: CharStream, errorText: string): string {
    let currentIndex = input.index;
    let result = errorText;
    const isQuotedString = errorText.startsWith('"') || errorText.startsWith("'");
    if (isQuotedString) {
      while (currentIndex < input.size && !result.endsWith('"') && !result.endsWith("'")) {
        const char = input.LA(1);
        if (char === -1 || char === 10 || char === 13) break;
        result += String.fromCharCode(char);
        currentIndex++;
        input.consume();
      }
    }
    return result;
  }

  private getSpecificMessage(errorText: string, msg: string): string {
    if (!this.validActivityTypes) {
      const errorMsg = [
        'activityTypes is undefined. This usually means the JSON file was not found or not imported correctly.',
        'Check: src/grammar/activityTypes.json exists and is valid.',
        'If using a build output, ensure activityTypes.json is copied to the output directory (e.g., dist/grammar/activityTypes.json).',
        'If using ts-node or a bundler, ensure resolveJsonModule is enabled and your runtime supports JSON imports.',
        'If the file is missing, re-run the code generation step (e.g., npm run generate) or check your build scripts.'
      ].join('\n');

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!this.validConceptTypes) {
      const errorMsg = [
        'validConceptTypes is undefined. This usually means the conceptTypes array was not initialized.',
        'Check: src/grammar/conceptTypes.json exists and is valid.',
        'If using a build output, ensure conceptTypes.json is copied to the output directory (e.g., dist/grammar/conceptTypes.json).',
        'If using ts-node or a bundler, ensure resolveJsonModule is enabled and your runtime supports JSON imports.',
        'If the file is missing, re-run the code generation step (e.g., npm run generate) or check your build scripts.'
      ].join('\n');

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!this.validConceptValueTypes) {
      const errorMsg = [
        'validConceptValueTypes is undefined. This usually means the conceptValueTypes array was not initialized.',
        'Check: src/grammar/conceptValueTypes.json exists and is valid.',
        'If using a build output, ensure conceptValueTypes.json is copied to the output directory (e.g., dist/grammar/conceptValueTypes.json).',
        'If using ts-node or a bundler, ensure resolveJsonModule is enabled and your runtime supports JSON imports.',
        'If the file is missing, re-run the code generation step (e.g., npm run generate) or check your build scripts.'
      ].join('\n');

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (this.validActivityTypes.some(type => errorText.startsWith(type))) {
      return `Invalid character in activity type: ${errorText}`;
    }
    if (this.validConceptTypes.some(type => errorText.startsWith(type))) {
      return `Invalid character in concept type: ${errorText}`;
    }
    if (this.validConceptValueTypes.some(type => errorText.startsWith(type))) {
      return `Invalid character in concept value type: ${errorText}`;
    }
    return `Invalid token: ${errorText}`;
  }

  syntaxError<T extends number>(
    _recognizer: Recognizer<T, ATNSimulator>,
    _offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    const input: CharStream = _recognizer.inputStream as CharStream;
    const startIndex = input.index;
    let errorText = this.parseErrorText(input);
    errorText = this.parseQuotedString(input, errorText);
    const specificMessage = this.getSpecificMessage(errorText, msg);

    const errorMessage = JSON.stringify({
      type: "LexicalError",
      line: line,
      column: charPositionInLine,
      message: specificMessage,
      details: {
        message:`${msg}`
      }
    });
    console.error(errorMessage);
    this.errors.push(errorMessage);

    if (_recognizer instanceof CPGLLexer) {
      const errorToken: Token = {
        type: this.ERROR_TOKEN_TYPE,
        text: errorMessage,
        channel: Token.DEFAULT_CHANNEL,
        startIndex,
        stopIndex: input.index - 1,
        line,
        charPositionInLine,
        tokenIndex: -1,
        tokenSource: _recognizer,
        inputStream: input,
      };

      _recognizer.emit(errorToken);
      return;
    }

    throw new Error(errorMessage);
  }

  getErrors(): string[] {
    return this.errors;
  }

  public reportCustomError(line: number, column: number, message: string, details?: any): void {
    const errorMessage = JSON.stringify({
      type: 'LexicalError',
      line,
      column,
      message,
      details,
    });
    console.error(errorMessage);
    this.errors.push(errorMessage);
  }
}