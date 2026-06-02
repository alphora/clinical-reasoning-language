#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";

import { emitCQLImports } from "../imports/emit";

function parseArgs(argv: string[]): {
  filePath: string | undefined;
  outDir: string | undefined;
} {
  let filePath: string | undefined;
  let outDir: string | undefined;
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
    } else if (a === "--out-dir") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--out-dir requires a value");
        process.exit(1);
      }
      outDir = v;
      i++;
    } else if (a === "--library-name") {
      console.error(
        "--library-name has been removed in v2.1.0. Under per-CRL emit each " +
          "library uses its own declared name from `library \"X\".`. Remove the flag.",
      );
      process.exit(1);
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
  return { filePath, outDir };
}

const { filePath, outDir } = parseArgs(process.argv.slice(2));

if (!filePath) {
  console.error("Usage: crl-emit --path <file.crl> --out-dir <output-directory>");
  process.exit(1);
}

if (!outDir) {
  console.error(
    "Usage: crl-emit --path <file.crl> --out-dir <output-directory>\n" +
      "\n" +
      "v2.1.0: per-CRL emit produces one CQL file per library in the import\n" +
      "closure. --out-dir is required.",
  );
  process.exit(1);
}

const result = emitCQLImports(filePath);

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

// Pre-check filename collisions before writing anything.
const seenFilenames = new Set<string>();
for (const entry of result.cqlByLibrary) {
  if (seenFilenames.has(entry.outputFilename)) {
    process.stderr.write(
      `Filename collision: multiple libraries would write to "${entry.outputFilename}"\n`,
    );
    process.exit(1);
  }
  seenFilenames.add(entry.outputFilename);
}

try {
  mkdirSync(outDir, { recursive: true });
} catch (e) {
  process.stderr.write(
    `Failed to create output directory "${outDir}": ${(e as Error).message}\n`,
  );
  process.exit(1);
}

for (const entry of result.cqlByLibrary) {
  const outPath = path.join(outDir, entry.outputFilename);
  try {
    writeFileSync(outPath, entry.cql, "utf-8");
    process.stdout.write(`wrote ${outPath}\n`);
  } catch (e) {
    process.stderr.write(`Failed to write ${outPath}: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
