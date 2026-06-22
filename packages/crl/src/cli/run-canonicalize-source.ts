#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { buildAnchorArtifact } from "../provenance";

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

const txtPath = outPath ?? inPath.replace(/\.[^./\\]+$/, "") + ".txt";
const metaPath = txtPath.replace(/\.txt$/i, "") + ".anchormeta.json";

let input: Buffer;
try {
  input = readFileSync(inPath);
} catch (e) {
  console.error(`Cannot read ${inPath}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const result = buildAnchorArtifact(input, basename(txtPath), inPath);
if (!result.ok) {
  console.error(`canonicalize failed [${result.error.kind}]: ${result.error.message}`);
  process.exit(1);
}

writeFileSync(txtPath, result.text, "utf8");
writeFileSync(metaPath, JSON.stringify(result.meta, null, 2) + "\n", "utf8");

for (const w of result.meta.warnings) console.error(`warning [${w.kind}]: ${w.message}`);
console.error(`wrote ${txtPath} (${Buffer.byteLength(result.text, "utf8")} bytes) + ${metaPath}`);
process.exit(0);
