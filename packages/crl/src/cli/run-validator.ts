import { readFileSync } from "fs";
import { join } from "path";

import { CRLAstBuilder } from "../ast/builder";
import { CRL } from "../ast/types";
import { createParser } from "../parser/createParser";
import { Validator } from "../validator/validator";

// Parse --path argument
const pathArgIndex = process.argv.indexOf("--path");
const filePath =
  (pathArgIndex !== -1 && process.argv[pathArgIndex + 1]) ||
  join(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");
const input = readFileSync(filePath, "utf-8");

// Create the parser (new API)
const { parser } = createParser(input);

// Parse the input
const tree = parser.crl();

// Create the AST builder and visit the parse tree
const builder = new CRLAstBuilder();
const ast = builder.visit(tree) as CRL;

// Create the validator and validate the AST
const validator = new Validator();
const result = validator.validate(ast);

// Check if pretty output is requested
const prettyOutput = process.argv.includes("--pretty");

if (!prettyOutput) {
  // Raw validation output
  console.log(JSON.stringify(result, null, 2));
} else {
  // Pretty validation output
  console.log(`Validation Results for: ${filePath}`);
  console.log("==================");
  console.log(`Valid: ${result.isValid}`);
  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((error) => {
      console.log(
        `- ${error.message} (${error.location.start.line}:${error.location.start.column})`,
      );
    });
  }
  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach((warning) => {
      console.log(
        `- ${warning.message} (${warning.location.start.line}:${warning.location.start.column})`,
      );
    });
  }
}
