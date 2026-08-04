#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { canonicalizeSourceToFiles } from "../provenance";

/**
 * crl-canonicalize-source — render a refined-source `.docx` into the canonical anchor-source `.txt`
 * plus a `<name>.anchormeta.json` sidecar (textHash, derivedFromHash, offsetUnit, warnings).
 *
 * Usage: crl-canonicalize-source --in <file.docx> [--out <file.txt>]
 *   --out defaults to the input path with its extension replaced by `.txt`.
 * Exit codes: 0 = success (warnings, if any, go to stderr AND into the sidecar — gate on the sidecar, not stderr);
 *             1 = hard error (bad args / fail-closed canonicalization).
 */
function parseArgs(argv: string[]): { inPath?: string; outPath?: string } {
  let inPath: string | undefined;
  let outPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in" || a === "--out") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error(`${a} requires a value`);
        process.exit(1);
      }
      if (a === "--in") inPath = v;
      else outPath = v;
      i++;
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    } else if (!inPath) {
      inPath = a; // allow a bare positional as the input
    }
  }
  return { inPath, outPath };
}

const { inPath, outPath } = parseArgs(process.argv.slice(2));
if (!inPath) {
  console.error("Usage: crl-canonicalize-source --in <file.docx> [--out <file.txt>]");
  process.exit(1);
}

let input: Buffer;
try {
  input = readFileSync(inPath);
} catch (e) {
  console.error(`Cannot read ${inPath}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const result = canonicalizeSourceToFiles(input, inPath, outPath);
if (!result.ok) {
  const detail =
    result.stage === "canonicalize"
      ? `[${result.error.kind}] ${result.error.message}`
      : result.message;
  console.error(`canonicalize failed [${result.stage}]: ${detail}`);
  process.exit(1);
}

for (const w of result.warnings) console.error(`warning [${w.kind}]: ${w.message}`);
for (const a of result.advisories ?? []) console.error(`advisory: ${a}`);
console.error(`wrote ${result.txtPath} (${result.byteLength} bytes) + ${result.metaPath}`);
process.exit(0);
