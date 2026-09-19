import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { buildCRL } from "@smile-digital-health/crl";
import {
  previewPresentationFileEdit,
  resolvePresentationFile,
  resolvePresentationTarget,
  sourceSha256,
  type PresentationEditRequest,
} from "@smile-digital-health/crl/language-services";
import {
  reconcileWordingDraft,
  wordingSelections,
  type WordingDraft,
} from "./presentationEditorModel";
import {
  capturePresentationBuffers,
  isLocalPresentationInput,
} from "./presentationEditorInputs";
import { presentationEditorHtml } from "./presentationEditorView";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
function projectRoot(file: string) {
  let dir = path.dirname(file);
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error("Open CRL in its package.json project.");
    dir = parent;
  }
  return dir;
}
function assertSavedUnrepresentableBuffers(
  inputs: readonly string[],
  overlays: ReadonlyMap<string, string>,
) {
  const dirty = vscode.workspace.textDocuments.filter(
    (d) =>
      d.isDirty &&
      d.uri.scheme === "file" &&
      fs.existsSync(d.uri.fsPath) &&
      !overlays.has(fs.realpathSync(d.uri.fsPath)),
  );
  if (!dirty.length) return;
  const physicalInputs = new Set(
    inputs
      .filter((name) => fs.existsSync(name) && fs.statSync(name).isFile())
      .map((name) => fs.realpathSync(name)),
  );
  for (const document of dirty)
    if (physicalInputs.has(fs.realpathSync(document.uri.fsPath)))
      throw new Error(
        "Save or reconcile the changed validation dependency before previewing: " +
          path.basename(document.uri.fsPath),
      );
}
function sameVersions(a: Map<string, number>, b: Map<string, number>) {
  return (
    a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)
  );
}
function draftMessage(value: any): WordingDraft {
  if (
    typeof value.questionText !== "string" ||
    typeof value.questionDescription !== "string" ||
    value.questionText.length > 8000 ||
    value.questionDescription.length > 16000
  )
    throw new Error("Invalid question wording message.");
  return {
    questionText: value.questionText,
    questionDescription: value.questionDescription,
  };
}

