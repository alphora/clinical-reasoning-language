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

// Imported so the package.json default and the spec's fallback are pinned to each other — two sources of truth
// for "what MV shows with no setting" would otherwise diverge silently.
import { MEDICAL_VALIDATION_PANE_SPEC, COCKPIT_PANE_SPEC } from "./paneOrder.ts";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const check = test;

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

check("contributes the crl.cockpit.showKeys setting (boolean, default true, window scope) (#163)", () => {
  const prop = c.configuration?.properties?.["crl.cockpit.showKeys"];
  assert.ok(prop, "expected crl.cockpit.showKeys in contributes.configuration.properties");
  assert.equal(prop.type, "boolean");
  assert.equal(prop.default, true);
  assert.equal(prop.scope, "window");
});

check("contributes the crl.cockpit.primary setting (enum source|crl|cel — NO tree; default source, window scope)", () => {
  const prop = c.configuration?.properties?.["crl.cockpit.primary"];
  assert.ok(prop, "expected crl.cockpit.primary in contributes.configuration.properties");
  // tree is render+reveal+peek-only — it must NEVER be a navigable primary, so it is absent from this enum.
  assert.deepEqual(prop.enum, ["source", "crl", "cel"]);
  assert.equal(prop.default, "source");
  assert.equal(prop.scope, "window");
});

check("contributes the crl.cockpit.paneOrder setting (enum + default incl. tree; tree removable, window scope)", () => {
  const prop = c.configuration?.properties?.["crl.cockpit.paneOrder"];
  assert.ok(prop, "expected crl.cockpit.paneOrder in contributes.configuration.properties");
  assert.equal(prop.type, "array");
  assert.deepEqual(prop.items?.enum, ["source", "crl", "cel", "tree"]);
  // tree ships in the DEFAULT (shown out-of-box) but is NON-canonical in normalizePaneOrder, so a user who sets a
  // tree-less order keeps it (opt-out). The 3 source/crl/cel panes are always present.
  assert.deepEqual(prop.default, ["source", "crl", "cel", "tree"]);
  assert.equal(prop.scope, "window"); // settable in User (global/cross-project) OR Workspace settings
});

check("contributes the crl.medicalValidation.show command + its .cel-scoped editor/title menu + crl.active palette entry (#156 slice 3)", () => {
  const cmds = (c.commands ?? []).map((x) => x.command);
  assert.ok(cmds.includes("crl.medicalValidation.show"), "expected the crl.medicalValidation.show command");
  const cmd = (c.commands ?? []).find((x) => x.command === "crl.medicalValidation.show");
  assert.equal(cmd.title, "CRL: Show Medical Validation");
  const titleMenu = c.menus?.["editor/title"] ?? [];
  const entry = titleMenu.find((m) => m.command === "crl.medicalValidation.show");
  assert.ok(entry, "crl.medicalValidation.show must be in menus.editor/title");
  assert.equal(entry.when, "resourceExtname == .cel", "the Medical Validation tab button stays scoped to .cel files");
  const palette = c.menus?.commandPalette ?? [];
  const pEntry = palette.find((m) => m.command === "crl.medicalValidation.show");
  assert.ok(pEntry, "crl.medicalValidation.show must have a commandPalette entry");
  // FIX 1: the palette entry must NOT be .cel-scoped — else the quick-pick branch is unreachable (a focused .cel always
  // wins the sync fast-path). crl.active matches the other cockpit palette entries.
  assert.equal(pEntry.when, "crl.active", "the palette entry must be crl.active (so the quick-pick is reachable without a focused .cel)");
});

check("FIX 1: crl.cockpit.show palette entry is crl.active (quick-pick reachable) + keeps its .cel tab button (#156 slice 3)", () => {
  const palette = c.menus?.commandPalette ?? [];
  const pEntry = palette.find((m) => m.command === "crl.cockpit.show");
  assert.ok(pEntry, "crl.cockpit.show must have a commandPalette entry");
  assert.equal(pEntry.when, "crl.active", "crl.cockpit.show palette entry must be crl.active so its quick-pick is reachable");
  const titleMenu = c.menus?.["editor/title"] ?? [];
  const tEntry = titleMenu.find((m) => m.command === "crl.cockpit.show");
  assert.ok(tEntry, "crl.cockpit.show must keep its editor/title button");
  assert.equal(tEntry.when, "resourceExtname == .cel", "the cockpit tab button stays scoped to .cel files");
});

