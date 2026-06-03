/**
 * Full audit: for each (NonObservation, boolean) concept, examine its
 * defined-as body and CLASSIFY it per the §1 rule.
 *
 * Classification:
 *   - BOOLEAN_GENUINE: all operands resolve to boolean predicates →
 *     fix to (Observation, boolean).
 *   - REFINEMENT_MISDECLARED: all operands resolve to list/refinement
 *     shapes → fix to (subject's type, subject's valuetype).
 *   - MIXED: operands of different shapes → escalate (author must decide).
 *   - UNKNOWN: cannot determine from current declarations.
 *
 * For each concept, prints classification + suggested fix.
 *
 * "Boolean predicate" subject = (Observation, boolean) OR a non-asserted
 * concept whose current declaration is `<X> + boolean` (we treat it as
 * intended-boolean for the purpose of this audit, even though it's the
 * very thing we're correcting).
 */

import { readFileSync } from "fs";

import { CRLAstBuilder } from "../ast/builder";
import type {
  CRL,
  Concept,
  CompositionExpression,
  ConceptType,
  ConceptValueType,
  DefinedAsComposition,
  DefinedAsBareRef,
} from "../ast/types";
import { getRefName } from "../ast/types";
import { createParser } from "../parser/createParser";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: audit-nonobs-boolean.ts <file.crl> [file.crl ...]");
  process.exit(1);
}

// Collect concepts across all input files into one map.
interface ConceptInfo {
  file: string;
  concept: Concept;
}

const allConcepts = new Map<string, ConceptInfo>();

for (const filePath of files) {
  const src = readFileSync(filePath, "utf-8");
  const { parser } = createParser(src);
  const tree = parser.crl();
  const builder = new CRLAstBuilder();
  const ast = builder.visit(tree) as CRL;
  const tag = filePath.split(/[\\/]/).pop() ?? filePath;
  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept" || !stmt.name) continue;
    allConcepts.set(stmt.name, { file: tag, concept: stmt as Concept });
  }
}

// Subjects: declared shape of any concept.
// Returns "boolean" | "list" | "value-bearing" | "unknown".
type Shape = "boolean" | "list" | "value-bearing" | "unknown";

function shapeOf(conceptName: string, seen = new Set<string>()): Shape {
  if (seen.has(conceptName)) return "unknown";
  seen.add(conceptName);
  const info = allConcepts.get(conceptName);
  if (!info) return "unknown";
  const c = info.concept;
  const vts = c.valueTypes ?? [];
  if (vts.includes("boolean")) return "boolean";
  if (vts.includes("dateTime") || vts.includes("integer") || vts.includes("Quantity")) {
    // Could be value-bearing OR a list of resources with quantity values.
    // For asserted Observation+Quantity (BMI Observations), it's a list of
    // Observation resources (each with a Quantity value field) — list shape.
    // For Order Date concepts (dateTime), it's value-bearing.
    // Heuristic: if the body is `coded from`, it's asserted → list shape.
    // If definition-is/defined-as with valuetype dateTime, it's value-bearing.
    if (c.definition.type === "CodedFromDefinition") return "list";
    if (vts.includes("dateTime") && vts.length === 1) return "value-bearing";
    return "list";
  }
  if (vts.includes("CodeableConcept")) return "list";
  // No valuetype declared — fall back to body type.
  if (c.definition.type === "CodedFromDefinition") return "list";
  if (c.definition.type === "DefinedAsDefinition") {
    const body = c.definition.body;
    if (body.type === "DefinedAsBareRef") return shapeOf(getRefName(body.ref), seen);
    return shapeOfComposition(body, seen);
  }
  if (c.definition.type === "DefinitionIsDefinition") return "unknown";
  return "unknown";
}

function shapeOfComposition(body: DefinedAsComposition, seen: Set<string>): Shape {
  return shapeOfExpression(body.expression, seen);
}

function shapeOfExpression(expr: CompositionExpression, seen: Set<string>): Shape {
  switch (expr.type) {
    case "CompositionRef":
      return shapeOf(getRefName(expr.ref), seen);
    case "SemNotExpression":
      return shapeOfExpression(expr.expression, seen);
    case "SemOrExpression":
    case "SemAndExpression": {
      const shapes = expr.terms.map((t) => shapeOfExpression(t, seen));
      const unique = [...new Set(shapes)];
      if (unique.length === 1) return unique[0];
      // Mixed
      return "unknown";
    }
    case "CompositionGroup":
      return shapeOfExpression(expr.expression, seen);
  }
}

