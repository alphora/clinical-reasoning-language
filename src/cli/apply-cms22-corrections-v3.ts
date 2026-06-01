/**
 * One-shot correction pass for cms22.crl per the v3 transformation rule.
 *
 * Same logic as apply-cms69-corrections-v3.ts — see that file's header for
 * the design principle (defined as is SEMANTIC composition).
 *
 * cms22-specific: the BP Quantity refinement chain. The asserted BP/Systolic/
 * Diastolic concepts are Observation+Quantity; intermediate definition-is concepts
 * that filter/extract from that chain stay Observation+Quantity; classifications
 * ("Last Systolic Below 120" etc.) become Observation+boolean predicates.
 */

import { readFileSync, writeFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type { CRL, Concept, ConceptType, ConceptValueType } from "../ast/types";
import { createParser } from "../parser/createParser";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: apply-cms22-corrections-v3.ts <path-to-cms22.crl>");
  process.exit(1);
}

// BP Quantity refinement chain — these stay Observation+Quantity (semantic
// refinements / value extractions of the Quantity-bearing BP Observation list).
const BP_QUANTITY_REFINEMENTS = new Set<string>([
  "Systolic Code Component of BP Panels",
  "Diastolic Code Component of BP Panels",
  "Last BP Panels On Qualifying Encounter Day",
  "Last BP Panels Within Year Prior To Qualifying Encounter",
  "Systolic Code Component of Last BP Panel On Encounter Day",
  "Diastolic Code Component of Last BP Panel On Encounter Day",
  "Systolic Code Component of Prior-Year Last BP Panel",
  "Diastolic Code Component of Prior-Year Last BP Panel",
]);

let source = readFileSync(filePath, "utf-8");
const { parser } = createParser(source);
const tree = parser.crl();
const builder = new CRLAstBuilder();
const ast = builder.visit(tree) as CRL;

interface PlannedChange {
  conceptName: string;
  kind: "flip-type-to-observation" | "annotate-definition-is";
  current?: string;
  proposed: { type: ConceptType; valuetype?: ConceptValueType };
}

const changes: PlannedChange[] = [];

for (const stmt of ast.statements) {
  if (stmt.type !== "Concept" || !stmt.name) continue;
  const c = stmt as Concept;

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
    const isBpRefinement = BP_QUANTITY_REFINEMENTS.has(c.name);
    changes.push({
      conceptName: c.name,
      kind: "annotate-definition-is" as const,
      proposed: {
        type: "Observation",
        valuetype: isBpRefinement ? "Quantity" : "boolean",
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

for (const change of changes) {
  const escaped = change.conceptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (change.kind === "flip-type-to-observation") {
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
    const re = new RegExp(`(concept "${escaped}":\\s*\\n)([ \\t]*)(- definition is)`, "");
    const match = re.exec(source);
    if (!match) {
      console.warn(`  WARN: could not locate definition-is block for "${change.conceptName}"`);
      continue;
    }
    const indent = match[2] || "";
    const replacement = `${match[1]}${indent}- type is ${change.proposed.type}.\n${indent}- valuetype is ${change.proposed.valuetype}.\n${indent}${match[3]}`;
    source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  }
}

writeFileSync(filePath, source, "utf-8");
console.log(`Applied corrections to ${filePath}`);
