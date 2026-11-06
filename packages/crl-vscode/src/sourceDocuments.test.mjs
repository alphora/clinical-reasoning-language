import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync, symlinkSync, realpathSync, renameSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { vi, afterEach } from 'vitest';
import { listSourceDocuments, showSourceDocuments } from './sourceDocuments.ts';
import { findPolicySrc } from './provenanceFindings.ts';
import { COCKPIT_WEBVIEW_SCRIPT } from './correspondenceCockpit.ts';

const blocked = vi.hoisted(() => new Set());
vi.mock('node:fs', async original => {
  const actual = await original();
  return { ...actual, readdirSync: (...args) => {
    if (blocked.has(resolve(String(args[0])))) throw Object.assign(Error('Permission denied'), { code: 'EACCES' });
    return actual.readdirSync(...args);
  } };
});
afterEach(() => blocked.clear());

function fixture() {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(join(parent, 'crl-source-documents-')), src = join(root, 'src'), links = [];
  assert.ok(root.startsWith(parent + sep));
  mkdirSync(join(src, 'crl'), { recursive: true }); mkdirSync(join(src, 'cel'));
  return {
    root, src, links,
    file(folder, name, text = 'Synthetic document') {
      const path = join(src, folder, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path;
    },
    link(target, path) { symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir'); links.push(path); },
    close() { for (const link of links.reverse()) unlinkSync(link); rmSync(root, { recursive: true, force: true }); },
  };
}
const ui = choose => ({ choose: vi.fn(choose ?? (async docs => docs[0])), open: vi.fn(async () => {}), message: vi.fn() });

test('lists both folders, nested paths and equal basenames with stable group/path identity', () => {
  const f = fixture(); try {
    f.file('source', 'z.pdf'); f.file('source', 'a.docx'); f.file('source', 'appendix/a.docx'); f.file('refined-source', 'a.docx');
    const list = listSourceDocuments(f.src);
    assert.equal(list.complete, true);
    assert.deepEqual(list.documents.map(x => [x.group, x.relativePath]), [['Source', 'a.docx'], ['Source', 'appendix/a.docx'], ['Source', 'z.pdf'], ['Refined source', 'a.docx']]);
    assert.equal(new Set(list.documents.map(x => x.filePath)).size, 4);
  } finally { f.close(); }
});
test('does not restrict files to particular viewer extensions or include housekeeping files', () => {
  const f = fixture(); try {
    for (const name of ['policy.txt', 'figure.png', 'policy.pdf', '~$policy.docx', '.gitkeep', '.DS_Store', 'Thumbs.db', 'desktop.ini']) f.file('source', name);
    assert.deepEqual(listSourceDocuments(f.src).documents.map(x => x.relativePath), ['figure.png', 'policy.pdf', 'policy.txt']);
  } finally { f.close(); }
});
test('missing and empty source folders are complete empty listings', async () => {
  const f = fixture(); try {
    assert.deepEqual(listSourceDocuments(f.src), { documents: [], complete: true, warnings: [] });
    mkdirSync(join(f.src, 'source')); mkdirSync(join(f.src, 'refined-source'));
    const action = ui(); await showSourceDocuments(f.src, action);
    assert.equal(action.choose.mock.calls.length, 0); assert.equal(action.open.mock.calls.length, 0);
    assert.match(action.message.mock.calls[0][0], /No Source or Refined source documents/);
  } finally { f.close(); }
});
test('unreadable source does not hide accessible refined documents or claim an empty policy', async () => {
  const f = fixture(); try {
    f.file('source', 'policy.pdf'); const refined = f.file('refined-source', 'working.docx'); blocked.add(resolve(join(f.src, 'source')));
    const list = listSourceDocuments(f.src); assert.equal(list.complete, false); assert.equal(list.documents.length, 1);
    const action = ui(); await showSourceDocuments(f.src, action);
    assert.equal(action.choose.mock.calls[0][1].incomplete, true); assert.equal(action.open.mock.calls[0][0], realpathSync(refined));
    assert.equal(action.message.mock.calls[0][1], 'warning'); assert.ok(!action.message.mock.calls.some(x => /No Source/.test(x[0])));
  } finally { f.close(); }
});
test('unreadable-only and non-directory roots give warnings rather than no-documents claims', async () => {
  const f = fixture(); try {
    f.file('source', 'policy.pdf'); blocked.add(resolve(join(f.src, 'source')));
    const action = ui(); await showSourceDocuments(f.src, action);
    assert.equal(action.choose.mock.calls.length, 0); assert.equal(action.message.mock.calls[0][1], 'warning');
    assert.ok(!action.message.mock.calls.some(x => /No Source/.test(x[0])));
    writeFileSync(join(f.src, 'refined-source'), 'not a directory');
    assert.ok(listSourceDocuments(f.src).warnings.some(x => /not a folder/.test(x)));
  } finally { f.close(); }
});
test('follows an explicitly named source-root junction but skips nested links', () => {
  const f = fixture(); try {
    const target = join(f.root, 'linked-source'); mkdirSync(target); writeFileSync(join(target, 'policy.pdf'), 'synthetic');
    f.link(target, join(f.src, 'source'));
    assert.equal(listSourceDocuments(f.src).documents[0].filePath, join(realpathSync(target), 'policy.pdf'));
    const elsewhere = join(f.root, 'elsewhere'); mkdirSync(elsewhere); writeFileSync(join(elsewhere, 'external.pdf'), 'not listed');
    f.link(elsewhere, join(target, 'nested'));
    const list = listSourceDocuments(f.src); assert.equal(list.complete, false); assert.equal(list.documents.length, 1);
  } finally { f.close(); }
});
test('entry/depth bounds disclose incomplete listings and keep deterministic visible files', () => {
  const f = fixture(); try {
    f.file('source', 'a.pdf'); f.file('source', 'b.pdf'); f.file('source', 'nested/deep.pdf');
    const entries = listSourceDocuments(f.src, { maxEntries: 1 }); assert.equal(entries.complete, false); assert.deepEqual(entries.documents.map(x => x.relativePath), ['a.pdf']);
    const depth = listSourceDocuments(f.src, { maxDepth: 0 }); assert.equal(depth.complete, false); assert.deepEqual(depth.documents.map(x => x.relativePath), ['a.pdf', 'b.pdf']);
  } finally { f.close(); }
});
test('refreshes discovery per invocation and never writes source files', async () => {
  const f = fixture(); try {
    const file = f.file('source', 'policy.txt', 'original bytes'), before = readFileSync(file);
    await showSourceDocuments(f.src, ui()); f.file('refined-source', 'new.txt');
    assert.equal(listSourceDocuments(f.src).documents.length, 2); assert.deepEqual(readFileSync(file), before);
  } finally { f.close(); }
});
test('cancel is inert; a default-editor rejection is reported without retry', async () => {
  const f = fixture(); try {
    f.file('source', 'policy.pdf'); const cancel = ui(async () => undefined); await showSourceDocuments(f.src, cancel); assert.equal(cancel.open.mock.calls.length, 0);
    const failure = ui(); failure.open.mockRejectedValue(Error('Viewer unavailable')); await showSourceDocuments(f.src, failure);
    assert.equal(failure.open.mock.calls.length, 1); assert.match(failure.message.mock.calls[0][0], /Viewer unavailable/);
  } finally { f.close(); }
});
test('a file deleted while the picker is open is not passed to the editor', async () => {
  const f = fixture(); try {
    f.file('source', 'policy.pdf'); const action = ui(async docs => { unlinkSync(docs[0].filePath); return docs[0]; });
    await showSourceDocuments(f.src, action); assert.equal(action.open.mock.calls.length, 0); assert.equal(action.message.mock.calls[0][1], 'warning');
  } finally { f.close(); }
});
test('a selected nested folder swapped to an outside junction is not followed at open time', async () => {
  const f = fixture(); try {
    f.file('source', 'nested/policy.pdf'); const outside = join(f.root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'policy.pdf'), 'different');
    const action = ui(async docs => { renameSync(join(f.src, 'source/nested'), join(f.root, 'original')); f.link(outside, join(f.src, 'source/nested')); return docs[0]; });
    await showSourceDocuments(f.src, action); assert.equal(action.open.mock.calls.length, 0); assert.match(action.message.mock.calls[0][0], /moved outside/);
  } finally { f.close(); }
});

const here = dirname(fileURLToPath(import.meta.url));
const cockpit = ts.createSourceFile('cockpit.ts', readFileSync(join(here, 'correspondenceCockpit.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
let openFunction;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'openPolicySourceDocuments') openFunction = node; ts.forEachChild(node, visit); }
visit(cockpit);
function host(f, pick = async items => items.find(x => x.document)) {
  const messages = [], opens = [], pickers = [];
  const c = vm.createContext({
    mode: 'medical-validation', currentCel: f.file('cel', 'broken.cel', 'invalid CEL syntax'), sourceDocumentsBusy: false,
    findPolicySrc, showSourceDocuments,
    vscode: { QuickPickItemKind: { Separator: -1 }, ViewColumn: { Beside: -2 }, Uri: { file: fsPath => ({ fsPath, scheme: 'file' }) },
      window: { showQuickPick: async (items, options) => { pickers.push([items, options]); return pick(items); }, showInformationMessage: x => messages.push(x), showWarningMessage: x => messages.push(x), setStatusBarMessage: x => messages.push(x) },
      commands: { executeCommand: async (...args) => { opens.push(args); } },
    },
  });
  assert.ok(openFunction); vm.runInContext(transformSync(openFunction.getText(cockpit), { loader: 'ts' }).code, c);
  return { c, messages, opens, pickers };
}
test('actual host adapter uses layout only, groups choices and opens the default editor beside MV without preview', async () => {
  const f = fixture(); try {
    const file = f.file('source', 'policy.txt'); f.file('refined-source', 'policy.txt'); const h = host(f);
    await h.c.openPolicySourceDocuments(); assert.equal(h.opens.length, 1);
    assert.equal(h.opens[0][0], 'vscode.open'); assert.equal(h.opens[0][1].fsPath, realpathSync(file));
    assert.equal(h.opens[0][2].viewColumn, -2); assert.equal(h.opens[0][2].preview, false);
    assert.deepEqual(Array.from(h.pickers[0][0]).filter(x => !x.document).map(x => x.label), ['Source', 'Refined source']); assert.equal(h.c.sourceDocumentsBusy, false);
    assert.deepEqual(Array.from(h.pickers[0][0]).filter(x => x.document).map(x => x.description), ['Source', 'Refined source']);
  } finally { f.close(); }
});
test('host prevents concurrent pickers, accepts cancellation and resets the busy state', async () => {
  const f = fixture(); let complete; try {
    f.file('source', 'policy.txt'); const h = host(f, () => new Promise(resolve => { complete = resolve; }));
    const first = h.c.openPolicySourceDocuments(); await vi.waitFor(() => assert.equal(h.pickers.length, 1));
    await h.c.openPolicySourceDocuments(); assert.equal(h.pickers.length, 1); assert.match(h.messages[0], /open Source documents list/);
    complete(undefined); await first; assert.equal(h.c.sourceDocumentsBusy, false); assert.equal(h.opens.length, 0);
    h.c.mode = 'cockpit'; await h.c.openPolicySourceDocuments(); assert.match(h.messages.at(-1), /Medical Validation/);
  } finally { if (complete) complete(undefined); f.close(); }
});
test('actual toolbar click delegate posts an action without accepting a file path or render token', () => {
  const script = ts.createSourceFile('webview.js', COCKPIT_WEBVIEW_SCRIPT, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); let callback;
  function walk(node) {
    if (ts.isCallExpression(node) && node.expression.getText(script) === 'listen' && node.arguments[0]?.getText(script) === 'fcc' && node.arguments[1]?.text === 'click') callback = node.arguments[2];
    ts.forEachChild(node, walk);
  }
  walk(script); assert.ok(callback);
  let click; const sent = [], fcc = { addEventListener(type, handler) { if (type === 'click') click = handler; } };
  new Function('fcc', 'v', `fcc.addEventListener('click',${callback.getText(script)});`)(fcc, { postMessage: x => sent.push(x) });
  click({ target: { closest(selector) { return selector === '[data-open-source-documents]' ? {} : null; } }, preventDefault() {} });
  assert.deepEqual(sent, [{ type: 'openSourceDocuments' }]);
});

test('source documents command is contributed and registered independently of the tree pane', () => {
  const manifest = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));
  assert.ok(manifest.contributes.commands.some(x => x.command === 'crl.medicalValidation.openSourceDocuments'));
  const source = readFileSync(join(here, 'correspondenceCockpit.ts'), 'utf8');
  assert.match(source, /const sourceDocumentsCmd = vscode.commands.registerCommand\("crl.medicalValidation.openSourceDocuments", \(\) => void openPolicySourceDocuments\(\)\)/);
  assert.match(source, /context.subscriptions.push\([\s\S]*sourceDocumentsCmd,/);
});
