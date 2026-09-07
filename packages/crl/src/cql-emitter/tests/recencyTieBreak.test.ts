import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { crossRepRecencyMergeExpr } from "../crossRepRecencyMerge";

// REFACTOR:grounded (#320, plan585): generic value recency retains its existing tie-break.
// Age arbitration is pattern-owned and must not use Patient update time or these generic helpers.

const CATALOG = readFileSync(
  join(__dirname, "..", "catalog", "CaseFeatureCommon.cql"),
  "utf-8",
);

describe("generic recency tie-break and age separation", () => {
  it("recencyLocalWins is EXACTLY the defensive `not Coalesce(sourceTs after localTs, false)` form", () => {
    // The Coalesce sits on the SOURCE-newer predicate, so an `after`-null (either ts null, precision mismatch,
    // equal) can never silently flip to source — LOCAL wins on any indeterminacy BY CONSTRUCTION. If this drifts
    // (e.g. back to `localTs after sourceTs` un-Coalesced), age's precision bug returns. Whitespace-normalized.
    const norm = CATALOG.replace(/\s+/g, " ");
    expect(norm).toContain(
      "define function recencyLocalWins(localTs System.DateTime, sourceTs System.DateTime): not Coalesce(sourceTs after localTs, false)",
    );
  });

  it("age no longer shares generic recency arbitration or Patient update time", () => {
    expect(CATALOG).not.toContain("recencyAge");
    expect(CATALOG).not.toContain("Patient.meta.lastUpdated");
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
