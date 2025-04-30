"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLexer = createLexer;
const antlr4ts_1 = require("antlr4ts");
const CRLLexer_1 = require("../grammar/generated/antlr/CRLLexer");
const CRLLexerErrorListener_1 = require("./CRLLexerErrorListener");
function createLexer(input) {
    const lexerErrorListener = new CRLLexerErrorListener_1.CRLLexerErrorListener();
    const lexer = new CRLLexer_1.CRLLexer(antlr4ts_1.CharStreams.fromString(input));
    lexer.removeErrorListeners();
    lexer.addErrorListener(lexerErrorListener);
    return { lexer, errorListener: lexerErrorListener };
}
//# sourceMappingURL=createLexer.js.map