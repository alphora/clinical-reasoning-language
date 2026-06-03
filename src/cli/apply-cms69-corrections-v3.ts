/**
 * One-shot correction pass for cms69.crl per the v3 transformation rule.
 *
 * Per the "defined as is SEMANTIC composition, not boolean logic" principle
 * (see features/cql-pattern-mining/defined-as-is-semantic-composition.md),
 * the author declares each concept's (type, valuetype) based on its semantic
 * meaning; sem-* operators don't type-check operands.
 *
 * v3 corrections:
 *   1. For every <NonObservation>+boolean concept, change `type is X.` to
 *      `type is Observation.` (boolean rule: Resource+boolean valid only if
 *      that resource has a native boolean value field; Condition, Encounter,
 *      MR, Procedure, SR don't, so all flip to Observation).
 *   2. For every `definition is` concept lacking declared type/valuetype, add
 *      both. The BMI Observation refinement chain gets Observation+Quantity;
 *      everything else gets Observation+boolean (semantic predicate intent).
 *   3. For the "Pregnancy or Other Related Diagnoses" wrapper concept,
 *      add `value type is CodeableConcept.` (currently missing).
 */

import { readFileSync, writeFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type { CRL, Concept, ConceptType, ConceptValueType } from "../ast/types";
import { createParser } from "../parser/createParser";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: apply-cms69-corrections-v3.ts <path-to-cms69.crl>");
  process.exit(1);
}

// BMI Observation refinement chain — these stay as Observation+Quantity
// (semantic refinement of the Quantity-bearing BMI Observation list).
const BMI_QUANTITY_REFINEMENTS = new Set<string>([
  "BMI Observation During MP",
  "BMI Observation Has Positive Value",
]);

let source = readFileSync(filePath, "utf-8");
const { parser } = createParser(source);
const tree = parser.crl();
const builder = new CRLAstBuilder();
const ast = builder.visit(tree) as CRL;

interface PlannedChange {
  conceptName: string;
  kind: "flip-type-to-observation" | "annotate-definition-is" | "add-valuetype-cc";
  current?: string;
  proposed: { type: ConceptType; valuetype?: ConceptValueType };
}

const changes: PlannedChange[] = [];

for (const stmt of ast.statements) {
  if (stmt.type !== "Concept" || !stmt.name) continue;
  const c = stmt as Concept;

  // Special case: "Pregnancy or Other Related Diagnoses" wrapper missing valuetype
  if (c.name === "Pregnancy or Other Related Diagnoses" && c.conceptType && !c.valueTypes?.length) {
    changes.push({
      conceptName: c.name,
      kind: "add-valuetype-cc",
      proposed: { type: c.conceptType, valuetype: "CodeableConcept" },
    });
    continue;
  }

  // Case 1: <NonObservation>+boolean → Observation+boolean
  if (
    c.conceptType &&
    c.conceptType !== "Observation" &&
    c.valueTypes?.includes("boolean")
  ) {
    changes.push({
      conceptName: c.name,
      kind: "flip-type-to-observation",
      current: c.conceptType,
      proposed: { type: "Observation", valuetype: "boolean" },
    });
    continue;
  }

  // Case 2: definition-is with no type declared → annotate
  if (c.definition.type === "DefinitionIsDefinition" && !c.conceptType) {
    const isBmiRefinement = BMI_QUANTITY_REFINEMENTS.has(c.name);
    changes.push({
      conceptName: c.name,
      kind: "annotate-definition-is" as const,
      proposed: {
        type: "Observation",
        valuetype: isBmiRefinement ? "Quantity" : "boolean",
      },
    });
    continue;
  }
}

console.log(`Planned ${changes.length} changes.`);
const byKind: Record<string, number> = {};
for (const ch of changes) {
  byKind[ch.kind] = (byKind[ch.kind] ?? 0) + 1;
}
console.log("By kind:", byKind);

// Apply changes textually.
for (const change of changes) {
  const escaped = change.conceptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (change.kind === "flip-type-to-observation") {
    // Find `concept "Name":` then the next `- type is X.` line and rewrite it.
    const re = new RegExp(
      `(concept "${escaped}":\\s*\\n[ \\t]*- type is )${change.current}(\\.)`,
      "",
    );
    const match = re.exec(source);
    if (!match) {
      console.warn(`  WARN: could not flip type for "${change.conceptName}"`);
      continue;
    }
    source = source.slice(0, match.index) + match[1] + "Observation" + match[2] + source.slice(match.index + match[0].length);
  } else if (change.kind === "annotate-definition-is") {
    // Insert `- type is Observation.\n- value type is X.\n` between
    // `concept "Name":` and `- definition is...`.
    const re = new RegExp(`(concept "${escaped}":\\s*\\n)([ \\t]*)(- definition is)`, "");
    const match = re.exec(source);
    if (!match) {
      console.warn(`  WARN: could not locate definition-is block for "${change.conceptName}"`);
      continue;
    }
    const indent = match[2] || "";
    const replacement = `${match[1]}${indent}- type is ${change.proposed.type}.\n${indent}- value type is ${change.proposed.valuetype}.\n${indent}${match[3]}`;
    source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  } else if (change.kind === "add-valuetype-cc") {
    // Insert `- value type is CodeableConcept.` after the `- type is X.` line.
    const re = new RegExp(
      `(concept "${escaped}":\\s*\\n[ \\t]*- type is [A-Za-z]+\\.\\s*\\n)`,
      "",
    );
    const match = re.exec(source);
    if (!match) {
      console.warn(`  WARN: could not locate concept block for "${change.conceptName}"`);
      continue;
    }
    const indentMatch = /\n([ \t]*)- type is/.exec(match[0]);
    const indent = (indentMatch && indentMatch[1]) || "";
    source = source.slice(0, match.index) + match[0] + `${indent}- value type is CodeableConcept.\n` + source.slice(match.index + match[0].length);
  }
}

writeFileSync(filePath, source, "utf-8");
console.log(`Applied corrections to ${filePath}`);
