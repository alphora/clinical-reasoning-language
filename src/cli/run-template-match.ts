#!/usr/bin/env node
/**
 * CLI: run template-match over all inferences in a CRL file and report
 * which patterns matched vs. which fell through to soft-compile placeholders.
 *
 * Usage: npm run cli:template-match -- --path <file.crl>
 */

import { readFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type { CRL, Concept, DefinitionIsDefinition } from "../ast/types";
import { createParser } from "../parser/createParser";
import { matchNarrative } from "../template-match";

const pathArgIndex = process.argv.indexOf("--path");
const filePath = pathArgIndex !== -1 ? process.argv[pathArgIndex + 1] : undefined;
if (!filePath) {
  console.error("Usage: cli:template-match -- --path <file.crl>");
  process.exit(1);
}

const input = readFileSync(filePath, "utf-8");
const { parser, parserErrorListener, lexerErrorListener } = createParser(input);
const tree = parser.crl();

const parserErrors = parserErrorListener.getErrors();
if (parserErrors.length > 0) {
  console.error("Parser errors:", JSON.stringify(parserErrors, null, 2));
  process.exit(1);
}
const lexerErrors = lexerErrorListener.getErrors();
if (lexerErrors.length > 0) {
  console.error("Lexer errors:", JSON.stringify(lexerErrors, null, 2));
  process.exit(1);
}

const builder = new CRLAstBuilder();
const ast = builder.visit(tree) as CRL;

// v0.7: a predicate-kind concept is a `concept` with a `definition is` body.
const predicateConcepts = ast.statements.filter(
  (s): s is Concept =>
    s.type === "Concept" && s.definition.type === "DefinitionIsDefinition",
);
console.log(`Found ${predicateConcepts.length} definition-is concepts in ${filePath}\n`);

const summary: Record<string, number> = {};
const unknowns: { name: string; text: string }[] = [];

for (const c of predicateConcepts) {
  const def = c.definition as DefinitionIsDefinition;
  const call = matchNarrative(def.body);
  if (call.known) {
    summary[call.pattern] = (summary[call.pattern] ?? 0) + 1;
  } else {
    summary["<unknown>"] = (summary["<unknown>"] ?? 0) + 1;
    unknowns.push({ name: c.name, text: call.pattern });
  }
}

console.log("=== Pattern coverage ===");
const sorted = Object.entries(summary).sort(([, a], [, b]) => b - a);
for (const [pattern, count] of sorted) {
  console.log(`  ${pattern.padEnd(30)} ${count}`);
}

if (unknowns.length > 0) {
  console.log(`\n=== Unmatched definition-is concepts (${unknowns.length}) ===`);
  for (const u of unknowns) {
    console.log(`  "${u.name}"`);
    console.log(`     → ${u.text}`);
  }
} else {
  console.log("\nAll definition-is concepts matched a catalog pattern.");
}
