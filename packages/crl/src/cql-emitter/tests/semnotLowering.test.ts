import { describe, it, expect } from "vitest";
import * as path from "path";

import { emitCQLImports } from "../../imports/emit";
import { emitCQL } from "../emitCQL";

/**
 * Issue #232 — `emit_crl` silently dropped `sem-not` in the `defined as`
 * truth-set lane: it emitted the operand UNNEGATED with only a `// FIXME`
 * comment and `success: true`, so an inference concept that should be the
 * complement of its operand shipped computing the operand itself (a silent
 * semantic inversion; caught only by `$apply`).
 *
 * Model (design disc 325): in the truth-set lane every value is `{ true }`
 * (established) / `{}` (not established), so `A except B` is already closed-world
 * `A and not B`. A NO-BASE `sem-not` (standalone, `sem-or` term, all-negative
 * `sem-and`) — which has no positive base to `except` from — lowers to the
 * unit-universe complement `({ true } except (X))`. Only in the truth-set flavor:
 * a `sem-not` over a resource-list (`coded from`) operand has no complement
 * universe → LOUD-REFUSE (an `emit-unlowerable-negation` hardError forcing
 * `success: false` + a compile-failing `CRLCommon.UnsupportedNegation(…)`
 * sentinel), never a silent inversion.
 *
 * The byte-exact CQL for the truth-set positions is pinned by the
 * `semnot-232` / `semnot-age-232` goldens in `emit-golden.test.ts`; this file
 * asserts the invariants goldens can't capture (a `success: false` refusal, the
 * precedence-critical parenthesisation, the classifier recognising a recency twin).
 */

const FIX = (name: string): string =>
  path.join(__dirname, "fixtures", name, `${name}.crl`);

const inferredCql = (result: any): string =>
  (result.cqlByLibrary ?? [])
    .filter((l: any) => String(l.outputFilename).includes("Inferred"))
    .map((l: any) => l.cql)
    .join("\n");

describe("#232 — sem-not lowering (truth-set lane)", () => {
  const result: any = emitCQLImports(FIX("semnot-232"));

  it("emits the closure without errors", () => {
    expect(result.success).toBe(true);
  });

  it("lowers a STANDALONE no-base sem-not to the unit-universe complement", () => {
    const cql = inferredCql(result);
    expect(cql).toMatch(
      /define "Not Alpha":\s*\n\s*\(\{ true \} except \(Semnot232FixtureLocalSource\."Alpha"\.asTruths\(\)\)\)/,
    );
    // The old silent-inversion signature must be gone.
    expect(cql).not.toContain("FIXME");
  });

  it("PARENTHESISES the complement as a sem-or term (union/except share precedence, left-assoc)", () => {
    // `B union ({ true } except (A))` must NOT degrade to `(B union { true }) except A`.
    const cql = inferredCql(result);
    expect(cql).toMatch(
      /define "Beta Or Not Alpha":[\s\S]*?\.asTruths\(\)\s*\n\s*union \(\{ true \} except \(Semnot232FixtureLocalSource\."Alpha"\.asTruths\(\)\)\)/,
    );
  });

  it("lowers an ALL-NEGATIVE sem-and to an intersect of complements (was `{}` — always empty)", () => {
    const cql = inferredCql(result);
    expect(cql).toMatch(
      /define "Neither Alpha Nor Beta":\s*\n\s*\(\{ true \} except \([\s\S]*?"Alpha"\.asTruths\(\)\)\)\s*\n\s*intersect \(\{ true \} except \([\s\S]*?"Beta"\.asTruths\(\)\)\)/,
    );
  });

  it("leaves a POSITIVE-ANCHORED sem-and on `except` (unchanged), grouped or not", () => {
    const cql = inferredCql(result);
    // Both the ungrouped `Beta sem-and sem-not Alpha` and the grouped
    // `Beta sem-and (sem-not Alpha)` produce the identical `Beta except Alpha`.
    const bodies = cql.match(/define "Beta And (Grouped )?Not Alpha":\s*\n\s*([\s\S]*?)(?=\ndefine |\s*$)/g) ?? [];
    expect(bodies.length).toBe(2);
    for (const b of bodies) {
      expect(b).toContain('except Semnot232FixtureLocalSource."Alpha".asTruths()');
      expect(b).not.toContain("{ true }");
    }
  });
});

describe("#232 — sem-not over the patient-age recency twin (real-artifact shape)", () => {
  it("classifies the recency both-rep twin as a truth-set and lowers (does NOT loud-refuse)", () => {
    const result: any = emitCQLImports(FIX("semnot-age-232"));
    expect(result.success).toBe(true);
    const cql = inferredCql(result);
    // `Under Age 21` = `sem-not "Age 21 Or Older"` where the operand is a bare
    // same-layer recency-twin inferred sibling → complement of that truth-set.
    expect(cql).toMatch(/define "Under Age 21":\s*\n\s*\(\{ true \} except \("Age 21 Or Older"\)\)/);
    expect(cql).not.toContain("FIXME");
    expect(cql).not.toContain("UnsupportedNegation");
  });
});

