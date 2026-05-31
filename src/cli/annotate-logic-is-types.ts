/**
 * One-shot annotation pass: for each `logic is` concept that lacks an
 * explicit `type is X.` declaration, infer the type from the narrative's
 * subject ref (the first NConceptRef in the body) and insert it.
 *
 * Resolves iteratively in case logic-is concepts reference each other.
 *
 * Usage: ts-node annotate-logic-is-types.ts <path-to-file.crl>
 *
 * Writes the annotated file to <path>.annotated.crl alongside the source.
 */

import { readFileSync, writeFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type {
  CRL,
  Concept,
  ConceptType,
  NarrativeClause,
  NarrativeElement,
} from "../ast/types";
import { createParser } from "../parser/createParser";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: annotate-logic-is-types.ts <path-to-file.crl>");
  process.exit(1);
}

let source = readFileSync(filePath, "utf-8");

// Iterate: parse → find logic-is concepts missing type → infer → re-parse
const MAX_PASSES = 10;
for (let pass = 0; pass < MAX_PASSES; pass++) {
  const { parser } = createParser(source);
  const tree = parser.crl();
  const builder = new CRLAstBuilder();
  const ast = builder.visit(tree) as CRL;

  // Build name → declared type map (only includes concepts that have type)
  const typeMap = new Map<string, ConceptType>();
  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept") continue;
    const c = stmt as Concept;
    if (c.conceptType && c.name) {
      typeMap.set(c.name, c.conceptType);
    }
  }

  // Find logic-is concepts without explicit type
  const toAnnotate: { name: string; inferredType: ConceptType }[] = [];
  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept") continue;
    const c = stmt as Concept;
    if (c.definition.type !== "LogicIsDefinition") continue;
    if (c.conceptType) continue; // already has type
    if (!c.name) continue;
    const subject = firstConceptRef(c.definition.body);
    if (!subject) continue;
    const subjectType = typeMap.get(subject);
    if (!subjectType) continue;
    toAnnotate.push({ name: c.name, inferredType: subjectType });
  }

  if (toAnnotate.length === 0) {
    console.log(`Pass ${pass + 1}: no more concepts to annotate. Done.`);
    break;
  }

  console.log(`Pass ${pass + 1}: annotating ${toAnnotate.length} concepts`);

  for (const { name, inferredType } of toAnnotate) {
    // Find `concept "Name":` line, then insert `- type is X.` on the next line.
    // The original concept block looks like:
    //   concept "Name":
    //   - logic is <narrative>.
    // After insertion:
    //   concept "Name":
    //   - type is X.
    //   - logic is <narrative>.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(concept "${escaped}":\\s*\\n)([ \\t]*)(- logic is )`, "");
    const match = re.exec(source);
    if (!match) {
      console.warn(`  WARN: could not locate concept block for "${name}"`);
      continue;
    }
    const indent = match[2] || "";
    const replacement = `${match[1]}${indent}- type is ${inferredType}.\n${indent}${match[3]}`;
    source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  }
}

writeFileSync(filePath, source, "utf-8");
console.log(`Annotated ${filePath}`);

// Returns the first concept ref (by traversal order) in a narrative body,
// recursing into in-arg disjunctions/conjunctions if needed.
function firstConceptRef(clause: NarrativeClause): string | null {
  for (const el of clause.elements) {
    const r = firstFromElement(el);
    if (r) return r;
  }
  return null;
}

function firstFromElement(el: NarrativeElement): string | null {
  switch (el.type) {
    case "NConceptRef":
      return el.value;
    case "NDisjunction":
    case "NConjunction": {
      const arr = el.type === "NDisjunction" ? el.disjuncts : el.conjuncts;
      for (const av of arr) {
        const r = firstFromElement(av as NarrativeElement);
        if (r) return r;
      }
      return null;
    }
    default:
      return null;
  }
}
