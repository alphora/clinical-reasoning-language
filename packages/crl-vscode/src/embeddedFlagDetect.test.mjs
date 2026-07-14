// #212 S3 — the un-migrated-flag safety-net detector (pure). Covers the whitespace/comment/status edges the source-goldens can't.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { countEmbeddedFlags, FORMER_FLAG_TAGS } = await load("embeddedFlagDetect.ts");

test("catches a canonical embedded flag", () => {
  assert.equal(countEmbeddedFlags("concept \"C\":\n- meta is `@validation-concern: BMI is wrong; status open`."), 1);
});

test("STATUS-AGNOSTIC: an absent status, and a `pending`/variant status, still count (they're real open flags)", () => {
  assert.equal(countEmbeddedFlags("- meta is `@validation-concern: no status field here`."), 1);
  assert.equal(countEmbeddedFlags("- meta is `@fidelity-defect: x; direction over-reach; status pending`."), 1);
});

test("WHITESPACE-FLEXIBLE (grammar-legal): tabs / extra spaces / NO space before the backtick all count", () => {
  assert.equal(countEmbeddedFlags("-\tmeta is  `@fidelity-defect: y; direction over-reach`."), 1);
  assert.equal(countEmbeddedFlags("  - meta is`@open-fork: no space before the backtick`."), 1); // no WS before `@ — grammar-legal
});

test("MULTI-LINE body is fine — the @tag is on the meta's first line", () => {
  assert.equal(countEmbeddedFlags("- meta is `@internal-inconsistency: line one\nline two of the body`."), 1);
});

test("a COMMENTED-OUT flag line is NOT a hit (anchored past leading whitespace; `//` isn't `-`)", () => {
  assert.equal(countEmbeddedFlags("// - meta is `@open-fork: an old commented-out line`."), 0);
});

test("a NON-flag meta (@business-logic-deferred, @ke-feedback, @gap-filed) is NOT a hit", () => {
  assert.equal(countEmbeddedFlags("- meta is `@business-logic-deferred: intentional`."), 0);
  assert.equal(countEmbeddedFlags("- meta is `@ke-feedback: note; status open`."), 0);
  assert.equal(countEmbeddedFlags("- meta is `@gap-filed: ref #7`."), 0);
});

test("counts EACH embedded flag across a file; a clean file → 0", () => {
  assert.equal(countEmbeddedFlags("- meta is `@validation-concern: a`.\n- meta is `@customer-confirmable: b`."), 2);
  assert.equal(countEmbeddedFlags("library \"L\".\nconcept \"C\":\n- type is Observation.\n- code is `c`."), 0);
});

test("all fidelity-defect aliases are covered", () => {
  for (const t of FORMER_FLAG_TAGS) assert.equal(countEmbeddedFlags("- meta is `@" + t + ": x`."), 1, t);
});

console.log("embeddedFlagDetect.test: ok");
