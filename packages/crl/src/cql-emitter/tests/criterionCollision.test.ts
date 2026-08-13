// #236 (disc 420) — a criterion lowers to a bare `define "X"`, so its CQL top-level identifier can
// collide with a same-named ordinary PARAMETER (`parameter "X"`) or TERMINOLOGY (`valueset "X"`).
// The validator's name-uniqueness buckets are per-kind (Criterion / Parameter / Terminology are
// SEPARATE — only Concept and Criterion share one), so the pair is validator-legal; the emit-seam
// collision preflight is the guard. These pin the three resolutions:
//   - criterion vs ORDINARY parameter  → hard emit error (no safe shadow; a criterion is a boolean).
//   - criterion vs CONTEXT parameter   → NO error (a Patient param emits `context Patient`, not `X`).
//   - criterion vs terminology         → the terminology is suffixed (as for a concept collision).

import { describe, expect, it } from "vitest";

import { emitCQL } from "../emitCQL";

function lib(body: string): string {
  return `# T\nlibrary "T".\nconcept "Gate":\n- type is Observation.\n- code is \`gate\`.\n${body}`;
}
const CRIT = `criterion "Eligible":\n- when ( "Gate" ).\n`;

describe("#236 — criterion CQL-identifier collision preflight", () => {
  it("criterion vs ORDINARY parameter of the same name → hard emit error", () => {
    const r = emitCQL(lib(`parameter "Eligible":\n- param type is Period.\n${CRIT}`), { libraryName: "T", canonicalBase: "http://example.org/crl/test" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).map((e) => (typeof e === "string" ? e : e.kind))).toContain(
      "emit-criterion-parameter-name-collision",
    );
  });

  it("criterion vs a same-named CONTEXT (Patient) parameter → NO collision (emits `context Patient`)", () => {
    // The Patient parameter emits `context Patient`, NOT `parameter "Eligible"`, so its source name
    // never claims the `Eligible` identifier the criterion's `define` does. This is the case the
    // `kind === "parameter"` guard protects (a naive `astParameters.has(name)` would false-positive).
    const r = emitCQL(lib(`parameter "Eligible":\n- param type is Patient.\n${CRIT}`), { libraryName: "T", canonicalBase: "http://example.org/crl/test" });
    expect(r.success).toBe(true);
    expect((r.errors ?? []).map((e) => (typeof e === "string" ? e : e.kind))).not.toContain(
      "emit-criterion-parameter-name-collision",
    );
    expect(r.result ?? "").toContain('define "Eligible"');
  });

  it("criterion vs a same-named terminology → terminology suffixed, both emit, no error", () => {
    const r = emitCQL(
      lib(`terminology "Eligible":\n- valueset is \`http://example.org/vs/eligible\`.\n${CRIT}`),
      { libraryName: "T", canonicalBase: "http://example.org/crl/test" },
    );
    expect(r.success).toBe(true);
    const cql = r.result ?? "";
    // The criterion keeps the bare identifier; the terminology is disambiguated with a suffix.
    expect(cql).toContain('define "Eligible"');
    expect(cql).toMatch(/valueset "Eligible (ValueSet|Code)"/);
    // The bare `valueset "Eligible":` (unsuffixed) must NOT appear — that would be the collision.
    expect(cql).not.toMatch(/valueset "Eligible":/);
  });
});
