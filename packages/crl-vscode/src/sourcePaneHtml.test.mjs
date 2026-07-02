// Unit tests for the Source pane RENDERER (#156 C2a): segmentation + anchors/reveals + XSS. vscode-free.
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { renderSourcePane } = await load("sourcePaneHtml.ts");
const num = (...pairs) => new Map(pairs); // unitId→number map helper

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};
// single-line range helper
const r = (a, b) => ({ startLine: 0, startCol: a, endLine: 0, endCol: b });
const unit = (unitId, a, b) => ({ unitId, range: r(a, b) });
const ov = (kind, a, b) => ({ kind, range: r(a, b) });
// attribute-tolerant: covered segments also carry id/data-reveal between class and >
const hasSpan = (html, cls, text) => new RegExp(`<span[^>]*class="${cls}"[^>]*>${text}</span>`).test(html);

check("a covered unit span → a `covered` segment with a reveal key + an anchor for the unit", () => {
  const out = renderSourcePane("ABCDEFGHIJ", [unit("u1", 0, 6)], []);
  assert.match(out.html, /class="covered"[^>]*data-reveal=/);
  assert.ok(out.anchors.u1, "u1 has an anchor");
  assert.equal(out.anchors.u1.segmentIds.length, 1);
  assert.equal(Object.values(out.reveals).filter((v) => v.unitId === "u1").length, 1);
});

check("partial overlap → three segments (covered, covered+uncovered, uncovered)", () => {
  const out = renderSourcePane("ABCDEFGHIJ", [unit("u1", 0, 6)], [ov("uncovered", 4, 10)]);
  assert.ok(hasSpan(out.html, "covered", "ABCD"), "the [0,4) head is covered only");
  assert.ok(hasSpan(out.html, "covered uncovered", "EF"), "the [4,6) overlap carries both classes");
  assert.ok(hasSpan(out.html, "uncovered", "GHIJ"), "the [6,10) tail is uncovered only");
  // u1 is split across the first two segments → both in its anchor
  assert.equal(out.anchors.u1.segmentIds.length, 2);
});

check("nested overlay inside a unit → covered / covered+ignored / covered", () => {
  const out = renderSourcePane("ABCDEFGHIJ", [unit("u1", 0, 10)], [ov("ignored", 2, 5)]);
  assert.ok(hasSpan(out.html, "covered", "AB"));
  assert.ok(hasSpan(out.html, "covered ignored", "CDE"));
  assert.ok(hasSpan(out.html, "covered", "FGHIJ"));
});

check("adjacent units → two separate covered segments, one anchor each", () => {
  const out = renderSourcePane("ABCDEF", [unit("u1", 0, 3), unit("u2", 3, 6)], []);
  assert.ok(out.anchors.u1 && out.anchors.u2);
  assert.notEqual(out.anchors.u1.scrollTo, out.anchors.u2.scrollTo);
});

check("multi-line: range on line 1 maps via line offsets", () => {
  const text = "line0\nXXXXX"; // line1 starts at offset 6
  const out = renderSourcePane(text, [{ unitId: "u1", range: { startLine: 1, startCol: 0, endLine: 1, endCol: 5 } }], []);
  assert.ok(out.html.includes('class="covered"') && out.html.includes(">XXXXX<"));
  assert.ok(out.html.startsWith("line0\n")); // the line-0 prefix is plain, unescaped passthrough
});

check("XSS: text is escaped", () => {
  const out = renderSourcePane('a<script>"&\'b', [], []);
  assert.ok(!out.html.includes("<script>"));
  assert.ok(out.html.includes("&lt;script&gt;") && out.html.includes("&amp;") && out.html.includes("&quot;"));
});

check("uncovered/ignored overlays have NO reveal key (not clickable units)", () => {
  const out = renderSourcePane("ABCDEF", [], [ov("uncovered", 0, 3), ov("ignored", 3, 6)]);
  assert.equal(Object.keys(out.reveals).length, 0);
  assert.ok(out.html.includes('class="uncovered"') && out.html.includes('class="ignored"'));
});

check("multi-unit overlap → segment in BOTH anchors; reveal first-wins (documented)", () => {
  const out = renderSourcePane("ABCDEFGHIJ", [unit("u1", 0, 6), unit("u2", 3, 10)], []);
  // the [3,6) overlap segment belongs to both units' anchors
  const overlapSegU1 = out.anchors.u1.segmentIds;
  const overlapSegU2 = out.anchors.u2.segmentIds;
  assert.ok(overlapSegU1.some((id) => overlapSegU2.includes(id)), "the overlap segment is in both anchors");
  // both units are reachable as click targets across their non-overlapping segments
  assert.ok(Object.values(out.reveals).some((v) => v.unitId === "u1"));
  assert.ok(Object.values(out.reveals).some((v) => v.unitId === "u2"));
});

