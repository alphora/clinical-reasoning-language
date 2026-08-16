// Unit tests for the $apply-questionnaire CSP dev harness. These pin the properties that would make the harness
// LIE — a reporter registered too late, or a rung whose policy is silently equivalent to the one before it —
// because a harness that under-reports is worse than no harness.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { buildHarnessDocument, harnessCsp, HARNESS_CSP_MODES } from "./applyQuestionnaireHarnessHtml.ts";
import { renderApplyQuestionnairePane, APPLY_QUESTIONNAIRE_STYLE } from "./applyQuestionnairePaneHtml.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "testdata", "questionnaire-pane", "get-case.example.json"), "utf8"),
);

const CSP = { scriptNonce: "snonce", styleNonce: "ynonce", cspSource: "vscode-webview://host" };

const pane = () =>
  renderApplyQuestionnairePane({
    questionnaire: fixture.questionnaire,
    questionnaireResponse: fixture.questionnaireResponse,
    assets: {
      zoneJs: "vscode-webview://host/zone.min.js",
      lhcFormsJs: "vscode-webview://host/lhc-forms.js",
      lformsFhirR4Js: "vscode-webview://host/lformsFHIR.min.js",
      stylesCss: "vscode-webview://host/styles.css",
    },
    nonce: CSP.scriptNonce,
    styleNonce: CSP.styleNonce,
  }).html;

const doc = (mode) =>
  buildHarnessDocument({ paneHtml: pane(), paneStyle: APPLY_QUESTIONNAIRE_STYLE, mode, csp: CSP });

describe("harnessCsp", () => {
  it("cockpit-strict reproduces the cockpit policy byte-for-byte", () => {
    // If this drifts from correspondenceCockpit.ts the baseline rung measures the wrong thing.
    assert.equal(
      harnessCsp("cockpit-strict", CSP),
      "default-src 'none'; style-src 'nonce-ynonce'; script-src 'nonce-snonce';",
    );
  });

  it("every rung is distinct — no rung silently repeats the one before it", () => {
    const seen = HARNESS_CSP_MODES.map((m) => harnessCsp(m, CSP));
    assert.equal(new Set(seen).size, seen.length, "two rungs produced identical policies");
  });

  it("plus-inline-style DROPS the style nonce", () => {
    // A nonce present alongside 'unsafe-inline' makes browsers ignore 'unsafe-inline', so keeping both would
    // make this rung a no-op vs plus-img and hide the real answer.
    const p = harnessCsp("plus-inline-style", CSP);
    assert.ok(p.includes("style-src 'unsafe-inline'"));
    assert.ok(!p.includes(`nonce-${CSP.styleNonce}`), "style nonce must not survive into the unsafe-inline rung");
  });

  it("opens img-src only from plus-img onward", () => {
    assert.ok(!harnessCsp("cockpit-strict", CSP).includes("img-src"));
    for (const m of ["plus-img", "plus-inline-style", "diagnostic-permissive"]) {
      assert.ok(harnessCsp(m, CSP).includes("img-src"), `${m} should permit images`);
    }
  });

  it("never widens script-src beyond the nonce", () => {
    // The vendored bundles carry zero eval/new Function, so no rung has any business relaxing scripts.
    for (const m of HARNESS_CSP_MODES) {
      const p = harnessCsp(m, CSP);
      assert.ok(p.includes(`script-src 'nonce-${CSP.scriptNonce}'`), `${m} changed script-src`);
      assert.ok(!p.includes("unsafe-eval"), `${m} introduced unsafe-eval`);
    }
  });
});

describe("buildHarnessDocument", () => {
  it("registers the violation reporter before any other script", () => {
    // A listener added after a blocked script has parsed misses its event, which reads as a clean run.
    const html = doc("cockpit-strict");
    const reporterAt = html.indexOf("securitypolicyviolation");
    // Compare against the FIRST pane script, which is zone.min.js — not lhc-forms.js. A regression that slid
    // the reporter between zone and the bundle would pass a lhc-forms.js comparison while breaking the
    // "before any other script" invariant this test exists to state.
    const firstAssetAt = html.indexOf("zone.min.js");
    assert.ok(reporterAt > 0 && firstAssetAt > 0);
    assert.ok(reporterAt < firstAssetAt, "reporter must precede the first pane script (zone.js)");
  });

  it("carries the policy into the document and shows it to the operator", () => {
    const html = doc("plus-img");
    assert.ok(html.includes('http-equiv="Content-Security-Policy"'));
    assert.ok(html.includes("img-src vscode-webview://host"));
    assert.ok(html.includes("CSP mode: plus-img"));
  });

  it("nonces its own style block and includes the pane style", () => {
    const html = doc("cockpit-strict");
    assert.ok(html.includes(`<style nonce="${CSP.styleNonce}">`));
    assert.ok(html.includes(".aq-header"));
  });

  it("embeds the pane, whose stylesheet link is nonced", () => {
    // Regression guard: an unnonced <link rel=stylesheet> is blocked by style-src and LForms renders unstyled.
    const html = doc("cockpit-strict");
    assert.ok(html.includes(`<link rel="stylesheet" nonce="${CSP.styleNonce}"`));
  });

  it("is pure", () => {
    assert.equal(doc("cockpit-strict"), doc("cockpit-strict"));
  });
});
