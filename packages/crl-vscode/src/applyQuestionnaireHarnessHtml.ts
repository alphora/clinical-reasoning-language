// DEV HARNESS document builder (vscode-free, unit-tested) for the $apply-questionnaire pane.
//
// WHY THIS EXISTS. The pane is the first thing in this extension that runs a third-party script bundle inside a
// webview, and the cockpit's CSP is strict nonce-only (`default-src 'none'`). Wiring the pane straight into
// correspondenceCockpit.ts would mean editing the single most-touched file in the package to satisfy a policy
// question nobody has measured. So we measure it here first, in a standalone panel that nothing else depends on,
// and touch the cockpit once with a known-good answer.
//
// WHAT IT MEASURES. The document installs a `securitypolicyviolation` listener BEFORE any other script, so every
// blocked resource is reported with its violated directive — rather than us guessing from a blank pane. Results
// are posted to the host AND painted into the panel, because the operator is looking at it.
//
// ⚠ Desktop is not the target. MV runs in the VS Code WEB WORKBENCH, which is stricter. A clean run here on
// Windows Desktop is necessary, not sufficient — the same ladder has to be walked in the web workbench before the
// cockpit change is designed.

/** CSP candidates, strictest first. The point of the harness is to find the leftmost one that renders. */
export type HarnessCspMode =
  | "cockpit-strict"
  | "plus-img"
  | "inline-style-only"
  | "plus-inline-style"
  | "diagnostic-permissive";

export const HARNESS_CSP_MODES: readonly HarnessCspMode[] = [
  "cockpit-strict",
  "plus-img",
  "inline-style-only",
  "plus-inline-style",
  "diagnostic-permissive",
] as const;

export interface HarnessCspInput {
  scriptNonce: string;
  styleNonce: string;
  /** `webview.cspSource` — the scheme+authority the host serves local resources from. */
  cspSource: string;
}

/**
 * Build the policy for a mode.
 *
 * The `plus-inline-style` rung DROPS the style nonce deliberately: when a nonce is present browsers IGNORE
 * `'unsafe-inline'` for that directive, so keeping both would silently behave as nonce-only and the rung would
 * measure nothing. That is exactly the trap this ladder exists to avoid walking into blind.
 */
export function harnessCsp(mode: HarnessCspMode, { scriptNonce, styleNonce, cspSource }: HarnessCspInput): string {
  const script = `script-src 'nonce-${scriptNonce}'`;
  switch (mode) {
    case "cockpit-strict":
      // Byte-for-byte the cockpit's policy (correspondenceCockpit.ts). The baseline we must beat or change.
      return `default-src 'none'; style-src 'nonce-${styleNonce}'; ${script};`;
    case "plus-img":
      return `default-src 'none'; style-src 'nonce-${styleNonce}'; ${script}; img-src ${cspSource} data:;`;
    case "inline-style-only":
      // The measured run at `plus-inline-style` reported style-src violations ONLY — never img-src. So the
      // images referenced from styles.css may never be fetched for this form, and opening img-src would be
      // widening the policy for nothing. This rung isolates that: if it is clean, it is the true minimum and
      // the one to propose for the cockpit.
      return `default-src 'none'; style-src 'unsafe-inline' ${cspSource}; ${script};`;
    case "plus-inline-style":
      return `default-src 'none'; style-src 'unsafe-inline' ${cspSource}; ${script}; img-src ${cspSource} data:;`;
    case "diagnostic-permissive":
      return (
        `default-src 'none'; style-src 'unsafe-inline' ${cspSource}; ${script}; ` +
        `img-src ${cspSource} data:; font-src ${cspSource} data:;`
      );
  }
}

