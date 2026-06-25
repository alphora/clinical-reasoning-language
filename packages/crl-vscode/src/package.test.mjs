// Static-assertion tests for the v2.3.0 package.json contributes restructure.
// Asserts:
//   - contributes.languages has entries for `crl` and `crl-cel` (per 054 Δ4
//     language id rename to avoid hmarr.cel collision)
//   - each language entry maps the right file extension + configuration path
//   - contributes.grammars binds each grammar to a `language` (NOT `injectTo`)
//   - activationEvents retains both `workspaceContains` events (load-bearing
//     during migration — 054 Δ1) and excludes `onLanguage:markdown` (the
//     cross-pollination root that v2.3.0 fixes)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

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

const c = pkg.contributes ?? {};

check("contributes.languages has crl + crl-cel with right extensions", () => {
  const langs = c.languages ?? [];
  const byId = Object.fromEntries(langs.map((l) => [l.id, l]));
  assert.ok(byId.crl, "expected language id `crl` in contributes.languages");
  assert.ok(byId["crl-cel"], "expected language id `crl-cel` in contributes.languages");
  assert.deepEqual(byId.crl.extensions, [".crl"]);
  assert.deepEqual(byId["crl-cel"].extensions, [".cel"]);
  assert.equal(byId.crl.configuration, "./syntaxes/crl.language-configuration.json");
  assert.equal(byId["crl-cel"].configuration, "./syntaxes/cel.language-configuration.json");
});

check("contributes.grammars binds by `language`, not `injectTo`", () => {
  const grams = c.grammars ?? [];
  const byScope = Object.fromEntries(grams.map((g) => [g.scopeName, g]));
  const crl = byScope["source.crl"];
  const cel = byScope["source.crl-cel"];
  assert.ok(crl, "expected grammar with scopeName source.crl");
  assert.ok(cel, "expected grammar with scopeName source.crl-cel");
  assert.equal(crl.language, "crl");
  assert.equal(cel.language, "crl-cel");
  assert.equal(crl.injectTo, undefined, "CRL grammar must not have injectTo (no longer a Markdown injection)");
  assert.equal(cel.injectTo, undefined, "CEL grammar must not have injectTo (no longer a Markdown injection)");
  assert.equal(crl.path, "./syntaxes/crl.tmLanguage.json");
  assert.equal(cel.path, "./syntaxes/cel.tmLanguage.json");
});

check("activationEvents retains workspaceContains (migration-load-bearing) + drops onLanguage:markdown", () => {
  const events = pkg.activationEvents ?? [];
  assert.ok(
    events.includes("workspaceContains:**/*.crl"),
    "workspaceContains:**/*.crl required so migration runs even with stale `.crl → markdown` association",
  );
  assert.ok(
    events.includes("workspaceContains:**/*.cel"),
    "workspaceContains:**/*.cel required for same reason as crl",
  );
  assert.ok(
    !events.includes("onLanguage:markdown"),
    "onLanguage:markdown must NOT be in activationEvents — that's the cross-pollination root v2.3.0 fixes",
  );
});

check("contributes the crl.runScenario command + its .cel-scoped editor/title menu", () => {
  const cmds = (c.commands ?? []).map((x) => x.command);
  assert.ok(cmds.includes("crl.runScenario"), "expected the crl.runScenario command");
  const titleMenu = c.menus?.["editor/title"] ?? [];
  const entry = titleMenu.find((m) => m.command === "crl.runScenario");
  assert.ok(entry, "crl.runScenario must be in menus.editor/title");
  assert.equal(entry.when, "resourceExtname == .cel", "the scenario-runner button is scoped to .cel files");
});

check("contributes the crl.cockpit.setPrimary command + navigator-title button + palette entry (C2b-3/C2c-1)", () => {
  const cmds = (c.commands ?? []).map((x) => x.command);
  assert.ok(cmds.includes("crl.cockpit.setPrimary"), "expected the crl.cockpit.setPrimary command");
  const viewTitle = c.menus?.["view/title"] ?? [];
  assert.ok(
    viewTitle.some((m) => m.command === "crl.cockpit.setPrimary" && m.when === "view == crlCockpitNavigator"),
    "setPrimary must be a navigator-title button",
  );
  const palette = c.menus?.commandPalette ?? [];
  assert.ok(palette.some((m) => m.command === "crl.cockpit.setPrimary"), "setPrimary must have a commandPalette entry");
});

check("contributes the crl.cockpit.toggleKeys command + navigator-title button + palette entry (#163)", () => {
  const cmds = (c.commands ?? []).map((x) => x.command);
  assert.ok(cmds.includes("crl.cockpit.toggleKeys"), "expected the crl.cockpit.toggleKeys command");
  const viewTitle = c.menus?.["view/title"] ?? [];
  assert.ok(
    viewTitle.some((m) => m.command === "crl.cockpit.toggleKeys" && m.when === "view == crlCockpitNavigator"),
    "toggleKeys must be a navigator-title button",
  );
  const palette = c.menus?.commandPalette ?? [];
  assert.ok(palette.some((m) => m.command === "crl.cockpit.toggleKeys"), "toggleKeys must have a commandPalette entry");
});

check("contributes the crl.correspondence.showKeys setting (boolean, default true, window scope) (#163)", () => {
  const prop = c.configuration?.properties?.["crl.correspondence.showKeys"];
  assert.ok(prop, "expected crl.correspondence.showKeys in contributes.configuration.properties");
  assert.equal(prop.type, "boolean");
  assert.equal(prop.default, true);
  assert.equal(prop.scope, "window");
});

check("contributes the crl.correspondence.primary setting (enum source|crl|cel — NO tree; default source, window scope)", () => {
  const prop = c.configuration?.properties?.["crl.correspondence.primary"];
  assert.ok(prop, "expected crl.correspondence.primary in contributes.configuration.properties");
  // tree is render+reveal+peek-only — it must NEVER be a navigable primary, so it is absent from this enum.
  assert.deepEqual(prop.enum, ["source", "crl", "cel"]);
  assert.equal(prop.default, "source");
  assert.equal(prop.scope, "window");
});

check("contributes the crl.correspondence.paneOrder setting (enum incl. opt-in tree; default stays 3 panes, window scope)", () => {
  const prop = c.configuration?.properties?.["crl.correspondence.paneOrder"];
  assert.ok(prop, "expected crl.correspondence.paneOrder in contributes.configuration.properties");
  assert.equal(prop.type, "array");
  // tree IS a valid pane id (a user can opt in via settings) ...
  assert.deepEqual(prop.items?.enum, ["source", "crl", "cel", "tree"]);
  // ... but the DEFAULT stays the 3 always-present panes (tree is opt-in until its renderer ships).
  assert.deepEqual(prop.default, ["source", "crl", "cel"]);
  assert.equal(prop.scope, "window"); // settable in User (global/cross-project) OR Workspace settings
});

// Verify the referenced language-configuration files exist on disk so a
// package.json typo doesn't make it to release.
check("contributes.languages.configuration paths resolve to real files", () => {
  for (const lang of c.languages ?? []) {
    const cfg = lang.configuration;
    if (!cfg) continue;
    const abs = join(here, "..", cfg.replace(/^\.\//, ""));
    const exists = readFileSync(abs, "utf8");
    assert.ok(exists.length > 0, `language-configuration at ${abs} must exist and be non-empty`);
  }
});

console.log(failed ? "\ntest:package FAILED" : "\npackage.test.mjs: v2.3.0 contributes restructure assertions passed.");
process.exit(failed ? 1 : 0);
