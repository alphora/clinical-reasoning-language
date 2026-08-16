// APPLY-QUESTIONNAIRE pane RENDERER (vscode-free, unit-tested) — the `$apply`-driven Medical Validation
// questionnaire panel, rendered by the vendored LForms web component.
//
// This pane RENDERS ONLY. A selection (tree node / CEL row) identifies a case; the CRL side's
// `crl_get_questionnaire_case` returns a FHIR Questionnaire + a QuestionnaireResponse with answers populated to
// the leaf; this module hands both to LForms. It never runs `$apply`, never spawns a JVM, never reads qa data,
// and never reasons about which concepts became fields — that is all upstream, at build time.
// Contract authority: docs/questionnaire-pane-api-contract.md (CRL emit side owns it).
//
// ⚠ HOW THIS DIFFERS FROM THE OTHER PANE RENDERERS. flowPaneHtml/sourcePaneHtml/questionnairePaneHtml are
// "CSP-safe by construction": they emit no <script>, no <style> and no inline `style=`, and export a *_STYLE
// string the shell folds into its own nonced <style>. This pane CANNOT be, because the renderer IS a third-party
// script bundle that injects its own component styles at runtime.
//
// ⚠⚠ THIS FRAGMENT SHAPE IS HARNESS-ONLY. IT WILL NOT WORK IN THE COCKPIT AS WRITTEN.
// The cockpit delivers pane content with `root.innerHTML = m.html` (correspondenceCockpit.ts:5205), and
// <script> elements inserted via innerHTML are NEVER executed — nonce or not, CSP or not. Wired in as-is, the
// <link> would load and Zone.js / LForms / the bootstrap would all silently not run: the exact silent-blank-pane
// failure this module was written to eliminate, reintroduced by the delivery mechanism. The harness works only
// because it sets `panel.webview.html` to a whole document, which IS a real load.
//
// Cockpit integration therefore needs script delivery REDESIGNED, not just a CSP line:
//   1. vendor <script>s move into the pane's shell document (`shellHtml()`), which is a real load;
//   2. the shell must PUBLISH its `acquireVsCodeApi()` handle — today it keeps it in a closure local
//      (correspondenceCockpit.ts:5165) and a second call throws;
//   3. the Q/QR travel as message DATA, not a <script> island, with mounting triggered after each innerHTML swap;
//   4. mounting must be gated like `shouldRerenderQuestionnaire` — every cockpit render replaces #root wholesale,
//      and remounting a 1.85 MB Angular app on unrelated re-renders would churn and wipe form state.
// The CSP relaxation can be confined to THIS pane: each pane is its own WebviewPanel with its own shellHtml()
// (correspondenceCockpit.ts:2486-2495). See media/lforms/README.md for the measurements and the iframe option.
//
// It imports NO `vscode` and no CRL core, so it stays unit-testable as a pure string function.

/** Webview-safe URIs for the vendored LForms assets (media/lforms/). The host resolves these via
 *  `webview.asWebviewUri`; this module never constructs a path. */
export interface ApplyQuestionnaireAssets {
  /** `zone.min.js` — Zone.js. MUST load BEFORE `lhc-forms.js`. The concatenated bundle deliberately EXCLUDES
   *  it (see the vendor README), and without it Angular never bootstraps: `LForms.Util` still works, so
   *  conversion and `addFormToPage` appear to succeed, but `<wc-lhc-form>` never upgrades and paints nothing. */
  zoneJs: string;
  /** `lhc-forms.js` — the concatenated IIFE bundle (NOT an ES module; no `type="module"`). */
  lhcFormsJs: string;
  /** `lformsFHIR.min.js` — R4 FHIR support. */
  lformsFhirR4Js: string;
  /** `styles.css` — the global stylesheet. */
  stylesCss: string;
}

export interface ApplyQuestionnaireInput {
  /** The FHIR Questionnaire, verbatim from `crl_get_questionnaire_case`. */
  questionnaire: unknown;
  /** The FHIR QuestionnaireResponse, answers populated to the leaf. */
  questionnaireResponse: unknown;
  assets: ApplyQuestionnaireAssets;
  /** The shell's script nonce. Both the asset <script>s and the bootstrap carry it. */
  nonce: string;
  /** The shell's STYLE nonce. The vendored `styles.css` arrives as a <link rel="stylesheet">, which `style-src`
   *  governs — without this it is blocked under the cockpit's nonce-only policy and LForms renders unstyled. */
  styleNonce: string;
  /** Optional case label for the pane header. */
  caseLabel?: string;
}

