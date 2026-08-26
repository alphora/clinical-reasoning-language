import * as path from "path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../emit";

/**
 * #270 (disc 461 code review, both crl-emit arms) — `defined as exists` on the case-feature INFERRED lane.
 *
 * Pre-#270 the inferred lane threw `definedAsExistsNotLowered`; #270 lowers it to a bare scalar `exists(<X>)`
 * (`emitCQL.emitExistsBridge`), and the ONE totality classifier (`emitsTotalScalarBoolean`) now returns true
 * for a coherent `Scalar<boolean>` `defined as exists` — so the discharge, the `refIsTotal` recursion, and
 * the Interface façade all read the SAME verdict. These fixtures pin the two consumer cells the code review
 * showed were previously mis-lowered, plus the both-rep loud refusal.
 */
const FIXTURES = path.resolve(__dirname, "fixtures");

function libBySuffix(result: ReturnType<typeof emitCQLImports>, suffix: string): string {
  const entry = result.cqlByLibrary.find((e) => e.libraryName.endsWith(suffix));
  if (!entry?.cql) throw new Error(`no library ending in "${suffix}" (got ${result.cqlByLibrary.map((e) => e.libraryName).join(", ")})`);
  return entry.cql;
}

describe("#270 — `defined as exists` inferred-lane consumers (disc 461 code review)", () => {
  const result = emitCQLImports(path.join(FIXTURES, "defined-as-exists-inferred", "root.crl"));

  it("emits successfully (all inferred-lane exists consumers lower)", () => {
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("baseline — `defined as exists` over a records concept → bare scalar `exists (<LocalPrimitives>.\"X\")`", () => {
    const inferred = libBySuffix(result, "Inferences");
    expect(inferred).toMatch(/define "Has Adult":\s*\n\s*exists \(\S+LocalPrimitives\."Adult Records"\)/);
  });

  it("Claude #1 — a bare-ref ALIAS to an exists concept re-exports BARE (never `.asTruths()` / never `.satisfied()` a scalar)", () => {
    const inferred = libBySuffix(result, "Inferences");
    // Inferences: bare same-layer ref, NOT lifted to a truth-set `.asTruths()`.
    expect(inferred).toMatch(/define "Adult Alias":\s*\n\s*"Has Adult"\s*\n/);
    expect(inferred).not.toMatch(/"Adult Alias":\s*\n\s*"Has Adult"\.asTruths\(\)/);
    // Interface: bare re-export, NO `.satisfied()` on a scalar Boolean.
    const iface = libBySuffix(result, "Interface");
    expect(iface).toMatch(/define "Adult Alias":\s*\n\s*\S+Inferences\."Adult Alias"\s*\n/);
    expect(iface).not.toMatch(/"Adult Alias":[\s\S]*?\.satisfied\(\)/);
  });

  it("Claude #2 — a `sem-or` composition OVER two exists concepts flips to boolean `or` (never `union` two scalar Booleans)", () => {
    const inferred = libBySuffix(result, "Inferences");
    expect(inferred).toMatch(/define "Adult Or Senior":\s*\n\s*"Has Adult"\s*\n\s*or "Has Senior"/);
    expect(inferred).not.toMatch(/"Adult Or Senior":[\s\S]*?union/);
    // Interface re-exports it BARE (a truth-set would be `.satisfied()`).
    const iface = libBySuffix(result, "Interface");
    expect(iface).toMatch(/define "Adult Or Senior":\s*\n\s*\S+Inferences\."Adult Or Senior"/);
    expect(iface).not.toMatch(/"Adult Or Senior":[\s\S]*?\.satisfied\(\)/);
  });
});

describe("#270 — both-rep `code is` + `defined as exists` is loud-refused (disc 461 Claude-3)", () => {
  it("refuses rather than silently drop the local-code fold on the canonical local-domain path", () => {
    const result = emitCQLImports(path.join(FIXTURES, "defined-as-exists-bothrep", "root.crl"));
    expect(result.success).toBe(false);
    // #189 Piece 1 (disc 506) — the value/interface membership fold now ACTIVATES for a `defined as exists` over a
    // both-rep RECENCY-VALUE referent. This fixture's referent ("Other Records") is a plain records concept, NOT
    // recency-value, so it stays DEFERRED — the loud-refusal INTENT (not silently dropped) is unchanged, but the
    // message now names the narrowed deferral reason (non-recency-value referent).
    expect(JSON.stringify(result.errors)).toMatch(/not a both-representation recency-value|DEFERRED emit gap/);
  });
});
