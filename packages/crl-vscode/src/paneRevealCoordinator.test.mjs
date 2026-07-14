// Unit tests for the PaneRevealCoordinator (#156 C2a) — the reveal state machine. vscode-free → imported directly (vitest transforms the .ts).
import assert from "node:assert/strict";

import { PaneRevealCoordinator } from "./paneRevealCoordinator.ts";

const check = test;
const T = (id) => ({ kind: "unit", id });

check("reveal queued before the first render flushes when the render readies", () => {
  const c = new PaneRevealCoordinator();
  c.queueReveal("source", T("u1"), 1); // before any startRender
  const gen = c.startRender("source");
  assert.deepEqual(c.ready("source", gen, 1), T("u1"));
});

check("a superseded render's ack is dropped (stale gen)", () => {
  const c = new PaneRevealCoordinator();
  const g1 = c.startRender("source");
  c.queueReveal("source", T("u1"), 1);
  c.startRender("source"); // g2 supersedes
  assert.equal(c.ready("source", g1, 1), undefined); // old render acks → dropped
});

check("independent single-pane rebuild lands the reveal at the new gen", () => {
  const c = new PaneRevealCoordinator();
  c.startRender("source");
  c.queueReveal("source", T("u2"), 1);
  const g2 = c.startRender("source"); // rebuild
  assert.deepEqual(c.ready("source", g2, 1), T("u2"));
});

check("indexVersion skew: a render NEWER than the queued reveal drops the stale pending (no flush)", () => {
  const c = new PaneRevealCoordinator();
  const gen = c.startRender("source");
  c.queueReveal("source", T("u1"), 1); // pending @ v1
  assert.equal(c.ready("source", gen, 2), undefined); // render reports v2 → v1 pending is stale → dropped
  // and it really was dropped (a later v1 ack finds nothing)
  assert.equal(c.ready("source", gen, 1), undefined);
});

check("old-render ack after setInputs+re-queue is ignored; the new render flushes", () => {
  const c = new PaneRevealCoordinator();
  const g1 = c.startRender("source"); // v1 render
  c.queueReveal("source", T("u1"), 1);
  // setInputs → v2: shell clears + re-queues + re-renders
  c.clearPending("source");
  c.queueReveal("source", T("u2"), 2);
  const g2 = c.startRender("source");
  assert.equal(c.ready("source", g1, 1), undefined); // old v1 render finishing → superseded
  assert.deepEqual(c.ready("source", g2, 2), T("u2")); // new v2 render flushes
});

check("queueReveal replaces (latest only — no stale backlog)", () => {
  const c = new PaneRevealCoordinator();
  const gen = c.startRender("source");
  c.queueReveal("source", T("a"), 1);
  c.queueReveal("source", T("b"), 1); // replaces a
  assert.deepEqual(c.ready("source", gen, 1), T("b"));
});

check("placeholder pane: no-op reveal, never accumulates a queue", () => {
  const c = new PaneRevealCoordinator();
  c.setPaneCapability("crl", "placeholder");
  const gen = c.startRender("crl");
  c.queueReveal("crl", T("u1"), 1); // ignored
  assert.equal(c.ready("crl", gen, 1), undefined);
});

check("clearPending empties the slot; disposePane resets the pane", () => {
  const c = new PaneRevealCoordinator();
  const gen = c.startRender("source");
  c.queueReveal("source", T("u1"), 1);
  c.clearPending("source");
  assert.equal(c.ready("source", gen, 1), undefined);
  c.disposePane("source"); // gen counter resets
  assert.equal(c.startRender("source"), 1);
});

