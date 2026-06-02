// Pure-function tests for `findDeclarationAtPosition`. Uses a fake
// ProjectIndex stub to avoid bringing in the package or vscode bindings.
// Runs via `npm run test:find-declaration`.

import { strict as assert } from "node:assert";
import { findDeclarationAtPosition } from "../dist/findDeclaration.js";

function fakeIndex({ declarations = [], libraries = [], references = [] } = {}) {
  return {
    getDeclarations: () => declarations,
    getLibraries: () => libraries,
    getReferences: () => references,
  };
}

function r(startLine, startCol, endCol) {
  return { startLine, startCol, endLine: startLine, endCol };
}

// Declaration at (line 5, col 9–12) — the name "BMI" inside `concept "BMI":`
{
  const decl = {
    name: "BMI",
    kind: "concept",
    libraryName: "L",
    filePath: "/p/a.crl",
    line: 5,
    nameRange: r(5, 9, 12),
    bodyRange: r(5, 0, 12),
    origin: "local",
  };
  const idx = fakeIndex({ declarations: [decl] });

  // Cursor on the name → declaration hit.
  const hit = findDeclarationAtPosition("/p/a.crl", { line: 5, character: 10 }, idx);
  assert.equal(hit?.kind, "declaration");
  assert.equal(hit.decl.name, "BMI");

  // Cursor outside the name range → null.
  const miss = findDeclarationAtPosition("/p/a.crl", { line: 5, character: 4 }, idx);
  assert.equal(miss, null);
}

// Library at (line 1, col 9–11) — `library "L".`
{
  const lib = {
    libraryName: "L",
    filePath: "/p/a.crl",
    origin: "local",
    range: r(1, 0, 13),
    nameRange: r(1, 9, 10),
  };
  const idx = fakeIndex({ libraries: [lib] });
  const hit = findDeclarationAtPosition("/p/a.crl", { line: 1, character: 9 }, idx);
  assert.equal(hit?.kind, "library");
  assert.equal(hit.lib.libraryName, "L");
}

// Reference (bare) at name position → reference-name.
{
  const ref = {
    targetLibrary: "L",
    targetName: "BMI",
    targetKind: "concept",
    filePath: "/p/a.crl",
    nameRange: r(10, 14, 17),
    qualifierRange: null,
    qualified: false,
  };
  const idx = fakeIndex({ references: [ref] });
  const hit = findDeclarationAtPosition("/p/a.crl", { line: 10, character: 15 }, idx);
  assert.equal(hit?.kind, "reference-name");
  assert.equal(hit.ref.targetName, "BMI");
}

// Qualified reference: qualifier hit vs name hit.
{
  const ref = {
    targetLibrary: "Other",
    targetName: "BMI",
    targetKind: "concept",
    filePath: "/p/a.crl",
    nameRange: r(10, 24, 27),
    qualifierRange: r(10, 15, 20),
    qualified: true,
  };
  const idx = fakeIndex({ references: [ref] });
  const onQual = findDeclarationAtPosition("/p/a.crl", { line: 10, character: 17 }, idx);
  assert.equal(onQual?.kind, "reference-qualifier");
  const onName = findDeclarationAtPosition("/p/a.crl", { line: 10, character: 25 }, idx);
  assert.equal(onName?.kind, "reference-name");
}

console.log("findDeclaration tests passed.");
