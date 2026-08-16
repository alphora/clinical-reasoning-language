// Unit tests for the APPLY-QUESTIONNAIRE pane RENDERER. Unlike questionnairePaneHtml.test.mjs this needs no CRL
// project: the pane's contract is with `crl_get_questionnaire_case`, not with CRL source, so the test drives it
// from the recorded tool-response fixture in testdata/questionnaire-pane/ — which is exactly what the real host
// will hand it. Contract authority: docs/questionnaire-pane-api-contract.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  renderApplyQuestionnairePane,
  APPLY_QUESTIONNAIRE_STYLE,
  APPLY_Q_CONTAINER_ID,
} from "./applyQuestionnairePaneHtml.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "testdata", "questionnaire-pane", "get-case.example.json"), "utf8"),
);

const ASSETS = {
  zoneJs: "vscode-webview://x/media/lforms/zone.min.js",
  lhcFormsJs: "vscode-webview://x/media/lforms/lhc-forms.js",
  lformsFhirR4Js: "vscode-webview://x/media/lforms/lformsFHIR.min.js",
  stylesCss: "vscode-webview://x/media/lforms/styles.css",
};
const NONCE = "abc123";
const STYLE_NONCE = "def456";

const render = (over = {}) =>
  renderApplyQuestionnairePane({
    questionnaire: fixture.questionnaire,
    questionnaireResponse: fixture.questionnaireResponse,
    assets: ASSETS,
    nonce: NONCE,
    styleNonce: STYLE_NONCE,
    ...over,
  });

describe("renderApplyQuestionnairePane", () => {
  it("returns the placeholder and loads NO bundle when no case is focused", () => {
    const { html, anchors, reveals } = render({ questionnaire: null, questionnaireResponse: null });
    assert.match(html, /class="placeholder"/);
    // An idle pane must not pay for the 1.85 MB bundle.
    assert.ok(!html.includes("lhc-forms.js"), "idle pane must not load the LForms bundle");
    assert.ok(!html.includes("<script"), "idle pane must emit no script");
    assert.deepEqual(anchors, {});
    assert.deepEqual(reveals, {});
  });

  it("mounts the container and loads both vendored bundles, each carrying the shell nonce", () => {
    const { html } = render();
    assert.ok(html.includes(`<div id="${APPLY_Q_CONTAINER_ID}"></div>`));
    for (const src of [ASSETS.zoneJs, ASSETS.lhcFormsJs, ASSETS.lformsFhirR4Js]) {
      assert.ok(html.includes(`<script nonce="${NONCE}" src="${src}">`), `missing nonced script for ${src}`);
    }
    // The stylesheet <link> is governed by style-src, so it needs the STYLE nonce — without it the cockpit's
    // nonce-only policy blocks it and LForms renders unstyled rather than failing loudly.
    assert.ok(html.includes(`<link rel="stylesheet" nonce="${STYLE_NONCE}" href="${ASSETS.stylesCss}">`));
    // Every script in the payload must be nonced, or the shell's CSP drops it silently.
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    assert.ok(scripts.length > 0);
    for (const tag of scripts) assert.match(tag, /nonce="abc123"/);
  });

  it("loads zone.min.js BEFORE lhc-forms.js", () => {
    // The concatenated bundle deliberately excludes Zone.js. Without it Angular never bootstraps, so
    // `LForms.Util` still works and addFormToPage "succeeds" while <wc-lhc-form> never upgrades and paints
    // nothing — a silent blank pane. Measured: height=0px, visibleText=0, firstChild=<wc-lhc-form>.
    const { html } = render();
    assert.ok(html.indexOf(ASSETS.zoneJs) < html.indexOf(ASSETS.lhcFormsJs), "zone.js must load first");
  });

  it("loads lhc-forms.js as a plain script, NOT an ES module", () => {
    // The vendored bundle is runtime+polyfills+main concatenated as an IIFE. `type="module"` would change its
    // scoping and break the global `LForms` the bootstrap depends on.
    const { html } = render();
    assert.ok(!html.includes('type="module"'), "lhc-forms.js is an IIFE; it must not be loaded as a module");
  });

  it("embeds both FHIR resources so the bootstrap can find them", () => {
    const { html } = render();
    assert.ok(html.includes("window.__applyQuestionnaire="));
    assert.ok(html.includes("window.__applyQuestionnaireResponse="));
    // Content actually crosses over, not just the assignment.
    assert.ok(html.includes("age-twenty-one-or-older"));
    assert.ok(html.includes("prior-treatment-documented"));
  });

  it("neutralises a </script> hidden in resource data", () => {
    // JSON.stringify alone would close the block early and turn case data into markup.
    const hostile = { resourceType: "Questionnaire", title: "</script><img src=x onerror=alert(1)>" };
    const { html } = render({ questionnaire: hostile });
    assert.ok(!html.includes("</script><img"), "raw </script> escaped from the JSON island");
    // No `|| html.includes("\\u003c")` fallback: any escaped `<` anywhere would satisfy that, making the
    // assertion near-tautological and letting this specific case regress unnoticed.
    assert.ok(html.includes("\\u003c/script>"), "expected the </script> sequence to be unicode-escaped");
  });

  it("neutralises U+2028 / U+2029 in resource data", () => {
    // These are literal line terminators in JS source: unescaped inside the script island they break the
    // statement apart. The escaping function documents this; nothing tested it until now.
    const hostile = { resourceType: "Questionnaire", title: "a\u2028b\u2029c" };
    const { html } = render({ questionnaire: hostile });
    assert.ok(!html.includes("\u2028"), "raw U+2028 survived into the script island");
    assert.ok(!html.includes("\u2029"), "raw U+2029 survived into the script island");
    assert.ok(html.includes("\\u2028") && html.includes("\\u2029"), "expected both to be escaped");
  });

  it("escapes the case label", () => {
    const { html } = render({ caseLabel: '<img src=x onerror="alert(1)">' });
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img"));
  });

  it("exports pane-local style that styles our chrome only", () => {
    // LForms' own appearance comes from the vendored styles.css; this string is folded into the shell's
    // nonced <style> like the other panes' *_STYLE exports.
    assert.match(APPLY_QUESTIONNAIRE_STYLE, /\.aq-header/);
    assert.match(APPLY_QUESTIONNAIRE_STYLE, new RegExp(`#${APPLY_Q_CONTAINER_ID}`));
  });

  it("is pure — same input, same output", () => {
    assert.equal(render().html, render().html);
  });
});
