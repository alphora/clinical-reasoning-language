// Integration-ish test for ProjectIndex's AST-driven reference index.
// Uses a real fixture directory under /tmp; parses CRL via the bundled
// package; verifies bare refs ARE indexed (would have caught Chunk C's
// round-1 code-review C1 bug where bare refs were silently dropped).

import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectIndex } from "@smile-digital-health/crl/language-services";

const root = mkdtempSync(join(tmpdir(), "crl-index-test-"));
writeFileSync(join(root, "package.json"), JSON.stringify({ name: "tmp", version: "0.0.0" }));
writeFileSync(
  join(root, "root.crl"),
  `# Root
library "Root".

terminology "BMI Valueset":
- valueset is \`urn:bmi\`.

concept "BMI":
- type is Observation.
- coded from "BMI Valueset".

concept "BMI Composed":
- type is Observation.
- defined as "BMI".

concept "BMI Cross":
- type is Observation.
- defined as "Sib"."Sib Concept".
`,
);
writeFileSync(
  join(root, "sib.crl"),
  `# Sib
library "Sib".

terminology "Sib T":
- valueset is \`urn:sib\`.

concept "Sib Concept":
- type is Observation.
- coded from "Sib T".
`,
);

const index = new ProjectIndex();
const rootFile = join(root, "root.crl");
const decls = index.getDeclarations(rootFile);

const rootBMI = decls.find((d) => d.libraryName === "Root" && d.name === "BMI" && d.kind === "concept");
assert.ok(rootBMI, "Root's BMI concept should be indexed");
const sibConcept = decls.find((d) => d.libraryName === "Sib" && d.name === "Sib Concept");
assert.ok(sibConcept, "Sib's Sib Concept should be indexed via project-wide scan");

const refs = index.getReferences(rootFile);

// Bare ref: `defined as "BMI"` in concept "BMI Composed"
const bareRef = refs.find((r) => r.targetName === "BMI" && r.targetLibrary === "Root" && !r.qualified);
assert.ok(bareRef, `bare ref to "BMI" must be indexed (round-1 C1 fix); got ${refs.length} refs total`);

// Bare ref: `coded from "BMI Valueset"`
const bareTermRef = refs.find((r) => r.targetName === "BMI Valueset" && !r.qualified);
assert.ok(bareTermRef, "bare terminology ref must be indexed");

// Qualified ref: `defined as "Sib"."Sib Concept"`
const qualRef = refs.find((r) => r.targetName === "Sib Concept" && r.targetLibrary === "Sib" && r.qualified);
assert.ok(qualRef, "qualified cross-library ref must be indexed");
assert.ok(qualRef.qualifierRange !== null, "qualified ref must have a qualifierRange");

// findRefsTo: O(1) lookup
const found = index.findRefsTo(rootFile, "Root", "BMI", "concept");
assert.equal(found.length, 1, "findRefsTo Root.BMI should return exactly the bare ref");

console.log(`projectIndex tests passed (${decls.length} decls, ${refs.length} refs indexed).`);
