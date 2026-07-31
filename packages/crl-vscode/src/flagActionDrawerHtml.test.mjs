// Flag-ACTION drawer — renderFlagActionDrawer: the read-only view. Post disc-359: the HEADER is the summary (not the long
// target label); Target + id live in a collapsible Details (auto-opened + noted when the target isn't in the current tree).
// Pure HTML; no vscode.
import assert from "node:assert/strict";

import { renderFlagActionDrawer } from "./flagActionDrawerHtml.ts";

/** A representative OPEN validation flag with an occurrence signature, an extra `kind` field, a numeric issue ref, a present target. */
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
  id: "flag-abc123",
  targetPresent: true,
  descriptionOnly: false,
};

test("renderFlagActionDrawer: the shell — data-flag-action-drawer + distinct action intents (NOT the create drawer's)", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /data-flag-action-drawer/);
  assert.match(h, /data-flag-action-close/);
  assert.match(h, /data-flag-action-toggle/);
  assert.match(h, /data-flag-action-issue/);
  assert.match(h, /class="flag-drawer flag-action-drawer"/);
  for (const create of ["data-flag-insert", "data-flag-cancel", 'data-flag-close"', "data-flag-tag", "data-flag-summary", "data-flag-stub"]) {
    assert.ok(!h.includes(create), `${create} must not appear in the action drawer`);
  }
});

test("renderFlagActionDrawer: the HEADER is the summary (disc 359), not the target label; no separate Summary/Target rows in the body", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /<span class="flag-title" title="the age gate is inverted">Flag — the age gate is inverted<\/span>/);
  // the old header (target label) is gone from the header; the target label now only appears inside Details
  assert.ok(!/Flag — this condition/.test(h), "header must be the summary, not the target label");
  assert.ok(!/>Summary<\/span>/.test(h), "no standalone Summary row (it's the header now)");
  // the Target row is INSIDE <details>, not a top-level body row
  const body = h.slice(h.indexOf('class="fa-body"'), h.indexOf("fa-details"));
  assert.ok(!/>Target<\/span>/.test(body), "Target is not a top-level body row — it's in Details");
});

test("renderFlagActionDrawer: empty gist → the header falls back to the Type (never a bare 'Flag —')", () => {
  const h = renderFlagActionDrawer({ ...OPEN_VIEW, summary: "" });
  assert.match(h, /Flag — CRL vs customer intent</);
});

test("renderFlagActionDrawer: the visible body rows — Type, Origin, Status, Description, extra fields, Ref, timestamps", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, />Type<\/span><span class="fa-val[^"]*">CRL vs customer intent</);
  assert.match(h, />Origin<\/span><span class="fa-val[^"]*">validation</);
  assert.match(h, /fa-status fa-status-open">open</);
  assert.match(h, /line one\nline two/); // multiline description preserved (fa-pre → pre-wrap)
  assert.match(h, />kind<\/span><span class="fa-val[^"]*">intent-divergence</);
  assert.match(h, />Ref<\/span><span class="fa-val[^"]*">#42</);
  assert.match(h, /2026-07-31T10:00:00\.000Z/); // created
  assert.match(h, />Edited<\/span>/);
});

test("renderFlagActionDrawer: Target + id live in a Details (collapsed when the target IS present)", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /<details class="fa-details"><summary>Details<\/summary>/); // collapsed (no `open` attr) when present
  const details = h.slice(h.indexOf("fa-details"));
  assert.match(details, />Target<\/span>/);
  assert.match(details, /this condition/); // the label
  assert.match(details, /decision:D &quot;Lib&quot;/); // escaped anchor address
  assert.match(details, /guard→activity/); // occurrence signature
  assert.match(details, />Id<\/span><span class="fa-val[^"]*">flag-abc123</);
  assert.ok(!details.includes("fa-note"), "no missing-target note when the target is present");
});

