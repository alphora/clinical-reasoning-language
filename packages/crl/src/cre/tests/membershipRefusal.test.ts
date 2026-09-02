import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";

/**
 * ⭐⭐ #189 gap 3 — THE CRE MUST REFUSE A MEMBERSHIP PREDICATE LOUDLY, NEVER PRODUCE A BRANCH.
 *
 * The CRE cannot evaluate `"X" in "VS"` yet: `FactValue` carries only `boolValue`, so it has no way to hold
 * the coded datum the predicate reads, and `conceptTruth` comes back EMPTY. That is T5's work.
 *
 * ⚠⚠ WHAT THIS PINS IS THE FAILURE MODE, NOT THE GAP. An engine that cannot evaluate something has two
 * options, and only one is safe: refuse by name, or guess. Guessing here would mean emitting a
 * recommendation from a determination it never computed — a wrong answer wearing the CRE's authority, in the
 * lane whose whole job is to check the other lane. The refusal is generic machinery that already existed;
 * this test exists so a later change cannot quietly turn it into silence.
 *
 * ⚠ When T5 lands, this test does not get deleted — it gets INVERTED to assert the produced branch. A fixture
 * that only ever said "not yet" would stop being evidence the moment it became stale.
 */
const CASES = path.resolve(__dirname, "fixtures/membership-refusal/cases.cel");

describe("#189 gap 3 — the CRE refuses membership by name", () => {
  it("⭐⭐ errors rather than producing a branch, and names the concept AND the stage", () => {
    const res = runCel(resolveCelImports(CASES) as never) as unknown as {
      runs?: { status?: string; produced?: string[]; diagnostics?: (string | { message?: string })[] }[];
    };
    const runs = res.runs ?? [];
    expect(runs.length, "the fixture must actually run").toBeGreaterThan(0);

    for (const r of runs) {
      expect(r.status, "an unevaluatable determination must ERROR").toBe("error");
      // ⚠ THE LOAD-BEARING ASSERTION. `produced: []` is what separates "refused" from "guessed".
      expect(r.produced ?? [], "the CRE must not produce a branch it did not compute").toEqual([]);
      const msg = (r.diagnostics ?? [])
        .map((d) => (typeof d === "string" ? d : (d.message ?? "")))
        .join(" | ");
      expect(msg, "the refusal must name the concept").toContain("Requested Service Is Covered");
      expect(msg, "the refusal must name the stage that defeated it").toContain("Membership");
      // ⭐ The engine says WHY it refused rather than just that it did — "rather than fabricate" is the
      // discipline this test protects. A refusal that stopped explaining itself would still pass the
      // assertions above while becoming much harder to act on.
      expect(msg).toContain("rather than fabricate");
    }
  });
});
