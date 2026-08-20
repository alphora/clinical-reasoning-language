import * as path from "path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../emit";

/**
 * #189 Slice 0c — a `defined as` BOOLEAN composition with a CROSS-LIBRARY operand
 * (`defined as ( "Sib"."Sib Flag" and "Root Flag" )`). In 0b this errored
 * `emit-boolean-composition-operand-not-total` (a qualified operand was inert under
 * `sameLayerResolver`); in 0c the FAMILY arm of `emitsTotalScalarBoolean` proves the foreign
 * operand total via the pre-emit `DeclaredResultIndex`, so it emits. The positive proof is
 * asserted at ALL THREE banner-A consumers — the Inferred pivot, the ledger discharge (the emit
 * succeeds ⇒ the discharge agreed), and the Interface façade (bare re-export, never `.satisfied()`).
 */
const FIXTURES = path.resolve(__dirname, "fixtures");

function libBySuffix(result: ReturnType<typeof emitCQLImports>, suffix: string): string {
  const entry = result.cqlByLibrary.find((e) => e.libraryName.endsWith(suffix));
  if (!entry?.cql)
    throw new Error(
      `no library ending in "${suffix}" (got ${result.cqlByLibrary.map((e) => e.libraryName).join(", ")})`,
    );
  return entry.cql;
}
function libByExact(result: ReturnType<typeof emitCQLImports>, name: string): string {
  const entry = result.cqlByLibrary.find((e) => e.libraryName === name);
  if (!entry?.cql)
    throw new Error(
      `no library named "${name}" (got ${result.cqlByLibrary.map((e) => e.libraryName).join(", ")})`,
    );
  return entry.cql;
}

describe("#189 Slice 0c — cross-library boolean-composition operand (positive proof)", () => {
  const result = emitCQLImports(path.join(FIXTURES, "boolean-composition-cross-lib", "root.crl"));

  it("emits successfully — a cross-library operand that errored `operand-not-total` in 0b now proves total", () => {
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("consumer 1 — the Inferred pivot emits `Sib.\"Sib Flag\" and \"Root Flag\"` (foreign operand QUALIFIED, bare same-lib operand)", () => {
    const inferred = libBySuffix(result, "Inferred");
    expect(inferred).toMatch(/define "Cross Both":\s*\n\s*Sib\."Sib Flag" and "Root Flag"/);
    // Never a fabricated Coalesce (charter §4) nor a truth-set weave (`union`/`.asTruths()`).
    expect(inferred).not.toMatch(/"Cross Both":[\s\S]*?(Coalesce|union|\.asTruths\(\))/);
  });

  it("the Inferred layer `include`s the foreign source library `Sib` (no dangling qualified reference)", () => {
    const inferred = libBySuffix(result, "Inferred");
    expect(inferred).toMatch(/\ninclude Sib\b/);
  });

  it("consumer 2 — the ledger discharge agreed (a cross-lib boolean composition emits, not a loud error)", () => {
    // A discharge/pivot disagreement would either loud-error (success:false) or emit a `.satisfied()`/truth-set
    // shell; the success + the bare compound above jointly witness the single-classifier agreement (banner A).
    expect(result.success).toBe(true);
  });

  it("consumer 3 — the Interface façade re-exports the cross-lib composition BARE (never `.satisfied()` a scalar boolean)", () => {
    const iface = libBySuffix(result, "Interface");
    expect(iface).toMatch(/define "Cross Both":\s*\n\s*\S+Inferred\."Cross Both"/);
    expect(iface).not.toMatch(/"Cross Both":[\s\S]*?\.satisfied\(\)/);
  });

  it("the foreign library `Sib` emits its total boolean define referenced cross-library", () => {
    const sib = libByExact(result, "Sib");
    expect(sib).toMatch(/define "Sib Flag":\s*\n\s*exists \("Sib Cond"\)/);
  });

  it("the ALIAS counterexample (disc 465/466) — a same-lib alias to the cross-lib composition AGREES with its bare Boolean form", () => {
    // The legacy bare-ref alias arm recurses same-layer into "Cross Both", whose boolean-comp arm proves it total,
    // so the alias re-exports BARE — never a truth-set `.asTruths()` (Inferred) nor `.satisfied()` on a Boolean
    // (Interface). This is the exact direction v1's per-consult-site design broke.
    const inferred = libBySuffix(result, "Inferred");
    expect(inferred).toMatch(/define "Cross Both Alias":\s*\n\s*"Cross Both"/);
    expect(inferred).not.toMatch(/"Cross Both Alias":[\s\S]*?\.asTruths\(\)/);
    const iface = libBySuffix(result, "Interface");
    expect(iface).toMatch(/define "Cross Both Alias":\s*\n\s*\S+Inferred\."Cross Both Alias"/);
    expect(iface).not.toMatch(/"Cross Both Alias":[\s\S]*?\.satisfied\(\)/);
  });
});

describe("#189 Slice 0c — CHAINED cross-library composition is conservatively LOUD (Option-(a), disc 465 §1)", () => {
  // Root → `"Sib"."Sib Chained"` → `"Third"."Third Flag"`. Sib's OWN emit proves "Sib Chained" total (Sib's family
  // arm resolves Third via the index), but the pre-emit index projects "Sib Chained" NON-total (it runs the UNIFORM
  // resolver, under which Third's operand is inert). So the root LOUD-fails `operand-not-total` — never a silent
  // wrong emit. This pins the documented conservative-loud limit (Option-(b) topological projection is deferred).
  const result = emitCQLImports(
    path.join(FIXTURES, "boolean-composition-cross-lib-chained", "root.crl"),
  );

  it("the root emit FAILS loud (never a silent wrong emit)", () => {
    expect(result.success).toBe(false);
  });

  it("the failure is `operand-not-total` naming the chained foreign operand — with the 0c-accurate note, NOT the stale 'gains a proof' text", () => {
    const err = (result.errors ?? []).find(
      (e) => (e as { kind?: string }).kind === "emit-boolean-composition-operand-not-total",
    ) as { message?: string } | undefined;
    expect(err, JSON.stringify(result.errors)).toBeDefined();
    expect(err?.message).toContain('operand "Sib Chained"');
    // Fix C (disc 466): the offender is the genuinely non-total operand with an accurate note, never the stale 0b
    // promise that cross-library operands "gain a totality proof in #189 Slice 0c".
    expect(err?.message).not.toContain("gain a totality proof");
    expect(err?.message).toContain("does not emit a total scalar boolean");
  });
});
