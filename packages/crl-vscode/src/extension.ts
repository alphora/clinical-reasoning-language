import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { claudeCodeTarget, resolveAutoProvisionMode, decideProvisioning, isProvisionedByPath, type ProvisionContext, type ProvisionDecision } from "./provision";
import { stageStableServer } from "./stableServer";
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
  RequestCompletionProvider,
  ConceptRefCompletionProvider,
  CRL_DOCUMENT_SELECTOR,
} from "./completion";
import {
  NarrativeHoverProvider,
  TypeValuetypeHoverProvider,
  ConceptRefHoverProvider,
} from "./hover";
import { registerDiagnostics } from "./diagnostics";
import { registerCelDiagnostics } from "./celDiagnostics";
import { registerCorrespondenceCockpit } from "./correspondenceCockpit";
import { registerProvenancePanel } from "./provenancePanel";
import { registerScenarioRunner } from "./scenarioRunner";
import { CelCompletionProvider, CEL_DOCUMENT_SELECTOR } from "./celCompletion";
import { CelHoverProvider } from "./celHover";
import { CelDefinitionProvider, CelReferenceProvider } from "./celNavigation";
import {
  CrlDefinitionProvider,
  CrlReferenceProvider,
  CrlDocumentSymbolProvider,
  CrlWorkspaceSymbolProvider,
  CrlRenameProvider,
  CrlDocumentLinkProvider,
} from "./navigation";
import { ProjectIndex } from "@smile-digital-health/crl/language-services";
import { registerAgentCommands } from "./agentCommands";
import { registerAgentChat } from "./agentChat";

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
    vscode.languages.registerCompletionItemProvider(
      CRL_DOCUMENT_SELECTOR,
      new RequestCompletionProvider(),
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
    // CEL (.cel) completion — one provider for all CEL slots (covers/subject/fact/defined-by/result-is),
    // triggers on `"` (quote slots) and `.` (qualified `defined by "Lib"."…"`). #4 slice 1.
    vscode.languages.registerCompletionItemProvider(
      CEL_DOCUMENT_SELECTOR,
      new CelCompletionProvider(index),
      '"',
      ".",
      " "
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
    // CEL (.cel) hover — resolves the token under the cursor (fact / concept / decision / arm). #4 slice 2.
    vscode.languages.registerHoverProvider(
      CEL_DOCUMENT_SELECTOR,
      new CelHoverProvider(index)
    ),
    // CEL (.cel) navigation — go-to-definition (.cel → .crl / file-local fact) + file-local fact refs. #4 slice 3.
    vscode.languages.registerDefinitionProvider(
      CEL_DOCUMENT_SELECTOR,
      new CelDefinitionProvider(index)
    ),
    vscode.languages.registerReferenceProvider(
      CEL_DOCUMENT_SELECTOR,
      new CelReferenceProvider()
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
    vscode.commands.registerCommand("crl.setup", async () => {
      try {
        const root = workspaceRoot();
        // Persist consent BEFORE provisioning — provisionAll may reloadWindow, terminating the host before the memento lands.
        if (root) await setProvisionDecision(context, root, "installed"); // manual setup = an explicit per-workspace consent
        await provisionAll(context, true, root);
      } catch (e) {
        vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`);
      }
    }),
    vscode.commands.registerCommand("crl.remove", async () => {
      try {
        const root = workspaceRoot();
        await removeAll(context);
        if (root) await setProvisionDecision(context, root, "never"); // a deliberate removal → don't re-offer (wins over mode "always")
      } catch (e) {
        vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`);
      }
    })
  );

  // Agent (editor-agent Todo A) commands register EARLY too — key handling + the provider round-trip proof must survive a
  // provisioning failure. getOutputChannel() is private to this module, so pass the channel in.
  registerAgentCommands(context, getOutputChannel());
  // The chat pane (editor-agent Todo B). Registers alongside the other agent commands — NOT gated behind `crl.active`
  // (Todo B has no app-state dependency; chat is available whenever the extension is loaded).
  registerAgentChat(context);

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
  registerScenarioRunner(context);
  registerProvenancePanel(context);
  registerCorrespondenceCockpit(context);
  registerDiagnostics(context, index);
  registerCelDiagnostics(context, index);

  // v2.3.0 migration + provisioning. Sequenced (migration first, then
  // provision) so provisionAll's downstream `applyHighlight` writes see the
  // post-migration `files.associations` snapshot. With Todo 1's deletion of
  // the legacy `ASSOCIATION_GLOBS → markdown` write in `applyHighlight`, the
  // ordering is only load-bearing for the FIRST activation post-upgrade —
  // subsequent activations are clean either way. Kept the ordering anyway
  // because explicit > implicit.
  const provisionRoot = workspaceRoot();
  void (async () => {
    try {
      // The stable MCP-server refresh (a copy into the extension's own globalStorage) is DECOUPLED from provisioning consent
      // (disc 369): a workspace that declines, or isn't a CRL project, must STILL get a fresh server binary so any EXISTING
      // `.mcp.json` entry (from a prior install, or one committed by a teammate) keeps working after an extension update
      // (#66/#68). It writes only to the extension's private globalStorage → no consent needed. Run it every activation, but
      // OFF the sync path (impl-review disc 370 #4): here in the async task, staged ONCE and threaded into provisionAll below.
      let stableServerPath: string | undefined;
      try {
        stableServerPath = resolveStableMcpServerScript(context);
      } catch {
        /* resolveStableMcpServerScript already logs + warns; leave undefined (a later provision falls back to the bundled path) */
      }

      try {
        await clearStaleAssociationsAtActivation();
      } catch (e) {
        // Migration failure is unactionable (settings may be managed/readonly). Log; don't pop up. NOTE (disc 370): this is a
        // GLOBAL `files.associations` write that runs unconditionally — the one consent-gate exception. It only REMOVES this
        // extension's own legacy `*.crl→markdown` associations (never adds), is idempotent, and ownership is exact — so it is
        // not the silent-provisioning the consent gate exists to stop.
        getOutputChannel().appendLine(`CRL migration: ${messageOf(e)}`);
      }
      if (!provisionRoot) return; // no workspace folder → nothing to provision or offer

      // impl-review (disc 370 #5): honor a PRE-MIGRATION workspace-scoped opt-out. The setting is now `scope:machine`, so VS
      // Code ignores a `.vscode/settings.json` value — but a user who set `"crl.autoProvision": false` there meant "not here".
      // Skip (don't provision, don't backfill "installed" over their intent) while that legacy value is present + detectable.
      const inspected = vscode.workspace.getConfiguration("crl").inspect("autoProvision");
      if (inspected?.workspaceValue === false || inspected?.workspaceFolderValue === false) return;

      // Consent-based, relevance-gated provisioning (disc 369). A per-workspace decision (Install / Never) wins over the global
      // `crl.autoProvision` mode, which governs only UNDECIDED workspaces. If VS Code coerces a legacy boolean against the new
      // enum type, `resolveAutoProvisionMode`'s outcomes are both consent-safe (true/false→"prompt" = offer, never a silent write).
      const mode = resolveAutoProvisionMode(vscode.workspace.getConfiguration("crl").get("autoProvision"));
      const decision = getProvisionDecision(context, provisionRoot);
      const already = stableServerPath ? isProvisionedByPath(provisionRoot, stableServerPath) : false;
      const action = decideProvisioning(mode, decision, already);
      if (action === "skip") return;
      if (action === "silent") {
        // Backfill the memento for a workspace THIS machine provisioned under the old silent default (undecided + already) so it
        // reads as an explicit "installed" from now on. AWAIT before provisioning (which may reloadWindow → host terminates).
        if (!decision && already) await setProvisionDecision(context, provisionRoot, "installed");
        try {
          await provisionAll(context, false, provisionRoot, stableServerPath);
        } catch (e) {
          vscode.window.showErrorMessage(`CRL: unexpected setup failure — ${messageOf(e)}`);
        }
        return;
      }
      // action === "check-relevance": undecided + not provisioned here → OFFER only if the workspace actually contains CRL files.
      if (!(await workspaceHasCrlFiles(provisionRoot))) return; // a non-CRL project: no writes, no prompt (the core fix)
      await offerProvisioning(context, provisionRoot, stableServerPath);
    } catch (e) {
      // Outer backstop (disc 370 #3): a rejected VS Code API call (the offer toast, a config/memento read) inside this detached
      // task would otherwise be an unhandled rejection. Activation already returned + commands are registered, so this is log
      // noise, not a crash — record it and move on (never a second toast).
      getOutputChannel().appendLine(`CRL provisioning: ${messageOf(e)}`);
    }
  })();
}

