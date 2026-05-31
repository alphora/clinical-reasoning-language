import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { claudeCodeTarget, type ProvisionContext } from "./provision";
import {
  applyHighlight,
  loadCrlRules,
  removeHighlight,
  type Associations,
  type TokenColors,
} from "./highlight";
import type { Pattern } from "./catalog";
import { NarrativeCompletionProvider, CRL_DOCUMENT_SELECTOR } from "./completion";
import { NarrativeHoverProvider } from "./hover";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function loadEmbeddedCatalog(context: vscode.ExtensionContext): Pattern[] {
  const catalogJsonPath = path.join(context.extensionPath, "dist", "catalog.json");
  try {
    const raw = fs.readFileSync(catalogJsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`expected an array in ${catalogJsonPath}, got ${typeof parsed}`);
    }
    return parsed as Pattern[];
  } catch (e) {
    // Non-fatal: language features just won't work. Surface a quiet warning.
    vscode.window.showWarningMessage(
      `CRL: could not load embedded pattern catalog (${messageOf(e)}). ` +
        "Completion + hover features disabled; provisioning and highlighting unaffected."
    );
    return [];
  }
}

function registerLanguageFeatures(context: vscode.ExtensionContext, patterns: Pattern[]): void {
  if (patterns.length === 0) return;
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      CRL_DOCUMENT_SELECTOR,
      new NarrativeCompletionProvider(patterns),
      " " // trigger after a space — natural place to suggest a continuation
    ),
    vscode.languages.registerHoverProvider(
      CRL_DOCUMENT_SELECTOR,
      new NarrativeHoverProvider(patterns)
    )
  );
}

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

  // Language features (completion + hover) are independent of provisioning —
  // they activate whenever the extension loads and a `.crl` file is opened.
  registerLanguageFeatures(context, loadEmbeddedCatalog(context));

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
