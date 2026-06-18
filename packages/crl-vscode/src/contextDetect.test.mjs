// Pure-function tests for detectExpectedKind / detectQualifiedRefQualifier
// + isInsideOpenQuote. Runs against the @smile-digital-health/crl/language-services subpath to
// match the repo's existing extension test scaffolding.

import { strict as assert } from "node:assert";
import { detectExpectedKind, detectQualifiedRefQualifier, isInsideOpenQuote } from "@smile-digital-health/crl/language-services";

const cases = [
  // [prefix, expectedKind]
  ['- coded from "', "terminology"],
  ['  - coded from "', "terminology"],
  ['- coded from "Lib"."', "terminology"],
  ['- with "', "terminology"],
  ['  - with "', "terminology"],
  ['- with "Lib"."', "terminology"],
  ['recommend activity "', "activity"],
  ['- when "X" then recommend activity "', "activity"],
  ['use decision "', "decision"],
  ['- when "X" then use decision "', "decision"],
  ['when "', "concept"],
  ['- when "', "concept"],
  ['  - when "Lib"."', "concept"],
  ['- defined as "', "concept"],
  ['- defined as "Lib"."', "concept"],
  ['- defined as ( "', "concept"],
  ['  "A" sem-and "', "concept"],
  ['  "A" sem-or "', "concept"],
  ['  "A" sem-or sem-not "', "concept"],
  // v2.2 issue #59: narrative slot accepts concept OR parameter
  // refs; mapped to a distinct ExpectedRefKind so non-narrative
  // concept slots stay strict.
  ['  - definition is "', "narrative"],
  // Narrative connectors
  ['"X" during "', "narrative"],
  ['"X" before "', "narrative"],
  ['"X" after "', "narrative"],
  ['"X" as of "', "narrative"],
  ['"X" on day of "', "narrative"],
  // Uncategorized → any
  ['just some text "', "any"],
];

for (const [prefix, expected] of cases) {
  const got = detectExpectedKind(prefix);
  assert.equal(got, expected, `detectExpectedKind(${JSON.stringify(prefix)}) = ${got}; expected ${expected}`);
}

// detectQualifiedRefQualifier — case 1: inside the second quote
assert.equal(detectQualifiedRefQualifier('- defined as "Lib"."'), "Lib");
assert.equal(detectQualifiedRefQualifier('- coded from "CMS22 Terminology"."'), "CMS22 Terminology");
// case 2: right after the dot (fired by the `.` trigger char before the
// second `"` is typed)
assert.equal(detectQualifiedRefQualifier('- defined as "Lib".'), "Lib");
assert.equal(detectQualifiedRefQualifier('- coded from "CMS22 Terminology".'), "CMS22 Terminology");
// Not a qualified-ref position
assert.equal(detectQualifiedRefQualifier('- defined as "'), null);
assert.equal(detectQualifiedRefQualifier('  "X" during "'), null);

// isInsideOpenQuote
assert.equal(isInsideOpenQuote('- coded from "'), true);
assert.equal(isInsideOpenQuote('- coded from "X"'), false);
assert.equal(isInsideOpenQuote('- coded from "X". '), false);
assert.equal(isInsideOpenQuote('- defined as "Lib"."'), true);

console.log("contextDetect tests passed.");