export function registerPresentationEditor(context: vscode.ExtensionContext) {
  const virtual = new Map<string, string>();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "crl-wording-preview",
      {
        provideTextDocumentContent: (uri) =>
          virtual.get(uri.toString()) ?? "Preview closed.",
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("crl.editQuestionWording", async () => {
      try {
        if (!vscode.workspace.isTrusted)
          throw new Error(
            "Trust this workspace before editing CRL question wording.",
          );
        const document = vscode.window.activeTextEditor?.document;
        if (
          !document ||
          document.uri.scheme !== "file" ||
          !document.uri.fsPath.endsWith(".crl")
        )
          throw new Error("Open the owning CRL source file first.");
        const target = resolvePresentationFile({
          projectRoot: projectRoot(document.uri.fsPath),
          filePath: document.uri.fsPath,
        });
        const parsed = buildCRL(document.getText().replace(/^\uFEFF/, ""));
        if (!parsed.success || !parsed.result)
          throw new Error(
            "Correct CRL syntax errors before editing question wording.",
          );
        const concepts = parsed.result.statements
          .filter((s) => s.type === "Concept" && s.code)
          .map((s) => ({ label: s.name }));
        if (!concepts.length)
          throw new Error(
            "This file has no locally owned question-enabled concepts.",
          );
        const selected = await vscode.window.showQuickPick(concepts, {
          title: "Edit question wording",
          placeHolder: "Choose the concept whose wording you want to edit",
        });
        if (!selected) return;
        const selections = wordingSelections(
          document.getText(),
          selected.label,
        );
        if (selections.unavailableScopes.length)
          void vscode.window.showInformationMessage(
            `Some unused criterion scopes require direct source editing: ${selections.unavailableScopes.join(", ")}`,
          );
        const selection = await vscode.window.showQuickPick(
          selections.choices,
          {
            title: selected.label,
            placeHolder: "Choose default or scoped wording",
          },
        );
        if (!selection) return;
        const requestBase = selection.request;
        const currentTarget = () => {
          if (document.isClosed)
            throw new Error(
              "The source document closed. Reopen it and the wording editor.",
            );
          const resolved = resolvePresentationTarget(
            document.getText(),
            requestBase.concept,
            requestBase.context
              ? {
                  decision: requestBase.context.decision,
                  criteria: new Set(requestBase.context.criteria),
                }
              : undefined,
          );
          if (!resolved?.editable)
            throw new Error(
              resolved?.readOnlyReason ??
                "The selected question no longer exists.",
            );
          if (resolved.library !== requestBase.library)
            throw new Error(
              "The owning library changed. Reopen the wording editor.",
            );
          return resolved;
        };
        let base = currentTarget(),
          disposed = false,
          busy = false;
        const displayedBaselines = new Map<string, typeof base>();
        type Preview = ReturnType<typeof previewPresentationFileEdit>;
        let pending:
          | {
              plan: Preview;
              request: PresentationEditRequest;
              draft: WordingDraft;
              versions: Map<string, number>;
              beforeUri: vscode.Uri;
              afterUri: vscode.Uri;
            }
          | undefined;
        let conflict:
          | {
              current: typeof base;
              draft: WordingDraft;
              fields: (keyof WordingDraft)[];
              sourceHash: string;
              shown: WordingDraft;
            }
          | undefined;
        const panel = vscode.window.createWebviewPanel(
          "crl.questionWording",
          "Edit Question Wording",
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [],
          },
        );
        const previewUris = new Set<string>();
        const post = (data: unknown) => {
          if (!disposed) void panel.webview.postMessage(data);
        };
        const changed = vscode.workspace.onDidChangeTextDocument((e) => {
          if (
            e.document.uri.scheme === "file" &&
            (isLocalPresentationInput(
              target.projectRoot,
              e.document.uri.fsPath,
            ) ||
              pending?.plan.validationInputs.includes(e.document.uri.fsPath))
          ) {
            pending = undefined;
            post({
              kind: "stale",
              message: "Source changed. Preview again; your draft is retained.",
            });
          }
        });
        const subscription = panel.webview.onDidReceiveMessage(async (raw) => {
          if (disposed) return;
          if (
            !raw ||
            typeof raw !== "object" ||
            !["ready", "preview", "diff", "apply", "resolve", "ack"].includes(
              raw.kind,
            )
          )
            return;
          const allowed =
            raw.kind === "preview"
              ? ["kind", "questionText", "questionDescription"]
              : raw.kind === "apply"
                ? ["kind", "questionText", "questionDescription", "token"]
                : raw.kind === "resolve"
                  ? ["kind", "choice", "questionText", "questionDescription"]
                  : raw.kind === "ack"
                    ? ["kind", "baselineId"]
                    : ["kind"];
          if (
            Object.keys(raw).some(
              (key) => !allowed.includes(key) && key !== "revision",
            )
          ) {
            post({ kind: "error", message: "Unsupported editor message." });
            return;
          }
          if (!Number.isSafeInteger(raw.revision) || raw.revision < 0) return;
          if (raw.kind === "ack") {
            if (typeof raw.baselineId === "string") {
              const accepted = displayedBaselines.get(raw.baselineId);
              if (accepted) base = accepted;
            }
            return;
          }
          if (busy) {
            post({
              kind: "error",
              revision: raw.revision,
              message:
                "Another operation is in progress. Preview again when it finishes.",
            });
            return;
          }
          const respond = (
            data: Record<string, unknown>,
            nextBase?: typeof base,
          ) => {
            let baselineId: string | undefined;
            if (nextBase) {
              baselineId = randomUUID();
              displayedBaselines.set(baselineId, nextBase);
              if (displayedBaselines.size > 32)
                displayedBaselines.delete(
                  displayedBaselines.keys().next().value!,
                );
            }
            post({
              ...data,
              revision: raw.revision,
              ...(baselineId ? { baselineId } : {}),
            });
          };
          busy = true;
          try {
            if (raw.kind === "ready") {
              respond(
                {
                  kind: "ready",
                  title: `${requestBase.library} / ${requestBase.concept}`,
                  scope: selection.label,
                  values: {
                    questionText: base.questionText,
                    questionDescription: base.questionDescription,
                  },
                },
                base,
              );
              return;
            }
            if (raw.kind === "resolve") {
              if (!conflict || !["current", "draft"].includes(raw.choice))
                throw new Error("Preview the current conflict again.");
              const shown = draftMessage(raw);
              if (
                shown.questionText !== conflict.shown.questionText ||
                shown.questionDescription !== conflict.shown.questionDescription
              )
                throw new Error(
                  "Draft changed. Preview it before resolving the conflict.",
                );
              if (sourceSha256(document.getText()) !== conflict.sourceHash)
                throw new Error(
                  "Source changed again. Preview before resolving the conflict.",
                );
              const draft = { ...conflict.draft };
              if (raw.choice === "current")
                for (const field of conflict.fields)
                  draft[field] = conflict.current[field];
              const nextBase = conflict.current;
              conflict = undefined;
              pending = undefined;
              respond(
                {
                  kind: "draft",
                  values: draft,
                  message:
                    "Conflict choice retained. Preview the resulting edit.",
                },
                nextBase,
              );
              return;
            }
            if (raw.kind === "preview") {
              pending = undefined;
              conflict = undefined;
              const draft = draftMessage(raw),
                current = currentTarget(),
                reconciled = reconcileWordingDraft(base, current, draft);
              if (reconciled.conflicts.length) {
                conflict = {
                  current,
                  draft: reconciled.refreshed,
                  fields: reconciled.conflicts.map((c) => c.field),
                  sourceHash: sourceSha256(document.getText()),
                  shown: draft,
                };
                respond({
                  kind: "conflict",
                  values: draft,
                  conflicts: reconciled.conflicts,
                });
                return;
              }
              const request = { ...requestBase, ...reconciled.changes },
                buffers = capturePresentationBuffers(
                  target.projectRoot,
                  vscode.workspace.textDocuments,
                );
              const plan = previewPresentationFileEdit(target, request, {
                overlays: buffers.overlays,
              });
              assertSavedUnrepresentableBuffers(
                plan.validationInputs,
                buffers.overlays,
              );
              // Immutable document identities keep already-open diffs accurate.
              const previewId = randomUUID();
              const beforeUri = vscode.Uri.parse(
                `crl-wording-preview:/${previewId}/before.crl`,
              );
              const afterUri = vscode.Uri.parse(
                `crl-wording-preview:/${previewId}/after.crl`,
              );
              previewUris.add(beforeUri.toString());
              previewUris.add(afterUri.toString());
              pending = {
                beforeUri,
                afterUri,
                plan,
                request,
                draft: reconciled.refreshed,
                versions: buffers.versions,
              };
              virtual.set(beforeUri.toString(), plan.source);
              virtual.set(afterUri.toString(), plan.candidateSource);
              respond(
                {
                  kind: "preview",
                  values: reconciled.refreshed,
                  token: plan.previewToken,
                  fields: plan.fields,
                  impact: plan.impact,
                  validation: plan.validation,
                },
                current,
              );
              return;
            }
            if (!pending)
              throw new Error("Preview your current draft before continuing.");
            if (raw.kind === "diff") {
              await vscode.commands.executeCommand(
                "vscode.diff",
                pending.beforeUri,
                pending.afterUri,
                "Question wording changes",
                { preview: true },
              );
              return;
            }
            const draft = draftMessage(raw),
              saved = pending;
            if (
              raw.token !== saved.plan.previewToken ||
              draft.questionText !== saved.draft.questionText ||
              draft.questionDescription !== saved.draft.questionDescription
            )
              throw new Error("The draft changed. Preview it again.");
            const editor = await vscode.window.showTextDocument(document, {
              preserveFocus: false,
              preview: false,
            });
            if (disposed || !vscode.workspace.isTrusted)
              throw new Error(
                "The editing panel closed or workspace trust changed.",
              );
            const buffers = capturePresentationBuffers(
              target.projectRoot,
              vscode.workspace.textDocuments,
            );
            const plan = previewPresentationFileEdit(target, saved.request, {
              overlays: buffers.overlays,
            });
            assertSavedUnrepresentableBuffers(
              plan.validationInputs,
              buffers.overlays,
            );
            if (
              plan.previewToken !== saved.plan.previewToken ||
              !sameVersions(buffers.versions, saved.versions)
            )
              throw new Error(
                "Source or validation inputs changed. Preview again; your draft is retained.",
              );
            // TextEditor.edit submits the document version and provides one ordinary editor undo step.
            const accepted = await editor.edit(
              (builder) => {
                for (const edit of plan.edits)
                  builder.replace(
                    new vscode.Range(
                      document.positionAt(edit.start),
                      document.positionAt(edit.end),
                    ),
                    edit.text,
                  );
              },
              { undoStopBefore: true, undoStopAfter: true },
            );
            pending = undefined;
            if (!accepted)
              throw new Error(
                "The editor refused the changed document version. No wording edit was applied; preview again.",
              );
            const appliedBase = currentTarget();
            conflict = undefined;
            respond(
              {
                kind: "applied",
                values: {
                  questionText: appliedBase.questionText,
                  questionDescription: appliedBase.questionDescription,
                },
                message:
                  "Applied to the editor. Save when ready; Undo restores the edit. Regenerate and verify before renewed review.",
              },
              appliedBase,
            );
          } catch (error) {
            pending = undefined;
            respond({ kind: "error", message: messageOf(error) });
          } finally {
            busy = false;
          }
        });
        panel.onDidDispose(() => {
          disposed = true;
          changed.dispose();
          subscription.dispose();
          for (const uri of previewUris) virtual.delete(uri);
        });
        context.subscriptions.push(panel);
        panel.webview.html = presentationEditorHtml(
          randomUUID().replace(/-/g, ""),
        );
      } catch (error) {
        void vscode.window.showErrorMessage(`CRL: ${messageOf(error)}`);
      }
    }),
  );
}
