// Tests for the pane-specific shell fragments — the ONE place every silent failure of the FHIR questionnaire
// pane has lived.
//
// All three real defects presented identically, as "LForms is undefined" over a blank pane, and none was
// catchable by typecheck or by the message-branch tests: scripts in <head> (they run before <body> exists),
// Zone.js after the bundle (Angular never bootstraps), and error hooks registered after the scripts they exist
// to observe (the cause is unreported). A fourth is latent: a nonce on the <link> would be blocked under this
// pane's nonce-dropped style-src, rendering the form unstyled rather than failing loudly.
//
// Each is a change a reasonable refactor would make, and nothing would fail until a clinician saw a blank pane.
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { paneShellFragments } from "./correspondenceCockpit.ts";

const NONCE = "NONCE123";
const asset = (f) => `vscode-webview://host/media/lforms/${f}`;
const frag = (pane) => paneShellFragments(pane, { nonce: NONCE, asset });

const OTHER_PANES = ["source", "crl", "cel", "tree", "questionnaire", "worklist"];

describe("paneShellFragments", () => {
  it("emits NOTHING for every other pane", () => {
    // The vendored runtime and the CSP relaxation are for one pane. If fragments leaked into another pane's
    // shell they would be blocked by its stricter policy — silently.
    for (const p of OTHER_PANES) {
      assert.deepEqual(frag(p), { head: "", bodyScripts: "" }, `${p} received shell fragments`);
    }
  });

  it("puts the vendor scripts in the BODY, never the head", () => {
    // Scripts in <head> run before <body> exists; LForms bootstraps against document.body and throws
    // "Cannot read properties of null (reading 'appendChild')" before defining its global.
    const { head, bodyScripts } = frag("fhirQuestionnaire");
    for (const f of ["zone.min.js", "lhc-forms.js", "lformsFHIR.min.js"]) {
      assert.ok(!head.includes(f), `${f} must not be in the head fragment`);
      assert.ok(bodyScripts.includes(f), `${f} missing from the body fragment`);
    }
  });

  it("loads zone.min.js BEFORE lhc-forms.js before lformsFHIR.min.js", () => {
    // The concatenated bundle deliberately excludes Zone.js; without it Angular never bootstraps and the form
    // silently paints nothing.
    const { bodyScripts } = frag("fhirQuestionnaire");
    const at = (f) => bodyScripts.indexOf(f);
    assert.ok(at("zone.min.js") >= 0 && at("zone.min.js") < at("lhc-forms.js"), "zone.js must load first");
    assert.ok(at("lhc-forms.js") < at("lformsFHIR.min.js"), "the FHIR bundle must load after lhc-forms");
  });

  it("registers the error hooks BEFORE any script they exist to observe", () => {
    // A listener added after a blocked or 404'd script misses its event, which reads as a clean load.
    const { head, bodyScripts } = frag("fhirQuestionnaire");
    assert.ok(head.includes("addEventListener('error'"), "no capture-phase error hook");
    assert.ok(head.includes("securitypolicyviolation"), "no CSP-violation hook");
    // They are in the head, and every vendor script is in the body, so ordering holds by construction —
    // asserted explicitly so a future move of either fragment fails here.
    assert.ok(!bodyScripts.includes("addEventListener"), "hooks must not drift into the body fragment");
  });

  it("captures all FOUR failure channels, which do not overlap", () => {
    const { head } = frag("fhirQuestionnaire");
    assert.ok(head.includes("'404 '"), "404s (error with a target src) unreported");
    assert.ok(head.includes("'threw '"), "throws (error with no target src) unreported");
    assert.ok(head.includes("'CSP '"), "CSP blocks (securitypolicyviolation only) unreported");
    // The first three are all SYNCHRONOUS. LForms fails asynchronously in the paths the all-item-types contract
    // reaches — `loadAnswerValueSets` rejects outright when no terminology server and no FHIR context are
    // configured (neither is, deliberately), with no network attempt and so no CSP violation either. Nothing
    // listened for that, so it read as a clean load with an empty dropdown.
    assert.ok(head.includes("'rejected '"), "promise rejections (unhandledrejection only) unreported");
  });

  it("registers the unhandledrejection hook on window, before the vendor scripts", () => {
    const { head, bodyScripts } = frag("fhirQuestionnaire");
    assert.ok(head.includes("addEventListener('unhandledrejection'"), "no unhandledrejection hook");
    assert.ok(!bodyScripts.includes("unhandledrejection"), "the hook must stay in the head fragment");
  });

  it("nonces every <script> it emits", () => {
    const { head, bodyScripts } = frag("fhirQuestionnaire");
    const tags = `${head}${bodyScripts}`.match(/<script\b[^>]*>/g) ?? [];
    assert.ok(tags.length >= 4, `expected the hook script + 3 vendor scripts, got ${tags.length}`);
    for (const t of tags) assert.match(t, new RegExp(`nonce="${NONCE}"`), `un-nonced script: ${t}`);
  });

  it("does NOT nonce the stylesheet link", () => {
    // This pane's style-src is 'unsafe-inline' + cspSource with the nonce DROPPED (a nonce present makes
    // browsers ignore 'unsafe-inline'). A nonced link would be blocked and the form would render unstyled —
    // the quiet failure, not a loud one.
    const { head } = frag("fhirQuestionnaire");
    const link = head.match(/<link\b[^>]*>/)?.[0] ?? "";
    assert.ok(link.includes("styles.css"), "no stylesheet link emitted");
    assert.ok(!link.includes("nonce"), "the stylesheet link must not carry a nonce");
  });

  it("resets white-space on #root", () => {
    // The shell's body{...white-space:pre-wrap} inherits into the form and mangles its layout.
    assert.match(frag("fhirQuestionnaire").head, /#root\{white-space:normal\}/);
  });

  it("loads the bundles as classic scripts, not modules", () => {
    // lhc-forms.js is an IIFE; type="module" would change its scoping and break the global LForms.
    assert.ok(!frag("fhirQuestionnaire").bodyScripts.includes('type="module"'));
  });

  it("is pure", () => {
    assert.deepEqual(frag("fhirQuestionnaire"), frag("fhirQuestionnaire"));
  });
});
