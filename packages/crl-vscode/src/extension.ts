import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { claudeCodeTarget, type ProvisionContext } from "./provision";
import {
  applyHighlight,
  clearStaleCrlAssociations,
  loadCrlRules,
  removeHighlight,
  type Associations,
  type TokenColors,
} from "@smile-digital-health/crl/language-services";
import type { Pattern } from "@smile-digital-health/crl/language-services";
import {
  NarrativeCompletionProvider,
  TypeCompletionProvider,
  ValuetypeCompletionProvider,
  ParamTypeCompletionProvider,
  ConceptRefCompletionProvider,
  CRL_DOCUMENT_SELECTOR,
} from "./completion";
import {
  NarrativeHoverProvider,
  TypeValuetypeHoverProvider,
  ConceptRefHoverProvider,
} from "./hover";
import { registerDiagnostics } from "./diagnostics";
import {
  CrlDefinitionProvider,
  CrlReferenceProvider,
  CrlDocumentSymbolProvider,
  CrlWorkspaceSymbolProvider,
  CrlRenameProvider,
  CrlDocumentLinkProvider,
} from "./navigation";
import { ProjectIndex } from "@smile-digital-health/crl/language-services";

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

function registerLanguageFeatures(
  context: vscode.ExtensionContext,
  patterns: Pattern[],
  index: ProjectIndex,
): void {
  // Narrative completion+hover requires the catalog; the others (type,
  // valuetype, concept-refs) only depend on document content and the
  // grammar-mirrored enums in catalog.ts, so they register regardless.
  context.subscriptions.push(
    // Completion providers
    vscode.languages.registerCompletionItemProvider(
      CRL_DOCUMENT_SELECTOR,
      new TypeCompletionProvider(),
      " "
    ),
    vscode.languages.registerCompletionItemProvider(
      CRL_DOCUMENT_SELECTOR,
      new ValuetypeCompletionProvider(),
      " "
    ),
    vscode.languages.registerCompletionItemProvider(
      CRL_DOCUMENT_SELECTOR,
      new ParamTypeCompletionProvider(),
      " "
    ),
    // ConceptRefCompletionProvider triggers on `"` AND `.` so qualified-ref
    // completion (`"Lib".<here>"`) fires after the dot without waiting for
    // the user to manually open the completion popup.
    vscode.languages.registerCompletionItemProvider(
      CRL_DOCUMENT_SELECTOR,
      new ConceptRefCompletionProvider(index),
      '"',
      "."
    ),
    // Hover providers
    vscode.languages.registerHoverProvider(
      CRL_DOCUMENT_SELECTOR,
      new TypeValuetypeHoverProvider()
    ),
    vscode.languages.registerHoverProvider(
      CRL_DOCUMENT_SELECTOR,
      new ConceptRefHoverProvider(index)
    ),
    // Navigation providers (Chunk C)
    vscode.languages.registerDefinitionProvider(
      CRL_DOCUMENT_SELECTOR,
      new CrlDefinitionProvider(index)
    ),
    vscode.languages.registerReferenceProvider(
      CRL_DOCUMENT_SELECTOR,
      new CrlReferenceProvider(index)
    ),
    vscode.languages.registerDocumentSymbolProvider(
      CRL_DOCUMENT_SELECTOR,
      new CrlDocumentSymbolProvider(index)
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new CrlWorkspaceSymbolProvider(index)
    ),
    vscode.languages.registerRenameProvider(
      CRL_DOCUMENT_SELECTOR,
      new CrlRenameProvider(index)
    ),
    vscode.languages.registerDocumentLinkProvider(
      CRL_DOCUMENT_SELECTOR,
      new CrlDocumentLinkProvider(index)
    )
  );
  if (patterns.length > 0) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        CRL_DOCUMENT_SELECTOR,
        new NarrativeCompletionProvider(patterns),
        " "
      ),
      vscode.languages.registerHoverProvider(
        CRL_DOCUMENT_SELECTOR,
        new NarrativeHoverProvider(patterns)
      )
    );
  }
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

  // Language features (completion + hover + diagnostics) are independent of
  // provisioning — they activate whenever the extension loads and a `.crl`
  // file is opened. ProjectIndex is the shared multi-file scope source.
  const index = new ProjectIndex();
  context.subscriptions.push(
    vscode.commands.registerCommand("crl.refreshProjectCache", () => {
      index.invalidateAll();
      vscode.window.showInformationMessage("CRL: project cache refreshed.");
    }),
  );
  registerLanguageFeatures(context, loadEmbeddedCatalog(context), index);
  registerDiagnostics(context, index);

  // v2.3.0 migration + provisioning. Sequenced (migration first, then
  // provision) so provisionAll's downstream `applyHighlight` writes see the
  // post-migration `files.associations` snapshot. With Todo 1's deletion of
  // the legacy `ASSOCIATION_GLOBS → markdown` write in `applyHighlight`, the
  // ordering is only load-bearing for the FIRST activation post-upgrade —
  // subsequent activations are clean either way. Kept the ordering anyway
  // because explicit > implicit.
  const auto = vscode.workspace.getConfiguration("crl").get<boolean>("autoProvision", true);
  const wantProvision = auto && (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  void (async () => {
    try {
      await clearStaleAssociationsAtActivation();
    } catch (e) {
      // Migration failure is unactionable for the user (settings may be
      // managed/readonly). Log to output channel; don't pop up an error.
      getOutputChannel().appendLine(`CRL migration: ${messageOf(e)}`);
    }
    if (wantProvision) {
      try {
        await provisionAll(context, false);
      } catch (e) {
        vscode.window.showErrorMessage(`CRL: unexpected setup failure — ${messageOf(e)}`);
      }
    }
  })();
}

