import * as path from "path";

import { describe, it, expect } from "vitest";

import { validateCRLImports } from "../validate";

// #224 ii.1a-2 — the criterion semantic checks over the MULTI-FILE (source-scoped)
// validator path: concept-XOR-criterion uniqueness and the foreign-qualified
// criterion diagnostic both rely on criterion-aware scopes (`scope.localNames.criteria`).

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("criterion — multi-file semantic validation", () => {
  it("concept XOR criterion fires duplicate-name in the scoped path", () => {
    const root = path.join(FIXTURES, "criterion-xor", "root.crl");
    const result = validateCRLImports(root);
    const dup = result.validationErrors.filter((e) => e.kind === "duplicate-name");
    expect(dup.length).toBeGreaterThanOrEqual(1);
    expect(dup.some((e) => /Eligible/.test(e.message))).toBe(true);
  });

  it("reverse XOR order (criterion before concept) also fires duplicate-name", () => {
    const root = path.join(FIXTURES, "criterion-xor-reverse", "root.crl");
    const result = validateCRLImports(root);
    const dup = result.validationErrors.filter(
      (e) => e.kind === "duplicate-name" && /Eligible/.test(e.message),
    );
    expect(dup.length).toBeGreaterThanOrEqual(1);
    // the criterion was declared first → the concept collides against a criterion.
    expect(dup.some((e) => /already declared as a criterion/.test(e.message))).toBe(true);
  });

  it("a library-qualified criterion ref → criterion-misuse (not 'no concept named X')", () => {
    const root = path.join(FIXTURES, "criterion-foreign-qualified", "root.crl");
    const result = validateCRLImports(root);
    const mis = result.validationErrors.filter((e) => e.kind === "criterion-misuse");
    expect(mis).toHaveLength(1);
    expect(mis[0].message).toMatch(/cannot be library-qualified/);
    // it must NOT surface the misleading qualified-ref-unresolved message
    expect(result.validationErrors.some((e) => e.kind === "qualified-ref-unresolved")).toBe(false);
  });

  it("a criterion cycle is detected on the scoped path, attributed to its library/file", () => {
    const root = path.join(FIXTURES, "criterion-cycle-scoped", "root.crl");
    const result = validateCRLImports(root);
    const cyc = result.validationErrors.filter((e) => e.kind === "criterion-cycle");
    expect(cyc.length).toBeGreaterThanOrEqual(1);
    expect(cyc[0].libraryName).toBe("Root");
    expect(cyc[0].filePath).toBe(path.join(FIXTURES, "criterion-cycle-scoped", "root.crl"));
  });

  it("same criterion name in two libraries is NOT a cycle (per-(origin,library) graph isolation)", () => {
    const root = path.join(FIXTURES, "criterion-isolation", "root.crl");
    const result = validateCRLImports(root);
    expect(result.validationErrors.filter((e) => e.kind === "criterion-cycle")).toHaveLength(0);
  });
});
