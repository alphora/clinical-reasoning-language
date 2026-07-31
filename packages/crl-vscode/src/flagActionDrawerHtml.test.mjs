// Flag-ACTION drawer — renderFlagActionDrawer: the read-only view shell, the full field render (Type/Origin/Status/Target/
// Summary/Description/extra fields/Ref/timestamps), the status-toggle + open-issue affordances, and escaping. Pure HTML; no vscode.
import assert from "node:assert/strict";

import { renderFlagActionDrawer } from "./flagActionDrawerHtml.ts";

/** A representative OPEN validation flag with an occurrence signature, an extra `kind` field, and a numeric issue ref. */
const OPEN_VIEW = {
  typeLabel: "CRL vs customer intent",
  category: "validation",
  status: "open",
  targetLabel: "this condition",
  targetTitle: "this condition (A/B/C signature)",
  anchorAddress: 'decision:D "Lib"',
  occurrenceSignature: "guard→activity",
  summary: "the age gate is inverted",
  description: "line one\nline two",
  fields: [{ key: "kind", value: "intent-divergence" }],
  issueRef: "#42",
  issueNo: 42,
  createdAt: "2026-07-31T10:00:00.000Z",
  editedAt: "2026-07-31T11:00:00.000Z",
};

test("renderFlagActionDrawer: the shell — data-flag-action-drawer + distinct action intents (NOT the create drawer's)", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /data-flag-action-drawer/);
  assert.match(h, /data-flag-action-close/);
  assert.match(h, /data-flag-action-toggle/);
  assert.match(h, /data-flag-action-issue/);
  // it reuses the shared .flag-drawer chrome (so the flow-zoom-hide + right-flyout layout apply)
  assert.match(h, /class="flag-drawer flag-action-drawer"/);
  // it must NOT carry the create drawer's intents (they'd collide in the shared #flagDrawer region listener)
  for (const create of ["data-flag-insert", "data-flag-cancel", 'data-flag-close"', "data-flag-tag", "data-flag-summary", "data-flag-stub"]) {
    assert.ok(!h.includes(create), `${create} must not appear in the action drawer`);
  }
});

test("renderFlagActionDrawer: renders the full record — Type, Origin, Status, Target(+signature), Summary, Description, extra fields, Ref, timestamps", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /CRL vs customer intent/); // Type
  assert.match(h, />Origin<\/span><span class="fa-val[^"]*">validation</); // category/provenance
  assert.match(h, /fa-status fa-status-open">open</);
  assert.match(h, /this condition/); // target label
  assert.match(h, /decision:D &quot;Lib&quot;/); // anchor address (escaped quotes)
  assert.match(h, /guard→activity/); // occurrence signature
  assert.match(h, /the age gate is inverted/); // summary
  assert.match(h, /line one\nline two/); // multiline description preserved (fa-pre → pre-wrap)
  assert.match(h, />kind<\/span><span class="fa-val[^"]*">intent-divergence</); // extra field
  assert.match(h, />Ref<\/span><span class="fa-val[^"]*">#42</);
  assert.match(h, /2026-07-31T10:00:00\.000Z/); // created
  assert.match(h, />Edited<\/span>/); // edited row present when editedAt set
});

test("renderFlagActionDrawer: OPEN flag → the primary Resolve button; RESOLVED → a Reopen button (no primary)", () => {
  const open = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(open, /class="fa-btn fa-toggle fa-primary" data-flag-action-toggle>✓ Resolve flag</);
  const resolved = renderFlagActionDrawer({ ...OPEN_VIEW, status: "resolved" });
  assert.match(resolved, /class="fa-btn fa-toggle" data-flag-action-toggle>↻ Reopen flag</);
  assert.ok(!resolved.includes("fa-primary"), "a resolved flag's toggle is not the primary action");
});

test("renderFlagActionDrawer: the Open-issue button appears ONLY with a numeric issueNo", () => {
  assert.match(renderFlagActionDrawer(OPEN_VIEW), /data-flag-action-issue>↗ Open issue #42</);
  const noNumeric = renderFlagActionDrawer({ ...OPEN_VIEW, issueNo: undefined, issueRef: "see PR" });
  assert.ok(!noNumeric.includes("data-flag-action-issue"), "no numeric ref → no open-issue affordance");
  assert.match(noNumeric, />Ref<\/span><span class="fa-val[^"]*">see PR</); // …but the raw ref still shows, legibly
});

test("renderFlagActionDrawer: absent optional data (no signature / description / editedAt / ref) renders em dashes, no Edited row, no issue button", () => {
  const min = renderFlagActionDrawer({
    typeLabel: "fidelity-defect", // an extraction tag with no displayName → the host passes the raw tag id
    category: "extraction",
    status: "open",
    targetLabel: 'the concept "x"',
    anchorAddress: "concept:x",
    summary: "",
    fields: [],
    createdAt: "2026-07-31T10:00:00.000Z",
  });
  assert.match(min, /fidelity-defect/); // raw-tag fallback rendered as Type
  assert.match(min, /fa-status-open/);
  assert.ok(!min.includes("guard→"), "no occurrence signature");
  assert.ok(!min.includes(">Edited<"), "no Edited row when editedAt absent");
  assert.ok(!min.includes("data-flag-action-issue"), "no issue button when no ref");
  assert.match(min, /class="fa-em">—<\/span>/); // summary/description/ref rendered as em dashes
});

test("renderFlagActionDrawer: all interpolated text is escaped (label / address / summary / description / field / ref)", () => {
  const h = renderFlagActionDrawer({
    typeLabel: "<script>t</script>",
    category: "<b>x</b>",
    status: "open",
    targetLabel: "</span><script>a</script>",
    anchorAddress: '"><img>',
    occurrenceSignature: "</span><i>s</i>",
    summary: "<script>b</script>",
    description: "</span><script>c</script>",
    fields: [{ key: "<u>k</u>", value: "</span><script>v</script>" }],
    issueRef: "<script>r</script>",
    createdAt: "<x>",
  });
  for (const raw of ["<script>t</script>", "<script>a</script>", '"><img>', "<i>s</i>", "<script>b</script>", "<script>c</script>", "<u>k</u>", "<script>v</script>", "<script>r</script>"]) {
    assert.ok(!h.includes(raw), `must escape: ${raw}`);
  }
  assert.match(h, /&lt;script&gt;/);
});

console.log("flagActionDrawerHtml.test: ok");
