"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLexer = createLexer;
const antlr4ts_1 = require("antlr4ts");
const CRLLexer_1 = require("../grammar/generated/antlr/CRLLexer");
const CRLLexerErrorListener_1 = require("./CRLLexerErrorListener");
class CRLLexerWithAutoError extends CRLLexer_1.CRLLexer {
    setErrorListener(listener) {
        this.errorListener = listener;
    }
    emit() {
        const token = super.emit();
        if (this.errorListener && token.type === this.errorListener.ERROR_TOKEN_TYPE) {
            this.errorListener.handleToken(token);
        }
        return token;
    }
}
function createLexer(input) {
    const lexerErrorListener = new CRLLexerErrorListener_1.CRLLexerErrorListener();
    const lexer = new CRLLexerWithAutoError(antlr4ts_1.CharStreams.fromString(input));
    lexer.removeErrorListeners();
    lexer.addErrorListener(lexerErrorListener);
    lexer.setErrorListener(lexerErrorListener);
    return { lexer, errorListener: lexerErrorListener };
}
//# sourceMappingURL=createLexer.js.map