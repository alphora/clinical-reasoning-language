"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const antlr4ts_1 = require("antlr4ts");
const builder_1 = require("../ast/builder");
const utils_1 = require("../ast/utils");
const createLexer_1 = require("../lexer/createLexer");
const createParser_1 = require("../parser/createParser");
const examplePath = (0, path_1.join)(__dirname, '../examples/cpgl/who/measles/IMMZ_All_Decisions.cpg');
const input = (0, fs_1.readFileSync)(examplePath, 'utf-8');
const lexer = (0, createLexer_1.createLexer)(antlr4ts_1.CharStreams.fromString(input));
const tokenStream = new antlr4ts_1.CommonTokenStream(lexer);
const parser = (0, createParser_1.createParser)(tokenStream);
const tree = parser.cpgl();
const builder = new builder_1.CPGLAstBuilder();
const ast = builder.visit(tree);
const prettyOutput = process.argv.includes('--pretty');
if (!prettyOutput) {
    console.log(JSON.stringify(ast, null, 2));
}
else {
    console.warn('[WARNING] Pretty mode is currently broken and may not display the AST correctly.');
    console.log('AST Representation:');
    console.log('==================');
    console.log((0, utils_1.printAST)(ast));
}
//# sourceMappingURL=run-ast.js.map