#!/usr/bin/env node
import { readFileSync } from "fs";
import { join } from "path";

import { CRLAstBuilder } from "../ast/builder";
import { CRL } from "../ast/types";
import { validateCRLImports } from "../imports/validate";
import { createParser } from "../parser/createParser";
import { Validator } from "../validator/validator";

function parseArgs(argv: string[]): {
  filePath: string;
  sourcePaths: string[];
  soft: boolean;
  pretty: boolean;
} {
  let filePath: string | undefined;
  const sourcePaths: string[] = [];
  let soft = false;
  let pretty = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--path") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--path requires a value");
        process.exit(1);
      }
      filePath = v;
      i++;
    } else if (a === "--source-path") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--source-path requires a value");
        process.exit(1);
      }
      sourcePaths.push(v);
      i++;
    } else if (a === "--soft") {
      soft = true;
    } else if (a === "--pretty") {
      pretty = true;
    }
  }
  return {
    filePath:
      filePath ??
      join(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl"),
    sourcePaths,
    soft,
    pretty,
  };
}

const { filePath, sourcePaths, soft, pretty } = parseArgs(process.argv.slice(2));

if (sourcePaths.length > 0) {
  // Import-aware mode: walk the include graph + validate against the combined namespace.
  const result = validateCRLImports(filePath, sourcePaths, { soft });

  if (!pretty) {
    // Raw JSON: omit `graph` (Maps don't serialize cleanly).
    const out = {
      success: result.success,
      importDiagnostics: result.importDiagnostics,
      validationErrors: result.validationErrors,
      validationWarnings: result.validationWarnings,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`Import-aware validation: ${filePath}`);
    console.log(`Source paths: ${sourcePaths.join(", ")}`);
    console.log("==================");
    console.log(`Valid: ${result.success}`);
    if (result.importDiagnostics.length > 0) {
      console.log("\nImport diagnostics:");
      result.importDiagnostics.forEach((d) => {
        console.log(`- [${d.severity}] ${d.kind}: ${JSON.stringify(d)}`);
      });
    }
    if (result.validationErrors.length > 0) {
      console.log("\nValidation errors:");
      result.validationErrors.forEach((e) => {
        const where = e.filePath ?? "<unknown>";
        console.log(`- ${where}:${e.location.start.line}:${e.location.start.column} ${e.message}`);
      });
    }
    if (result.validationWarnings.length > 0) {
      console.log("\nValidation warnings:");
      result.validationWarnings.forEach((w) => {
        const where = w.filePath ?? "<unknown>";
        console.log(`- ${where}:${w.location.start.line}:${w.location.start.column} ${w.message}`);
      });
    }
  }
} else {
  // Single-file mode (backward-compatible with the original CLI behavior).
  const input = readFileSync(filePath, "utf-8");
  const { parser } = createParser(input);
  const tree = parser.crl();
  const builder = new CRLAstBuilder();
  const ast = builder.visit(tree) as CRL;
  const validator = new Validator();
  const result = validator.validate(ast, { soft });

  if (!pretty) {
    console.log(JSON.stringify(result, null, 2));
  } else {
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
}