test("renderFlagActionDrawer: target NOT present → Details AUTO-OPENS + a note (disc 359 zero-placement)", () => {
  const h = renderFlagActionDrawer({ ...OPEN_VIEW, targetPresent: false });
  assert.match(h, /<details class="fa-details" open><summary>Details<\/summary>/); // auto-opened
  assert.match(h, /fa-note">This flag's target isn't drawn in the current tree/);
});

test("renderFlagActionDrawer: OPEN → primary Resolve; RESOLVED → Reopen (no primary); Open-issue only with a numeric issueNo", () => {
  const open = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(open, /class="fa-btn fa-toggle fa-primary" data-flag-action-toggle>✓ Resolve flag</);
  assert.match(open, /data-flag-action-issue>↗ Open issue #42</);
  const resolved = renderFlagActionDrawer({ ...OPEN_VIEW, status: "resolved" });
  assert.match(resolved, /class="fa-btn fa-toggle" data-flag-action-toggle>↻ Reopen flag</);
  assert.ok(!resolved.includes("fa-primary"));
  const noNumeric = renderFlagActionDrawer({ ...OPEN_VIEW, issueNo: undefined, issueRef: "see PR" });
  assert.ok(!noNumeric.includes("data-flag-action-issue"));
  assert.match(noNumeric, />Ref<\/span><span class="fa-val[^"]*">see PR</);
});

test("renderFlagActionDrawer: absent optional data (no signature / description / editedAt / ref) → those ROWS omitted, no issue button", () => {
  const min = renderFlagActionDrawer({
    typeLabel: "fidelity-defect",
    category: "extraction",
    status: "open",
    targetLabel: 'the concept "x"',
    anchorAddress: "concept:x",
    summary: "",
    fields: [],
    createdAt: "2026-07-31T10:00:00.000Z",
    id: "f1",
    targetPresent: true,
    descriptionOnly: true, // an extraction flag (fidelity-defect) → "Edit description"
  });
  assert.match(min, /Flag — fidelity-defect</); // empty gist → Type in the header
  assert.match(min, /fa-status-open/);
  assert.ok(!min.includes("guard→"), "no occurrence signature");
  assert.ok(!min.includes(">Edited<"), "no Edited row when editedAt absent");
  assert.ok(!min.includes("data-flag-action-issue"), "no issue button when no ref");
  // operator: Description is ALWAYS shown (em-dash when empty — it's human-editable); Ref is omitted when empty (not editable)
  assert.match(min, />Description<\/span><span class="fa-val fa-pre"><span class="fa-em">—/); // Description row present, em-dash value
  assert.ok(!min.includes(">Ref<"), "no Ref row when ref absent");
});

test("renderFlagActionDrawer: all interpolated text is escaped (header / address / description / field / ref / id)", () => {
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
    id: "</details><script>id</script>",
    targetPresent: true,
    descriptionOnly: false,
  });
  for (const raw of ["<script>t</script>", "<script>a</script>", '"><img>', "<i>s</i>", "<script>b</script>", "<script>c</script>", "<u>k</u>", "<script>v</script>", "<script>r</script>", "<script>id</script>"]) {
    assert.ok(!h.includes(raw), `must escape: ${raw}`);
  }
  assert.match(h, /&lt;script&gt;/);
});

// ── Todo 3.5 (operator): Edit is offered for EVERY flag — "Edit flag" (human MV Type) vs "Edit description" (AI/extraction) ──
test("edit button: always rendered; label 'Edit flag' for a human Type, 'Edit description' for an AI/extraction flag", () => {
  const human = renderFlagActionDrawer(OPEN_VIEW); // descriptionOnly:false
  assert.match(human, /data-flag-action-edit/);
  assert.match(human, /Edit flag/);
  const ai = renderFlagActionDrawer({ ...OPEN_VIEW, descriptionOnly: true });
  assert.match(ai, /data-flag-action-edit/); // still editable (description only)
  assert.match(ai, /Edit description/);
  assert.ok(!/Edit flag/.test(ai), "an AI flag says 'Edit description', not 'Edit flag'");
});
test("delete button (Todo 4): always rendered with data-flag-action-delete, destructive styling, for every flag", () => {
  const human = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(human, /data-flag-action-delete/);
  assert.match(human, /fa-danger/);
  assert.match(human, /Delete flag/);
  const ai = renderFlagActionDrawer({ ...OPEN_VIEW, descriptionOnly: true });
  assert.match(ai, /data-flag-action-delete/); // offered for an AI flag too
});
test("description row: ALWAYS shown (operator — human-editable on AI flags), em-dash when empty; Ref omitted when empty", () => {
  const noDesc = renderFlagActionDrawer({ ...OPEN_VIEW, description: undefined });
  assert.match(noDesc, />Description<\/span><span class="fa-val fa-pre"><span class="fa-em">—/); // Description row present with em-dash
  const noRef = renderFlagActionDrawer({ ...OPEN_VIEW, issueRef: undefined, issueNo: undefined });
  assert.ok(!/>Ref</.test(noRef), "no Ref row when ref absent");
});

console.log("flagActionDrawerHtml.test: ok");
