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
    .filter((l: any) => String(l.outputFilename).includes("Inferences"))
    .map((l: any) => l.cql)
    .join("\n");

/**
 * ⭐ #189 T5 step 2b — THIS WHOLE BLOCK FLIPPED LANES, and the flip is a defect fix, not a re-pin.
 *
 * `semnot-232`'s leaves ("Alpha", "Beta") are PURE QUESTIONS: locally-coded booleans with no derivation and no
 * source representation, so nothing can compute them and they are UNKNOWN until a human answers. Step 2b gives
 * each a three-state determination (`"<X> Records".answeredValue()` — true / false / null), which makes every
 * composition over them a composition over BOOLEANS, so the pivot routes them to the boolean lane.
 *
 * ⚠ WHY THE OLD PINS WERE THE BUG. In the truth-set lane an UNANSWERED question has an empty truth-set, so
 * `({ true } except (Alpha))` evaluated to `{ true }` — i.e. `sem-not <unanswered question>` was TRUE. A tree
 * guarded on it took the branch on the strength of a question nobody had answered. The boolean lane gives
 * `not (null) = null`, so the guard pauses and the question is asked. That is the #189 null/pause defect, and
 * these four cases were pinning it.
 *
 * The sibling `semnot-age-232` block below flipped the same way for the same reason at #189 2b.3b.1 (a recency
 * twin instead of a question), so this is one behaviour reaching its second family, not a new rule.
 *
 * ⚠ COVERAGE CONSEQUENCE, RECORDED RATHER THAN PAPERED OVER: `semnot-232` was the last in-tree fixture
 * reaching the truth-set unit-universe complement (`{ true } except (X)`). That lowering is now unexercised.
 * It is NOT re-covered with a contrived fixture: the complement universe only exists for a truth-set of
 * booleans (a `sem-not` over a `coded from` record list already LOUD-REFUSES, `emit-unlowerable-negation`),
 * and that lane is what T5 step 5 deletes wholesale. Authoring a fixture to keep it green would sanction a
 * shape the language no longer produces.
 */
describe("#232 — sem-not lowering (pure-question leaves → boolean lane)", () => {
  const result: any = emitCQLImports(FIX("semnot-232"));

  it("emits the closure without errors", () => {
    expect(result.success).toBe(true);
  });

  it("each question leaf publishes its THREE-STATE determination, un-Coalesced", () => {
    const cql = inferredCql(result);
    expect(cql).toMatch(/define "Alpha":\s*\n\s*Semnot232FixtureLocalPrimitives\."Alpha Records"\.answeredValue\(\)/);
    expect(cql).toMatch(/define "Beta":\s*\n\s*Semnot232FixtureLocalPrimitives\."Beta Records"\.answeredValue\(\)/);
    // Totality belongs at the branch guard, never per operand — a `Coalesce` here forecloses the pause.
    expect(cql).not.toContain("Coalesce");
  });

  it("lowers a STANDALONE no-base sem-not to boolean `not` — null-propagating, not the `{ true }` complement", () => {
    const cql = inferredCql(result);
    expect(cql).toMatch(/define "Not Alpha":\s*\n\s*not \("Alpha"\)/);
    // The unit-universe complement asserted TRUE for an unanswered question. It must not come back.
    expect(cql).not.toContain("{ true }");
    // The original #232 silent-inversion signature must also still be gone.
    expect(cql).not.toContain("FIXME");
  });

  it("a sem-or term lowers to `or not`, and precedence still cannot degrade", () => {
    const cql = inferredCql(result);
    expect(cql).toMatch(/define "Beta Or Not Alpha":\s*\n\s*"Beta"\s*\n\s*or not \("Alpha"\)/);
  });

  it("an ALL-NEGATIVE sem-and lowers to `not X and not Y` (was `{}` — always empty, then `{ true }` — always true)", () => {
    const cql = inferredCql(result);
    expect(cql).toMatch(/define "Neither Alpha Nor Beta":\s*\n\s*not \("Alpha"\)\s*\n\s*and not \("Beta"\)/);
  });

  it("a POSITIVE-ANCHORED sem-and lowers to `and not` — the boolean counterpart of `except`, grouped or not", () => {
    const cql = inferredCql(result);
    // Set `B except A` (elements of B not in A) is boolean `B and not A`. Both the ungrouped
    // `Beta sem-and sem-not Alpha` and the grouped `Beta sem-and (sem-not Alpha)` mean the same thing.
    const bodies = cql.match(/define "Beta And (Grouped )?Not Alpha":\s*\n\s*([\s\S]*?)(?=\ndefine |\s*$)/g) ?? [];
    expect(bodies.length).toBe(2);
    for (const b of bodies) {
      expect(b).toMatch(/"Beta"\s*\n\s*and \(?not \("Alpha"\)/);
      expect(b).not.toContain("asTruths()");
      expect(b).not.toContain("{ true }");
    }
  });
});

describe("#232 — sem-not over the patient-age recency twin (real-artifact shape)", () => {
  it("flips the recency-twin `sem-not` to the boolean lane (`not (...)`) — the twin emits a TOTAL boolean (#189 2b.3b.1)", () => {
    const result: any = emitCQLImports(FIX("semnot-age-232"));
    expect(result.success).toBe(true);
    const cql = inferredCql(result);
    // #189 Slice C 2b.3b.1 — `Under Age 21` = `sem-not "Age 21 Or Older"` where the operand is the recency twin,
    // which now emits a TOTAL boolean (`Coalesce(CFH.recencyAgeSelected(...), false)`). The composition is
    // all-operands-total → flips to the boolean lane: `not ("Age 21 Or Older")`, NOT the truth-set complement
    // `({ true } except ("Age 21 Or Older"))`.
    expect(cql).toMatch(/define "Under Age 21":\s*\n\s*not \("Age 21 Or Older"\)/);
    expect(cql).not.toMatch(/\{ true \} except/);
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
