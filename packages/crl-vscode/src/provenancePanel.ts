// Validation-cockpit findings-panel — the thin vscode shell over the pure provenanceFindings core (#156 slice 1 / T2).
// A TreeView grouped by severity (soft §9.1 keyword findings low-prominence), each finding click-navigable to its
// CRL/CEL node or source span. Re-discovers + rebuilds on save of the .cel/.crl (editor) AND on regeneration of the
// artifact/anchor (a FileSystemWatcher over the policy-root globs — those are tool-generated, not editor-saved).
import { basename } from "node:path";

import { buildCorrespondenceModel } from "@smile-digital-health/crl";
import { canonicalize } from "@smile-digital-health/crl/language-services";
import * as vscode from "vscode";

import {
  buildFindingsTree,
  discoverProvenance,
  findPolicySrc,
  headline,
  type FindingNode,
  type FindingsGroup,
  type FindingsTree,
  type NavTarget,
  type Prominence,
} from "./provenanceFindings";
import { isRelevantSave } from "./scenarioWatch";

type Node =
  | { t: "group"; group: FindingsGroup }
  | { t: "finding"; node: FindingNode }
  | { t: "target"; target: NavTarget };

type NavigableTarget = Extract<NavTarget, { navigable: true }>;

const ICON: Record<Prominence, { id: string; color?: string }> = {
  error: { id: "error", color: "errorForeground" },
  "manual-review": { id: "warning", color: "editorWarning.foreground" },
  warning: { id: "warning", color: "editorWarning.foreground" },
  soft: { id: "info" }, // muted: no ThemeColor (round 2: "present but don't alarm")
  info: { id: "info" },
};
const PANE_ICON: Record<NavTarget["pane"], string> = {
  source: "file-text",
  crl: "symbol-class",
  cel: "beaker",
  anchor: "file",
};

const revealCommand = (t: NavigableTarget): vscode.Command => ({
  command: "crl.revealProvenanceTarget",
  title: "Reveal",
  arguments: [t.filePath, t.range],
});

class ProvenanceTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private tree: FindingsTree | undefined;

  setTree(tree: FindingsTree | undefined): void {
    this.tree = tree;
    this._onDidChange.fire(undefined);
  }

  getChildren(el?: Node): Node[] {
    if (!this.tree) return [];
    if (!el) return this.tree.groups.map((group) => ({ t: "group", group }));
    if (el.t === "group") return el.group.nodes.map((node) => ({ t: "finding", node }));
    if (el.t === "finding")
      return el.node.targets.length > 1 ? el.node.targets.map((target) => ({ t: "target", target })) : [];
    return [];
  }

  getTreeItem(el: Node): vscode.TreeItem {
    if (el.t === "group") {
      const it = new vscode.TreeItem(el.group.label, vscode.TreeItemCollapsibleState.Expanded);
      it.description = String(el.group.nodes.length);
      return it;
    }
    if (el.t === "finding") {
      const n = el.node;
      const it = new vscode.TreeItem(
        n.label,
        n.targets.length > 1
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
      );
      const ic = ICON[n.prominence];
      it.iconPath = new vscode.ThemeIcon(ic.id, ic.color ? new vscode.ThemeColor(ic.color) : undefined);
      const primary = n.targets.find((t): t is NavigableTarget => t.navigable);
      // Surface the unresolved reason when nothing is navigable (else a single non-navigable target's reason
      // would be lost — the finding doesn't expand at targets.length <= 1).
      const unresolvedReason = primary ? undefined : n.targets.find((t) => !t.navigable)?.reason;
      it.description = n.prominence === "soft" ? `${n.kind} (soft)` : unresolvedReason ? `${n.kind} — ${unresolvedReason}` : n.kind;
      it.tooltip = `[${n.prominence}] ${n.kind}\n${n.label}${unresolvedReason ? `\n⚠ ${unresolvedReason}` : ""}`;
      if (primary) it.command = revealCommand(primary);
      return it;
    }
    const t = el.target;
    const it = new vscode.TreeItem(
      t.navigable ? t.pane : `${t.pane} — ${t.reason}`,
      vscode.TreeItemCollapsibleState.None,
    );
    it.iconPath = new vscode.ThemeIcon(t.navigable ? PANE_ICON[t.pane] : "circle-slash");
    if (t.navigable) it.command = revealCommand(t);
    else it.tooltip = t.reason;
    return it;
  }
}