check("contributes the crl.medical-validation.primary setting (enum source|cel; default cel, window scope) (#156 slice 3)", () => {
  const prop = c.configuration?.properties?.["crl.medical-validation.primary"];
  assert.ok(prop, "expected crl.medical-validation.primary in contributes.configuration.properties");
  assert.deepEqual(prop.enum, ["source", "cel"]);
  assert.equal(prop.default, "cel");
  assert.equal(prop.scope, "window");
});

check("contributes the crl.medical-validation.paneOrder setting (enum + ALL-panes default, window scope)", () => {
  const prop = c.configuration?.properties?.["crl.medical-validation.paneOrder"];
  assert.ok(prop, "expected crl.medical-validation.paneOrder in contributes.configuration.properties");
  assert.equal(prop.type, "array");
  assert.deepEqual(prop.items?.enum, ["worklist", "source", "tree", "questionnaire", "fhirQuestionnaire", "crl", "cel"]);
  // Operator's default (2026-08-16). Deliberately a SUBSET of the enum: the setting is the source of truth, so
  // the rest are opt-in via the enum a user editing this setting is already looking at. Defaulting to all seven
  // was tried and reverted — seven webviews side by side on a browser-only clinician's screen.
  assert.deepEqual(prop.default, ["source", "fhirQuestionnaire", "tree"]);
  assert.equal(prop.scope, "window");
});

check("the package default and the COCKPIT spec's fallback are the SAME list", () => {
  // Same trap as MV: cockpit canonical omitted `tree` (right when canonical meant "always appended", wrong now
  // that it means "what you get with no usable setting") while the package default included it — so deleting
  // the setting gave four panes and a mistyped setting gave three.
  const prop = c.configuration?.properties?.["crl.cockpit.paneOrder"];
  assert.deepEqual([...COCKPIT_PANE_SPEC.canonical], prop.default);
});

check("the package default and the MV spec's fallback are the SAME list", () => {
  // Two sources of truth for "what MV shows with no setting" would diverge silently: package.json supplies the
  // value when the setting is unset, spec.canonical when it is set to a non-array.
  const prop = c.configuration?.properties?.["crl.medical-validation.paneOrder"];
  assert.deepEqual([...MEDICAL_VALIDATION_PANE_SPEC.canonical], prop.default);
});

check("every default pane is a valid pane", () => {
  const prop = c.configuration?.properties?.["crl.medical-validation.paneOrder"];
  assert.ok(prop.default.every((p) => prop.items.enum.includes(p)), "a default pane is missing from the enum");
});

check("no crl.dev.* command or setting ships to users", () => {
  // The CSP harness is a dev-host instrument, not a feature: no command, no palette entry, no setting.
  const props = Object.keys(c.configuration?.properties ?? {});
  assert.deepEqual(props.filter((k) => k.startsWith("crl.dev.")), []);
  assert.deepEqual((c.commands ?? []).map((x) => x.command).filter((k) => k.startsWith("crl.dev.")), []);
  assert.deepEqual((c.menus?.commandPalette ?? []).map((m) => m.command).filter((k) => k.startsWith("crl.dev.")), []);
});

check("contributes the crl.medical-validation.showKeys setting (boolean, default true, window scope) (#156 slice 3)", () => {
  const prop = c.configuration?.properties?.["crl.medical-validation.showKeys"];
  assert.ok(prop, "expected crl.medical-validation.showKeys in contributes.configuration.properties");
  assert.equal(prop.type, "boolean");
  assert.equal(prop.default, true);
  assert.equal(prop.scope, "window");
});

check("contributes the crl.issueBaseUrl setting (string, default '', window scope) (#203 Slice C)", () => {
  // Guards the duplicate-`configuration`-key trap: a second contributes.configuration would shadow this via JSON
  // last-wins and silently drop it from the manifest — this asserts it survives into the ONE effective block.
  const prop = c.configuration?.properties?.["crl.issueBaseUrl"];
  assert.ok(prop, "expected crl.issueBaseUrl in contributes.configuration.properties");
  assert.equal(prop.type, "string");
  assert.equal(prop.default, "");
  assert.equal(prop.scope, "window");
});