// Trace back to the asserted subject and return its (type, valuetype) pair.
// Used when classifying as REFINEMENT_MISDECLARED.
function tracedSubject(expr: CompositionExpression): { type?: ConceptType; valuetype?: ConceptValueType; via: string } | null {
  // First leaf CompositionRef in left-to-right traversal.
  const leaves: string[] = [];
  walk(expr);
  function walk(e: CompositionExpression): void {
    switch (e.type) {
      case "CompositionRef":
        leaves.push(getRefName(e.ref)); return;
      case "SemNotExpression":
        walk(e.expression); return;
      case "SemOrExpression":
      case "SemAndExpression":
        for (const t of e.terms) walk(t); return;
      case "CompositionGroup":
        walk(e.expression); return;
    }
  }
  const first = leaves[0];
  if (!first) return null;
  // Walk back through defined-as chain until we hit an asserted (CodedFrom).
  const visited = new Set<string>();
  let current = first;
  while (!visited.has(current)) {
    visited.add(current);
    const info = allConcepts.get(current);
    if (!info) return null;
    const c = info.concept;
    if (c.definition.type === "CodedFromDefinition") {
      return {
        type: c.conceptType,
        valuetype: c.valueTypes?.[0],
        via: current,
      };
    }
    if (c.definition.type === "DefinedAsDefinition") {
      const body = c.definition.body;
      if (body.type === "DefinedAsBareRef") {
        current = getRefName(body.ref); continue;
      }
      // Composition — pick first leaf
      const innerLeaves: string[] = [];
      const walk2 = (e: CompositionExpression): void => {
        switch (e.type) {
          case "CompositionRef": innerLeaves.push(getRefName(e.ref)); return;
          case "SemNotExpression": walk2(e.expression); return;
          case "SemOrExpression":
          case "SemAndExpression": for (const t of e.terms) walk2(t); return;
          case "CompositionGroup": walk2(e.expression); return;
        }
      };
      walk2(body.expression);
      if (innerLeaves.length === 0) return null;
      current = innerLeaves[0];
      continue;
    }
    // DefinitionIsDefinition — return its declaration as authoritative
    // (the predicate's narrative body doesn't disambiguate shape; trust declared type)
    return {
      type: c.conceptType,
      valuetype: c.valueTypes?.[0],
      via: current,
    };
  }
  return null;
}

// --- Run audit ---

interface AuditRow {
  file: string;
  name: string;
  currentType: string;
  shape: Shape;
  classification: string;
  suggestion: string;
}

const rows: AuditRow[] = [];

for (const [name, info] of allConcepts) {
  const c = info.concept;
  if (!c.conceptType || c.conceptType === "Observation") continue;
  if (!c.valueTypes?.includes("boolean")) continue;

  let shape: Shape = "unknown";
  let subjectTrace: { type?: ConceptType; valuetype?: ConceptValueType; via: string } | null = null;

  if (c.definition.type === "DefinedAsDefinition") {
    const body = c.definition.body;
    if (body.type === "DefinedAsBareRef") {
      const refName = getRefName(body.ref);
      shape = shapeOf(refName);
      // For bare ref, the "subject" is the referenced concept itself.
      const refInfo = allConcepts.get(refName);
      if (refInfo) {
        subjectTrace = {
          type: refInfo.concept.conceptType,
          valuetype: refInfo.concept.valueTypes?.[0],
          via: refName,
        };
      }
    } else {
      shape = shapeOfComposition(body, new Set());
      subjectTrace = tracedSubject(body.expression);
    }
  } else if (c.definition.type === "DefinitionIsDefinition") {
    shape = "unknown"; // Would need to inspect narrative semantics
  }

  let classification: string;
  let suggestion: string;
  if (shape === "boolean") {
    classification = "BOOLEAN_GENUINE";
    suggestion = `type is Observation. value type is boolean.`;
  } else if (shape === "list" && subjectTrace?.type && subjectTrace?.valuetype) {
    classification = "REFINEMENT_MISDECLARED";
    suggestion = `type is ${subjectTrace.type}. value type is ${subjectTrace.valuetype}. (from subject "${subjectTrace.via}")`;
  } else if (shape === "value-bearing") {
    classification = "VALUE_BEARING_MISDECLARED";
    suggestion = `type is ${subjectTrace?.type ?? c.conceptType}. value type is dateTime/Quantity (NOT boolean).`;
  } else {
    classification = "MIXED_OR_UNKNOWN";
    suggestion = `audit manually; subject="${subjectTrace?.via ?? "?"}" subjectShape="${shape}"`;
  }

  rows.push({
    file: info.file,
    name,
    currentType: c.conceptType,
    shape,
    classification,
    suggestion,
  });
}

const byClass = new Map<string, AuditRow[]>();
for (const r of rows) {
  if (!byClass.has(r.classification)) byClass.set(r.classification, []);
  byClass.get(r.classification)!.push(r);
}

for (const cls of ["BOOLEAN_GENUINE", "REFINEMENT_MISDECLARED", "VALUE_BEARING_MISDECLARED", "MIXED_OR_UNKNOWN"]) {
  const list = byClass.get(cls) ?? [];
  if (list.length === 0) continue;
  console.log(`\n=== ${cls} (${list.length}) ===`);
  for (const r of list) {
    console.log(`  ${r.file}  "${r.name}" (was ${r.currentType}+boolean)`);
    console.log(`    → ${r.suggestion}`);
  }
}

console.log(`\nTotal: ${rows.length}`);
