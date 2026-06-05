#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";

import { emitCelToFhir, writeEmitResult } from "../cel/emitter";
import { resolveCelImports } from "../cel/imports";
import {
  emitFhirDefFromPath,
  isFhirDefError,
  isFhirDefWarning,
  writeFhirResources,
} from "../fhir-emitter";
import { emitCQLImports } from "../imports/emit";

type TargetMode = "cql" | "fhir-def" | undefined;

function parseArgs(argv: string[]): {
  filePath: string | undefined;
  outDir: string | undefined;
  target: TargetMode;
  quiet: boolean;
} {
  let filePath: string | undefined;
  let outDir: string | undefined;
  let target: TargetMode = undefined;
  let quiet = false;
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
    } else if (a === "--target") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--target requires a value (cql | fhir-def)");
        process.exit(1);
      }
      if (v !== "cql" && v !== "fhir-def") {
        console.error(`--target must be 'cql' or 'fhir-def' (got: ${v})`);
        process.exit(1);
      }
      target = v;
      i++;
    } else if (a === "--quiet") {
      quiet = true;
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
  return { filePath, outDir, target, quiet };
}

const { filePath, outDir, target, quiet } = parseArgs(process.argv.slice(2));

if (!filePath) {
  console.error("Usage: crl-emit --path <file.crl> --out-dir <output-directory>");
  process.exit(1);
}

if (!outDir) {
  console.error(
    "Usage: crl-emit --path <file.{crl,cel}> --out-dir <output-directory>\n" +
      "\n" +
      ".crl input → per-CRL CQL emit (one library per file in the import closure).\n" +
      ".cel input → per-case FHIR JSON instance emit (KALM-style directory tree).\n" +
      "--out-dir is required.",
  );
  process.exit(1);
}

// Plan v3.2 §"CLI extension": .cel + --target fhir-def is a category
// error (CEL emits FHIR instances; --target fhir-def is for CRL→FHIR
// Definition resources). Hard-error to prevent silent confusion.
if (filePath.toLowerCase().endsWith(".cel") && target === "fhir-def") {
  process.stderr.write(
    `cli-cel-fhir-def-incompatible: CEL input is not compatible with --target fhir-def. ` +
      `CEL emits FHIR instances; remove the flag or pass a .crl file.\n`,
  );
  process.exit(1);
}

// .crl + --target fhir-def: closure orchestrator path.
if (filePath.toLowerCase().endsWith(".crl") && target === "fhir-def") {
  const result = emitFhirDefFromPath(filePath);

  const hardErrors = [
    ...result.errors.filter(isFhirDefError),
    ...result.metadataErrors,
    ...result.importDiagnostics.filter((d) => d.severity === "error"),
  ];
  const warnings = [
    ...result.errors.filter(isFhirDefWarning),
    ...result.importDiagnostics.filter((d) => d.severity === "warning"),
  ];

  if (hardErrors.length > 0) {
    process.stderr.write(
      JSON.stringify(
        { errors: hardErrors, importDiagnostics: result.importDiagnostics, metadataErrors: result.metadataErrors },
        null,
        2,
      ) + "\n",
    );
    process.exit(1);
  }

  // Resources land at <out-dir>/fhir/<rt>/<id>.json per plan v3.2 layout.
  const fhirOutDir = path.join(outDir, "fhir");
  try {
    mkdirSync(fhirOutDir, { recursive: true });
  } catch (e) {
    process.stderr.write(`Failed to create output directory "${fhirOutDir}": ${(e as Error).message}\n`);
    process.exit(1);
  }
  const written = writeFhirResources({ success: true, resources: result.resources }, fhirOutDir);
  if (!quiet) {
    for (const p of written) process.stdout.write(`wrote ${p}\n`);
  } else {
    process.stdout.write(`wrote ${written.length} resource(s) under ${fhirOutDir}\n`);
  }

  if (warnings.length > 0 || result.unmatched.length > 0) {
    process.stderr.write(
      JSON.stringify({ warnings, unmatched: result.unmatched }, null, 2) + "\n",
    );
    process.exit(2);
  }
  process.exit(0);
}

// Pitch v4 critical decision #1 option (d): crl-emit auto-dispatches by
// file extension. `.cel` → FHIR JSON; `.crl` (default) → CQL.
if (filePath.toLowerCase().endsWith(".cel")) {
  const graph = resolveCelImports(filePath);
  const result = emitCelToFhir(graph);
  const blockers = result.diagnostics.filter((d) => d.severity === "error");
  if (blockers.length > 0) {
    process.stderr.write(JSON.stringify({ diagnostics: blockers }, null, 2) + "\n");
    process.exit(1);
  }
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (e) {
    process.stderr.write(`Failed to create output directory "${outDir}": ${(e as Error).message}\n`);
    process.exit(1);
  }
  const written = writeEmitResult(result, outDir);
  process.stdout.write(`wrote ${written} FHIR resource(s) under ${outDir}\n`);
  const unsupported = result.diagnostics.filter((d) => d.kind === "unsupported-yet");
  if (unsupported.length > 0) {
    process.stderr.write(JSON.stringify({ unsupportedYet: unsupported }, null, 2) + "\n");
    process.exit(2);
  }
  process.exit(0);
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
