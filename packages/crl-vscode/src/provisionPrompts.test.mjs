// Source-assertion tests for what provisioning is allowed to SHOW the user (issue #243).
//
// The MV codespace ships this extension pre-installed to clinicians. A prompt on the
// success path lands on someone with no basis to answer it, so the rules are:
//   - no reload prompt, and no `workbench.action.reloadWindow` call, ever;
//   - the automatic (mode-driven) path is SILENT on success — no success toast, and
//     no token-scope question either — but it still reports errors and warnings;
//   - only a user-initiated provision (the `crl.setup` command, or "Install" on the
//     consent toast) acknowledges, and only when both halves actually succeeded;
//   - every run leaves a line on the output channel, because once success is silent
//     that log is the only passive evidence provisioning happened at all.
//
// These are static assertions over extension.ts, matching the house style in
// grammar.test.mjs (which likewise reads extension.ts rather than importing it —
// the module needs a live `vscode` host, so it can't be imported under vitest).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const EXT_SRC = readFileSync(join(here, "extension.ts"), "utf8");

// The provisionAll body, so ordering assertions can't be satisfied by unrelated code elsewhere in the file.
const PROVISION_ALL = EXT_SRC.slice(EXT_SRC.indexOf("async function provisionAll"));

const check = test;

check("#243: the extension never asks for, or performs, a window reload", () => {
  assert.ok(
    !/workbench\.action\.reloadWindow/.test(EXT_SRC),
    "extension.ts must not invoke workbench.action.reloadWindow — a reload fixes nothing here (see provisionAll)",
  );
  assert.ok(!/Reload to finish/.test(EXT_SRC), "the 'Reload to finish' prompt must stay deleted");
  // Broad on purpose: any "Reload" string is either a button label or prose telling the user to reload, and neither belongs
  // here. Narrower forms (e.g. scanning one showInformationMessage call) can't cross a nested paren and miss `f(g(x), "Reload")`.
  assert.ok(!/"Reload"/.test(EXT_SRC), "no message may offer a 'Reload' action");
});

