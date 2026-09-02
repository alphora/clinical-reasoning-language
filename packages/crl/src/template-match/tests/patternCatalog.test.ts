import { readFileSync } from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  catalogFunctionName,
  classifiedPatterns,
  isProjectionOnly,
  patternEntry,
  patternProjection,
  patternReturnShape,
  renameForDefinitionSlot,
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
    expect(isProjectionOnly("Exists")).toBe(true);
    expect(isProjectionOnly("MostRecent")).toBe(false);
  });

  it("⭐ `exists this` READS RECORDS, and needs terminology only when the RESOURCE has a coded retrieve", () => {
    // ⚠⚠ THIS TEST USED TO BE A CONTRAST with `matches this`, which is RETIRED (operator, 2026-09-02) —
    // membership is now a CONCEPT-LEVEL predicate naming its own set. What survives the retirement is the
    // half about `exists`, and it survives because it is a REGRESSION PIN, not a description.
    //
    // `reads` decides what a projection can produce WHEN INVOKED: an existence arm can never record a
    // negative. Zero records contributes NOTHING — that is arm participation, not this axis, and conflating
    // them kills the pause row.
    expect(patternProjection("Exists")?.reads).toBe("records");

    // ⚠ THE PIN. `Exists` was once marked "always requires terminology", which REJECTED the legal
    // `- type is Patient.` + `- value projection is exists this.` — Patient has no code-based retrieve, so
    // the charter does not require a `coded from` there. The RESOURCE decides.
    expect(patternProjection("Exists")?.terminology).toBe("when-coded-retrieve");
    expect(patternProjection("Exists")?.retrieve).toBe("terminology-filtered");
  });

  it("⭐⭐ every `crl-common` pattern names a function that EXISTS in CRLCommon.cql", () => {
    // ⚠⚠ THIS CHECK IS THE POINT OF THE `realization` FIELD. Without it the field was a required claim that
    // NOTHING read and that was FALSE on arrival for two entries: `Exists` and `Matches` were marked
    // `crl-common`, and `CRLCommon.cql` defines neither — both lower to native CQL. That is exactly the
    // `preservesElements` defect (a catalog field written, consumed by nobody) reproduced in the commit that
    // fixed it. A field nothing reads cannot report its own falsehoods; this is what makes it read.
    //
    // ⚠ It also checks the NAME, not just the pattern: `Last` lowers to `LastOf` and `First` to `FirstOf`,
    // so `entry.pattern` is not the callable. That mapping lives in the catalog for this reason.
    const cql = readFileSync(
      path.resolve(__dirname, "../../cql-emitter/catalog/CRLCommon.cql"),
      "utf8",
    );
    const defined = new Set(
      [...cql.matchAll(/^define function "([^"]+)"/gm)].map((m) => m[1]),
    );
    const missing = classifiedPatterns()
      .filter((p) => patternEntry(p)!.realization === "crl-common")
      .filter((p) => !defined.has(catalogFunctionName(p)));
    expect(missing).toEqual([]);
  });

  it("⭐ the definition-slot rename covers `exists this` and NOTHING else", () => {
    // The slot is what separates the concept-level existence reduction from the rep-local projection. Both
    // are spelled `exists this` and the matcher is slot-blind, so every reader that KNOWS it is in a
    // `definition is` must apply this — the resolver and the pipeline-stage validator both do.
    expect(renameForDefinitionSlot("Exists")).toBe("ExistsOverSpace");
    // ⚠ `Matches` must NOT be renamed: its comparand is the representation's own `coded from`, so it has no
    // concept-level counterpart and belongs nowhere but a projection.
    expect(renameForDefinitionSlot("Matches")).toBe("Matches");
    expect(renameForDefinitionSlot("MostRecent")).toBe("MostRecent");
  });

  it("⭐ a grounded VALUE-returning pattern declares its concrete result type", () => {
    // `returnShape: "other"` covers Period, Quantity, Interval and DateTime alike, so it cannot tell
    // `BodyMassIndex → Quantity` from a Period-returning pattern. Without `resultType` the resolver could
    // only ask "did the author declare SOME value type", which let a record concept declaring
    // `value type is date` take a `BodyMassIndex` producer and resolve clean.
    const ungrounded = classifiedPatterns()
      .map((p) => [p, patternEntry(p)!] as const)
      .filter(([, e]) => e.stage.grounded && (e.returnShape === "boolean" || e.returnShape === "other"))
      .filter(([, e]) => (e.stage as { resultType?: string }).resultType === undefined)
      .map(([p]) => p);
    expect(ungrounded).toEqual([]);
    expect((patternEntry("BodyMassIndex")!.stage as { resultType?: string }).resultType).toBe("Quantity");
    expect((patternEntry("AtLeast")!.stage as { resultType?: string }).resultType).toBe("boolean");
  });

  it("a non-projection pattern carries no projection facts", () => {
    expect(patternProjection("MostRecent")).toBeUndefined();
    expect(patternReturnShape("MostRecent")).toBe("instance");
  });
});