check("failedCriteriaMode stays SHARED under crl.cockpit ONLY — no crl.medical-validation copy (#156 slice 3)", () => {
  assert.ok(c.configuration?.properties?.["crl.cockpit.failedCriteriaMode"], "crl.cockpit.failedCriteriaMode must exist (the shared key)");
  assert.equal(
    c.configuration?.properties?.["crl.medical-validation.failedCriteriaMode"],
    undefined,
    "must NOT add a crl.medical-validation.failedCriteriaMode — the All/Blocking toggle is cross-surface and reads crl.cockpit",
  );
});

check("Todo B.1: contributes the crlAssist activity-bar container + the crl.agentChat webview view (id, type:webview, NO when) + retitled command", () => {
  // A DEDICATED container — NOT crlCockpit (which is crl.active-gated). The user drags it to the Secondary Side Bar once.
  const containers = c.viewsContainers?.activitybar ?? [];
  const assist = containers.find((x) => x.id === "crlAssist");
  assert.ok(assist, "expected a crlAssist activity-bar container");
  assert.notEqual(assist.id, "crlCockpit", "the chat container must be its OWN container, not the crl.active-gated crlCockpit");
  assert.equal(assist.title, "CRL Assist");
  assert.ok(assist.icon, "the crlAssist container needs an icon");

  const views = c.views?.crlAssist ?? [];
  const view = views.find((v) => v.id === "crl.agentChat");
  assert.ok(view, "expected the crl.agentChat view under the crlAssist container");
  assert.equal(view.type, "webview", "the chat view must be a webview view");
  assert.equal(view.name, "CRL Assist");
  assert.equal(view.when, undefined, "the chat view must NOT be gated by a `when` clause (chat is always available)");

  const cmd = (c.commands ?? []).find((x) => x.command === "crl.agent.chat");
  assert.ok(cmd, "expected the crl.agent.chat command");
  assert.equal(cmd.title, "CRL: Open CRL Assist", "the command retitles to 'CRL: Open CRL Assist'");
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

// Coral branding assets (#B.1 follow-on): the container icon SVG + the `$(coral)` icon-font woff must exist on disk so a
// missing/mis-referenced asset can't ship a broken icon.
check("Coral assets: the crlCockpit container icon + the coral icon font resolve to real files", () => {
  const container = (c.viewsContainers?.activitybar ?? []).find((x) => x.id === "crlCockpit");
  assert.equal(container?.icon, "media/coral-activitybar.svg", "crlCockpit uses the Coral activity-bar SVG (not $(law))");
  const svg = readFileSync(join(here, "..", container.icon), "utf8");
  assert.match(svg, /<svg/, "the Coral activity-bar SVG is a real SVG");
  // CRL Assist gets a DISTINCT mark (Coral tree + a "+") so it isn't two identical Coral icons in the activity bar.
  const assist = (c.viewsContainers?.activitybar ?? []).find((x) => x.id === "crlAssist");
  assert.equal(assist?.icon, "media/coral-assist-activitybar.svg", "crlAssist uses the distinct Coral+ SVG (not $(sparkle))");
  assert.match(readFileSync(join(here, "..", assist.icon), "utf8"), /<svg/, "the CRL Assist icon is a real SVG");
  const coralIcon = c.icons?.coral;
  assert.ok(coralIcon && coralIcon.default?.fontCharacter === "\\E900", "the coral icon font is contributed at U+E900");
  const woff = readFileSync(join(here, "..", coralIcon.default.fontPath.replace(/^\.\//, "")));
  assert.ok(woff.length > 0, "the coral-icons.woff exists and is non-empty");
});

check("the marketplace extension icon is a real PNG (not the default placeholder)", () => {
  assert.equal(pkg.icon, "media/icon.png", "the extension `icon` points to the Coral PNG");
  const png = readFileSync(join(here, "..", pkg.icon));
  // PNG magic bytes — ensure it's actually a PNG (marketplace rejects SVG here) and non-empty.
  assert.ok(png.length > 1000 && png[0] === 0x89 && png[1] === 0x50, "media/icon.png is a real, non-trivial PNG");
});

check("the CRL Assist reopener keybinding is contributed (Ctrl+Alt+A → crl.agent.chat)", () => {
  const kb = (c.keybindings ?? []).find((x) => x.command === "crl.agent.chat");
  assert.ok(kb && /ctrl\+alt\+a/i.test(kb.key), "expected a Ctrl+Alt+A keybinding for crl.agent.chat");
});

