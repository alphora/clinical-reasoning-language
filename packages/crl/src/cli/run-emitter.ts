#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";

import { emitCelToFhir, writeEmitResult } from "../cel/emitter";
import { resolveCelImports } from "../cel/imports";
import { CAPABILITY_ORDER, writeFhirResources } from "../fhir-emitter";
import type { Capability } from "../fhir-emitter";
import { emitCQLImports } from "../imports/emit";
import { emitCrlTwoLane } from "../emit-two-lane";

type TargetMode = "cql" | "fhir-def" | undefined;

const HELP_TEXT = `crl-emit — CRL/CEL → CQL or FHIR resource emitter

USAGE:
  crl-emit --path <file.{crl,cel}> --out-dir <dir> [--target <mode>] [--quiet]
  crl-emit --help

FLAGS:
  --path <file>     Input file (.crl or .cel). Required.
  --out-dir <dir>   Output directory. Required.
  --target <mode>   Emit target for .crl input:
                      cql       (default) CQL library files flat under <out-dir>/
                      fhir-def  FHIR Definition resources + CQL libraries written
                                atomically (either both lanes succeed or nothing is
                                written). Layout:
                                  <out-dir>/cql/<library-name>.cql
                                  <out-dir>/fhir/<ResourceType>/<id>.json
                    Rejected with .cel input (CEL has its own FHIR-instance pipeline).
  --quiet           Print one summary line instead of one "wrote <path>" line per file
                    (--target fhir-def only).
  --date <iso>      (fhir-def) Publication date for reproducible emit. Highest
                    precedence; else SOURCE_DATE_EPOCH env, else package.json
                    crl.date, else wall clock. Only stamped at publishable+.
  --capability <c>  (fhir-def) CRMI capability level: shareable | computable |
                    publishable. Default publishable. Drives, on all emitted
                    definitional resources, the additive meta.profile set, the
                    cqf-knowledgeCapability list, and date (publishable+).
                    'executable' is not yet supported (needs compiled ELM /
                    value-set expansion — see issue #113).
  --help            Show this message and exit 0.

INPUT DISPATCH:
  .crl              CRL → CQL emit (default) or CRL → FHIR Definition + CQL emit
                    (--target fhir-def).
  .cel              CEL → FHIR instance emit (KALM-style directory tree). --target is
                    rejected on .cel input.

EXIT CODES:
  0  Success.
  1  Hard error: parse failure, unresolved reference, write failure, or incompatible
     flags (e.g. .cel + --target, unknown --target value).
  2  Soft warnings: unresolved bare references, empty terminologies, ASCII-fallback
     slug warnings, or unmatched concept narratives surfaced after a successful write.

See USER_GUIDE.md §"Emitting FHIR Definition resources" for the full --target fhir-def
contract, deliberate spec deviations, and the MCP \`emit_crl_fhir\` companion tool.
`;

function parseArgs(argv: string[]): {
  filePath: string | undefined;
  outDir: string | undefined;
  target: TargetMode;
  quiet: boolean;
  date: string | undefined;
  capability: Capability | undefined;
} {
  let filePath: string | undefined;
  let outDir: string | undefined;
  let target: TargetMode = undefined;
  let quiet = false;
  let date: string | undefined;
  let capability: Capability | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    } else if (a === "--path") {
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
    } else if (a === "--date") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("--date requires an ISO date value (e.g. 2024-01-01T00:00:00.000Z)");
        process.exit(1);
      }
      date = v;
      i++;
    } else if (a === "--capability") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error(`--capability requires a value (${CAPABILITY_ORDER.join(" | ")})`);
        process.exit(1);
      }
      if (!CAPABILITY_ORDER.includes(v as Capability)) {
        console.error(`--capability must be one of ${CAPABILITY_ORDER.join(", ")} (got: ${v})`);
        process.exit(1);
      }
      capability = v as Capability;
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
  return { filePath, outDir, target, quiet, date, capability };
}

const { filePath, outDir, target, quiet, date, capability } = parseArgs(process.argv.slice(2));

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

// Plan v3.2 §"CLI extension": .cel input is not compatible with either
// CRL emit target. CEL has its own FHIR-instance emit pipeline.
// Round-5 Claude [nit]: be symmetric — reject .cel + --target cql too,
// not just .cel + --target fhir-def.
if (filePath.toLowerCase().endsWith(".cel") && target !== undefined) {
  const kind = target === "fhir-def" ? "cli-cel-fhir-def-incompatible" : "cli-cel-cql-incompatible";
  process.stderr.write(
    `${kind}: CEL input is not compatible with --target ${target}. ` +
      `CEL emits FHIR instances via the existing pipeline (omit --target); remove the flag or pass a .crl file.\n`,
  );
  process.exit(1);
}

