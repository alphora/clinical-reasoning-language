import * as path from "path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../emit";

/**
 * #189 Slice 0b (code review disc 464, both crl-emit arms) — a `defined as` BOOLEAN composition on the
 * case-feature / layered INFERRED lane (the production KE lane). The off/standard lane is byte-tested in
 * `ast/tests/definedAsBooleanComposition-t1.test.ts`; this pins the layered lane, which routes through the
 * SAME `emitConceptBody` → `emitBooleanComposition` but requalifies/re-exports through the layer split.
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

describe("#189 Slice 0b — boolean composition on the case-feature/layered INFERRED lane", () => {
  const result = emitCQLImports(path.join(FIXTURES, "boolean-composition-inferred", "root.crl"));

  it("emits successfully (all inferred-lane boolean-composition consumers lower)", () => {
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("`and` over exists operands → bare compound boolean on the Inferred lane (never union / `.asTruths()`)", () => {
    const inferred = libBySuffix(result, "Inferred");
    expect(inferred).toMatch(/define "Adult And Senior":\s*\n\s*"Has Adult" and "Has Senior"/);
    expect(inferred).not.toMatch(/"Adult And Senior":[\s\S]*?(union|\.asTruths\(\))/);
  });

  it("`or not` lowers structurally (bare leaves, no fabricated Coalesce)", () => {
    const inferred = libBySuffix(result, "Inferred");
    expect(inferred).toMatch(/define "Adult Or Not Senior":\s*\n\s*"Has Adult" or not "Has Senior"/);
    expect(inferred).not.toMatch(/"Adult Or Not Senior":[\s\S]*?Coalesce\("Has Adult"/);
  });

  it("the Interface façade re-exports the composition BARE (never `.satisfied()` a scalar boolean)", () => {
    const iface = libBySuffix(result, "Interface");
    expect(iface).toMatch(/define "Adult And Senior":\s*\n\s*\S+Inferred\."Adult And Senior"/);
    expect(iface).not.toMatch(/"Adult And Senior":[\s\S]*?\.satisfied\(\)/);
  });
});
