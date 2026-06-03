// v2.2 Todo 4 (issue #59) — predicate + precedence-helper tests for
// completion.ts. The full `vscode.CompletionItemProvider` types can't be
// imported under plain Node, so this file exercises the pure helpers the
// providers consume.
//
// Mirrors the `contextDetect.test.mjs` testability pattern.

import assert from "node:assert/strict";

import * as mod from "../dist/completionHelpers.js";
const {
  isTypeCompletionPrefix,
  isValuetypeCompletionPrefix,
  isParamTypeCompletionPrefix,
  isUnquotedTypeSlotPrefix,
  applyNarrativePrecedence,
  findByConceptFirstPrecedence,
} = mod.default ?? mod;

// --- isTypeCompletionPrefix ---
assert.equal(isTypeCompletionPrefix("- type is "), true);
assert.equal(isTypeCompletionPrefix("  - type is "), true);
assert.equal(isTypeCompletionPrefix("- type is Obs"), true);
assert.equal(isTypeCompletionPrefix("- value type is "), false, "value type slot must NOT match type-slot predicate");
assert.equal(isTypeCompletionPrefix("- param type is "), false, "param type slot must NOT match type-slot predicate");
assert.equal(isTypeCompletionPrefix("concept \"X\":"), false);
// Whitespace after the type token closes the slot (the regex requires \S* end).
assert.equal(isTypeCompletionPrefix("- type is Observation "), false, "trailing space closes the slot");

// --- isValuetypeCompletionPrefix ---
assert.equal(isValuetypeCompletionPrefix("- value type is "), true);
assert.equal(isValuetypeCompletionPrefix("  - value type is bool"), true);
assert.equal(isValuetypeCompletionPrefix("- type is "), false);
assert.equal(isValuetypeCompletionPrefix("- param type is "), false);
assert.equal(isValuetypeCompletionPrefix("- value type is boolean "), false, "trailing space closes the slot");

// --- isParamTypeCompletionPrefix ---
assert.equal(isParamTypeCompletionPrefix("- param type is "), true);
assert.equal(isParamTypeCompletionPrefix("  - param type is P"), true);
assert.equal(isParamTypeCompletionPrefix("- type is "), false, "type slot must NOT match param-type predicate");
assert.equal(isParamTypeCompletionPrefix("- value type is "), false, "value-type slot must NOT match param-type predicate");
assert.equal(isParamTypeCompletionPrefix("parameter \"X\":"), false);
assert.equal(isParamTypeCompletionPrefix("- param type is Period "), false, "trailing space closes the slot");

// --- isUnquotedTypeSlotPrefix: REGRESSION GUARD for "concept refs leak into type slots" ---
// Bug: typing `"` on a `- param type is "` line fired ConceptRefCompletionProvider
// and showed concept/terminology/decision suggestions. The slot expects an
// UNQUOTED identifier (Patient, Period, etc.); concept-ref completion has
// nothing to offer there. This predicate gates the suppression.

// Positive — should suppress
assert.equal(isUnquotedTypeSlotPrefix("- param type is "), true);
assert.equal(isUnquotedTypeSlotPrefix("- param type is \""), true, "open quote on param-type line still in slot");
assert.equal(isUnquotedTypeSlotPrefix("- param type is \"Foo"), true, "cursor inside an open quote in slot");
assert.equal(isUnquotedTypeSlotPrefix("- type is "), true);
assert.equal(isUnquotedTypeSlotPrefix("- type is \"Obs"), true);
assert.equal(isUnquotedTypeSlotPrefix("- value type is "), true);
assert.equal(isUnquotedTypeSlotPrefix("  - value type is \""), true, "indented value-type slot still detected");

// Negative — should NOT suppress (other slots that DO accept quoted refs)
assert.equal(isUnquotedTypeSlotPrefix("- coded from \""), false);
assert.equal(isUnquotedTypeSlotPrefix("- defined as \""), false);
assert.equal(isUnquotedTypeSlotPrefix("- definition is \""), false);
assert.equal(isUnquotedTypeSlotPrefix("- with \""), false);
assert.equal(isUnquotedTypeSlotPrefix("when \""), false);
assert.equal(isUnquotedTypeSlotPrefix("concept \"X\":"), false);
assert.equal(isUnquotedTypeSlotPrefix("parameter \""), false, "declaration header isn't a type slot");

// Negative — close-similar words that aren't the slot
assert.equal(isUnquotedTypeSlotPrefix("- typespecific is \""), false);
assert.equal(isUnquotedTypeSlotPrefix("- type isSome \""), false, "isSome lacks word boundary after `is`");

// --- applyNarrativePrecedence: concept-of-same-name suppresses the parameter ---
{
  const input = [
    { name: "BMI", kind: "parameter", libraryName: "Lib", origin: "local" },
    { name: "BMI", kind: "concept", libraryName: "Lib", origin: "local" },
  ];
  const out = applyNarrativePrecedence(input);
  assert.equal(out.length, 1, "parameter dropped when same-name concept exists");
  assert.equal(out[0].kind, "concept");
}