export function registerProvenancePanel(context: vscode.ExtensionContext): void {
  // Gate the view's visibility on the workspace actually containing CRL content (the extension also activates on
  // onStartupFinished, so an unconditional setContext would show the view in every workspace).
  void vscode.workspace
    .findFiles("**/*.{crl,cel}", "**/node_modules/**", 1)
    .then((hits) => vscode.commands.executeCommand("setContext", "crl.active", hits.length > 0), () => {});
  const provider = new ProvenanceTreeProvider();
  const view = vscode.window.createTreeView<Node>("crlProvenanceFindings", { treeDataProvider: provider });

  let currentCel: string | undefined;
  let watcher: vscode.FileSystemWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function rebuild(): void {
    if (!currentCel) {
      provider.setTree(undefined);
      view.message = "Open a .cel and run “CRL: Show Provenance”.";
      return;
    }
    const d = discoverProvenance(currentCel);
    if (!d.found) {
      provider.setTree(undefined);
      view.message = `${basename(currentCel)}: ${d.reason}`;
      return;
    }
    let model;
    try {
      model = buildCorrespondenceModel(d.artifactPath, currentCel, d.anchorPath);
    } catch (e) {
      provider.setTree(undefined);
      view.message = `Failed to build provenance for ${basename(currentCel)}: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    const tree = buildFindingsTree(model, d.warnings);
    provider.setTree(tree);
    const prefix =
      d.status === "cel-mismatch"
        ? "⚠ artifact does not reference this .cel — "
        : d.status === "ambiguous"
          ? "⚠ multiple artifacts — "
          : "";
    view.message = prefix + headline(tree.summary, d.candidates.length > 1);
  }

  function scheduleRebuild(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      rebuild();
    }, 150);
  }

  function setupWatcher(): void {
    watcher?.dispose();
    watcher = undefined;
    if (!currentCel) return;
    const src = findPolicySrc(currentCel);
    if (!src) return;
    // Glob (not concrete files): an artifact regenerated from nothing, or atomic temp-write+rename, still fires.
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(src, "{provenance/*.provenance.json,anchor-source/*.txt}"),
    );
    watcher.onDidCreate(scheduleRebuild);
    watcher.onDidChange(scheduleRebuild);
    watcher.onDidDelete(scheduleRebuild);
    // NOT pushed per-call to context.subscriptions (that leaks a dead Disposable per re-target); a single parent
    // disposable below disposes whichever watcher is current at deactivation.
  }

  const showCmd = vscode.commands.registerCommand("crl.showProvenance", () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== "file" || !ed.document.uri.fsPath.toLowerCase().endsWith(".cel")) {
      void vscode.window.showInformationMessage("CRL Provenance: open a .cel scenario file first.");
      return;
    }
    currentCel = ed.document.uri.fsPath;
    setupWatcher();
    rebuild();
  });

  const revealCmd = vscode.commands.registerCommand(
    "crl.revealProvenanceTarget",
    (filePath: string, range: { startLine: number; startCol: number; endLine: number; endCol: number }) => {
      try {
        const selection = new vscode.Range(range.startLine, range.startCol, range.endLine, range.endCol);
        void vscode.window
          .showTextDocument(vscode.Uri.file(filePath), { selection, viewColumn: vscode.ViewColumn.One })
          .then(undefined, () => {});
      } catch {
        /* malformed range / Uri — ignore */
      }
    },
  );

  const saveWatch = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!currentCel || !isRelevantSave(doc.uri.fsPath, currentCel)) return;
    // Scope ANY-.crl-save to THIS policy root (round-2 disposition) — a .crl save elsewhere shouldn't rebuild this panel.
    const p = doc.uri.fsPath;
    if (canonicalize(p) === canonicalize(currentCel)) return scheduleRebuild();
    const src = findPolicySrc(currentCel);
    if (src && canonicalize(p).startsWith(canonicalize(src))) scheduleRebuild();
  });

  view.message = "Open a .cel and run “CRL: Show Provenance”.";
  context.subscriptions.push(view, showCmd, revealCmd, saveWatch, { dispose: () => watcher?.dispose() });
}
