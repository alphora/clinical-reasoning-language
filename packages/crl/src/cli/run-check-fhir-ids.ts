#!/usr/bin/env node
import { scanFhirIds } from "../fhir-emitter/checkIds";

const HELP_TEXT = `crl-check-fhir-ids — flag committed FHIR resource ids that break the id rule

USAGE:
  crl-check-fhir-ids --path <dir|file.json> [--quiet]
  crl-check-fhir-ids --help

Scans a directory (recursively) or a single .json file for FHIR resource ids that
violate the FHIR id datatype [A-Za-z0-9-.]{1,64} — too long (> 64), off-charset,
or empty. Checks each resource's top-level id and, for a Bundle, every
entry[].resource id. node_modules/.git/dist and dot-directories are skipped.

This is a READ-ONLY conformance check. Emit-time id derivation already keeps NEW
ids conformant (#237); this finds resources already committed with invalid ids.
It does not fix anything.

FLAGS:
  --path <dir|file>   Directory to scan, or a single .json file. Required.
  --quiet             Print only the summary line, not one line per violation.
  --help              Show this message and exit 0.

EXIT CODES:
  0  Conformant — no violations AND the scan completed (nothing skipped).
  2  Violations found, OR the scan was incomplete (unreadable/malformed files or a
     truncated walk) so conformance could not be certified.
  1  Bad arguments, or the --path root is unreadable / not a .json file.
`;

function parseArgs(argv: string[]): { path?: string; quiet: boolean } {
  let path: string | undefined;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    } else if (a === "--path") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        process.stderr.write("--path requires a value\n");
        process.exit(1);
      }
      path = v;
      i++;
    } else if (a === "--quiet") {
      quiet = true;
    } else {
      // Reject BOTH unknown --flags and bare positional args (an unrecognized
      // token is a usage error, not silently dropped).
      process.stderr.write(`Unexpected argument: ${a}\n`);
      process.exit(1);
    }
  }
  return { path, quiet };
}

const { path, quiet } = parseArgs(process.argv.slice(2));

if (!path) {
  process.stderr.write("Usage: crl-check-fhir-ids --path <dir|file.json> [--quiet]\n");
  process.exit(1);
}

let report;
try {
  report = scanFhirIds(path);
} catch (e) {
  process.stderr.write(`Cannot scan "${path}": ${(e as Error).message}\n`);
  process.exit(1);
}

if (!quiet) {
  for (const v of report.violations) {
    process.stdout.write(
      `${v.file}: ${v.resourceType}/${v.id} (${v.location}, len ${v.idLength}) — ${v.reasons.join(", ")}\n`,
    );
  }
  for (const e of report.readErrors) {
    process.stderr.write(`skip (read/parse error): ${e.file} — ${e.message}\n`);
  }
  if (report.truncated) {
    process.stderr.write(`${report.truncated.note}\n`);
  }
}

process.stdout.write(
  `checked ${report.resourcesChecked} resource(s) in ${report.filesChecked} file(s): ` +
    `${report.violations.length} violation(s)` +
    (report.readErrors.length > 0 ? `, ${report.readErrors.length} skipped (read/parse)` : "") +
    (report.truncated ? `, TRUNCATED` : "") +
    (report.complete ? "" : " — scan INCOMPLETE, conformance not certified") +
    `\n`,
);

// Exit 0 only on a COMPLETE, violation-free scan; an incomplete scan cannot certify.
process.exit(report.pass && report.complete ? 0 : 2);
