// Unit tests for the pure highlight helpers. Imports the BUILT bundle.
// Run via `npm run test:highlight`.
import * as mod from "@smile-digital-health/crl/language-services";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { loadCrlRules, applyHighlight, removeHighlight, clearStaleCrlAssociations } = mod.default ?? mod;
const here = dirname(fileURLToPath(import.meta.url));
const grammar = resolve(here, "../syntaxes/crl.tmLanguage.json");

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

check("apply on empty config adds all rules + does NOT write any file-association (v2.3.0)", () => {
  const r = applyHighlight(undefined, undefined, rules);
  // v2.3.0: applyHighlight does NOT touch files.associations anymore. The
  // *.crl → markdown write that pre-v2.3.0 versions did is removed; the
  // native `crl` language registration in package.json drives buffer
  // language resolution. clearStaleCrlAssociations() is the helper that
  // cleans up leftover pre-v2.3.0 entries on activation.
  assert.equal(r.associationsChanged, false);
  assert.equal(r.tokenColorsChanged, true);
  assert.equal(r.associations["*.crl"], undefined);
  assert.equal(r.associations["*.cel"], undefined);
  assert.equal(r.tokenColors.textMateRules.length, rules.length);
});

check("apply is idempotent on its own output", () => {
  const first = applyHighlight(undefined, undefined, rules);
  const second = applyHighlight(first.associations, first.tokenColors, rules);
  assert.equal(second.associationsChanged, false);
  assert.equal(second.tokenColorsChanged, false);
});

check("apply flags only the section that changed (associations no longer toggled in v2.3.0)", () => {
  const applied = applyHighlight(undefined, undefined, rules);
  // Colors already present → tokenColorsChanged is false. Associations
  // never change in v2.3.0 (clearStaleCrlAssociations is the only path
  // that mutates them).
  const r = applyHighlight(undefined, applied.tokenColors, rules);
  assert.equal(r.associationsChanged, false);
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

check("remove deletes our rules, keeps user's (v2.3.0: does NOT touch associations)", () => {
  // Pre-existing user state: a non-CRL association + a user textMate rule.
  // applyHighlight adds our rules; removeHighlight strips them. v2.3.0:
  // neither path touches files.associations — that's clearStaleCrlAssociations's job.
  const applied = applyHighlight({ "*.foo": "json" }, { textMateRules: [{ scope: "x.mine", settings: { foreground: "#1" } }] }, rules);
  const r = removeHighlight(applied.associations, applied.tokenColors, rules);
  assert.equal(r.associationsChanged, false);
  assert.equal(r.tokenColorsChanged, true);
  assert.equal(r.associations["*.crl"], undefined);
  assert.equal(r.associations["*.foo"], "json");
  assert.ok(r.tokenColors.textMateRules.some((x) => x.scope === "x.mine"));
  assert.ok(!r.tokenColors.textMateRules.some((x) => x.scope === "entity.name.type.crl"));
});

check("clearStaleCrlAssociations: deletes *.crl → markdown + *.cel → markdown", () => {
  const cur = { "*.crl": "markdown", "*.cel": "markdown", "*.foo": "json" };
  const r = clearStaleCrlAssociations(cur);
  assert.equal(r.changed, true);
  assert.equal(r.associations["*.crl"], undefined);
  assert.equal(r.associations["*.cel"], undefined);
  assert.equal(r.associations["*.foo"], "json", "non-CRL associations must be left alone");
});

check("clearStaleCrlAssociations: leaves *.crl pointed at non-markdown (user customization) alone", () => {
  const cur = { "*.crl": "html" };
  const r = clearStaleCrlAssociations(cur);
  assert.equal(r.changed, false);
  assert.equal(r.associations["*.crl"], "html");
});

check("clearStaleCrlAssociations: no-op on undefined", () => {
  const r = clearStaleCrlAssociations(undefined);
  assert.equal(r.changed, false);
  assert.deepEqual(r.associations, {});
});

check("clearStaleCrlAssociations: no-op when neither key is `markdown`", () => {
  const cur = { "*.foo": "json" };
  const r = clearStaleCrlAssociations(cur);
  assert.equal(r.changed, false);
  assert.equal(r.associations["*.foo"], "json");
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
