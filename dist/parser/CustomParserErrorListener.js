"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomParserErrorListener = void 0;
class CustomParserErrorListener {
    constructor() {
        this.errors = [];
    }
    syntaxError(recognizer, offendingSymbol, line, charPositionInLine, msg, e) {
        const errorMessage = JSON.stringify({
            type: "ParserError",
            line: line,
            column: charPositionInLine,
            message: `Syntax error: ${msg}`,
            details: {
                offendingSymbol: offendingSymbol?.text || "unknown",
            },
        });
        console.error(errorMessage);
        this.errors.push(errorMessage);
    }
    getErrors() {
        return this.errors;
    }
}
exports.CustomParserErrorListener = CustomParserErrorListener;
//# sourceMappingURL=CustomParserErrorListener.js.map