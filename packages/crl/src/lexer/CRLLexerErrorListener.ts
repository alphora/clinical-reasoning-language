import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";
import { CharStream } from "antlr4ts/CharStream";

import { CRLLexer } from "../grammar/generated/antlr/CRLLexer";
import activityTypesJson from "../grammar/generated/types/activityTypes.json";
import conceptTypesJson from "../grammar/generated/types/conceptTypes.json";
import conceptValueTypesJson from "../grammar/generated/types/conceptValueTypes.json";
import parameterTypesJson from "../grammar/generated/types/parameterTypes.json";
import { CRLError } from "../types/errors";

export class CRLLexerErrorListener implements ANTLRErrorListener<number> {
  ERROR_TOKEN_TYPE = CRLLexer.ERROR;

  private readonly errors: CRLError[] = [];

  private readonly validActivityTypes = activityTypesJson as string[];
  private readonly validConceptTypes = conceptTypesJson as string[];
  private readonly validConceptValueTypes = conceptValueTypesJson as string[];
  private readonly validParameterTypes = parameterTypesJson as string[];

  private parseErrorText(input: CharStream): string {
    let errorText = "";
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

  private getSpecificMessage(errorText: string, _msg: string): string {
    if (!this.validActivityTypes) {
      const errorMsg = [
        "activityTypes is undefined. This usually means the JSON file was not found or not imported correctly.",
        "Check: src/grammar/activityTypes.json exists and is valid.",
        "If using a build output, ensure activityTypes.json is copied to the output directory (e.g., dist/grammar/activityTypes.json).",
        "If using ts-node or a bundler, ensure resolveJsonModule is enabled and your runtime supports JSON imports.",
        "If the file is missing, re-run the code generation step (e.g., npm run generate) or check your build scripts.",
      ].join("\n");

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!this.validConceptTypes) {
      const errorMsg = [
        "validConceptTypes is undefined. This usually means the conceptTypes array was not initialized.",
        "Check: src/grammar/conceptTypes.json exists and is valid.",
        "If using a build output, ensure conceptTypes.json is copied to the output directory (e.g., dist/grammar/conceptTypes.json).",
        "If using ts-node or a bundler, ensure resolveJsonModule is enabled and your runtime supports JSON imports.",
        "If the file is missing, re-run the code generation step (e.g., npm run generate) or check your build scripts.",
      ].join("\n");

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!this.validConceptValueTypes) {
      const errorMsg = [
        "validConceptValueTypes is undefined. This usually means the conceptValueTypes array was not initialized.",
        "Check: src/grammar/conceptValueTypes.json exists and is valid.",
        "If using a build output, ensure conceptValueTypes.json is copied to the output directory (e.g., dist/grammar/conceptValueTypes.json).",
        "If using ts-node or a bundler, ensure resolveJsonModule is enabled and your runtime supports JSON imports.",
        "If the file is missing, re-run the code generation step (e.g., npm run generate) or check your build scripts.",
      ].join("\n");

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!this.validParameterTypes) {
      const errorMsg = [
        "validParameterTypes is undefined. This usually means the parameterTypes array was not initialized.",
        "Check: src/grammar/generated/types/parameterTypes.json exists and is valid.",
        "If the file is missing, re-run the code generation step (npm run generate) which produces it via scripts/extractParameterTypes.js.",
      ].join("\n");

      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (this.validActivityTypes.some((type) => errorText.startsWith(type))) {
      return `Invalid character in activity type: ${errorText}`;
    }
    if (this.validConceptTypes.some((type) => errorText.startsWith(type))) {
      return `Invalid character in concept type: ${errorText}`;
    }
    if (this.validConceptValueTypes.some((type) => errorText.startsWith(type))) {
      return `Invalid character in concept value type: ${errorText}`;
    }
    if (this.validParameterTypes.some((type) => errorText.startsWith(type))) {
      return `Invalid character in parameter type: ${errorText}`;
    }
    return `Invalid token: ${errorText}`;
  }

  syntaxError<T extends number>(
    recognizer: Recognizer<T, ATNSimulator>,
    offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    const input: CharStream = recognizer.inputStream as CharStream;
    const startIndex = input.index;
    let errorText = this.parseErrorText(input);
    errorText = this.parseQuotedString(input, errorText);
    const specificMessage = this.getSpecificMessage(errorText, msg);

    let offendingDetails: unknown = { text: "unknown" };
    if (offendingSymbol && typeof (offendingSymbol as unknown as Token).text === "string") {
      const token = offendingSymbol as unknown as Token;
      offendingDetails = {
        text: token.text,
        type: token.type,
        line: token.line,
        charPositionInLine: token.charPositionInLine,
        startIndex: token.startIndex,
        stopIndex: token.stopIndex,
        tokenIndex: token.tokenIndex,
      };
    } else if (offendingSymbol !== undefined) {
      offendingDetails = { text: String(offendingSymbol) };
    }

    const error: CRLError = {
      type: "LexicalError",
      line,
      column: charPositionInLine,
      message: specificMessage,
      details: {
        message: msg,
        offendingSymbol: offendingDetails,
      },
    };
    this.errors.push(error);

    if (recognizer instanceof CRLLexer) {
      const errorToken: Token = {
        type: this.ERROR_TOKEN_TYPE,
        text: JSON.stringify(error),
        channel: Token.DEFAULT_CHANNEL,
        startIndex,
        stopIndex: input.index - 1,
        line,
        charPositionInLine,
        tokenIndex: -1,
        tokenSource: recognizer,
        inputStream: input,
      };
      recognizer.emit(errorToken);
      return;
    }
    throw new Error(JSON.stringify(error));
  }

  handleToken(token: Token): void {
    if (token.type === this.ERROR_TOKEN_TYPE) {
      let details: Record<string, unknown> = { text: token.text };
      let message: string;
      try {
        const parsed = JSON.parse(token.text ?? "{}") as Record<string, unknown>;
        details = parsed;
        switch (parsed.errorType) {
          case "InvalidActivityType":
            message = `Invalid activity type: ${parsed.value}`;
            break;
          case "InvalidConceptType":
            message = `Invalid concept type: ${parsed.value}`;
            break;
          case "InvalidConceptValueType":
            message = `Invalid concept value type: ${parsed.value}`;
            break;
          case "InvalidConceptShape":
            message = `Invalid concept shape: ${parsed.value}`;
            break;
          case "InvalidCharacterInActivityType":
            message = `Invalid character in activity type: ${parsed.value}`;
            break;
          case "InvalidCharacterInConceptType":
            message = `Invalid character in concept type: ${parsed.value}`;
            break;
          case "InvalidCharacterInConceptValueType":
            message = `Invalid character in concept value type: ${parsed.value}`;
            break;
          case "InvalidParameterType":
            message = `Invalid parameter type: ${parsed.value}`;
            break;
          case "InvalidCharacterInParameterType":
            message = `Invalid character in parameter type: ${parsed.value}`;
            break;
          default:
            message = `Invalid token: ${typeof parsed.value === "string" ? parsed.value : token.text}`;
        }
      } catch {
        // fallback to generic message
        message = `Invalid token: ${token.text}`;
      }

      const lastError = this.errors[this.errors.length - 1];
      const line = (details.line as number) ?? token.line;
      const column = (details.charPosition as number) ?? token.charPositionInLine;
      const value = (details.value as string) ?? token.text;
      const lastValue =
        typeof lastError?.details === "object" &&
        lastError.details !== null &&
        "value" in lastError.details
          ? (lastError.details as { value?: unknown }).value
          : undefined;
      if (
        !lastError ||
        lastError.line !== line ||
        lastError.column !== column ||
        lastValue !== value
      ) {
        const error: CRLError = {
          type: "LexicalError",
          line,
          column,
          message,
          details,
        };
        this.errors.push(error);
      }
    }
  }

  getErrors(): CRLError[] {
    return this.errors;
  }
}
