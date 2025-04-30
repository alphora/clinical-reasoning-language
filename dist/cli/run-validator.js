"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const builder_1 = require("../ast/builder");
const createParser_1 = require("../parser/createParser");
const validator_1 = require("../validator/validator");
const examplePath = (0, path_1.join)(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");
const input = (0, fs_1.readFileSync)(examplePath, "utf-8");
const { parser } = (0, createParser_1.createParser)(input);
const tree = parser.crl();
const builder = new builder_1.CRLAstBuilder();
const ast = builder.visit(tree);
const validator = new validator_1.Validator();
const result = validator.validate(ast);
const prettyOutput = process.argv.includes("--pretty");
if (!prettyOutput) {
    console.log(JSON.stringify(result, null, 2));
}
else {
    console.log("Validation Results:");
    console.log("==================");
    console.log(`Valid: ${result.isValid}`);
    if (result.errors.length > 0) {
        console.log("\nErrors:");
        result.errors.forEach((error) => {
            console.log(`- ${error.message} (${error.location.start.line}:${error.location.start.column})`);
        });
    }
    if (result.warnings.length > 0) {
        console.log("\nWarnings:");
        result.warnings.forEach((warning) => {
            console.log(`- ${warning.message} (${warning.location.start.line}:${warning.location.start.column})`);
        });
    }
}
//# sourceMappingURL=run-validator.js.map