#!/usr/bin/env node
import { emitCQLImports } from "../imports/emit";

function parseArgs(argv: string[]): {
  filePath: string | undefined;
  libraryName?: string;
} {
  let filePath: string | undefined;
  let libraryName: string | undefined;
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
    } else if (a === "--library-name") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--library-name requires a value");
        process.exit(1);
      }
      libraryName = v;
      i++;
    } else if (a === "--source-path") {
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
  return { filePath, libraryName };
}

const { filePath, libraryName } = parseArgs(process.argv.slice(2));

if (!filePath) {
  console.error("Usage: crl-emit --path <file.crl> [--library-name <name>]");
  process.exit(1);
}

const result = emitCQLImports(filePath, libraryName ? { libraryName } : {});

if (!result.success) {
  process.stderr.write(
    JSON.stringify(
      {
        success: result.success,
        importDiagnostics: result.importDiagnostics,
        errors: result.errors,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(1);
}
process.stdout.write(result.cql ?? "");
