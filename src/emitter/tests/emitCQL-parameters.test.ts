import { describe, expect, it } from "@jest/globals";

import type { CRL, Parameter, ParameterType } from "../../ast/types";
import { emitCQL, emitCQLFromAST } from "../emitCQL";

// v2.2 Todo 3 (issue #59) — emitter coverage for AST `Parameter` declarations.
// See `.vibe-tools/discussions/038-...` for the test-scope rationale.

function lib(name: string, body: string): string {
  return `# ${name}\nlibrary "${name}".\n${body}`;
}

function ok(src: string): string {
  const r = emitCQL(src, { libraryName: srcLibName(src) });
  expect(r.success).toBe(true);
  return r.result ?? "";
}

function srcLibName(src: string): string {
  const m = src.match(/library "([^"]+)"\./);
  return m ? m[1] : "T";
}

describe("emitter — Todo 3: AST parameter declarations (issue #59)", () => {
  it("AST `parameter \"Measurement Period\" Period` emits as `parameter \"Measurement Period\" Interval<DateTime>` with NO default", () => {
    const cql = ok(lib("T", `parameter "Measurement Period":\n- param type is Period.\n`));
    expect(cql).toMatch(/parameter "Measurement Period" Interval<DateTime>/);
    // AST-derived parameters do NOT emit the legacy stub default.
    expect(cql).not.toMatch(/default Interval\[/);
  });

  it("AST `parameter \"X\" Patient` emits `context Patient`, NO parameter line", () => {
    const cql = ok(lib("T", `parameter "Eligible Patient":\n- param type is Patient.\n`));
    expect(cql).toMatch(/context Patient/);
    // Patient-typed parameter's literal name must NOT appear as a parameter line.
    expect(cql).not.toMatch(/parameter "Eligible Patient"/);
  });

  it("AST `parameter \"X\" Practitioner` (hand-built; not yet in lexer allowlist) emits `context Practitioner`", () => {
    // Practitioner widening is deferred from Todo 3 — `parameterTypes.json`
    // does not yet include Practitioner. The branch is future-proofing, so
    // we exercise it with a hand-built AST + explicit cast.
    const practitionerParam: Parameter = {
      type: "Parameter",
      name: "Index Practitioner",
      parameterType: "Practitioner" as unknown as ParameterType,
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const ast: CRL = {
      type: "CRL",
      library: {
        type: "Library",
        name: "T",
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      },
      includes: [],
      statements: [practitionerParam],
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const r = emitCQLFromAST(ast, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/context Practitioner/);
    expect(r.result).not.toMatch(/parameter "Index Practitioner"/);
  });

  it("Patient + Practitioner conflict → FIXME comment + Practitioner wins", () => {
    const patientParam: Parameter = {
      type: "Parameter",
      name: "P1",
      parameterType: "Patient",
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const practitionerParam: Parameter = {
      type: "Parameter",
      name: "P2",
      parameterType: "Practitioner" as unknown as ParameterType,
      location: { line: 2, column: 0 },
    };
    const ast: CRL = {
      type: "CRL",
      library: { type: "Library", name: "T", location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
      includes: [],
      statements: [patientParam, practitionerParam],
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const r = emitCQLFromAST(ast, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/\/\/ FIXME: multiple context-typed parameters declared; emitted as Practitioner\ncontext Practitioner/);
  });

  it("concept \"Foo\" + parameter \"Foo\" Period → only `define \"Foo\"` line, no `parameter \"Foo\"` line (index-time shadow)", () => {
    // Non-stub terminology URL — otherwise the existing stub-valueset
    // mechanism would clobber this test by emitting a stub-derived
    // parameter and skipping the concept.
    const cql = ok(lib("T", `concept "Foo":
- type is Observation.
- value type is Quantity.
- coded from "Foo VS".
terminology "Foo VS":
- valueset is \`http://example.org/foo\`.
parameter "Foo":
- param type is Period.
`));
    expect(cql).toMatch(/define "Foo"/);
    expect(cql).not.toMatch(/parameter "Foo" Interval<DateTime>/);
  });

  it("shadowed Practitioner-typed parameter does NOT promote to `context Practitioner`", () => {
    // Hand-built: concept "X" + parameter "X" Practitioner. The parameter
    // is shadowed at index time, so `emitContext` should NOT see it and
    // therefore should fall back to the default `context Patient`.
    const ast: CRL = {
      type: "CRL",
      library: { type: "Library", name: "T", location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
      includes: [],
      statements: [
        {
          type: "Concept",
          name: "X",
          conceptType: "Observation",
          valueTypes: ["boolean"],
          definition: {
            type: "DefinitionIsDefinition",
            body: {
              type: "NarrativeClause",
              // Use a matched narrative (`<X> performed`) so issue #79's
              // unmatched-narrative envelope flip doesn't fail this test —
              // the test's concern is parameter shadowing, not emit fidelity.
              elements: [
                { type: "NConceptRef", value: "Y", location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
                { type: "NWord", value: "performed", location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
              ],
              location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            },
            location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          },
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        } as never,
        {
          type: "Parameter",
          name: "X",
          parameterType: "Practitioner" as unknown as ParameterType,
          location: { line: 2, column: 0 },
        },
      ],
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const r = emitCQLFromAST(ast, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/context Patient/);
    expect(r.result).not.toMatch(/context Practitioner/);
  });

  it("terminology \"X\" + parameter \"X\" → terminology emits with \" ValueSet\" suffix", () => {
    const cql = ok(lib("T", `terminology "Foo":
- valueset is \`http://example.org/foo\`.
parameter "Foo":
- param type is Period.
`));
    expect(cql).toMatch(/valueset "Foo ValueSet"/);
    expect(cql).toMatch(/parameter "Foo" Interval<DateTime>/);
  });

  it("Patient-typed parameter local bare narrative ref rewrites to `Patient` identifier (operator's CQL-spec rule)", () => {
    const cql = ok(lib("T", `parameter "Eligible Patient":
- param type is Patient.
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "Eligible Patient" performed.
`));
    // The narrative ref `"Eligible Patient"` must rewrite to bare `Patient`
    // in the emitted CQL — NOT the literal quoted parameter name.
    expect(cql).toMatch(/CRLPatterns\.WasPerformed\([^)]*Patient\)/);
    expect(cql).not.toMatch(/"Eligible Patient"/);
  });

  it("Patient-typed parameter self-qualified narrative ref also rewrites to `Patient`", () => {
    const cql = ok(lib("T", `parameter "Eligible Patient":
- param type is Patient.
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "T"."Eligible Patient" performed.
`));
    expect(cql).toMatch(/CRLPatterns\.WasPerformed\([^)]*Patient\)/);
    expect(cql).not.toMatch(/"Eligible Patient"/);
  });

  it("two-pass `indexNames` — parameter declared BEFORE concept of same name still gets shadowed (locks R4-Δ4 against source-order regression)", () => {
    const cql = ok(lib("T", `parameter "Foo":
- param type is Period.
concept "Foo":
- type is Observation.
- value type is Quantity.
- coded from "Foo VS".
terminology "Foo VS":
- valueset is \`http://example.org/foo\`.
`));
    expect(cql).toMatch(/define "Foo"/);
    expect(cql).not.toMatch(/parameter "Foo" Interval<DateTime>/);
  });

  it("shadowed Patient-typed parameter does NOT trigger bare-`Patient` rewrite on narrative ref (locks R3-Δ1 over R3-Δ3)", () => {
    // Concept "Eligible Patient" (boolean) + parameter "Eligible Patient" Patient.
    // Per R3-Δ1, the parameter is shadowed at index time; the narrative ref
    // resolves to the concept and emits the CONCEPT's identifier — NOT the
    // bare CQL `Patient` context that the rewrite would produce.
    const cql = ok(lib("T", `concept "Eligible Patient":
- type is Observation.
- value type is boolean.
- coded from "Foo VS".
terminology "Foo VS":
- valueset is \`http://example.org/foo\`.
parameter "Eligible Patient":
- param type is Patient.
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "Eligible Patient" performed.
`));
    // The ref resolves to the concept's quoted identifier, not bare `Patient`.
    expect(cql).toMatch(/CRLPatterns\.WasPerformed\("Eligible Patient"\)/);
    expect(cql).not.toMatch(/CRLPatterns\.WasPerformed\(Patient\)/);
  });

  it("Patient-typed AST parameter coexists with same-name empty-URL terminology — context emits, terminology gets collision suffix", () => {
    // v2.2 Todo 5 — after stub-mechanism removal, an empty-URL terminology
    // is no longer silently magic-converted to a runtime parameter; it
    // emits as a literal `valueset "X": ''` declaration. When it collides
    // with a same-named AST parameter, the existing collision-suffix
    // branch fires (the AST parameter populates `astParameters` BEFORE
    // `detectCollisions` runs, so the suffix `" ValueSet"` lands).
    const cql = ok(lib("T", `parameter "Measurement Period":
- param type is Patient.
terminology "Measurement Period":
- valueset is \`\`.
`));
    // Patient-typed parameter → CQL context, no `parameter` line for it.
    expect(cql).toMatch(/context Patient/);
    expect(cql).not.toMatch(/parameter "Measurement Period"/);
    // Collision-suffixed terminology — surfaces the author's empty-URL TODO
    // rather than masking it.
    expect(cql).toMatch(/valueset "Measurement Period ValueSet": ''/);
  });

  it("`coded from` to a parameter name produces the parameter-shadow FIXME (not the generic unresolved-terminology one)", () => {
    // Direct emitter input — validator would reject this CRL, but the soft-
    // compile path through emitCQL still has to produce useful output. The
    // FIXME wording disambiguates "you wrote a parameter where a terminology
    // belongs" from "this terminology doesn't exist."
    const cql = ok(lib("T", `parameter "MyParam":
- param type is Period.
concept "X":
- type is Observation.
- coded from "MyParam".
`));
    expect(cql).toMatch(/\/\/ FIXME: "MyParam" is a parameter, not a terminology/);
  });

  it("AST-derived Period parameter emits without a default-Interval clause", () => {
    const astCql = ok(lib("T", `parameter "Measurement Period":
- param type is Period.
`));
    expect(astCql).toMatch(/parameter "Measurement Period" Interval<DateTime>/);
    expect(astCql).not.toMatch(/default Interval\[/);
  });

  it("AST Period parameter + same-name empty-URL terminology — terminology gets collision suffix, no synthesized default", () => {
    // v2.2 Todo 5 — replaces the previous "stub-derived parameter keeps
    // its default" test. After stub-mechanism removal, the empty-URL
    // terminology emits as a literal `valueset "X ValueSet": ''` (the
    // collision-suffix branch fires because the AST parameter already
    // claims `"Measurement Period"`). No magic Interval<DateTime> default
    // synthesis anywhere.
    const cql = ok(lib("T", `parameter "Measurement Period":
- param type is Period.
terminology "Measurement Period":
- valueset is \`\`.
`));
    expect(cql).toMatch(/parameter "Measurement Period" Interval<DateTime>/);
    expect(cql).not.toMatch(/default Interval\[/);
    expect(cql).toMatch(/valueset "Measurement Period ValueSet": ''/);
  });
});
