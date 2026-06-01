#!/usr/bin/env node
import { readFileSync } from "fs";
import { join } from "path";

import { emitCQL } from "../emitter";
import { emitCQLImports } from "../imports/emit";

function parseArgs(argv: string[]): {
  filePath: string;
  sourcePaths: string[];
  libraryName?: string;
} {
  let filePath: string | undefined;
  const sourcePaths: string[] = [];
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
    } else if (a === "--source-path") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--source-path requires a value");
        process.exit(1);
      }
      sourcePaths.push(v);
      i++;
    } else if (a === "--library-name") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--library-name requires a value");
        process.exit(1);
      }
      libraryName = v;
      i++;
    }
  }
  return {
    filePath:
      filePath ??
      join(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl"),
    sourcePaths,
    libraryName,
  };
}

const { filePath, sourcePaths, libraryName } = parseArgs(process.argv.slice(2));

if (sourcePaths.length > 0) {
  // Import-aware mode: walk the include graph and flat-inline emit one CQL library.
  const result = emitCQLImports(
    filePath,
    sourcePaths,
    libraryName ? { libraryName } : {},
  );
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
} else {
  // Single-file mode (backward-compatible).
  const input = readFileSync(filePath, "utf-8");
  const result = emitCQL(input, libraryName ? { libraryName } : {});
  if (!result.success) {
    process.stderr.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(1);
  }
  process.stdout.write(result.result ?? "");
}
