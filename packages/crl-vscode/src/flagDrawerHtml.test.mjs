// #211 create-flag drawer — renderFlagDrawer: structure, tag ordering, per-tag field groups (only the selected visible),
// prefill, and escaping. Post the flag-vocab redesign: the drawer receives ONLY the human MV "Type" tags (a `displayName`),
// the option text IS the displayName, and `kind` is hidden (AI-only). Pure HTML; no vscode.
import assert from "node:assert/strict";

import { renderFlagDrawer } from "./flagDrawerHtml.ts";

// The four MV Types as the host now feeds them (each has a `displayName`; validation-concern still declares `kind`, now hidden).
const TAGS = [
  { id: "narrative-defect", category: "validation", displayName: "CRL vs narrative", fields: [] },
  { id: "validation-concern", category: "validation", displayName: "CRL vs customer intent", fields: [{ key: "kind", required: false, values: ["underspecified", "narrative-error"] }] },
  { id: "tooling-bug", category: "validation", displayName: "Tooling bug", fields: [] },
  { id: "other", category: "validation", displayName: "Other", fields: [] },
];

test("renderFlagDrawer: the shell — data-flag-drawer, tag select, summary, stub, Insert/Cancel/Close", () => {
  const h = renderFlagDrawer({ targetLabel: 'the concept "x"', tags: TAGS });
  assert.match(h, /data-flag-drawer/);
  assert.match(h, /data-flag-tag/);
  assert.match(h, /data-flag-summary/);
  assert.match(h, /data-flag-stub/);
  assert.match(h, /data-flag-insert/);
  assert.match(h, /data-flag-cancel/);
  assert.match(h, /data-flag-close/);
});

test("renderFlagDrawer: the Type <option> text is the human displayName (not the tag id / a category gloss)", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  assert.match(h, /<option value="validation-concern"[^>]*>CRL vs customer intent<\/option>/);
  assert.match(h, /<option value="narrative-defect"[^>]*>CRL vs narrative<\/option>/);
  assert.match(h, /<option value="tooling-bug"[^>]*>Tooling bug<\/option>/);
  // no legacy "@id — category" gloss
  assert.doesNotMatch(h, /@validation-concern/);
  assert.doesNotMatch(h, /CRL vs customer intent<\/option>[\s\S]*extraction — CRL vs narrative/);
});

test("renderFlagDrawer: `kind` is HIDDEN (AI-only) — validation-concern renders NO kind control", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  assert.ok(!h.includes('data-flag-field="kind"'), "kind must not render in the human drawer");
  // its (empty) field group still exists + is visible (validation-concern is the default), just with no field controls
  assert.match(h, /data-flag-field-for="validation-concern">/);
});

test("renderFlagDrawer: validation-concern is floated FIRST in the tag select regardless of input order", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  const opts = [...h.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(opts[0], "validation-concern");
});

test("renderFlagDrawer: one field group per tag; only the selected tag's group is visible", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  // default selected = validation-concern (floated first) → visible; the others start ` hidden>`
  assert.match(h, /data-flag-field-for="validation-concern">/);
  assert.match(h, /data-flag-field-for="narrative-defect" hidden>/);
  assert.match(h, /data-flag-field-for="tooling-bug" hidden>/);
});

test("renderFlagDrawer: a chosen prefill.tag selects that tag + shows ITS group", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS, tag: "tooling-bug" });
  assert.match(h, /<option value="tooling-bug" selected>/);
  assert.match(h, /data-flag-field-for="tooling-bug"(?! hidden)/);
  assert.match(h, /data-flag-field-for="validation-concern" hidden/);
});

test("renderFlagDrawer: prefilled summary/stub are placed", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS, tag: "narrative-defect", summary: "S", stub: "B" });
  assert.match(h, /data-flag-summary value="S"/);
  assert.match(h, /<textarea[^>]*data-flag-stub[^>]*>B<\/textarea>/);
});

test("renderFlagDrawer: the header shows the short label; the full label (signature) is the hover title", () => {
  const h = renderFlagDrawer({ targetLabel: "this condition", targetTitle: "this condition (A/B/C long signature)", tags: TAGS });
  assert.match(h, /<span class="flag-title" title="this condition \(A\/B\/C long signature\)">Add flag — this condition<\/span>/);
});

