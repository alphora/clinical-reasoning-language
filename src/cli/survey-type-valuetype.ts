/**
 * Survey the corpus for type→valuetype pairings.
 *
 * For every concept that has BOTH `type is X.` and one or more `valuetype is V.`
 * declarations, record (X, V) pairs. Emit a summary table grouped by FHIR type
 * with the set of valuetypes observed and how many concepts contributed each.
 *
 * This is the empirical input for the per-FHIR-type valuetype map.
 *
 * Usage: ts-node survey-type-valuetype.ts <file1.crl> [file2.crl ...]
 */

import { readFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type { CRL, Concept } from "../ast/types";
import { createParser } from "../parser/createParser";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: survey-type-valuetype.ts <file.crl> [file.crl ...]");
  process.exit(1);
}

// FHIR type → valuetype → list of concept names that paired them
const pairs = new Map<string, Map<string, string[]>>();
// Concepts with type but NO valuetype
const typeNoValuetype = new Map<string, string[]>();
// Concepts with valuetype but no type (shouldn't happen post-annotation)
const valuetypeNoType: string[] = [];

for (const filePath of files) {
  const src = readFileSync(filePath, "utf-8");
  const { parser } = createParser(src);
  const tree = parser.crl();
  const builder = new CRLAstBuilder();
  const ast = builder.visit(tree) as CRL;
  const tag = filePath.split(/[\\/]/).pop() ?? filePath;

  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept" || !stmt.name) continue;
    const c = stmt as Concept;
    const t = c.conceptType;
    const vts = c.valueTypes ?? [];
    const label = `${c.name} (${tag})`;
    if (!t && vts.length > 0) {
      valuetypeNoType.push(label);
      continue;
    }
    if (!t) continue;
    if (vts.length === 0) {
      if (!typeNoValuetype.has(t)) typeNoValuetype.set(t, []);
      typeNoValuetype.get(t)!.push(label);
      continue;
    }
    if (!pairs.has(t)) pairs.set(t, new Map());
    const inner = pairs.get(t)!;
    for (const vt of vts) {
      if (!inner.has(vt)) inner.set(vt, []);
      inner.get(vt)!.push(label);
    }
  }
}

// Emit
const sortedTypes = [...pairs.keys()].sort();
console.log("=== type → valuetype pairings ===");
for (const t of sortedTypes) {
  const inner = pairs.get(t)!;
  const sortedVts = [...inner.keys()].sort();
  console.log(`\n${t}:`);
  for (const vt of sortedVts) {
    const examples = inner.get(vt)!;
    console.log(`  ${vt} (${examples.length}): ${examples.slice(0, 3).join(", ")}${examples.length > 3 ? ", ..." : ""}`);
  }
}

console.log("\n\n=== type WITHOUT valuetype ===");
for (const t of [...typeNoValuetype.keys()].sort()) {
  const examples = typeNoValuetype.get(t)!;
  console.log(`  ${t} (${examples.length}): ${examples.slice(0, 3).join(", ")}${examples.length > 3 ? ", ..." : ""}`);
}

if (valuetypeNoType.length > 0) {
  console.log("\n\n=== ANOMALY: valuetype WITHOUT type ===");
  for (const v of valuetypeNoType) console.log(`  ${v}`);
}
