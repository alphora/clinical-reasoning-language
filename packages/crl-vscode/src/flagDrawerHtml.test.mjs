// #211 create-flag drawer — renderFlagDrawer: structure, tag ordering, per-tag field groups (only the selected visible),
// prefill, and escaping. Pure HTML; no vscode.
import assert from "node:assert/strict";

import { renderFlagDrawer } from "./flagDrawerHtml.ts";

const TAGS = [
  { id: "fidelity-defect", category: "extraction", fields: [{ key: "direction", required: true, values: ["over", "under"] }] },
  { id: "validation-concern", category: "validation", fields: [{ key: "kind", required: false, values: ["underspecified", "narrative-error"] }] },
  { id: "open-fork", category: "extraction", fields: [] },
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

test("renderFlagDrawer: validation-concern is floated FIRST in the tag select regardless of input order", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  const opts = [...h.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  // the FIRST tag <option> is validation-concern (field-group options like enum values come later / are in groups)
  assert.equal(opts[0], "validation-concern");
});

test("renderFlagDrawer: one field group per tag; only the selected tag's group is visible", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  // default selected = validation-concern (floated first) → its group's div closes immediately (visible); others ` hidden>`
  assert.match(h, /data-flag-field-for="validation-concern">/);
  assert.match(h, /data-flag-field-for="fidelity-defect" hidden>/);
  // fidelity-defect's required enum renders a <select> with its values
  assert.match(h, /data-flag-field="direction"/);
  assert.match(h, /<option value="over"/);
});

test("renderFlagDrawer: a chosen prefill.tag selects that tag + shows ITS group", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS, tag: "fidelity-defect" });
  assert.match(h, /<option value="fidelity-defect" selected>/);
  assert.match(h, /data-flag-field-for="fidelity-defect"(?! hidden)/);
  assert.match(h, /data-flag-field-for="validation-concern" hidden/);
});

test("renderFlagDrawer: prefilled summary/stub/field values are placed (and selected in an enum)", () => {
  const h = renderFlagDrawer({ targetLabel: "t", tags: TAGS, tag: "fidelity-defect", summary: "S", stub: "B", fields: { direction: "under" } });
  assert.match(h, /data-flag-summary value="S"/);
  assert.match(h, /<textarea[^>]*data-flag-stub[^>]*>B<\/textarea>/);
  assert.match(h, /<option value="under" selected>/);
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
  // no focus → no ring anywhere (the human right-click path)
  const none = renderFlagDrawer({ targetLabel: "t", tags: TAGS });
  assert.doesNotMatch(none, /flag-focus/);
});

test("renderFlagDrawer: host-managed fields (ref/key/status/system) are NOT rendered — only real discriminators", () => {
  const tags = [
    {
      id: "x",
      category: "extraction",
      fields: [
        { key: "direction", required: true, values: ["over", "under"] },
        { key: "ref", required: false },
        { key: "key", required: false },
        { key: "status", required: false, values: ["open", "resolved"] },
        { key: "system", required: false },
      ],
    },
  ];
  const h = renderFlagDrawer({ targetLabel: "t", tags });
  assert.match(h, /data-flag-field="direction"/); // the genuine discriminator stays
  for (const hm of ["ref", "key", "status", "system"]) {
    assert.ok(!h.includes(`data-flag-field="${hm}"`), `${hm} is host-managed and must not render as an input`);
  }
});

test("renderFlagDrawer: all interpolated text is escaped (no breakout via label / prefill)", () => {
  const h = renderFlagDrawer({ targetLabel: '</span><script>x</script>', tags: TAGS, summary: '"><img>', stub: "</textarea><b>" });
  assert.ok(!h.includes("<script>x</script>"), "target label escaped");
  assert.ok(!h.includes('"><img>'), "summary attribute escaped");
  assert.ok(!h.includes("</textarea><b>"), "stub escaped (no textarea breakout)");
  assert.match(h, /&lt;script&gt;/);
});

console.log("flagDrawerHtml.test: ok");