// .crl + --target fhir-def: closure orchestrator path. Writes BOTH the
// CQL closure AND the FHIR-def resources, because the emitted Library
// resources' content[0].attachment.url points at the sibling CQL file
// at `../../cql/<name>.cql` — emitting one without the other ships
// broken Library references (round-5 gpt55 [critical]).
if (filePath.toLowerCase().endsWith(".crl") && target === "fhir-def") {
  // Two-lane emit (SHARED with the `emit_crl` MCP tool via emitCrlTwoLane): the
  // FHIR Definition resources AND the CQL closure they reference. The Library
  // content URLs point at the sibling ../../cql/<name>.cql, so both must ship.
  const two = emitCrlTwoLane(filePath, {
    ...(date !== undefined ? { date } : {}),
    ...(capability !== undefined ? { capability } : {}),
  });

  // Per-lane error attribution (unchanged from the pre-extraction CLI): FHIR
  // hard errors first, then the CQL lane, then filename collisions.
  if (two.fhirHardErrors.length > 0) {
    process.stderr.write(
      JSON.stringify(
        {
          errors: two.fhirHardErrors,
          importDiagnostics: two.fhir.importDiagnostics,
          metadataErrors: two.fhir.metadataErrors,
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(1);
  }
  if (!two.cql.success) {
    process.stderr.write(
      JSON.stringify(
        { stage: "cql-emit", importDiagnostics: two.cql.importDiagnostics, errors: two.cql.errors },
        null,
        2,
      ) + "\n",
    );
    process.exit(1);
  }
  if (two.filenameCollisions.length > 0) {
    process.stderr.write(
      `Filename collision: multiple CQL libraries would write to "${two.filenameCollisions[0]}"\n`,
    );
    process.exit(1);
  }

  const cqlOutDir = path.join(outDir, "cql");
  const fhirOutDir = path.join(outDir, "fhir");
  try {
    mkdirSync(cqlOutDir, { recursive: true });
    mkdirSync(fhirOutDir, { recursive: true });
  } catch (e) {
    process.stderr.write(`Failed to create output directory: ${(e as Error).message}\n`);
    process.exit(1);
  }

  const writtenCql: string[] = [];
  for (const entry of two.cqlLibraries) {
    const outPath = path.join(cqlOutDir, entry.outputFilename);
    try {
      writeFileSync(outPath, entry.cql, "utf-8");
      writtenCql.push(outPath);
    } catch (e) {
      process.stderr.write(`Failed to write ${outPath}: ${(e as Error).message}\n`);
      process.exit(1);
    }
  }

  // ── FHIR side ──
  let writtenFhir: string[];
  try {
    writtenFhir = writeFhirResources({ success: true, resources: two.fhir.resources }, fhirOutDir);
  } catch (e) {
    process.stderr.write(`Failed to write FHIR resources: ${(e as Error).message}\n`);
    process.exit(1);
  }

  if (!quiet) {
    for (const p of writtenCql) process.stdout.write(`wrote ${p}\n`);
    for (const p of writtenFhir) process.stdout.write(`wrote ${p}\n`);
  } else {
    process.stdout.write(
      `wrote ${writtenCql.length} CQL + ${writtenFhir.length} FHIR resource(s) under ${outDir}\n`,
    );
  }

  if (two.warnings.length > 0 || two.fhir.unmatched.length > 0) {
    process.stderr.write(
      JSON.stringify({ warnings: two.warnings, unmatched: two.fhir.unmatched }, null, 2) + "\n",
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
  // T12 / #85: surface result-deferred (outcomes parsed but not emitted —
  // tied to #70 / `metric`) on stderr the same way unsupported-yet is
  // surfaced, with exit code 2. Pre-fix the deferral was silent and the
  // CLI read as success despite zero outcome resources.
  const unsupported = result.diagnostics.filter((d) => d.kind === "unsupported-yet");
  const deferred = result.diagnostics.filter((d) => d.kind === "result-deferred");
  if (unsupported.length > 0 || deferred.length > 0) {
    process.stderr.write(
      JSON.stringify(
        {
          ...(unsupported.length > 0 ? { unsupportedYet: unsupported } : {}),
          ...(deferred.length > 0 ? { resultDeferred: deferred } : {}),
        },
        null,
        2,
      ) + "\n",
    );
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