check("reveals carry the trusted source range (for open-raw at the clicked locus)", () => {
  const out = renderSourcePane("ABCDEFGHIJ", [unit("u1", 2, 8)], []);
  const v = Object.values(out.reveals)[0];
  assert.deepEqual(v, { unitId: "u1", range: { startLine: 0, startCol: 2, endLine: 0, endCol: 8 } });
});

check("col past line end is clamped to the line (no bleed into the next line)", () => {
  const text = "AB\nCD"; // line 0 = "AB" (offsets 0..2, \n at 2), line 1 starts at 3
  const out = renderSourcePane(text, [{ unitId: "u1", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 99 } }], []);
  // the covered run is clamped to "AB" — line 1's "CD" is not pulled in, and stays a plain (unmarked) run
  assert.ok(hasSpan(out.html, "covered", "AB"));
  assert.ok(!/class="covered"[^>]*>[^<]*CD/.test(out.html), "CD must not be inside a covered span");
  assert.ok(out.html.includes("CD"));
});

check("revealPrefix namespaces segment + reveal keys (per-render generation safety)", () => {
  const out = renderSourcePane("ABC", [unit("u1", 0, 3)], [], { revealPrefix: "7:" });
  assert.ok(Object.keys(out.reveals).every((k) => k.startsWith("7:")));
  assert.ok(out.anchors.u1.scrollTo.startsWith("7:"));
});

// --- #163-2 at-rest source badge ---

check("showKeys + unitNumber → an inline key badge before the covered span; off → none", () => {
  const on = renderSourcePane("ABCDEFGHIJ", [unit("u1", 0, 6)], [], { unitNumber: num(["u1", 3]), showKeys: true });
  assert.match(on.html, /<span class="corr-key"[^>]*><span class="corr-sw [^"]*"><\/span><span class="corr-num">3<\/span><\/span><span [^>]*class="covered"/);
  const off = renderSourcePane("ABCDEFGHIJ", [unit("u1", 0, 6)], [], { unitNumber: num(["u1", 3]), showKeys: false });
  assert.ok(!off.html.includes("corr-key"), "showKeys off → no badge");
});

check("badge DEDUPED across same-membership adjacent runs (nested overlay → one badge, not three)", () => {
  // u1 covers [0,9); an ignored overlay [3,6) splits it into covered/covered+ignored/covered — all unit {u1}
  const out = renderSourcePane("ABCDEFGHI", [unit("u1", 0, 9)], [ov("ignored", 3, 6)], { unitNumber: num(["u1", 1]), showKeys: true });
  assert.equal((out.html.match(/corr-key/g) || []).length, 1, "one badge for the continuous same-unit run");
});

check("badge RE-SHOWS after an uncovered gap between two runs of the same unit", () => {
  // u1 covers [0,3) and [6,9); [3,6) is a plain gap → the second run re-badges
  const out = renderSourcePane("ABCDEFGHI", [unit("u1", 0, 3), unit("u1", 6, 9)], [], { unitNumber: num(["u1", 2]), showKeys: true });
  assert.equal((out.html.match(/corr-key/g) || []).length, 2, "badge re-appears after the gap");
});

check("leading whitespace → badge placed AFTER the indentation (not before)", () => {
  const out = renderSourcePane("   word", [unit("u1", 0, 7)], [], { unitNumber: num(["u1", 5]), showKeys: true });
  assert.match(out.html, /^ {3}<span class="corr-key"/, "3 spaces, then the badge, then the covered span");
});

check("badge RE-SHOWS after an UNCOVERED-overlay gap (not just a plain gap) between same-unit runs", () => {
  // u1 [0,2) + uncovered [2,4) + u1 [4,6): the uncovered-only middle run is a visual gap → the second run re-badges
  const out = renderSourcePane("ABCDEF", [unit("u1", 0, 2), unit("u1", 4, 6)], [ov("uncovered", 2, 4)], { unitNumber: num(["u1", 1]), showKeys: true });
  assert.equal((out.html.match(/corr-key/g) || []).length, 2, "uncovered overlay gap re-shows the badge");
});

check("a unit split only by INTERNAL whitespace shows ONE badge (whitespace run is transparent)", () => {
  // u1 covers "A B"; an ignored overlay on the space splits it into "A" / " " / "B" — all u1 → one badge
  const out = renderSourcePane("A B", [unit("u1", 0, 3)], [ov("ignored", 1, 2)], { unitNumber: num(["u1", 1]), showKeys: true });
  assert.equal((out.html.match(/corr-key/g) || []).length, 1, "internal whitespace does not re-badge a continuous unit");
});

check("multi-unit covered run → sorted numbers in the badge", () => {
  const out = renderSourcePane("ABCDEF", [unit("u1", 0, 6), unit("u2", 0, 6)], [], { unitNumber: num(["u1", 7], ["u2", 3]), showKeys: true });
  assert.ok(out.html.includes('<span class="corr-num">3,7</span>'), "sorted ascending regardless of unit order");
});

console.log(`\nsourcePaneHtml.test: ${pass} checks passed`);
