"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLexer = createLexer;
const antlr4ts_1 = require("antlr4ts");
const CPGLLexer_1 = require("../grammar/generated/antlr/CPGLLexer");
const CPGLLexerErrorListener_1 = require("./CPGLLexerErrorListener");
function createLexer(input) {
    const lexerErrorListener = new CPGLLexerErrorListener_1.CPGLLexerErrorListener();
    const lexer = new CPGLLexer_1.CPGLLexer(antlr4ts_1.CharStreams.fromString(input));
    lexer.removeErrorListeners();
    lexer.addErrorListener(lexerErrorListener);
    return { lexer, errorListener: lexerErrorListener };
}
//# sourceMappingURL=createLexer.js.map