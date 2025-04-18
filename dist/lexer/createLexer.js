"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLexer = createLexer;
const CPGLLexer_1 = require("../grammar/generated/CPGLLexer");
const CPGLLexerErrorListener_1 = require("./CPGLLexerErrorListener");
function createLexer(input) {
    const lexer = new CPGLLexer_1.CPGLLexer(input);
    lexer.removeErrorListeners();
    lexer.addErrorListener(new CPGLLexerErrorListener_1.CPGLLexerErrorListener());
    return lexer;
}
//# sourceMappingURL=createLexer.js.map