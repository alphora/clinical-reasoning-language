// Static-assertion tests for the v2.3.0 language-configuration.json files
// (CRL + CEL). Asserts:
//   - parse as valid JSON
//   - lineComment === "//" (the canonical CRL/CEL comment syntax)
//   - blockComment === ["/*", "*/"]
//   - wordPattern is set (per 054 Δ5 — hyphen-inclusive so `sem-not` etc.
//     select as one word for double-click + getWordRangeAtPosition callers)
//   - autoClosingPairs include `notIn: ["string", "comment"]` on quote and
//     backtick pairs (per 054 Δ8 — avoids the quote-inside-string nuisance)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const syntaxesDir = resolve(here, "../syntaxes");
const crl = JSON.parse(readFileSync(join(syntaxesDir, "crl.language-configuration.json"), "utf8"));
const cel = JSON.parse(readFileSync(join(syntaxesDir, "cel.language-configuration.json"), "utf8"));

const check = test;

for (const [name, cfg] of [
  ["CRL", crl],
  ["CEL", cel],
]) {
  check(`${name} language-configuration: comments`, () => {
    assert.equal(cfg.comments.lineComment, "//");
    assert.deepEqual(cfg.comments.blockComment, ["/*", "*/"]);
  });

  check(`${name} language-configuration: wordPattern set (hyphen-inclusive)`, () => {
    assert.equal(typeof cfg.wordPattern, "string");
    // Sanity-check the pattern admits hyphens. The exact regex string is
    // documented in 054 Δ5; we want to detect a regression that drops `-`
    // from the word class without re-specifying the canonical regex here.
    const re = new RegExp(cfg.wordPattern);
    assert.ok(re.test("sem-not"), "wordPattern must match `sem-not` as one word");
    assert.ok(re.test("do-not-perform"), "wordPattern must match hyphenated CRL keywords");
  });

  check(`${name} language-configuration: autoClosingPairs use notIn for quotes`, () => {
    const pairs = cfg.autoClosingPairs ?? [];
    const dq = pairs.find((p) => p.open === '"');
    const bt = pairs.find((p) => p.open === "`");
    assert.ok(dq, `${name} autoClosingPairs must include double-quote`);
    assert.ok(bt, `${name} autoClosingPairs must include backtick`);
    assert.deepEqual(dq.notIn, ["string", "comment"]);
    assert.deepEqual(bt.notIn, ["string", "comment"]);
  });
}

