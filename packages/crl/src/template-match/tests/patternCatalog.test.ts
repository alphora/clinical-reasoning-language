import { readFileSync } from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifiedPatterns,
  isProjectionOnly,
  patternEntry,
  patternProjection,
  patternReturnShape,
  requireReturnShape,
} from "../patternCatalog";

/**
 * #189 P2 (design D9) — the catalog must stay TOTAL over what the matchers can emit.
 *
 * ⭐ THIS EXISTS BECAUSE THE GAP ALREADY HAPPENED. `matches this` was added to the matcher registry with no
 * classification and nothing noticed: the only consumer that would have tripped was guarded, and the old
 * `?? "list"` default would have silently classified it as a FILTER. A table with a permissive default
 * cannot report its own holes.
 */

/**
 * Pattern names taken from STRING-LITERAL `makeCall("X", …)` sites.
 *
 * ⚠ A LOWER BOUND, NOT THE WHOLE SET — say so plainly rather than let the name imply otherwise. Two matcher
 * families build their name at runtime and are invisible here; they are covered explicitly below, and a new
 * dynamic matcher must be added there by hand.
 */
function literalNamedPatterns(): string[] {
  const src = readFileSync(path.resolve(__dirname, "..", "matcher.ts"), "utf8");
  return [...new Set([...src.matchAll(/makeCall\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]))].sort();
}

/**
 * Names the matchers build at RUNTIME, which no source scan can see.
 *
 * ⚠ MAINTAINED BY HAND. If a new matcher computes its pattern name, add it here — the scan above will not.
 */
const DYNAMIC_PATTERNS: Record<string, string> = {
  // `valueClass` (`<X> low|high|normal|abnormal`) capitalises the matched word into the pattern name.
  Low: "valueClass",
  High: "valueClass",
  Normal: "valueClass",
  Abnormal: "valueClass",
  // The age matchers pass a computed `computeFn` — but NESTED inside a comparator, never as the top-level
  // pattern. `AgeAt` is classified anyway; `AgeInMonths` deliberately is not (see below).
  AgeAt: "the age matchers' computeFn",
};

describe("pattern catalog totality", () => {
  it("finds patterns to check (guards against a silently-empty scan)", () => {
    // A totality test that scans nothing passes forever.
    expect(literalNamedPatterns().length).toBeGreaterThan(30);
  });

  it("⭐ every LITERAL-NAMED pattern a matcher emits is classified", () => {
    const unclassified = literalNamedPatterns().filter((p) => patternEntry(p) === undefined);
    expect(
      unclassified,
      `Emitted by a matcher but not classified in \`patternCatalog.ts\`. Add an entry — a missing one is a ` +
        `WRONG classification waiting to happen, not a neutral absence:\n  ${unclassified.join("\n  ")}`,
    ).toEqual([]);
  });

  it("⚠ every DYNAMICALLY-NAMED pattern is classified too — the scan cannot see these", () => {
    const unclassified = Object.keys(DYNAMIC_PATTERNS).filter((p) => patternEntry(p) === undefined);
    expect(
      unclassified,
      `Built at runtime by a matcher and unclassified:\n` +
        unclassified.map((p) => `  ${p} (from ${DYNAMIC_PATTERNS[p]})`).join("\n"),
    ).toEqual([]);
  });

  it("`AgeInMonths` is deliberately UNCLASSIFIED, and that is safe only because it is nested-only", () => {
    // ⚠ Pinning the exemption so it stays a DECISION rather than becoming an unnoticed hole. It is safe
    // because the age matchers place the compute fn INSIDE a comparator (`AtLeast(AgeInMonths(), q)`), so it
    // is never the top-level pattern a lookup sees. If that ever changes, this test fails and says why.
    expect(patternEntry("AgeInMonths")).toBeUndefined();
    const src = readFileSync(path.resolve(__dirname, "..", "matcher.ts"), "utf8");
    // Every `computeFn` call site must be wrapped in `nestedArg(...)`.
    for (const m of src.matchAll(/(.{0,24})makeCall\(computeFn/g)) {
      expect(m[1]).toContain("nestedArg(");
    }
  });

  it("⚠ `requireReturnShape` FAILS CLOSED — it does not default", () => {
    // The behaviour that replaced `?? "list"`. If this ever returns instead of throwing, the trap is back.
    expect(() => requireReturnShape("NoSuchPattern", "a test")).toThrow(/no catalog classification/);
    expect(requireReturnShape("MostRecent", "a test")).toBe("instance");
  });

  it("⭐ EVERY entry declares a slot — the table is total, not an exception list", () => {
    // ⚠ The point of requiring `slot` on every entry: adding a pattern forces a scope decision instead of
    // inheriting a permissive default. An exception list here would reproduce the `Matches` gap exactly.
    for (const p of classifiedPatterns()) {
      expect(patternEntry(p)!.slot, `pattern ${p}`).toBeDefined();
    }
    expect(isProjectionOnly("Matches")).toBe(true);
    expect(isProjectionOnly("Exists")).toBe(true);
    expect(isProjectionOnly("MostRecent")).toBe(false);
  });

  it("⭐ `matches this` and `exists this` differ on READS and on TERMINOLOGY need", () => {
    // `reads` decides what a projection can produce WHEN INVOKED: an existence arm can never record a
    // negative, a membership arm can. Zero records contributes NOTHING for both — that is arm
    // participation, not this axis, and conflating them kills the pause row.
    expect(patternProjection("Exists")?.reads).toBe("records");
    expect(patternProjection("Matches")?.reads).toBe("datum");

    // ⚠ REGRESSION PIN. `Exists` was once marked "always requires terminology", which REJECTED the legal
    // `- type is Patient.` + `- value projection is exists this.` — Patient has no code-based retrieve, so
    // the charter does not require a `coded from` there. The RESOURCE decides for `exists`; the SET is the
    // comparand for `matches`.
    expect(patternProjection("Exists")?.terminology).toBe("when-coded-retrieve");
    expect(patternProjection("Matches")?.terminology).toBe("always");

    // The retrieve shape each requires — the contract a future emit author must not re-derive.
    expect(patternProjection("Exists")?.retrieve).toBe("terminology-filtered");
    expect(patternProjection("Matches")?.retrieve).toBe("unfiltered");
  });

  it("a non-projection pattern carries no projection facts", () => {
    expect(patternProjection("MostRecent")).toBeUndefined();
    expect(patternReturnShape("MostRecent")).toBe("instance");
  });
});
