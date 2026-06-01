#!/usr/bin/env node
import { validateCRLImports } from "../imports/validate";

function parseArgs(argv: string[]): {
  filePath: string | undefined;
  soft: boolean;
  pretty: boolean;
} {
  let filePath: string | undefined;
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
    } else if (a === "--soft") {
      soft = true;
    } else if (a === "--pretty") {
      pretty = true;
    } else if (a === "--source-path") {
      // Deliberate hard-fail: --source-path was removed in the
      // npm-style resolution redesign. Don't silently ignore — surface the
      // change so old scripts learn the new model.
      console.error(
        "--source-path has been removed. CRL now resolves imports against the " +
          "nearest package.json (walking up from --path) plus that project's " +
          "node_modules/. See USER_GUIDE.md §5 for details.",
      );
      process.exit(1);
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  return { filePath, soft, pretty };
}

const { filePath, soft, pretty } = parseArgs(process.argv.slice(2));

if (!filePath) {
  console.error("Usage: crl-validate --path <file.crl> [--soft] [--pretty]");
  process.exit(1);
}

const result = validateCRLImports(filePath, { soft });

if (!pretty) {
  const out = {
    success: result.success,
    importDiagnostics: result.importDiagnostics,
    validationErrors: result.validationErrors,
    validationWarnings: result.validationWarnings,
  };
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Validation: ${filePath}`);
  if (result.graph.projectRoot) {
    console.log(`Project root: ${result.graph.projectRoot}`);
  }
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