export interface HarnessDocumentInput {
  /** The pane fragment from `renderApplyQuestionnairePane`. */
  paneHtml: string;
  /** Pane-local CSS (`APPLY_QUESTIONNAIRE_STYLE`), folded into the nonced <style> as the cockpit does. */
  paneStyle: string;
  mode: HarnessCspMode;
  csp: HarnessCspInput;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

const HARNESS_STYLE = `
body { font-family: var(--vscode-font-family); padding: .75rem; }
.h-bar { display: flex; gap: .75rem; align-items: baseline; margin-bottom: .5rem; }
.h-mode { font-weight: 600; }
.h-note { opacity: .8; font-size: .9em; }
.h-violations { border: 1px solid var(--vscode-inputValidation-errorBorder); padding: .5rem; margin: .5rem 0; }
.h-violations:empty { display: none; }
.h-violations li { font-family: var(--vscode-editor-font-family); font-size: .9em; }
.h-ok { border: 1px solid var(--vscode-inputValidation-infoBorder); padding: .5rem; margin: .5rem 0; }
`;

/**
 * The violation reporter. MUST be the first script in the document: a listener registered after a blocked
 * resource has already been parsed will miss its event, which would read as a clean run.
 */
const REPORTER = `
(function () {
  var out = [];
  var box = null;
  // Shared handle: acquireVsCodeApi() throws if called twice, and the pane's own bootstrap needs it too.
  var vs = window.__vscodeApi ||
    (typeof acquireVsCodeApi === "function" ? (window.__vscodeApi = acquireVsCodeApi()) : null);
  function paint() {
    box = box || document.getElementById("hViolations");
    if (!box) return;
    if (!out.length) return;
    // A violation arriving AFTER the settle must retract the clean verdict, or the panel shows "No CSP
    // violations reported." above a list of violations.
    var okBox = document.getElementById("hOk");
    if (okBox) okBox.textContent = "";
    box.replaceChildren();
    var h = document.createElement("strong");
    h.textContent = out.length + " CSP violation(s):";
    box.appendChild(h);
    var ul = document.createElement("ul");
    out.forEach(function (v) {
      var li = document.createElement("li");
      li.textContent = v.directive + "  ←  " + v.blockedURI;
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  document.addEventListener("securitypolicyviolation", function (e) {
    var v = { directive: e.violatedDirective, blockedURI: e.blockedURI, line: e.lineNumber };
    out.push(v);
    if (vs) vs.postMessage({ type: "csp-violation", violation: v });
    paint();
  });
  // A CSP violation is only ONE way a script fails to run. A <script src> that 404s, and a SyntaxError in a
  // later inline block, both produce SILENCE: no violation, no output, nothing painted. Capture-phase "error"
  // catches both — resource-load failures (which do not bubble) and uncaught exceptions.
  window.addEventListener("error", function (e) {
    var t = e && e.target;
    var v;
    if (t && (t.src || t.href)) {
      v = { directive: "resource-load-failed", blockedURI: (t.src || t.href) };
    } else if (t && t.tagName) {
      // A blocked inline <style>/<script> raises an error whose target is the ELEMENT and which carries no
      // message. Stringifying it yields "[object Event]", which says nothing — name the element instead.
      v = { directive: "element-error", blockedURI: "<" + t.tagName.toLowerCase() + "> (likely CSP-blocked)" };
    } else {
      v = {
        directive: "script-error",
        blockedURI: (e && e.message) ? e.message : "(no message; not a resource or element)",
      };
    }
    out.push(v);
    if (vs) vs.postMessage({ type: "csp-violation", violation: v });
    paint();
  }, true);
  window.addEventListener("load", function () {
    paint();
    // Angular injects its component styles AFTER window load, so a count taken here undercounts — measured
    // "4 violations" on a run whose real total was 14. Report only once things have settled.
    setTimeout(function () {
      paint();
      if (vs) vs.postMessage({ type: "harness-loaded", violations: out.length });
      if (!out.length) {
        var ok = document.getElementById("hOk");
        if (ok) ok.textContent = "No CSP violations reported.";
      }
    }, 2500);
  });
})();
`;

/** Assemble the standalone harness document. Pure: same inputs → same string. */
export function buildHarnessDocument(input: HarnessDocumentInput): string {
  const { paneHtml, paneStyle, mode, csp } = input;
  const policy = harnessCsp(mode, csp);
  const n = escapeHtml(csp.scriptNonce);
  const sn = escapeHtml(csp.styleNonce);

  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">` +
    `<title>$apply Questionnaire — CSP harness</title>` +
    `<style nonce="${sn}">${HARNESS_STYLE}${paneStyle}</style>` +
    `</head><body>` +
    // Reporter first, before the pane's own scripts, so nothing is missed.
    `<script nonce="${n}">${REPORTER}</script>` +
    `<div class="h-bar"><span class="h-mode">CSP mode: ${escapeHtml(mode)}</span>` +
    `<span class="h-note">${escapeHtml(policy)}</span></div>` +
    `<div class="h-ok" id="hOk"></div>` +
    `<ul class="h-violations" id="hViolations"></ul>` +
    paneHtml +
    `</body></html>`
  );
}
