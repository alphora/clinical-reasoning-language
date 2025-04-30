import { readFileSync } from "fs";
import { join } from "path";

import { CRLAstBuilder } from "../ast/builder";
import { CRL } from "../ast/types";
import { printAST } from "../ast/utils";
import { createParser } from "../parser/createParser";

// Read the example file
const examplePath = join(
  __dirname,
  "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl",
);
const input = readFileSync(examplePath, "utf-8");

// Create the parser (new API)
const { parser } = createParser(input);

// Parse the input
const tree = parser.crl();

// Create the AST builder and visit the parse tree
const builder = new CRLAstBuilder();
const ast = builder.visit(tree) as CRL;

// Check if raw output is requested
const prettyOutput = process.argv.includes("--pretty");

if (!prettyOutput) {
  // Raw AST output
  console.log(JSON.stringify(ast, null, 2));
} else {
  // Pretty AST output
  console.warn("[WARNING] Pretty mode is currently broken and may not display the AST correctly.");
  console.log("AST Representation:");
  console.log("==================");
  console.log(printAST(ast));
}
