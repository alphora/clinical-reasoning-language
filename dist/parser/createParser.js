"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createParser = createParser;
const antlr4ts_1 = require("antlr4ts");
const CPGLParser_1 = require("../grammar/generated/antlr/CPGLParser");
const createLexer_1 = require("../lexer/createLexer");
const CustomParserErrorListener_1 = require("./CustomParserErrorListener");
function createParser(input) {
    const { lexer, errorListener: lexerErrorListener } = (0, createLexer_1.createLexer)(input);
    const tokenStream = new antlr4ts_1.CommonTokenStream(lexer);
    const parserErrorListener = new CustomParserErrorListener_1.CustomParserErrorListener();
    const parser = new CPGLParser_1.CPGLParser(tokenStream);
    parser.removeErrorListeners();
    parser.addErrorListener(parserErrorListener);
    return { parser, parserErrorListener, lexerErrorListener };
}
//# sourceMappingURL=createParser.js.map