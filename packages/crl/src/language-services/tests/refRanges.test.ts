import { describe, expect, it } from "vitest";

import { findRefRangesInSource } from "../projectIndex";

// Regression for the degenerate multi-line ref-range (introduced 2026-06-18,
// a9f94d6 — #132 step 1). A `when "<concept>" then: <body>` block has a location
// that spans its nested `then:` body, so it is MULTI-LINE. The old code returned
// a 1-char range at the block start, so go-to-definition / hover missed the
// concept name on every multi-line when-condition ("No definition found").
describe("findRefRangesInSource — multi-line when-condition ref range", () => {
  const NAME = "Initial Authorization Requested";
  const source = [
    'decision "Adult Determination":', // line 1
    "first:", // line 2
    `- when "${NAME}" then:`, // line 3 (0-based line 2)
    "  first:", // line 4
    '  - otherwise then recommend activity "Deny".', // line 5
    "  end.", // line 6
    '- otherwise then recommend activity "Deny".', // line 7
  ].join("\n");

  it("locates the condition NAME on the start line of a multi-line block (not a 1-char stub)", () => {
    // WhenBlock location: starts at the `-` on line 3, ends inside the nested body on line 6.
    const loc = { start: { line: 3, column: 0 }, end: { line: 6, column: 6 } };
    const res = findRefRangesInSource(source, loc, NAME, false);
    expect(res).not.toBeNull();
    const nr = res!.nameRange;
    expect(nr.startLine).toBe(2); // 0-based → 1-based line 3
    expect(nr.endLine).toBe(2);
    // The range spans the FULL quoted name and points at it in the source —
    // the old degenerate branch returned endCol === startCol + 1 (a lone "-").
    expect(nr.endCol - nr.startCol).toBe(NAME.length);
    expect(source.split("\n")[2].slice(nr.startCol, nr.endCol)).toBe(NAME);
  });

  it("still resolves a single-line when-condition (regression guard for the common case)", () => {
    const line = `- when "${NAME}" then recommend activity "Deny".`;
    const single = [`decision "D":`, "first:", line].join("\n");
    const loc = { start: { line: 3, column: 0 }, end: { line: 3, column: line.length } };
    const res = findRefRangesInSource(single, loc, NAME, false);
    expect(res).not.toBeNull();
    expect(single.split("\n")[2].slice(res!.nameRange.startCol, res!.nameRange.endCol)).toBe(NAME);
  });

  // Both reviewers: `lastIndexOf` mis-ranged a bare when-condition when the same
  // name recurs later on the line (concept + activity may share a name). A bare
  // ref must resolve to the FIRST occurrence (the `when` condition), not the last.
  it("bare when-condition prefers the FIRST occurrence when the name recurs on the line", () => {
    const line = `- when "Deny" then recommend activity "Deny".`;
    const src = [`decision "D":`, "first:", line].join("\n");
    const loc = { start: { line: 3, column: 0 }, end: { line: 3, column: line.length } };
    const res = findRefRangesInSource(src, loc, "Deny", false);
    expect(res).not.toBeNull();
    // The condition ref points at the FIRST `"Deny"` (after `when`), not the activity's.
    expect(res!.nameRange.startCol).toBe(line.indexOf('"Deny"') + 1);
  });

  // Qualified ref driven through the MULTI-LINE branch: name + qualifier both
  // resolve on the START line (last-occurrence for qualified handles `"X"."X"`).
  it("qualified ref through a multi-line location resolves name + qualifier on the start line", () => {
    const startLine = `- when "OtherLib"."${NAME}" then:`;
    const src = [`decision "D":`, "first:", startLine, "  first:", "  end."].join("\n");
    const loc = { start: { line: 3, column: 0 }, end: { line: 5, column: 6 } };
    const res = findRefRangesInSource(src, loc, NAME, true);
    expect(res).not.toBeNull();
    const l = src.split("\n")[2];
    expect(l.slice(res!.nameRange.startCol, res!.nameRange.endCol)).toBe(NAME);
    expect(res!.qualifierRange).not.toBeNull();
    expect(l.slice(res!.qualifierRange!.startCol, res!.qualifierRange!.endCol)).toBe("OtherLib");
  });
});