// --- consent-based provisioning: the per-workspace decision memento + the offer (disc 369) ---

interface StoredProvisionDecision {
  decision: ProvisionDecision;
  root: string; // the folder the decision was made for — a mismatch (multi-root reorder / standalone vs multi-root) re-evaluates
}
const PROVISION_DECISION_KEY = "crl.provisionDecision";

function getProvisionDecision(context: vscode.ExtensionContext, root: string): ProvisionDecision | undefined {
  const v = context.workspaceState.get<StoredProvisionDecision>(PROVISION_DECISION_KEY);
  if (!v || (v.decision !== "installed" && v.decision !== "never")) return undefined;
  if (v.root !== root) return undefined; // recorded for a different folder → treat as undecided (safety for multi-root)
  return v.decision;
}

/** Persist the per-workspace decision. Returns the update Thenable so callers can AWAIT durability (disc 370 #2) — the write
 *  must land before a `provisionAll` that may `reloadWindow`, and before command completion, or the choice can be lost. */
function setProvisionDecision(context: vscode.ExtensionContext, root: string, decision: ProvisionDecision): Thenable<void> {
  return context.workspaceState.update(PROVISION_DECISION_KEY, { decision, root } satisfies StoredProvisionDecision);
}

/** Does the provisioning target folder contain any `.crl`/`.cel` file? Scoped to the EXACT captured root (the write target),
 *  NOT a `[0]` fallback (disc 370 #1: consent/relevance must be for the same folder we'll write) nor the whole multi-root set.
 *  Excludes `node_modules` explicitly — `findFiles` consults `files.exclude` only, NOT `search.exclude` (disc 370 #6), so a
 *  dependency shipping `.crl`/`.cel` would otherwise trigger an offer. Stops at 1 hit. */