export interface RenderedApplyQuestionnaire {
  html: string;
  /** No anchors yet: the cross-pane "this node" marker needs a linkId→nodeId map that only the producer can
   *  supply. Emitted (always `{}`) so the shell's per-pane `{html, anchors, reveals}` contract stays uniform. */
  anchors: Record<string, never>;
  /** Read-only pane: it posts no engine selections. */
  reveals: Record<string, never>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** The placeholder shown when no case is focused (mirrors the other panes' `.placeholder` convention). */
const PLACEHOLDER = '<p class="placeholder">Select a scenario in the worklist to see its $apply questionnaire.</p>';

/** The container LForms mounts into. Stable so the shell can scroll/reveal it. */
export const APPLY_Q_CONTAINER_ID = "applyQuestionnaireForm";

/** Pane-local CSS, folded into the shell's nonced <style> exactly like QUESTIONNAIRE_STYLE. This covers only OUR
 *  chrome (header, placeholder, error box) — LForms' own styling comes from the vendored styles.css. */
export const APPLY_QUESTIONNAIRE_STYLE = `
.aq-header { font-weight: 600; margin: 0 0 .5rem 0; }
.aq-error { border: 1px solid var(--vscode-inputValidation-errorBorder); padding: .5rem; margin: .5rem 0; }
.aq-warning { border: 1px solid var(--vscode-inputValidation-warningBorder); padding: .5rem; margin: .5rem 0; }
#${APPLY_Q_CONTAINER_ID} { margin-top: .5rem; }
`;

/**
 * JSON for embedding inside a <script> block. `JSON.stringify` alone is NOT safe here: a `</script>` inside any
 * string value would close the block early, and U+2028/U+2029 are literal line terminators in JS source.
 */
const embedJson = (v: unknown): string =>
  // `?? "null"` covers JSON.stringify returning undefined (a function/symbol input). The declared type is
  // `unknown`, so the compiler does not rule it out, and `.replace` on undefined would throw.
  (JSON.stringify(v ?? null) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/**
 * The bootstrap that turns the two FHIR resources into a rendered form.
 *
 * VERIFIED on Windows Desktop and in the VS Code web workbench (LForms 43.1.0): the convert → merge → add
 * sequence renders the fixture correctly, with answers and `enableWhen` gating intact. See
 * media/lforms/README.md for the measurements.
 *
 * The rendered controls are INTERACTIVE — `addFormToPage` renders live inputs and `prepopulate: false` does not
 * change that, so an operator can edit answers locally. That is ACCEPTED, not a defect (operator decision,
 * 2026-08-16): read-only is not a requirement for this pane. Edits are local to the webview and posted nowhere,
 * so nothing can be written back. Do not "fix" it by forcing `Questionnaire.item.readOnly` or hunting an LForms
 * view mode; if a future requirement DOES demand read-only, that is a new decision, not a latent bug.
 */
const BOOTSTRAP = `
(function () {
  var ID = ${JSON.stringify(APPLY_Q_CONTAINER_ID)};
  var el = document.getElementById(ID);
  if (!el) return;
  // acquireVsCodeApi() may be called ONCE per webview and THROWS on a second call. The harness's reporter parks
  // its handle on this shared global; we reuse it if present.
  // ⚠ The cockpit shell does NOT follow this convention — it holds its handle in a closure local
  // (correspondenceCockpit.ts:5165). Adopting the convention there is on the integration checklist. Until then
  // this acquisition must stay INSIDE the try, or a throw here would bypass fail() and die silently.
  var vs = null;
  function report(ok, detail) {
    if (vs) vs.postMessage({ type: "apply-q-render", ok: ok, detail: detail });
  }
  function fail(msg) {
    var p = document.createElement("p");
    p.className = "aq-error";
    p.textContent = "Could not render the questionnaire: " + msg;
    el.replaceChildren(p);
    report(false, msg);
  }
  try {
    vs = window.__vscodeApi ||
      (typeof acquireVsCodeApi === "function" ? (window.__vscodeApi = acquireVsCodeApi()) : null);
    if (typeof LForms === "undefined") { fail("the LForms bundle did not load (LForms is undefined)."); return; }
    if (!LForms.Util) { fail("LForms loaded but LForms.Util is missing."); return; }
    var q = window.__applyQuestionnaire;
    var qr = window.__applyQuestionnaireResponse;
    if (!q) { fail("no Questionnaire was supplied."); return; }
    var form = LForms.Util.convertFHIRQuestionnaireToLForms(q, "R4");
    if (!form) { fail("convertFHIRQuestionnaireToLForms returned nothing."); return; }
    if (qr) form = LForms.Util.mergeFHIRDataIntoLForms("QuestionnaireResponse", qr, form, "R4");
    LForms.Util.addFormToPage(form, ID, { prepopulate: false });
    // addFormToPage can resolve without painting (an unrecognised item tree yields an empty form). Saying
    // "rendered" when the container is still empty is the failure mode this whole harness exists to avoid.
    var kids = el.children.length;
    if (!kids) { fail("addFormToPage completed but the container is still empty."); return; }
    // "In the DOM" and "on the screen" are different claims. A custom element that never upgraded, or one
    // whose styles did not apply, yields children with zero height and no text — which reads to a human as
    // "nothing rendered" while every programmatic check passes. Measure both, on the next frame so layout has
    // settled.
    // Angular Elements upgrades ASYNCHRONOUSLY, so one frame is not enough — measuring too early reports a
    // false 0px. Poll briefly for paint, then report whatever we have.
    var tries = 0;
    (function measure() {
      var r = el.getBoundingClientRect();
      var text = (el.innerText || "").trim();
      if (!r.height && tries++ < 40) { setTimeout(measure, 50); return; }
      var tag = el.firstElementChild ? el.firstElementChild.tagName.toLowerCase() : "none";
      var upgraded = !!(window.customElements && window.customElements.get("wc-lhc-form"));
      report(r.height > 0,
        "children=" + kids +
        ", items=" + ((form.items || []).length) +
        ", height=" + Math.round(r.height) + "px" +
        ", visibleText=" + text.length + " chars" +
        ", firstChild=<" + tag + ">" +
        ", customElementDefined=" + upgraded +
        ", waitedMs=" + tries * 50);
    })();
  } catch (e) {
    fail((e && e.message) ? e.message : String(e));
  }
})();
`;

/**
 * Render the `$apply` questionnaire pane. Pure: same inputs → same string.
 *
 * Pass `questionnaire: null` (no case focused) to get the placeholder — the LForms bundle is then not loaded at
 * all, so an idle pane costs nothing.
 */
export function renderApplyQuestionnairePane(input: ApplyQuestionnaireInput): RenderedApplyQuestionnaire {
  const { questionnaire, questionnaireResponse, assets, nonce, styleNonce, caseLabel } = input;

  const header = caseLabel ? `<p class="aq-header">${escapeHtml(caseLabel)}</p>` : "";

  if (!questionnaire) {
    return { html: `${header}${PLACEHOLDER}`, anchors: {}, reveals: {} };
  }

  const n = escapeHtml(nonce);
  const html =
    header +
    `<link rel="stylesheet" nonce="${escapeHtml(styleNonce)}" href="${escapeHtml(assets.stylesCss)}">` +
    `<div id="${APPLY_Q_CONTAINER_ID}"></div>` +
    // Zone.js first — Angular's bootstrap depends on it and the bundle does not carry it.
    `<script nonce="${n}" src="${escapeHtml(assets.zoneJs)}"></script>` +
    `<script nonce="${n}" src="${escapeHtml(assets.lhcFormsJs)}"></script>` +
    `<script nonce="${n}" src="${escapeHtml(assets.lformsFhirR4Js)}"></script>` +
    `<script nonce="${n}">` +
    `window.__applyQuestionnaire=${embedJson(questionnaire)};` +
    `window.__applyQuestionnaireResponse=${embedJson(questionnaireResponse)};` +
    BOOTSTRAP +
    `</script>`;

  return { html, anchors: {}, reveals: {} };
}
