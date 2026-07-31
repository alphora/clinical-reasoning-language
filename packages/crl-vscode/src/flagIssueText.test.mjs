// flag→issue title/body composition — the issue is self-describing on GitHub's side (prefixed with the artifact id +
// a body header naming the artifact/target), degrading cleanly when the policy id can't be resolved.
import assert from "node:assert/strict";

import { flagIssueBody, flagIssueTitle, replaceIssueTypeLine } from "./flagIssueText.ts";

const T = { kind: "decision", name: "Meets criteria", label: 'decision "Meets criteria"' };

test("flagIssueTitle: prefixes the artifact id with ' - '", () => {
  assert.equal(flagIssueTitle("sur716-011", "BMI threshold looks wrong"), "sur716-011 - BMI threshold looks wrong");
});

test("flagIssueTitle: no policy id → bare summary, never a stray leading ' - '", () => {
  assert.equal(flagIssueTitle(undefined, "BMI threshold looks wrong"), "BMI threshold looks wrong");
  assert.equal(flagIssueTitle("", "BMI threshold looks wrong"), "BMI threshold looks wrong");
});

test("flagIssueTitle: trims the summary", () => {
  assert.equal(flagIssueTitle("rx501-147", "  spacing  "), "rx501-147 - spacing");
});

test("flagIssueTitle: clamps to 256 chars (prefix preserved, summary tail ellipsized) so the prefix can't force a GitHub 422", () => {
  const long = "x".repeat(400);
  const out = flagIssueTitle("sur716-011", long);
  assert.equal(out.length, 256);
  assert.ok(out.startsWith("sur716-011 - x"), "prefix preserved");
  assert.ok(out.endsWith("…"), "summary tail ellipsized");
  // A title that already fits is untouched (no ellipsis).
  assert.equal(flagIssueTitle("sur716-011", "short"), "sur716-011 - short");
});

test("flagIssueBody: header names the artifact + target, then the stub", () => {
  const b = flagIssueBody("sur716-011", T, "The encoded threshold is 35 but policy says 40.");
  assert.equal(b, '**Artifact:** `sur716-011` · decision "Meets criteria"\n\nThe encoded threshold is 35 but policy says 40.');
});

test("flagIssueBody: a Type name adds a `**Type:**` line under the artifact (so the issue is triageable without a label)", () => {
  const b = flagIssueBody("sur716-011", T, "note", "CRL vs narrative");
  assert.equal(b, '**Artifact:** `sur716-011` · decision "Meets criteria"\n**Type:** CRL vs narrative\n\nnote');
  // empty stub → header (with the Type line) alone
  assert.equal(flagIssueBody("sur716-011", T, "", "Tooling bug"), '**Artifact:** `sur716-011` · decision "Meets criteria"\n**Type:** Tooling bug');
  // no Type name (an unlabeled/unknown tag) → no Type line (unchanged shape)
  assert.equal(flagIssueBody("sur716-011", T, "note"), '**Artifact:** `sur716-011` · decision "Meets criteria"\n\nnote');
});

test("flagIssueBody: empty stub → header alone (body was empty before)", () => {
  assert.equal(flagIssueBody("sur716-011", T, ""), '**Artifact:** `sur716-011` · decision "Meets criteria"');
  assert.equal(flagIssueBody("sur716-011", T, "   "), '**Artifact:** `sur716-011` · decision "Meets criteria"');
});

test("flagIssueBody: no policy id → target descriptor only (no Artifact label)", () => {
  assert.equal(flagIssueBody(undefined, T, "note"), 'decision "Meets criteria"\n\nnote');
});

test("flagIssueBody: no label → falls back to `<kind> \"<name>\"`", () => {
  const b = flagIssueBody("med201-014", { kind: "concept", name: "BMI Qualifies" }, "");
  assert.equal(b, '**Artifact:** `med201-014` · concept "BMI Qualifies"');
});

test("flagIssueBody: whitespace-only label is treated as absent (falls back to kind/name)", () => {
  const b = flagIssueBody("med201-014", { kind: "concept", name: "BMI Qualifies", label: "   " }, "");
  assert.equal(b, '**Artifact:** `med201-014` · concept "BMI Qualifies"');
});

// ── Todo 3 (disc 358): replaceIssueTypeLine — re-sync the issue body's **Type:** line after a flag Type change ──
test("replaceIssueTypeLine: replaces the existing **Type:** line in place, leaving the rest of the body untouched", () => {
  const body = flagIssueBody("sur716-011", T, "the reviewer's prose\nmore prose", "CRL vs narrative");
  const out = replaceIssueTypeLine(body, "Tooling bug");
  assert.match(out, /^\*\*Type:\*\* Tooling bug$/m);
  assert.ok(!out.includes("CRL vs narrative"), "the old Type is gone");
  assert.ok(out.includes("the reviewer's prose\nmore prose"), "the reviewer's prose survives");
  assert.ok(out.includes("**Artifact:**"), "the artifact header survives");
});
test("replaceIssueTypeLine: no **Type:** line → inserts one right after the first (Artifact) line", () => {
  const body = "**Artifact:** `p` · decision \"D\"\n\nsome prose";
  const out = replaceIssueTypeLine(body, "Other");
  assert.equal(out, "**Artifact:** `p` · decision \"D\"\n**Type:** Other\n\nsome prose");
});
test("replaceIssueTypeLine: single-line body (no newline) → appends the Type line; empty body → just the line", () => {
  assert.equal(replaceIssueTypeLine("only a header", "Other"), "only a header\n**Type:** Other");
  assert.equal(replaceIssueTypeLine("", "Other"), "**Type:** Other");
});
test("replaceIssueTypeLine: matches a CRLF Type line (no duplicate) and preserves the CRLF ending (impl-review gpt56 #6)", () => {
  const body = '**Artifact:** `p` · decision "D"\r\n**Type:** Old\r\n\r\nprose';
  const out = replaceIssueTypeLine(body, "New");
  assert.ok(out.includes("**Type:** New"), "replaced");
  assert.ok(!out.includes("**Type:** Old"), "old gone");
  assert.equal((out.match(/\*\*Type:\*\*/g) || []).length, 1, "no duplicated Type line on a CRLF body");
  assert.ok(out.includes("**Type:** New\r\n"), "the CRLF line ending is preserved");
});
test("replaceIssueTypeLine: replaces only the FIRST Type line (a later mention in prose is left alone)", () => {
  const body = "**Artifact:** `p` · decision \"D\"\n**Type:** Old\n\nWe discussed **Type:** in a comment.";
  const out = replaceIssueTypeLine(body, "New");
  assert.match(out, /^\*\*Type:\*\* New$/m);
  assert.ok(out.includes("We discussed **Type:** in a comment."), "a prose mention is untouched");
});
