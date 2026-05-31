// Unit tests for the pure highlight helpers. Imports the BUILT bundle.
// Run via `npm run test:highlight`.
import * as mod from "../dist/highlight.js";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { loadCrlRules, applyHighlight, removeHighlight } = mod.default ?? mod;
const here = dirname(fileURLToPath(import.meta.url));
const grammar = resolve(here, "../syntaxes/crl-injection.tmLanguage.json");

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

const rules = loadCrlRules(grammar);

check("loadCrlRules returns the grammar's rule set", () => {
  assert.ok(Array.isArray(rules) && rules.length > 0);
  const scopes = rules.map((r) => r.scope);
  assert.ok(scopes.includes("entity.name.type.crl"));
  assert.ok(scopes.includes("keyword.control.flow.crl"));
});

check("apply on empty config adds association + all rules (changed)", () => {
  const r = applyHighlight(undefined, undefined, rules);
  assert.equal(r.associationsChanged, true);
  assert.equal(r.tokenColorsChanged, true);
  assert.equal(r.associations["*.crl"], "markdown");
  assert.equal(r.tokenColors.textMateRules.length, rules.length);
});

check("apply is idempotent on its own output", () => {
  const first = applyHighlight(undefined, undefined, rules);
  const second = applyHighlight(first.associations, first.tokenColors, rules);
  assert.equal(second.associationsChanged, false);
  assert.equal(second.tokenColorsChanged, false);
});

check("apply flags only the section that changed", () => {
  const applied = applyHighlight(undefined, undefined, rules);
  // association absent, colors already present → only associationsChanged
  const r = applyHighlight(undefined, applied.tokenColors, rules);
  assert.equal(r.associationsChanged, true);
  assert.equal(r.tokenColorsChanged, false);
});

check("apply preserves user's other association + token rule", () => {
  const assoc = { "*.foo": "json" };
  const colors = { textMateRules: [{ scope: "comment.line.mine", settings: { foreground: "#fff" } }] };
  const r = applyHighlight(assoc, colors, rules);
  assert.equal(r.associations["*.foo"], "json");
  assert.ok(r.tokenColors.textMateRules.some((x) => x.scope === "comment.line.mine"));
  assert.ok(r.tokenColors.textMateRules.some((x) => x.scope === "entity.name.type.crl"));
});

check("apply leaves a user-customized .crl rule + reports the scope for prompting", () => {
  const mine = { scope: "entity.name.type.crl", settings: { foreground: "#123456" } };
  const r = applyHighlight(undefined, { textMateRules: [mine] }, rules);
  const got = r.tokenColors.textMateRules.find((x) => x.scope === "entity.name.type.crl");
  assert.equal(got.settings.foreground, "#123456"); // unchanged
  assert.deepEqual(r.customizedScopes, ["entity.name.type.crl"]);
  // The extension host handles the prompt — no warning fired from the pure helper.
  assert.equal(r.warnings.length, 0);
});

check("apply with replaceScopes overwrites the user-customized rule", () => {
  const mine = { scope: "entity.name.type.crl", settings: { foreground: "#123456" } };
  const r = applyHighlight(undefined, { textMateRules: [mine] }, rules, {
    replaceScopes: new Set(["entity.name.type.crl"]),
  });
  const got = r.tokenColors.textMateRules.find((x) => x.scope === "entity.name.type.crl");
  const expected = rules.find((x) => x.scope === "entity.name.type.crl");
  assert.deepEqual(got.settings, expected.settings, "replace must overwrite with CRL's canonical settings");
  assert.equal(r.customizedScopes.length, 0, "replaced scopes are not re-reported as customized");
  assert.equal(r.tokenColorsChanged, true);
});

check("remove deletes our association + our rules, keeps user's", () => {
  const applied = applyHighlight({ "*.foo": "json" }, { textMateRules: [{ scope: "x.mine", settings: { foreground: "#1" } }] }, rules);
  const r = removeHighlight(applied.associations, applied.tokenColors, rules);
  assert.ok(r.associationsChanged && r.tokenColorsChanged);
  assert.equal(r.associations["*.crl"], undefined);
  assert.equal(r.associations["*.foo"], "json");
  assert.ok(r.tokenColors.textMateRules.some((x) => x.scope === "x.mine"));
  assert.ok(!r.tokenColors.textMateRules.some((x) => x.scope === "entity.name.type.crl"));
});

check("remove leaves a user-customized .crl rule (settings differ)", () => {
  const mine = { scope: "entity.name.type.crl", settings: { foreground: "#123456" } };
  const r = removeHighlight(undefined, { textMateRules: [mine] }, rules);
  assert.ok(r.tokenColors.textMateRules.some((x) => x.scope === "entity.name.type.crl"));
});

check("defensive: non-array textMateRules and undefined inputs don't throw", () => {
  assert.doesNotThrow(() => applyHighlight(undefined, { textMateRules: "oops" }, rules));
  assert.doesNotThrow(() => removeHighlight(undefined, undefined, rules));
});

console.log(failed ? "\ntest:highlight FAILED" : "\ntest:highlight passed");
process.exit(failed ? 1 : 0);
