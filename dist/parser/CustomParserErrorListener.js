"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomParserErrorListener = void 0;
class CustomParserErrorListener {
    constructor() {
        this.errors = [];
    }
    syntaxError(_recognizer, offendingSymbol, line, charPositionInLine, msg, _e) {
        const offendingDetails = offendingSymbol
            ? {
                text: offendingSymbol.text,
                type: offendingSymbol.type,
                line: offendingSymbol.line,
                charPositionInLine: offendingSymbol.charPositionInLine,
                startIndex: offendingSymbol.startIndex,
                stopIndex: offendingSymbol.stopIndex,
                tokenIndex: offendingSymbol.tokenIndex,
            }
            : { text: "unknown" };
        const error = {
            type: "ParserError",
            line,
            column: charPositionInLine,
            message: `Syntax error: ${msg}`,
            details: {
                offendingSymbol: offendingDetails,
            },
        };
        this.errors.push(error);
    }
    getErrors() {
        return this.errors;
    }
}
exports.CustomParserErrorListener = CustomParserErrorListener;
//# sourceMappingURL=CustomParserErrorListener.js.map