test("renderFlagDrawer: #210 (disc 239) focus rings ONLY the requested element (summary/description/submit)", () => {
  const desc = renderFlagDrawer({ targetLabel: "t", tags: TAGS, focus: "description" });
  assert.match(desc, /<textarea class="flag-input flag-focus" data-flag-stub/);
  assert.doesNotMatch(desc, /data-flag-summary[^>]*flag-focus|flag-insert flag-focus/);
  const sum = renderFlagDrawer({ targetLabel: "t", tags: TAGS, focus: "summary" });
  assert.match(sum, /<input type="text" class="flag-input flag-focus" data-flag-summary/);
  const sub = renderFlagDrawer({ targetLabel: "t", tags: TAGS, focus: "submit" });
  assert.match(sub, /class="flag-insert flag-focus" data-flag-insert/);
  const none = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  assert.doesNotMatch(none, /flag-focus/);
});

test("renderFlagDrawer: fields never author-input (ref/key/status/system/kind) do NOT render — only genuine discriminators", () => {
  // a synthetic tag exercising the filter directly (a real discriminator + every hidden key incl. kind)
  const tags = [
    {
      id: "x",
      category: "validation",
      displayName: "X",
      fields: [
        { key: "direction", required: true, values: ["over", "under"] },
        { key: "ref", required: false },
        { key: "key", required: false },
        { key: "status", required: false, values: ["open", "resolved"] },
        { key: "system", required: false },
        { key: "kind", required: false, values: ["a", "b"] },
      ],
    },
  ];
  const h = renderFlagDrawer({ targetLabel: "t", tags });
  assert.match(h, /data-flag-field="direction"/); // the genuine discriminator stays
  for (const hm of ["ref", "key", "status", "system", "kind"]) {
    assert.ok(!h.includes(`data-flag-field="${hm}"`), `${hm} is not author-input and must not render`);
  }
});

test("renderFlagDrawer: all interpolated text is escaped (no breakout via label / prefill / displayName)", () => {
  const h = renderFlagDrawer({
    targetLabel: '</span><script>x</script>',
    tags: [{ id: "evil", category: "validation", displayName: "</option><script>y</script>", fields: [] }],
    summary: '"><img>',
    stub: "</textarea><b>",
  });
  assert.ok(!h.includes("<script>x</script>"), "target label escaped");
  assert.ok(!h.includes("<script>y</script>"), "displayName (option text) escaped — no </option> breakout");
  assert.ok(!h.includes('"><img>'), "summary attribute escaped");
  assert.ok(!h.includes("</textarea><b>"), "stub escaped (no textarea breakout)");
  assert.match(h, /&lt;script&gt;/);
});

// ── Todo 3 (disc 358): the EDIT form — same shell, DISTINCT intents + copy so it doesn't hit the create-only handlers ──
test("renderFlagDrawer edit: 'Edit flag —' heading, distinct data-flag-edit-{save,cancel} intents, 'Save changes', neutral placeholder", () => {
  const h = renderFlagDrawer({ targetLabel: "this condition", tags: TAGS, tag: "tooling-bug", summary: "s", stub: "d", edit: true });
  assert.match(h, /Edit flag — this condition/);
  assert.match(h, /flag-edit-drawer/); // the container marker (webview dirty-tracking + gold accent)
  assert.match(h, /data-flag-edit-save/);
  assert.match(h, /data-flag-edit-cancel/); // BOTH Cancel + ✕ carry it
  assert.equal((h.match(/data-flag-edit-cancel/g) || []).length, 2, "Cancel + ✕ both → edit-cancel");
  assert.match(h, />Save changes</);
  // the create-only intents must be ABSENT (dead in edit mode)
  assert.ok(!/data-flag-insert/.test(h), "no create Insert intent");
  assert.ok(!/data-flag-close(?!-)/.test(h) && !/data-flag-cancel(?!-)/.test(h), "no create close/cancel intents");
  assert.ok(!/becomes the GitHub issue body/.test(h), "the create-only placebo is dropped on edit");
  // the selected tag is prefilled + its field group visible (reuses the create field machinery)
  assert.match(h, /<option value="tooling-bug" selected>/);
});
test("renderFlagDrawer create (default): keeps the create intents; no edit markers", () => {
  const h = renderFlagDrawer({ targetLabel: "x", tags: TAGS });
  assert.match(h, /Add flag — x/);
  assert.match(h, /data-flag-insert/);
  assert.ok(!/data-flag-edit-/.test(h) && !/flag-edit-drawer/.test(h), "no edit markers on the create form");
});

console.log("flagDrawerHtml.test: ok");
