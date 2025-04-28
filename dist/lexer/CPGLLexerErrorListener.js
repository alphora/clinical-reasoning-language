"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPGLLexerErrorListener = void 0;
const antlr4ts_1 = require("antlr4ts");
const CPGLLexer_1 = require("../grammar/generated/antlr/CPGLLexer");
const activityTypes_json_1 = __importDefault(require("../grammar/generated/types/activityTypes.json"));
const conceptTypes_json_1 = __importDefault(require("../grammar/generated/types/conceptTypes.json"));
const conceptValueTypes_json_1 = __importDefault(require("../grammar/generated/types/conceptValueTypes.json"));
class CPGLLexerErrorListener {
    constructor() {
        this.ERROR_TOKEN_TYPE = 27;
        this.errors = [];
        this.validActivityTypes = activityTypes_json_1.default;
        this.validConceptTypes = conceptTypes_json_1.default;
        this.validConceptValueTypes = conceptValueTypes_json_1.default;
    }
    parseErrorText(input) {
        let errorText = "";
        let currentIndex = input.index;
        while (currentIndex < input.size) {
            const char = input.LA(1);
            if (char === -1 || char === 10 || char === 13)
                break;
            if (char === 32 || char === 9) {
                if (errorText.length > 0)
                    break;
            }
            else {
                errorText += String.fromCharCode(char);
            }
            currentIndex++;
            input.consume();
        }
        return errorText;
    }
    parseQuotedString(input, errorText) {
        let currentIndex = input.index;
        let result = errorText;
        const isQuotedString = errorText.startsWith('"') || errorText.startsWith("'");
        if (isQuotedString) {
            while (currentIndex < input.size && !result.endsWith('"') && !result.endsWith("'")) {
                const char = input.LA(1);
                if (char === -1 || char === 10 || char === 13)
                    break;
                result += String.fromCharCode(char);
                currentIndex++;
                input.consume();
            }
        }
        return result;
    }
    getSpecificMessage(errorText, _msg) {
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
        if (this.validActivityTypes.some((type) => errorText.startsWith(type))) {
            return `Invalid character in activity type: ${errorText}`;
        }
        if (this.validConceptTypes.some((type) => errorText.startsWith(type))) {
            return `Invalid character in concept type: ${errorText}`;
        }
        if (this.validConceptValueTypes.some((type) => errorText.startsWith(type))) {
            return `Invalid character in concept value type: ${errorText}`;
        }
        return `Invalid token: ${errorText}`;
    }
    syntaxError(recognizer, offendingSymbol, line, charPositionInLine, msg, _e) {
        const input = recognizer.inputStream;
        const startIndex = input.index;
        let errorText = this.parseErrorText(input);
        errorText = this.parseQuotedString(input, errorText);
        const specificMessage = this.getSpecificMessage(errorText, msg);
        let offendingDetails = { text: "unknown" };
        if (offendingSymbol && typeof offendingSymbol.text === "string") {
            const token = offendingSymbol;
            offendingDetails = {
                text: token.text,
                type: token.type,
                line: token.line,
                charPositionInLine: token.charPositionInLine,
                startIndex: token.startIndex,
                stopIndex: token.stopIndex,
                tokenIndex: token.tokenIndex,
            };
        }
        else if (offendingSymbol !== undefined) {
            offendingDetails = { text: String(offendingSymbol) };
        }
        const errorMessage = JSON.stringify({
            type: "LexicalError",
            line: line,
            column: charPositionInLine,
            message: specificMessage,
            details: {
                message: `${msg}`,
                offendingSymbol: offendingDetails,
            },
        });
        console.error(errorMessage);
        this.errors.push(errorMessage);
        if (recognizer instanceof CPGLLexer_1.CPGLLexer) {
            const errorToken = {
                type: this.ERROR_TOKEN_TYPE,
                text: errorMessage,
                channel: antlr4ts_1.Token.DEFAULT_CHANNEL,
                startIndex,
                stopIndex: input.index - 1,
                line: line,
                charPositionInLine: charPositionInLine,
                tokenIndex: -1,
                tokenSource: recognizer,
                inputStream: input,
            };
            recognizer.emit(errorToken);
            return;
        }
        throw new Error(errorMessage);
    }
    getErrors() {
        return this.errors;
    }
    reportCustomError(line, column, message, details) {
        const errorMessage = JSON.stringify({
            type: "LexicalError",
            line,
            column,
            message,
            details,
        });
        console.error(errorMessage);
        this.errors.push(errorMessage);
    }
}
exports.CPGLLexerErrorListener = CPGLLexerErrorListener;
//# sourceMappingURL=CPGLLexerErrorListener.js.map