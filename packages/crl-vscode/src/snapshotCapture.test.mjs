// #(tree-snapshot) Todo 2 — the vscode-free capture coordinator + string helpers. The failure-prone settlement logic is
// tested directly here (the cockpit owns only the postMessage/fs glue).
import assert from "node:assert/strict";

import { SnapshotCapture, screenCapturedDom, snapshotFileName, SNAPSHOT_MAX_BYTES } from "./snapshotCapture.ts";

test("SnapshotCapture: a matching-token reply resolves the capture exactly once", async () => {
  const c = new SnapshotCapture();
  const p = c.begin("tok-1");
  assert.equal(c.pending, true);
  assert.equal(c.resolve("tok-1", "<svg/>"), true, "settled the pending capture");
  assert.equal(await p, "<svg/>");
  assert.equal(c.pending, false, "cleared after settle");
});

test("SnapshotCapture: single-flight — a second begin while pending throws", () => {
  const c = new SnapshotCapture();
  c.begin("tok-1");
  assert.throws(() => c.begin("tok-2"), /already in progress/);
});

test("SnapshotCapture: a STALE or LATE reply (wrong token, or after settle) is ignored — never double-settles", async () => {
  const c = new SnapshotCapture();
  const p = c.begin("tok-1");
  assert.equal(c.resolve("tok-OTHER", "x"), false, "wrong token ignored");
  c.resolve("tok-1", "real");
  assert.equal(await p, "real");
  assert.equal(c.resolve("tok-1", "late"), false, "a late reply after settle is ignored (capture idle)");
});

test("SnapshotCapture: settleEmpty (timeout/abort) resolves undefined; idle settleEmpty is a no-op", async () => {
  const c = new SnapshotCapture();
  const p = c.begin("tok-1");
  c.settleEmpty();
  assert.equal(await p, undefined, "timeout/abort → undefined");
  assert.equal(c.pending, false);
  assert.doesNotThrow(() => c.settleEmpty(), "idle settleEmpty no-ops");
  // after a settleEmpty, a matching-token reply is inert (the token was cleared)
  assert.equal(c.resolve("tok-1", "late"), false);
});

test("SnapshotCapture: begin again works after a settled capture", async () => {
  const c = new SnapshotCapture();
  await (c.begin("a"), c.resolve("a", "one"), Promise.resolve());
  const p = c.begin("b");
  c.resolve("b", "two");
  assert.equal(await p, "two");
});

test("screenCapturedDom: accepts our renderer output; rejects non-string / oversized / active content (incl. the malformed-tag bypasses)", () => {
  assert.deepEqual(screenCapturedDom(`<div class="flow-wrap"><svg class="flow-svg"><g class="flow-row"/></svg></div>`), {
    ok: true,
    html: `<div class="flow-wrap"><svg class="flow-svg"><g class="flow-row"/></svg></div>`,
  });
  assert.equal(screenCapturedDom(undefined).ok, false, "non-string rejected");
  assert.equal(screenCapturedDom(42).ok, false, "non-string rejected");
  assert.equal(screenCapturedDom("x".repeat(SNAPSHOT_MAX_BYTES + 1)).ok, false, "oversized rejected (byte-accurate)");
  assert.equal(screenCapturedDom(`<svg><script>alert(1)</script></svg>`).ok, false, "<script rejected");
  assert.equal(screenCapturedDom(`<svg><script/x>evil()</script></svg>`).ok, false, "<script/x> (slash-separated) rejected — the disc-324 bypass");
  assert.equal(screenCapturedDom(`<iframe srcdoc="&lt;script&gt;evil()&lt;/script&gt;"></iframe>`).ok, false, "<iframe srcdoc rejected");
  assert.equal(screenCapturedDom(`<a href="javascript:alert(1)">x</a>`).ok, false, "<a (a javascript-url carrier) rejected");
  assert.equal(screenCapturedDom(`<foreignObject><body>x</body></foreignObject>`).ok, false, "<foreignObject rejected");
  assert.equal(screenCapturedDom(`<g onclick="x()"/>`).ok, false, "quoted on-handler rejected");
  assert.equal(screenCapturedDom(`<svg/onload="x()">`).ok, false, "<svg/onload= (no space before the handler) rejected — the disc-324 bypass");
  // text-node false-positives must NOT trip: escaped label text never contains a literal `<`, and the on-handler check needs a QUOTE.
  assert.equal(screenCapturedDom(`<g class="one-node"/>`).ok, true, "a class like 'one-node' is fine");
  assert.equal(screenCapturedDom(`<text>monitor ongoing = yes</text>`).ok, true, "clinical text 'ongoing = yes' (unquoted) does NOT trip the on-handler check");
  assert.equal(screenCapturedDom(`<text>oncology status</text>`).ok, true, "a word starting 'on' in text is fine");
});

test("snapshotFileName: sanitizes + falls back, never emits a bare '-tree.html'", () => {
  assert.equal(snapshotFileName("sur716-011"), "sur716-011-tree.html");
  assert.equal(snapshotFileName("SUR705.030"), "SUR705.030-tree.html");
  assert.equal(snapshotFileName("a/b c:d"), "a-b-c-d-tree.html", "unsafe chars → single dashes");
  assert.equal(snapshotFileName(undefined), "decision-tree.html", "no id → fallback");
  assert.equal(snapshotFileName("///"), "decision-tree.html", "degenerate id → fallback (never '-tree.html')");
});
