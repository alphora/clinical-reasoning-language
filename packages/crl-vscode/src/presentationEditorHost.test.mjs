import { test, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { capturePresentationBuffers } from "./presentationEditorInputs.ts";
const host = vi.hoisted(() => ({
  commands: new Map(),
  messages: [],
  diffs: [],
}));
vi.mock("vscode", () => ({
  Uri: { parse: (s) => ({ toString: () => s }) },
  ViewColumn: { Beside: 2 },
  Range: class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  workspace: {
    get textDocuments() {
      return host.docs;
    },
    isTrusted: true,
    registerTextDocumentContentProvider: (_, p) => {
      host.provider = p;
      return { dispose() {} };
    },
    onDidChangeTextDocument: (cb) => {
      host.changed = cb;
      return { dispose() {} };
    },
  },
  window: {
    get activeTextEditor() {
      return { document: host.docs[0] };
    },
    showQuickPick: async (items) => items[0],
    showInformationMessage: vi.fn(),
    showErrorMessage: (m) => {
      throw new Error(m);
    },
    createWebviewPanel: () => ({
      webview: {
        postMessage: (m) => host.messages.push(m),
        onDidReceiveMessage: (cb) => {
          host.receive = cb;
          return { dispose() {} };
        },
      },
      onDidDispose() {},
    }),
    showTextDocument: async () => ({ edit: async () => false }),
  },
  commands: {
    registerCommand: (id, cb) => {
      host.commands.set(id, cb);
      return { dispose() {} };
    },
    executeCommand: async (...args) => host.diffs.push(args),
  },
}));
import { registerPresentationEditor } from "./presentationEditor.ts";
const roots = [];
afterEach(() => {
  for (const r of roots.splice(0))
    fs.rmSync(r, { recursive: true, force: true });
});
const source =
  'library "L".\nconcept "Answer":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `answer`.\n- shape reduction is most recent.\npresentation for "Answer":\n- question text is "Original".\n- question description is "Description".\n';
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wording-host-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "wording-host", version: "1.0.0" }),
  );
  const file = path.join(root, "main.crl");
  fs.writeFileSync(file, source);
  return { root, file };
}
function doc(file, text = source) {
  return {
    uri: { scheme: "file", fsPath: file, toString: () => file },
    version: 1,
    isDirty: false,
    isClosed: false,
    getText: () => text,
    positionAt: (n) => n,
  };
}
test("nested project buffers do not participate; local inputs and missing local files still do", () => {
  const { root, file } = fixture(),
    nested = path.join(root, "examples", "nested");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, "package.json"), "{}");
  const dependency = path.join(root, "dependency.crl");
  fs.writeFileSync(dependency, 'library "Dependency".');
  const nestedSaved = path.join(nested, "saved.crl");
  fs.writeFileSync(nestedSaved, "invalid");
  const captured = capturePresentationBuffers(root, [
    doc(file),
    doc(dependency, 'library "Changed".'),
    doc(nestedSaved),
    doc(path.join(nested, "new.crl")),
    doc(path.join(root, "dist", "new.crl")),
  ]);
  expect([...captured.overlays.keys()]).toEqual([
    fs.realpathSync(file),
    fs.realpathSync(dependency),
  ]);
  expect(captured.overlays.get(fs.realpathSync(dependency))).toBe(
    'library "Changed".',
  );
  expect(captured.versions.size).toBe(2);
  expect(() =>
    capturePresentationBuffers(root, [doc(path.join(root, "new.crl"))]),
  ).toThrow("Save newly created");
});
// @kit shared-wording-editing:editor
test("successive previews preserve already-open diffs and editor refusal never reports an apply", async () => {
  const { file } = fixture();
  host.docs = [doc(file)];
  host.messages = [];
  host.diffs = [];
  registerPresentationEditor({ subscriptions: [] });
  await host.commands.get("crl.editQuestionWording")();
  await host.receive({ kind: "ready", revision: 0 });
  let ready = host.messages.at(-1);
  await host.receive({
    kind: "ack",
    revision: 0,
    baselineId: ready.baselineId,
  });
  const preview = async (text, revision) => {
    await host.receive({
      kind: "preview",
      revision,
      questionText: text,
      questionDescription: "Description",
    });
    const msg = host.messages.at(-1);
    expect(msg.kind).toBe("preview");
    await host.receive({ kind: "ack", revision, baselineId: msg.baselineId });
    await host.receive({ kind: "diff", revision });
    return msg;
  };
  await preview("Preview A", 1);
  const first = host.diffs.at(-1)[2];
  expect(host.provider.provideTextDocumentContent(first)).toContain(
    "Preview A",
  );
  const second = await preview("Preview B", 2),
    next = host.diffs.at(-1)[2];
  expect(next.toString()).not.toBe(first.toString());
  expect(host.provider.provideTextDocumentContent(next)).toContain("Preview B");
  expect(host.provider.provideTextDocumentContent(first)).toContain(
    "Preview A",
  );
  await host.receive({
    kind: "apply",
    revision: 2,
    token: second.token,
    questionText: "Preview B",
    questionDescription: "Description",
  });
  expect(host.messages.at(-1).kind).toBe("error");
  expect(host.messages.at(-1).message).toContain("editor refused");
  expect(host.messages.some((m) => m.kind === "applied")).toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe(source);
});