check("#243: the success message is INSIDE the user-initiated gate, and is the only success toast", () => {
  const gate = PROVISION_ALL.indexOf("if (userInitiated && toolsOk && highlightOk) {");
  assert.ok(gate > 0, "the acknowledgement must be gated on userInitiated && toolsOk && highlightOk");
  // Pin the message to the gate by POSITION — a restructure that keeps the `if` but hoists the toast above it must fail.
  const success = PROVISION_ALL.indexOf("start a new session to pick up the CRL tools");
  assert.ok(success > gate, "the success message must appear after (inside) the gate, not before it");
  // …and no other success toast may sneak in ahead of the gate on the silent path.
  const before = PROVISION_ALL.slice(0, gate);
  assert.ok(
    !/showInformationMessage\(/.test(before),
    "provisionAll must show no information message before the userInitiated gate — the automatic path is silent on success",
  );
});

check("#243: the automatic path passes userInitiated=false; both user-asked paths pass true", () => {
  // The mode-driven ("silent") activation path — the one the MV space takes via autoProvision:"always".
  assert.ok(
    /await provisionAll\(context, false, provisionRoot, stableServerPath\)/.test(EXT_SRC),
    "the mode-driven activation path must provision with userInitiated=false (silent on success)",
  );
  // The `crl.setup` command.
  assert.ok(
    /await provisionAll\(context, true, root\)/.test(EXT_SRC),
    "the crl.setup command must provision with userInitiated=true",
  );
  // Clicking "Install" on the consent toast is a request too (design review #1).
  assert.ok(
    /await provisionAll\(context, true, root, serverScriptPath\)/.test(EXT_SRC),
    "an 'Install' click must provision with userInitiated=true — the user asked for it just as explicitly as the command",
  );
  // The `crl.enableResults` config watcher: a settings change is NOT a request to provision, so it is
  // userInitiated=false — it must stay silent on success like the automatic path, and it only ever
  // rewrites a workspace that is ALREADY provisioned (guarded by isProvisionedByPath at the call site).
  assert.ok(
    /await provisionAll\(context, false, root, serverScriptPath\)/.test(EXT_SRC),
    "the crl.enableResults watcher must provision with userInitiated=false — changing a setting is not asking us to talk",
  );
  // A FIFTH call site added later would otherwise pass all of the above unclassified: force it through this test.
  const callSites = EXT_SRC.match(/provisionAll\(context, /g) ?? [];
  assert.equal(callSites.length, 4, "unexpected provisionAll call site — classify it as userInitiated true/false and update this test");
});

check("#243: silence covers SUCCESS only — errors and warnings still surface", () => {
  // Both provisioning halves report their own failure regardless of userInitiated.
  assert.ok(
    /showErrorMessage\(`CRL: could not configure tools/.test(EXT_SRC),
    "an .mcp.json/CLAUDE.md failure must still raise an error message",
  );
  assert.ok(
    /showErrorMessage\(`CRL: could not configure highlighting/.test(EXT_SRC),
    "a highlighting failure must still raise an error message",
  );
  // flushWarnings is called unconditionally, before any userInitiated gate.
  assert.ok(
    PROVISION_ALL.indexOf("flushWarnings(warnings);") <
      PROVISION_ALL.indexOf("if (userInitiated && toolsOk && highlightOk)"),
    "flushWarnings must run unconditionally, ahead of the acknowledgement gate",
  );
});

check("#243: the token-scope question is asked only on the user-initiated path", () => {
  // promptForCustomizedScopes is a per-scope Replace/Keep-mine toast — prompt-shaped, not an error, so the automatic path
  // must not reach it. It takes an explicit canPrompt, and writeHighlight passes userInitiated through.
  assert.ok(
    /promptForCustomizedScopes\(\s*context,\s*res\.customizedScopes,\s*userInitiated,?\s*\)/.test(EXT_SRC),
    "writeHighlight must pass userInitiated into promptForCustomizedScopes as canPrompt",
  );
  assert.ok(
    /if \(!canPrompt\) continue;/.test(EXT_SRC),
    "an undecided scope must be skipped (keep the user's color) rather than asked about on the automatic path",
  );
  // A REMEMBERED decision must still apply — only the question is suppressed, not the user's earlier answer.
  const loop = EXT_SRC.slice(EXT_SRC.indexOf("for (const scope of customizedScopes)"));
  assert.ok(
    loop.indexOf('if (prior === "replace")') < loop.indexOf("if (!canPrompt) continue;"),
    "recorded replace/keep decisions must be honored before the canPrompt bail",
  );
  assert.ok(
    /await writeHighlight\(context, "apply", userInitiated\)/.test(EXT_SRC),
    "provisionAll must thread userInitiated into writeHighlight",
  );
});

check("#243: every provisionAll outcome is logged, and a throw is not blamed on one file", () => {
  // Spaces' one ask when the toast went away: silence on success must not mean no evidence it ran.
  assert.ok(
    /appendLine\(`\[provision\] tools: \$\{toolsOutcome\}; highlighting: /.test(EXT_SRC),
    "provisionAll must log its outcome — it is the only passive signal that provisioning ran",
  );
  // apply() writes .mcp.json before CLAUDE.md, so a CLAUDE.md throw would mislabel a file that was written fine.
  assert.ok(
    /toolsOutcome = `FAILED \(\$\{messageOf\(e\)\}\)`/.test(EXT_SRC),
    "a throw must be reported as the tools HALF failing, never as '.mcp.json FAILED'",
  );
  // Both early guards log too, or a bailed automatic run is silent AND untraceable.
  assert.ok(/appendLine\("\[provision\] skipped: no workspace folder"\)/.test(EXT_SRC), "the no-root guard must log");
  assert.ok(/appendLine\(`\[provision\] skipped: \$\{root\} is no longer a workspace folder`\)/.test(EXT_SRC), "the workspace-changed guard must log");
});

check("#243: the new-session hint keys off BOTH session inputs, not just .mcp.json", () => {
  // CLAUDE.md is read at Claude Code session start exactly like .mcp.json. A stable staged server path means .mcp.json can be
  // "unchanged" while the managed block is rewritten (7b59db1 did precisely that) — that user still needs a new session.
  assert.ok(
    /const mdChanged = r\.claudeMd !== "unchanged" && r\.claudeMd !== "skipped";/.test(EXT_SRC),
    "the CLAUDE.md outcome must be evaluated, not discarded",
  );
  assert.ok(
    /sessionInputsChanged = mcpChanged \|\| mdChanged;/.test(EXT_SRC),
    "the hint must fire when EITHER session input changed",
  );
  assert.ok(
    /sessionInputsChanged\s*\n?\s*\? "CRL: tools and highlighting are configured/.test(EXT_SRC),
    "the success message must branch on sessionInputsChanged",
  );
});