describe("#232 — sem-not over a resource-list operand (loud-refuse)", () => {
  const result: any = emitCQLImports(FIX("semnot-refuse-232"));

  it("fails the emit rather than silently shipping the operand unnegated", () => {
    expect(result.success).toBe(false);
  });

  it("surfaces a source-located `emit-unlowerable-negation` hardError at the sem-not", () => {
    const errs: any[] = (result.importDiagnostics ?? [])
      .flatMap((d: any) => d.errors ?? [])
      .concat(result.errors ?? [], result.hardErrors ?? []);
    const neg = JSON.parse(JSON.stringify(result));
    // The kind must be present, and carry a real source location (not 0/0).
    const blob = JSON.stringify(neg);
    expect(blob).toContain("emit-unlowerable-negation");
    const m = blob.match(/"kind":"emit-unlowerable-negation","line":(\d+),"column":(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    void errs;
  });

  it("reports the `unknown` flavor (not `resource-list`) for an unmodeled operand", () => {
    // The single-library `coded from` fixture resolves through the off-lane, whose
    // operand flavor is unmodeled → `unknown`. The message must say so, not claim
    // a resource-list problem (the impl-review message-split).
    const msg = JSON.stringify(result);
    expect(msg).toContain("could not be established locally");
  });

  it("poisons the directly-emitted CQL with a compile-failing UnsupportedNegation sentinel", () => {
    // `emitCQLImports` discards a failed library's CQL, so assert the sentinel at
    // the single-library `emitCQL` level (a caller that writes `result` despite
    // `success: false` gets CQL that cannot compile — the #79 safety net). A
    // single-library `off`-lane refinement `sem-not` also has no truth-set lane,
    // so it likewise loud-refuses.
    const src = [
      'library "Direct Refuse".',
      "",
      'terminology "VS":',
      "- valueset is `http://example.org/vs`.",
      "",
      'concept "Foo":',
      "- type is Observation.",
      "- value type is CodeableConcept.",
      '- coded from "VS".',
      "",
      'concept "Not Foo":',
      "- type is Observation.",
      "- value type is CodeableConcept.",
      '- defined as ( sem-not "Foo" ).',
      "",
    ].join("\n");
    const direct: any = emitCQL(src);
    expect(direct.success).toBe(false);
    expect((direct.errors ?? []).some((e: any) => e.kind === "emit-unlowerable-negation")).toBe(true);
    expect(String(direct.result ?? "")).toContain("CRLCommon.UnsupportedNegation(");
  });
});

describe("#232 — grouping & diagnostics (impl-review refinements)", () => {
  const resourceLib = (defs: string): string =>
    [
      'library "P".',
      "",
      'terminology "VS":',
      "- valueset is `http://example.org/vs`.",
      "",
      'concept "A":',
      "- type is Encounter.",
      "- value type is CodeableConcept.",
      '- coded from "VS".',
      "",
      'concept "B":',
      "- type is Encounter.",
      "- value type is CodeableConcept.",
      '- coded from "VS".',
      "",
      defs,
    ].join("\n");

  const bodyOf = (cql: string, name: string): string =>
    cql.match(new RegExp(`define "${name}":[\\s\\S]*?(?=\\ndefine |\\n*$)`))?.[0] ?? "";

  it("peels ALL redundant grouping — parentheses never change support (single ≡ double group)", () => {
    const single: any = emitCQL(
      resourceLib(
        'concept "S":\n- type is Encounter.\n- value type is CodeableConcept.\n- defined as ( "A" sem-and ( sem-not "B" ) ).',
      ),
    );
    const dbl: any = emitCQL(
      resourceLib(
        'concept "D":\n- type is Encounter.\n- value type is CodeableConcept.\n- defined as ( "A" sem-and ( ( sem-not "B" ) ) ).',
      ),
    );
    // Both are positive-anchored `A except B` — no loud-refuse, identical bodies.
    expect(single.success).toBe(true);
    expect(dbl.success).toBe(true);
    expect(bodyOf(String(single.result), "S").replace(/S/, "X")).toBe(
      bodyOf(String(dbl.result), "D").replace(/D/, "X"),
    );
    expect(bodyOf(String(dbl.result), "D")).toContain('"A"');
    expect(bodyOf(String(dbl.result), "D")).toContain('except "B"');
  });

  it("reports each all-negative refusal at its OWN sem-not location (not the operand)", () => {
    const r: any = emitCQL(
      resourceLib(
        'concept "N":\n- type is Encounter.\n- value type is CodeableConcept.\n- defined as ( sem-not "A" sem-and sem-not "B" ).',
      ),
    );
    expect(r.success).toBe(false);
    const errs = (r.errors ?? []).filter((e: any) => e.kind === "emit-unlowerable-negation");
    // One per sem-not, at DISTINCT columns (the two `sem-not` keywords), same line.
    expect(errs.length).toBe(2);
    expect(errs[0].line).toBeGreaterThan(0);
    expect(errs[0].column).not.toBe(errs[1].column);
  });
});
