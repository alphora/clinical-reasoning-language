// #211 create-flag drawer — renderFlagDrawer: structure, tag ordering, per-tag field groups (only the selected visible),
// prefill, and escaping. Pure HTML; no vscode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { renderFlagDrawer } = await load("flagDrawerHtml.ts");

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
  assert.match(h, /<textarea data-flag-stub[^>]*>B<\/textarea>/);
  assert.match(h, /<option value="under" selected>/);
});

test("renderFlagDrawer: all interpolated text is escaped (no breakout via label / prefill)", () => {
  const h = renderFlagDrawer({ targetLabel: '</span><script>x</script>', tags: TAGS, summary: '"><img>', stub: "</textarea><b>" });
  assert.ok(!h.includes("<script>x</script>"), "target label escaped");
  assert.ok(!h.includes('"><img>'), "summary attribute escaped");
  assert.ok(!h.includes("</textarea><b>"), "stub escaped (no textarea breakout)");
  assert.match(h, /&lt;script&gt;/);
});

console.log("flagDrawerHtml.test: ok");
