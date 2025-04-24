"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createParser = createParser;
const CPGLParser_1 = require("../grammar/generated/antlr/CPGLParser");
const CustomParserErrorListener_1 = require("./CustomParserErrorListener");
function createParser(input) {
    const parser = new CPGLParser_1.CPGLParser(input);
    parser.removeErrorListeners();
    parser.addErrorListener(new CustomParserErrorListener_1.CustomParserErrorListener());
    return parser;
}
//# sourceMappingURL=createParser.js.map