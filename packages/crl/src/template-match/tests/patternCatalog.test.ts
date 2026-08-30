import { readFileSync } from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifiedPatterns,
  isProjectionOnly,
  patternReturnShape,
  patternScope,
  requireReturnShape,
} from "../patternCatalog";

/**
 * #189 P2 (design D9) — the catalog must stay TOTAL over what the matchers can emit.
 *
 * ⭐ THIS TEST EXISTS BECAUSE THE GAP ALREADY HAPPENED. `matches this` was added to the matcher registry
 * with no return-shape entry, and nothing noticed: the suite stayed green because the only consumer that
 * would have tripped was guarded, and the old `?? "list"` default would have silently classified it as a
 * FILTER. A classification table with a permissive default cannot report its own holes.
 */

/** Every pattern name a matcher can emit — the string literals handed to `makeCall`. */
function emittedPatterns(): string[] {
  const src = readFileSync(path.resolve(__dirname, "..", "matcher.ts"), "utf8");
  return [...new Set([...src.matchAll(/makeCall\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]))].sort();
}

describe("pattern catalog totality", () => {
  it("finds patterns to check (guards against a silently-empty scan)", () => {
    // A totality test that scans nothing passes forever.
    expect(emittedPatterns().length).toBeGreaterThan(30);
  });

  it("⭐ EVERY pattern a matcher emits has a return-shape classification", () => {
    const unclassified = emittedPatterns().filter((p) => patternReturnShape(p) === undefined);
    expect(
      unclassified,
      `These patterns are emitted by a matcher but not classified in \`patternCatalog.ts\`. ` +
        `Add an entry — a missing one is a WRONG classification waiting to happen, not a neutral absence:\n` +
        `  ${unclassified.join("\n  ")}`,
    ).toEqual([]);
  });

  it("⚠ `requireReturnShape` FAILS CLOSED — it does not default", () => {
    // The behaviour that replaced `?? "list"`. If this ever returns instead of throwing, the trap is back.
    expect(() => requireReturnShape("NoSuchPattern", "a test")).toThrow(/no return-shape classification/);
    expect(requireReturnShape("MostRecent", "a test")).toBe("instance");
  });

  it("the projection-only scope table stays consistent with the return-shape table", () => {
    // A scoped pattern is still a pattern: it must be classified like any other.
    for (const p of classifiedPatterns()) {
      if (isProjectionOnly(p)) expect(patternReturnShape(p)).toBeDefined();
    }
    expect(isProjectionOnly("Matches")).toBe(true);
    expect(isProjectionOnly("Exists")).toBe(true);
    expect(isProjectionOnly("MostRecent")).toBe(false);
  });

  it("⭐ `matches this` and `exists this` differ on what they READ — the pause-row distinction", () => {
    // ⚠ Not cosmetic. `reads` decides what a projection can produce WHEN INVOKED: an existence arm can
    // never record a negative, a membership arm can. Zero records contributes NOTHING for both — that is
    // arm participation, not this axis, and conflating them kills the pause row.
    expect(patternScope("Exists")?.reads).toBe("records");
    expect(patternScope("Matches")?.reads).toBe("datum");
    // And the retrieve shape each requires — the contract a future emit author must not re-derive.
    expect(patternScope("Exists")?.retrieve).toBe("terminology-filtered");
    expect(patternScope("Matches")?.retrieve).toBe("unfiltered");
  });
});
