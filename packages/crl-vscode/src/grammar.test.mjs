// Static-assertion tests for the v2.3.0 grammar file restructure.
// Asserts BOTH grammar JSONs have the expected v2.3.0 shape:
//   - parse as valid JSON
//   - no `injectionSelector` (they're standalone language grammars now)
//   - correct `scopeName` (source.crl / source.crl-cel — `cel` collides with
//     hmarr.cel per 054 discussion Δ4)
//   - first pattern is the new `#`-line comment per the v2.3.0 design
//   - CRL grammar's `__readme_token_color_customizations_snippet__` references
//     the new comment scope; CEL grammar deliberately has no snippet (theme
//     defaults handle CEL coloring — 054 discussion Δ6)
//   - the runtime path extension.ts:grammarPath() builds resolves to a real
//     file (Δ10 from 054 — catches a future rename-without-test-update)

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const syntaxesDir = resolve(here, "../syntaxes");
const crlPath = join(syntaxesDir, "crl.tmLanguage.json");
const celPath = join(syntaxesDir, "cel.tmLanguage.json");

let failed = false;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (e) {
    failed = true;
    console.error(`FAIL  ${label}\n      ${e.stack || e.message}`);
  }
};

const crl = JSON.parse(readFileSync(crlPath, "utf8"));
const cel = JSON.parse(readFileSync(celPath, "utf8"));

check("CRL grammar: valid JSON + standalone scopeName", () => {
  assert.equal(crl.scopeName, "source.crl");
  assert.equal(crl.injectionSelector, undefined, "injectionSelector must be removed");
  assert.ok(Array.isArray(crl.patterns) && crl.patterns.length > 0);
});

check("CEL grammar: valid JSON + renamed scopeName (avoid hmarr.cel collision)", () => {
  assert.equal(cel.scopeName, "source.crl-cel");
  assert.equal(cel.injectionSelector, undefined, "injectionSelector must be removed");
  assert.ok(Array.isArray(cel.patterns) && cel.patterns.length > 0);
});

check("CRL grammar: first pattern is #-line comment", () => {
  const first = crl.patterns[0];
  assert.equal(first.name, "comment.line.number-sign.crl");
  assert.equal(first.match, "^\\s*#.*$");
});

check("CEL grammar: first pattern is #-line comment (CRL parity scope)", () => {
  // Per operator parity request: CEL pattern scopes are renamed to `.crl`
  // suffix so the user's existing CRL editor.tokenColorCustomizations rules
  // apply to CEL too. CEL keywords get the same colors as their CRL analogs.
  const first = cel.patterns[0];
  assert.equal(first.name, "comment.line.number-sign.crl");
  assert.equal(first.match, "^\\s*#.*$");
});

check("CRL grammar: snippet references the new #-comment scope", () => {
  const snippet = crl.__readme_token_color_customizations_snippet__;
  assert.ok(snippet, "CRL grammar must carry the snippet (loadCrlRules consumes it)");
  const rules = snippet["editor.tokenColorCustomizations"].textMateRules;
  const scopes = rules.map((r) => r.scope);
  assert.ok(
    scopes.includes("comment.line.number-sign.crl"),
    `expected comment.line.number-sign.crl in snippet scopes; got: ${scopes.join(", ")}`,
  );
});

check("CEL grammar: NO __readme_*_snippet__ (CEL relies on theme defaults — 054 Δ6)", () => {
  assert.equal(
    cel.__readme_token_color_customizations_snippet__,
    undefined,
    "CEL grammar must NOT carry a snippet; CEL token colors fall through to theme defaults",
  );
});

check("CRL grammar: extension.ts:grammarPath() string literal matches the actual file on disk", () => {
  // Parse the literal grammarPath() builds in extension.ts and verify the
  // file exists. Catches BOTH (a) future renames that miss extension.ts and
  // (b) future divergences where extension.ts's literal drifts from the
  // real filename. Cheaper than instantiating a vscode ExtensionContext.
  const extSrc = readFileSync(join(here, "extension.ts"), "utf8");
  const match = extSrc.match(/grammarPath\([^)]*\)\s*:\s*string\s*\{[\s\S]*?"syntaxes",\s*"([^"]+)"/);
  assert.ok(match, "extension.ts:grammarPath() literal could not be parsed — has the function shape changed?");
  const literal = match[1];
  assert.equal(
    literal,
    "crl.tmLanguage.json",
    `extension.ts:grammarPath() string literal is "${literal}", expected "crl.tmLanguage.json"`,
  );
  const expected = join(here, "..", "syntaxes", literal);
  assert.ok(existsSync(expected), `file at ${expected} (per extension.ts literal) must exist`);
});

console.log(failed ? "\ntest:grammar FAILED" : "\ngrammar.test.mjs: v2.3.0 grammar restructure assertions passed.");
process.exit(failed ? 1 : 0);
