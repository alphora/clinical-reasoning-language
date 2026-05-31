/**
 * One-shot audit: dump every concept whose declared (type, valuetype) pair
 * is `(NonObservation, boolean)`. Per the §1 rule in
 * features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md, these
 * are corpus errors — boolean predicates should always be modeled as
 * (Observation, boolean), regardless of what FHIR resource the underlying
 * logic touches.
 *
 * Outputs: name | type | first 80 chars of body | location, so we can
 * eyeball each one and confirm the boolean-predicate intent before
 * bulk-correcting.
 */

import { readFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type { CRL, Concept } from "../ast/types";
import { createParser } from "../parser/createParser";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: dump-nonobs-boolean.ts <file.crl> [file.crl ...]");
  process.exit(1);
}

interface Row {
  file: string;
  name: string;
  type: string;
  body: string;
  startLine: number;
}

const rows: Row[] = [];

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
    if (!c.conceptType || c.conceptType === "Observation") continue;
    if (!c.valueTypes?.includes("boolean")) continue;
    rows.push({
      file: tag,
      name: c.name,
      type: c.conceptType,
      body: bodySnippet(c),
      startLine: c.location.start.line,
    });
  }
}

console.log(`Found ${rows.length} concepts with (NonObservation, boolean):\n`);
const byType = new Map<string, Row[]>();
for (const r of rows) {
  if (!byType.has(r.type)) byType.set(r.type, []);
  byType.get(r.type)!.push(r);
}
for (const t of [...byType.keys()].sort()) {
  const list = byType.get(t)!;
  console.log(`\n=== ${t} (${list.length}) ===`);
  for (const r of list) {
    console.log(`  ${r.file}:${r.startLine}  "${r.name}"`);
    console.log(`    body: ${r.body}`);
  }
}

function bodySnippet(c: Concept): string {
  switch (c.definition.type) {
    case "CodedFromDefinition":
      return `coded from "${c.definition.terminologyName}"`;
    case "InferredFromDefinition": {
      const body = c.definition.body;
      if (body.type === "InferredFromBareRef") return `inferred from "${body.ref}"`;
      return `inferred from <composition>`;
    }
    case "LogicIsDefinition": {
      const els = c.definition.body.elements.map((el): string => {
        if (el.type === "NWord") return el.value;
        if (el.type === "NConceptRef") return `"${el.value}"`;
        if (el.type === "Quantity") return `${el.value} '${el.unit ?? ""}'`;
        if (el.type === "NDisjunction") return `(${el.disjuncts.length} disjuncts)`;
        if (el.type === "NConjunction") return `(${el.conjuncts.length} conjuncts)`;
        return (el as { type: string }).type;
      });
      const text = `logic is ${els.join(" ")}`;
      return text.length > 120 ? text.slice(0, 117) + "..." : text;
    }
  }
}