/**
 * v2.3.0 migration. Runs on every activation. Idempotent. Removes
 * `*.crl → markdown` / `*.cel → markdown` from the user's globally-scoped
 * `files.associations` so the native `crl` / `crl-cel` language ids
 * contributed by this extension take effect for the next file open.
 */
async function clearStaleAssociationsAtActivation(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration();
  const curAssoc = cfg.inspect<Associations>("files.associations")?.globalValue;
  const res = clearStaleCrlAssociations(curAssoc);
  if (!res.changed) return;
  await cfg.update("files.associations", res.associations, vscode.ConfigurationTarget.Global);
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
    serverScriptPath: resolveStableMcpServerScript(context),
    extensionVersion: typeof version === "string" ? version : "0.0.0",
  };
}

/**
 * Returns a STABLE path to the MCP server script — one that doesn't change
 * when the extension is updated, so `.mcp.json` entries written by
 * `crl.setup` survive version updates.
 *
 * Implementation: copy the extension's bundled `dist/mcp-server.js` into the
 * per-extension `globalStorageUri` directory (version-independent, persists
 * across extension updates). The copy is refreshed on every activation so
 * the stable file always matches the currently-installed extension's MCP
 * server logic.
 *
 * Why this matters: `context.extensionPath` resolves to a versioned install
 * dir (e.g., `...crl-language-support-2.2.3/`). Writing that path into
 * `.mcp.json` pins the MCP server to that specific version on disk — so
 * extension updates leave `.mcp.json` pointing at the OLD install dir, and
 * the new version's server logic never gets loaded by MCP clients. See
 * issues #66 / #68 for symptoms.
 */
function resolveStableMcpServerScript(context: vscode.ExtensionContext): string {
  const stableDir = context.globalStorageUri.fsPath;
  const stablePath = path.join(stableDir, "mcp-server.js");
  const bundledPath = path.join(context.extensionPath, "dist", "mcp-server.js");
  const log = getOutputChannel();
  try {
    fs.mkdirSync(stableDir, { recursive: true });
    fs.copyFileSync(bundledPath, stablePath);
  } catch (e) {
    log.appendLine(
      `[mcp] WARN refresh failed at ${stablePath}: ${messageOf(e)} — falling back to bundled path`,
    );
    vscode.window.showWarningMessage(
      `CRL: could not refresh MCP server at ${stablePath}: ${messageOf(e)}. ` +
        `Falling back to the bundled path; the MCP server may stop tracking ` +
        `extension updates until the storage directory becomes writable.`,
    );
    return bundledPath;
  }
  const version = context.extension?.packageJSON?.version ?? "0.0.0";
  log.appendLine(`[mcp] resolved server (v${version}) → ${stablePath}`);
  log.appendLine(`[mcp] bundled source → ${bundledPath}`);
  return stablePath;
}

let outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("CRL");
  }
  return outputChannel;
}

function grammarPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "syntaxes", "crl.tmLanguage.json");
}

// Keys in extension globalState for the customized-scope dialog state.
const SCOPE_DECISIONS_KEY = "crl.highlight.scopeDecisions";
const SKIP_ALL_CUSTOMIZED_KEY = "crl.highlight.skipAllCustomized";
type ScopeDecision = "replace" | "keep";

function readScopeDecisions(context: vscode.ExtensionContext): Record<string, ScopeDecision> {
  return context.globalState.get<Record<string, ScopeDecision>>(SCOPE_DECISIONS_KEY, {});
}

async function writeScopeDecisions(
  context: vscode.ExtensionContext,
  decisions: Record<string, ScopeDecision>
): Promise<void> {
  await context.globalState.update(SCOPE_DECISIONS_KEY, decisions);
}

/**
 * Prompt the user for each unknown customized scope. Returns the set of
 * scopes the user chose to replace. Persists keep/replace decisions per
 * scope and a global "don't ask again" flag.
 */
async function promptForCustomizedScopes(
  context: vscode.ExtensionContext,
  customizedScopes: string[]
): Promise<Set<string>> {
  const replaceScopes = new Set<string>();
  if (customizedScopes.length === 0) return replaceScopes;
  if (context.globalState.get<boolean>(SKIP_ALL_CUSTOMIZED_KEY, false)) {
    // User previously said "don't ask again" — leave everything alone.
    return replaceScopes;
  }
  const decisions = { ...readScopeDecisions(context) };
  let dirty = false;
  for (const scope of customizedScopes) {
    const prior = decisions[scope];
    if (prior === "replace") {
      replaceScopes.add(scope);
      continue;
    }
    if (prior === "keep") continue;
    const choice = await vscode.window.showInformationMessage(
      `CRL: your settings have a customized token color for "${scope}". Replace with CRL's default?`,
      "Replace",
      "Keep mine",
      "Don't ask again"
    );
    if (choice === "Replace") {
      decisions[scope] = "replace";
      replaceScopes.add(scope);
      dirty = true;
    } else if (choice === "Keep mine") {
      decisions[scope] = "keep";
      dirty = true;
    } else if (choice === "Don't ask again") {
      await context.globalState.update(SKIP_ALL_CUSTOMIZED_KEY, true);
      // No per-scope decision; future activations won't prompt at all.
      break;
    }
    // Dismissed (no choice) — leave alone this run, ask again next time.
  }
  if (dirty) await writeScopeDecisions(context, decisions);
  return replaceScopes;
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
  let res = mode === "apply"
    ? applyHighlight(curAssoc, curColors, rules)
    : removeHighlight(curAssoc, curColors, rules);
  if (mode === "apply" && res.customizedScopes.length > 0) {
    const replaceScopes = await promptForCustomizedScopes(context, res.customizedScopes);
    if (replaceScopes.size > 0) {
      res = applyHighlight(curAssoc, curColors, rules, { replaceScopes });
    }
  }

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
