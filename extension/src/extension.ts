import * as vscode from "vscode";
import * as path from "node:path";
import { claudeCodeTarget, type ProvisionContext } from "./provision";
import {
  applyHighlight,
  loadCrlRules,
  removeHighlight,
  type Associations,
  type TokenColors,
} from "./highlight";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function activate(context: vscode.ExtensionContext): void {
  // Register commands FIRST so they survive a provisioning failure.
  context.subscriptions.push(
    vscode.commands.registerCommand("crl.setup", () =>
      provisionAll(context, true).catch((e) => vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`))
    ),
    vscode.commands.registerCommand("crl.remove", () =>
      removeAll(context).catch((e) => vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`))
    )
  );

  const auto = vscode.workspace.getConfiguration("crl").get<boolean>("autoProvision", true);
  if (auto && vscode.workspace.workspaceFolders?.length) {
    void provisionAll(context, false).catch((e) =>
      vscode.window.showErrorMessage(`CRL: unexpected setup failure — ${messageOf(e)}`)
    );
  }
}

export function deactivate(): void {
  // no-op
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function warnMultiRoot(): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length > 1) {
    vscode.window.showWarningMessage(
      `CRL: multi-root workspace detected; configuring only the first folder ("${folders[0].name}"). Open the CRL folder on its own if that's not right.`
    );
  }
}

function flushWarnings(warnings: string[]): void {
  if (warnings.length) {
    vscode.window.showWarningMessage(`CRL: ${warnings.join(" ")}`);
  }
}

function ctxFor(context: vscode.ExtensionContext, root: string): ProvisionContext {
  const version = context.extension?.packageJSON?.version;
  return {
    workspaceRoot: root,
    serverScriptPath: path.join(context.extensionPath, "dist", "mcp-server.js"),
    extensionVersion: typeof version === "string" ? version : "0.0.0",
  };
}

function grammarPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "syntaxes", "crl-injection.tmLanguage.json");
}

// Highlighting is written at GLOBAL scope (see highlight.ts header). We read the
// global value (not the merged effective value) and write back only the section
// that changed.
async function writeHighlight(
  context: vscode.ExtensionContext,
  mode: "apply" | "remove"
): Promise<{ changed: boolean; warnings: string[] }> {
  const rules = loadCrlRules(grammarPath(context));
  const cfg = vscode.workspace.getConfiguration();
  const curAssoc = cfg.inspect<Associations>("files.associations")?.globalValue;
  const curColors = cfg.inspect<TokenColors>("editor.tokenColorCustomizations")?.globalValue;
  const res = mode === "apply"
    ? applyHighlight(curAssoc, curColors, rules)
    : removeHighlight(curAssoc, curColors, rules);

  // Token colors first, then the association, so a .crl file is never switched
  // to Markdown before its color rules exist.
  if (res.tokenColorsChanged) {
    await cfg.update("editor.tokenColorCustomizations", res.tokenColors, vscode.ConfigurationTarget.Global);
  }
  if (res.associationsChanged) {
    await cfg.update("files.associations", res.associations, vscode.ConfigurationTarget.Global);
  }
  return { changed: res.associationsChanged || res.tokenColorsChanged, warnings: res.warnings };
}

async function provisionAll(context: vscode.ExtensionContext, manual: boolean): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    if (manual) {
      vscode.window.showWarningMessage("CRL: open your CRL project folder first, then run CRL: Set up tools.");
    }
    return;
  }
  warnMultiRoot();

  const warnings: string[] = [];
  let mcpOk = false;
  let mcpChanged = false;
  let highlightOk = false;

  // Provisioning (.mcp.json + CLAUDE.md) and highlighting are independent — a
  // malformed .mcp.json must not block highlighting, and vice versa.
  try {
    const r = claudeCodeTarget.apply(ctxFor(context, root));
    mcpOk = true;
    mcpChanged = r.mcp === "created" || r.mcp === "updated";
    warnings.push(...r.warnings);
  } catch (e) {
    vscode.window.showErrorMessage(`CRL: could not configure tools — ${messageOf(e)}`);
  }

  try {
    const hl = await writeHighlight(context, "apply");
    highlightOk = true;
    warnings.push(...hl.warnings);
  } catch (e) {
    vscode.window.showErrorMessage(`CRL: could not configure highlighting — ${messageOf(e)}`);
  }

  flushWarnings(warnings);

  if (mcpChanged) {
    // A VS Code reload restarts the Claude Code extension so it re-reads
    // .mcp.json and the CRL tools become available.
    const choice = await vscode.window.showInformationMessage(
      "CRL tools are set up for this workspace. Reload to finish.",
      "Reload"
    );
    if (choice === "Reload") {
      try {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
      } catch {
        /* reload is best-effort */
      }
    }
  } else if (manual && mcpOk && highlightOk) {
    vscode.window.showInformationMessage("CRL: tools and highlighting are already configured for this workspace.");
  }
}

async function removeAll(context: vscode.ExtensionContext): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage("CRL: open the CRL workspace first, then run CRL: Remove tools.");
    return;
  }

  const warnings: string[] = [];
  let anyFailed = false;
  try {
    warnings.push(...claudeCodeTarget.remove(ctxFor(context, root)).warnings);
  } catch (e) {
    anyFailed = true;
    vscode.window.showErrorMessage(`CRL: could not remove tools — ${messageOf(e)}`);
  }
  try {
    await writeHighlight(context, "remove");
  } catch (e) {
    anyFailed = true;
    vscode.window.showErrorMessage(`CRL: could not remove highlighting — ${messageOf(e)}`);
  }

  flushWarnings(warnings);
  if (!anyFailed) {
    vscode.window.showInformationMessage(
      "CRL: removed from this workspace's .mcp.json + CLAUDE.md and your user highlighting settings."
    );
  }
}
