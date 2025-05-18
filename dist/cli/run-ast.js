"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const createBuilder_1 = require("../ast/createBuilder");
const utils_1 = require("../ast/utils");
const createParser_1 = require("../parser/createParser");
const pathArgIndex = process.argv.indexOf("--path");
const filePath = (pathArgIndex !== -1 && process.argv[pathArgIndex + 1]) ||
    (0, path_1.join)(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");
const input = (0, fs_1.readFileSync)(filePath, "utf-8");
const { parser, parserErrorListener, lexerErrorListener } = (0, createParser_1.createParser)(input);
const tree = parser.crl();
const lexerErrors = lexerErrorListener.getErrors();
const parserErrors = parserErrorListener.getErrors();
if (parserErrors.length > 0) {
    console.error("Parser errors:");
    parserErrors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
    process.exit(1);
}
if (lexerErrors.length > 0) {
    console.error("Lexer errors:");
    lexerErrors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
    process.exit(1);
}
const { ast, errors } = (0, createBuilder_1.createBuilder)(tree);
if (errors.length > 0) {
    console.error("AST builder errors:");
    errors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
    process.exit(1);
}
const prettyOutput = process.argv.includes("--pretty");
if (!prettyOutput) {
    console.log(JSON.stringify(ast, null, 2));
}
else {
    console.warn("[WARNING] Pretty mode is currently broken and may not display the AST correctly.");
    console.log(`AST Representation for: ${filePath}`);
    console.log("==================");
    console.log((0, utils_1.printAST)(ast));
}
//# sourceMappingURL=run-ast.js.map