// --- applyNarrativePrecedence: order-independent ---
{
  const input = [
    { name: "BMI", kind: "concept", libraryName: "Lib", origin: "local" },
    { name: "BMI", kind: "parameter", libraryName: "Lib", origin: "local" },
  ];
  const out = applyNarrativePrecedence(input);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "concept", "concept wins regardless of source order");
}

// --- applyNarrativePrecedence: cross-library same-name stays distinct ---
{
  const input = [
    { name: "BMI", kind: "concept", libraryName: "A", origin: "local" },
    { name: "BMI", kind: "parameter", libraryName: "B", origin: "local" },
  ];
  const out = applyNarrativePrecedence(input);
  assert.equal(out.length, 2, "different libraries are different scopes — parameter NOT suppressed");
}

// --- applyNarrativePrecedence: same library name, DIFFERENT origin keeps both ---
// (Matches ProjectIndex's `resolveTargetKind` semantics — local "Foo" and
// package "Foo" stay separate.)
{
  const input = [
    { name: "BMI", kind: "concept", libraryName: "Lib", origin: "local" },
    { name: "BMI", kind: "parameter", libraryName: "Lib", origin: "package" },
  ];
  const out = applyNarrativePrecedence(input);
  assert.equal(out.length, 2, "cross-origin same-libname suggestions stay distinct");
}

// --- applyNarrativePrecedence: lone parameter keeps the parameter ---
{
  const input = [
    { name: "MP", kind: "parameter", libraryName: "Lib", origin: "local" },
  ];
  const out = applyNarrativePrecedence(input);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "parameter");
}

// --- applyNarrativePrecedence: non-narrative kinds (terminology + concept same name) pass through ---
// Other kind-pairs (terminology+concept, decision+activity) are different
// slots; users seeing both labels is correct, not a UX problem.
{
  const input = [
    { name: "BMI", kind: "concept", libraryName: "Lib", origin: "local" },
    { name: "BMI", kind: "terminology", libraryName: "Lib", origin: "local" },
  ];
  const out = applyNarrativePrecedence(input);
  assert.equal(out.length, 2, "terminology with same name as concept must NOT be suppressed");
}

// --- findByConceptFirstPrecedence: shared helper used by hover + concepts ---
// REGRESSION GUARD: this is the helper that backs both `findIndexedNarrative`
// (in hover.ts, indexed path) and `findNarrativeDeclaration` (in concepts.ts,
// orphan path). The indexed wrapper has no other unit test — these checks
// lock the algorithm itself.

// concept-first when both concept and parameter match
{
  const decls = [
    { name: "BMI", kind: "parameter" },
    { name: "BMI", kind: "concept" },
  ];
  const r = findByConceptFirstPrecedence(decls, (d) => d.name === "BMI");
  assert.equal(r?.kind, "concept");
}

// parameter when no concept matches
{
  const decls = [{ name: "MP", kind: "parameter" }];
  const r = findByConceptFirstPrecedence(decls, (d) => d.name === "MP");
  assert.equal(r?.kind, "parameter");
}

// terminology when it's the only match (preserves pre-Todo-4 hover behavior)
{
  const decls = [{ name: "T", kind: "terminology" }];
  const r = findByConceptFirstPrecedence(decls, (d) => d.name === "T");
  assert.equal(r?.kind, "terminology");
}

// activity / decision / any other kind passes through
{
  const decls = [
    { name: "Act", kind: "activity" },
    { name: "Dec", kind: "decision" },
  ];
  assert.equal(findByConceptFirstPrecedence(decls, (d) => d.name === "Act")?.kind, "activity");
  assert.equal(findByConceptFirstPrecedence(decls, (d) => d.name === "Dec")?.kind, "decision");
}

// concept wins over both parameter AND a later same-kind concept
{
  const decls = [
    { name: "X", kind: "parameter" },
    { name: "X", kind: "concept" },
    { name: "X", kind: "concept" },
  ];
  const r = findByConceptFirstPrecedence(decls, (d) => d.name === "X");
  assert.equal(r?.kind, "concept");
}

// returns undefined when no match
{
  const decls = [{ name: "X", kind: "concept" }];
  const r = findByConceptFirstPrecedence(decls, (d) => d.name === "Z");
  assert.equal(r, undefined);
}

// matcher predicate composes — caller can filter by qualifier + name
// (this is exactly how findIndexedNarrative uses it for qualified refs).
{
  const decls = [
    { name: "X", kind: "parameter", libraryName: "A" },
    { name: "X", kind: "concept", libraryName: "B" },
  ];
  const r = findByConceptFirstPrecedence(
    decls,
    (d) => d.name === "X" && d.libraryName === "A",
  );
  assert.equal(r?.kind, "parameter", "qualified-A-only filter excludes the B concept");
  assert.equal(r?.libraryName, "A");
}

console.log(`completion.test.mjs: predicate + precedence-helper tests passed.`);
