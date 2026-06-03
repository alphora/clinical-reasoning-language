// Unit tests for the document scanner (concepts.ts). Runs against the
// just-built dist/concepts.js. Validates that headers, type/valuetype
// bullets, and body previews are extracted from realistic CRL fragments.

import assert from "node:assert/strict";

import * as mod from "../dist/concepts.js";
const { scanDeclarations, declarationsByName } = mod.default ?? mod;

// --- terminology header + body ---
{
  const src = `terminology "X":
- valueset is \`https://example.org/vs/x\`.`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 1);
  assert.equal(decls[0].name, "X");
  assert.equal(decls[0].kind, "terminology");
  assert.equal(decls[0].line, 0);
  assert.equal(decls[0].bodyPreview, "valueset is `https://example.org/vs/x`");
}

// --- concept with type, valuetype, coded from ---
{
  const src = `concept "BMI Observations":
- type is Observation.
- value type is Quantity.
- coded from "Body Mass Index Observations".`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 1);
  assert.equal(decls[0].name, "BMI Observations");
  assert.equal(decls[0].kind, "concept");
  assert.equal(decls[0].type, "Observation");
  assert.equal(decls[0].valuetype, "Quantity");
  assert.equal(decls[0].bodyPreview, `coded from "Body Mass Index Observations"`);
}

// --- two concepts back-to-back ---
{
  const src = `concept "A":
- type is Encounter.
- coded from "VS-A".

concept "B":
- type is Condition.
- value type is CodeableConcept.
- coded from "VS-B".`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 2);
  assert.equal(decls[0].name, "A");
  assert.equal(decls[0].type, "Encounter");
  assert.equal(decls[1].name, "B");
  assert.equal(decls[1].valuetype, "CodeableConcept");
}

// --- defined as body (multiline) — body preview captures first bullet ---
{
  const src = `concept "Qualifying Encounter":
- type is Encounter.
- defined as
(
   "BMI Evaluation Encounter (not virtual) During MP"
   sem-and
   "BMI Evaluation Encounter (not virtual) Performed"
).`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 1);
  assert.equal(decls[0].name, "Qualifying Encounter");
  assert.equal(decls[0].type, "Encounter");
  assert.equal(decls[0].bodyPreview, "defined as");
}

// --- definition-is body ---
{
  const src = `concept "BMI Observation During MP":
- type is Observation.
- value type is Quantity.
- definition is "BMI Observations" during "Measurement Period".`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 1);
  assert.equal(decls[0].bodyPreview, `definition is "BMI Observations" during "Measurement Period"`);
}

// --- declarationsByName: last-write-wins ---
{
  const src = `concept "Dup":
- type is Observation.

concept "Dup":
- type is Condition.`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 2);
  const byName = declarationsByName(decls);
  assert.equal(byName.size, 1);
  assert.equal(byName.get("Dup").type, "Condition", "duplicate names: last declaration wins for lookup map");
}

// --- malformed header isn't picked up ---
{
  const src = `not-a-header "X":
- type is Observation.`;
  const decls = scanDeclarations(src);
  assert.equal(decls.length, 0);
}

console.log(`concepts.test.mjs: declaration scanner spot-checks passed.`);