async function workspaceHasCrlFiles(root: string): Promise<boolean> {
  try {
    const folder = vscode.workspace.workspaceFolders?.find((f) => f.uri.fsPath === root);
    if (!folder) return false; // the captured folder is gone (reorder/removal) → don't offer against a moved target
    const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.{crl,cel}"), "**/node_modules/**", 1);
    return found.length > 0;
  } catch {
    return false; // a findFiles failure must never crash activation or spuriously offer
  }
}

/** The consent toast (non-modal): names EVERY write (the workspace `.mcp.json`/`CLAUDE.md` AND the global editor highlighting),
 *  since "Install" runs the full `provisionAll`. Install → persist "installed" (AWAITED, before the write/reload) + provision the
 *  captured root; Never → persist "never"; Not now / dismiss → leave undecided (re-offered next activation). */
async function offerProvisioning(context: vscode.ExtensionContext, root: string, serverScriptPath: string | undefined): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "This workspace has Clinical Reasoning Language files. Set up CRL tools? This adds an MCP server and a note to this workspace (.mcp.json, CLAUDE.md) and enables .crl highlighting in your editor settings.",
    "Install",
    "Not now",
    "Never for this workspace",
  );
  if (choice === "Install") {
    await setProvisionDecision(context, root, "installed"); // persist consent BEFORE provisioning (a reload could terminate the host)
    try {
      await provisionAll(context, false, root, serverScriptPath);
    } catch (e) {
      vscode.window.showErrorMessage(`CRL: unexpected setup failure — ${messageOf(e)}`);
    }
  } else if (choice === "Never for this workspace") {
    await setProvisionDecision(context, root, "never");
  }
  // "Not now" / dismissed → leave the memento undecided; the next activation of this CRL workspace offers again.
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

function ctxFor(context: vscode.ExtensionContext, root: string, serverScriptPath?: string): ProvisionContext {
  const version = context.extension?.packageJSON?.version;
  return {
    workspaceRoot: root,
    // Reuse an already-staged path when the caller has one (disc 370 #4: avoids re-staging + a duplicate storage-failure warning);
    // otherwise resolve (which stages) — the manual `crl.setup` path.
    serverScriptPath: serverScriptPath ?? resolveStableMcpServerScript(context),
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
  const bundledDir = path.join(context.extensionPath, "dist");
  const bundledPath = path.join(bundledDir, "mcp-server.js");
  const log = getOutputChannel();
  try {
    // Copies mcp-server.js AND the runtime catalog `.cql` next to it — the server
    // runs from here, and the emitter reads the `.cql` via join(__dirname, name).
    const stablePath = stageStableServer(bundledDir, stableDir);
    const version = context.extension?.packageJSON?.version ?? "0.0.0";
    log.appendLine(`[mcp] resolved server (v${version}) → ${stablePath}`);
    log.appendLine(`[mcp] bundled source → ${bundledPath}`);
    return stablePath;
  } catch (e) {
    log.appendLine(
      `[mcp] WARN stable refresh failed in ${stableDir}: ${messageOf(e)} — falling back to bundled path`,
    );
    vscode.window.showWarningMessage(
      `CRL: could not refresh the MCP server in ${stableDir}: ${messageOf(e)}. ` +
        `Falling back to the bundled path; the MCP server may stop tracking ` +
        `extension updates until the storage directory becomes writable.`,
    );
    // The bundled dir has the `.cql` as esbuild-copied siblings, so the catalog
    // still resolves from here.
    return bundledPath;
  }
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

async function provisionAll(context: vscode.ExtensionContext, manual: boolean, root = workspaceRoot(), serverScriptPath?: string): Promise<void> {
  if (!root) {
    if (manual) {
      vscode.window.showWarningMessage("CRL: open your CRL project folder first, then run CRL: Set up tools.");
    }
    return;
  }
  // Consent-boundary guard (disc 370 #1): write ONLY to the captured root, and only if it's still a current workspace folder —
  // a folder reorder/removal while an offer toast was open must not redirect the write to a different (unconsented) folder.
  if (!(vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === root)) {
    if (manual) vscode.window.showWarningMessage("CRL: the workspace changed — reopen the folder, then run CRL: Set up tools.");
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
    const r = claudeCodeTarget.apply(ctxFor(context, root, serverScriptPath));
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
