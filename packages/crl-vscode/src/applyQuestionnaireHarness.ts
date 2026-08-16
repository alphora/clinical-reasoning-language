// DEV HARNESS host for the $apply-questionnaire pane — the only vscode-touching part of the spike.
//
// Opens a standalone webview that renders the pane under a CHOSEN CSP rung and reports every
// `securitypolicyviolation` back here. Nothing else in the extension depends on it, so we can learn what LForms
// needs without editing correspondenceCockpit.ts — the most-touched file in the package — on a guess.
//
// Run it via the command `CRL Dev: $apply Questionnaire CSP harness`, pick a rung, read the violations in the
// panel or in the "CRL" output channel.
//
// ⚠ TODO before a real release: this command is registered unconditionally and so appears in the palette of a
// production VSIX. That is deliberate today — installing a VSIX is the only route into the web workbench, which
// is where the CSP ladder has to be re-walked — but it should be gated (dev-only `when` clause, or stripped at
// package time) before the extension ships to users.
//
// ⚠ Desktop is necessary but NOT sufficient. MV runs in the VS Code web workbench, which is stricter. The rung
// that passes here must be re-walked there before the cockpit's policy is changed.
import * as vscode from "vscode";

// EMBEDDED, not read from disk: `.vscodeignore` excludes `src/**`, so a packaged VSIX has no `testdata/`.
// esbuild inlines this into the bundle, which keeps the harness working identically when dev-loaded and when
// installed from a VSIX — the latter being how we reach the WEB WORKBENCH, where MV actually runs.
import fixture from "./testdata/questionnaire-pane/get-case.example.json";

import { renderApplyQuestionnairePane, APPLY_QUESTIONNAIRE_STYLE } from "./applyQuestionnairePaneHtml";
import {
  buildHarnessDocument,
  HARNESS_CSP_MODES,
  type HarnessCspMode,
} from "./applyQuestionnaireHarnessHtml";

/** Cryptographically-irrelevant but unguessable-enough per-render nonce, matching the other panels' approach. */
const makeNonce = (): string => {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
};

export function registerApplyQuestionnaireHarness(
  context: vscode.ExtensionContext,
  log: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("crl.dev.applyQuestionnaireHarness", async () => {
      const mode = (await vscode.window.showQuickPick(HARNESS_CSP_MODES as readonly string[], {
        title: "$apply Questionnaire — CSP rung",
        placeHolder: "Strictest first. Pick the rung to test; 'cockpit-strict' is today's cockpit policy.",
      })) as HarnessCspMode | undefined;
      if (!mode) return;

      const lformsRoot = vscode.Uri.joinPath(context.extensionUri, "media", "lforms");
      const panel = vscode.window.createWebviewPanel(
        "crlApplyQuestionnaireHarness",
        "$apply Questionnaire — CSP harness",
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [lformsRoot] },
      );

      const asset = (f: string): string => panel.webview.asWebviewUri(vscode.Uri.joinPath(lformsRoot, f)).toString();
      const nonce = makeNonce();
      const styleNonce = makeNonce();

      const { html: paneHtml } = renderApplyQuestionnairePane({
        questionnaire: fixture.questionnaire,
        questionnaireResponse: fixture.questionnaireResponse,
        assets: {
          zoneJs: asset("zone.min.js"),
          lhcFormsJs: asset("lhc-forms.js"),
          lformsFhirR4Js: asset("lformsFHIR.min.js"),
          stylesCss: asset("styles.css"),
        },
        nonce,
        styleNonce,
        caseLabel: "fixture: um-css-03 / age-gate-adult-cannot-use-minor-dmc-route",
      });

      panel.webview.html = buildHarnessDocument({
        paneHtml,
        paneStyle: APPLY_QUESTIONNAIRE_STYLE,
        mode,
        csp: { scriptNonce: nonce, styleNonce, cspSource: panel.webview.cspSource },
      });

      log.appendLine(`[apply-q harness] opened with CSP rung "${mode}" (cspSource=${panel.webview.cspSource})`);

      panel.webview.onDidReceiveMessage(
        (m: {
          type?: string;
          violation?: { directive?: string; blockedURI?: string };
          violations?: number;
          ok?: boolean;
          detail?: string;
        }) => {
          if (m?.type === "csp-violation" && m.violation) {
            log.appendLine(`[apply-q harness] CSP BLOCKED ${m.violation.directive} ← ${m.violation.blockedURI}`);
          } else if (m?.type === "apply-q-render") {
            // The whole point of the spike: distinguish "CSP let it through" from "LForms actually painted".
            log.appendLine(`[apply-q harness] RENDER ${m.ok ? "OK" : "FAILED"} — ${m.detail ?? "(no detail)"}`);
            log.show(true);
            if (!m.ok) vscode.window.showWarningMessage(`CRL harness: LForms did not render — ${m.detail ?? ""}`);
          } else if (m?.type === "harness-loaded") {
            // "so far": the count is a FLOOR, not a total. It is taken after a fixed settle, and a slower
            // machine (or a later interaction) can still produce violations afterwards — each of which arrives
            // as its own `csp-violation` line above.
            log.appendLine(
              m.violations
                ? `[apply-q harness] load complete — ${m.violations} violation(s) so far under "${mode}"`
                : `[apply-q harness] load complete — no violations so far under "${mode}"`,
            );
          }
        },
        undefined,
        context.subscriptions,
      );
    }),
  );
}
