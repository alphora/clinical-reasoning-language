import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { crossRepRecencyMergeExpr } from "../crossRepRecencyMerge";

// #189 B2 — the shared cross-rep recency tie-break (`CaseFeatureCommon.recencyLocalWins`) + age's adoption of it.
// The tie-break's CORRECTNESS is proven on the real cqf engine (the `cql` evaluator, disc 498) — CI cannot run the
// jar, so this file (a) REGRESSION-GUARDS the exact defensive CQL form (a future edit must not restore the
// `after`-null fallthrough bug), (b) pins that age consults the SHARED fn (no drift), and (c) records the
// engine-pinned truth table in-repo so the expected behavior survives without the jar.
//
// ── ENGINE-PIN (cqf-fhir-cr-cli-4.7.0 `cql`, 2026-08-23; TRUE = LOCAL wins) ───────────────────────────────────
//   recencyLocalWins(localTs, sourceTs) = not Coalesce(sourceTs after localTs, false)
//     local strictly newer  → true  (LOCAL)      source strictly newer → false (SOURCE)
//     equal timestamps      → true  (LOCAL) [D1=A, operator-ratified — flipped from the pre-B2 age lattice]
//     localTs null          → true  (LOCAL)      sourceTs null         → true  (LOCAL)
//     precision mismatch    → true  (LOCAL) [`after` → null → Coalesce false → the age precision-hole FIX]
//   Raw pins: `@t after @t` = false; `null after @t` = null; a precision-mismatch `after` = null.

const CATALOG = readFileSync(
  join(__dirname, "..", "catalog", "CaseFeatureCommon.cql"),
  "utf-8",
);

describe("#189 B2 — recencyLocalWins tie-break (regression guard for age's precision hole)", () => {
  it("recencyLocalWins is EXACTLY the defensive `not Coalesce(sourceTs after localTs, false)` form", () => {
    // The Coalesce sits on the SOURCE-newer predicate, so an `after`-null (either ts null, precision mismatch,
    // equal) can never silently flip to source — LOCAL wins on any indeterminacy BY CONSTRUCTION. If this drifts
    // (e.g. back to `localTs after sourceTs` un-Coalesced), age's precision bug returns. Whitespace-normalized.
    const norm = CATALOG.replace(/\s+/g, " ");
    expect(norm).toContain(
      "define function recencyLocalWins(localTs System.DateTime, sourceTs System.DateTime): not Coalesce(sourceTs after localTs, false)",
    );
  });

  it("age consults the SHARED recencyLocalWins (so age + the general cross-rep merge cannot drift)", () => {
    const norm = CATALOG.replace(/\s+/g, " ");
    expect(norm).toContain(
      "define function recencyAgeAssertedWins(local FHIR.Observation): local is not null and recencyLocalWins((local.effective as FHIR.dateTime).value, Patient.meta.lastUpdated.value)",
    );
    // The pre-B2 inline 3-way OR (`effective after lastUpdated`, un-Coalesced) must be GONE — it is the bug.
    expect(CATALOG).not.toContain("(local.effective as FHIR.dateTime).value after Patient.meta.lastUpdated.value");
  });
});

describe("#189 B2 — crossRepRecencyMergeExpr (general value merge; INERT, wired at F)", () => {
  const arms = {
    localValue: "LocalNewest.value",
    localTs: "(LocalNewest.effective as FHIR.dateTime).value",
    sourceValue: "SourceNewest.code",
    sourceTs: "SourceNewest.authoredOn.value",
  };

  it("assembles the two-tier value-presence → recencyLocalWins selection", () => {
    expect(crossRepRecencyMergeExpr(arms)).toBe(
      "if (SourceNewest.code) is null then (LocalNewest.value) " +
        "else if (LocalNewest.value) is null then (SourceNewest.code) " +
        "else if CFH.recencyLocalWins((LocalNewest.effective as FHIR.dateTime).value, SourceNewest.authoredOn.value) then (LocalNewest.value) " +
        "else (SourceNewest.code)",
    );
  });

  it("delegates the tie-break to CFH.recencyLocalWins — it never re-implements the `after` comparison", () => {
    const expr = crossRepRecencyMergeExpr(arms);
    expect(expr).toContain("CFH.recencyLocalWins(");
    expect(expr).not.toContain(" after "); // the comparison lives ONLY in the catalog fn (no drift)
  });

  it("honors a custom CaseFeatureCommon alias", () => {
    expect(crossRepRecencyMergeExpr({ ...arms, cfhAlias: "CaseFeatureCommon" })).toContain(
      "CaseFeatureCommon.recencyLocalWins(",
    );
  });

  it("source-null → local (possibly null): the load-bearing null return B3 reads", () => {
    // Structurally: the FIRST branch returns the local value when source is null; both-null yields null (local is
    // null too), which B3's `is not null` interface reads as false. Pinned via the branch order.
    expect(crossRepRecencyMergeExpr(arms).startsWith("if (SourceNewest.code) is null then (LocalNewest.value)")).toBe(
      true,
    );
  });
});
