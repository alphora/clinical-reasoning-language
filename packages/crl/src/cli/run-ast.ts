import { readFileSync } from "fs";
import { join } from "path";

import { createBuilder } from "../ast/createBuilder";
import { printAST } from "../ast/utils";
import { createParser } from "../parser/createParser";

// Parse --path argument
const pathArgIndex = process.argv.indexOf("--path");
const filePath =
  (pathArgIndex !== -1 && process.argv[pathArgIndex + 1]) ||
  join(__dirname, "../../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");
const input = readFileSync(filePath, "utf-8");

// Create the parser (new API)
const { parser, parserErrorListener, lexerErrorListener } = createParser(input);

// Parse the input
const tree = parser.crl();

// Check for lexer and parser errors before building the AST
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

// Create the AST builder and visit the parse tree
const { ast, errors } = createBuilder(tree);
if (errors.length > 0) {
  console.error("AST builder errors:");
  errors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
  process.exit(1);
}

// Check if raw output is requested
const prettyOutput = process.argv.includes("--pretty");

if (!prettyOutput) {
  // Raw AST output
  console.log(JSON.stringify(ast, null, 2));
} else {
  // Pretty AST output
  console.warn("[WARNING] Pretty mode is currently broken and may not display the AST correctly.");
  console.log(`AST Representation for: ${filePath}`);
  console.log("==================");
  console.log(printAST(ast));
}
