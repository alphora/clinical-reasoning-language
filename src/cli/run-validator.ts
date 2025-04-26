import { readFileSync } from "fs";
import { join } from "path";

import { CPGLAstBuilder } from "../ast/builder";
import { CPGL } from "../ast/types";
import { createParser } from "../parser/createParser";
import { Validator } from "../validator/validator";

// Read the example file
const examplePath = join(__dirname, '../examples/cpgl/who/smart-example-immz/IMMZ_All_Decisions.cpg');
const input = readFileSync(examplePath, 'utf-8');

// Create the parser (new API)
const { parser } = createParser(input);

// Parse the input
const tree = parser.cpgl();

// Create the AST builder and visit the parse tree
const builder = new CPGLAstBuilder();
const ast = builder.visit(tree) as CPGL;

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
  console.log("Validation Results:");
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
