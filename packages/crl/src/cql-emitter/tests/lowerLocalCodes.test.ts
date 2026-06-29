import { describe, expect, it } from "@jest/globals";

import { buildCRL } from "../../index";
import type { CRL, Concept, Terminology } from "../../ast/types";
import { emitCQL } from "../emitCQL";
import { lowerLocalCodes, localCodesystemUrn } from "../lowerLocalCodes";

// Slice 3 — concept-level `code is` local-source lowering. Covers the
// `lowerLocalCodes` transform shape + each hard-error diagnostic, plus the
// end-to-end emit (per-CRL inline) of a `code is` concept.

function parse(src: string): CRL {
  const r = buildCRL(src);
  if (!r.success || !r.result) {
    throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  }
  return r.result;
}

function lib(body: string, name = "T"): string {
  return `# ${name}\nlibrary "${name}".\n${body}`;
}

describe("lowerLocalCodes — transform", () => {
  it("lowers a `code is`-only concept into a synthetic Terminology + CodedFromDefinition and CLEARS `code`", () => {
    const ast = parse(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult-18-or-older\`.
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);

    // A synthetic Terminology named after the concept was prepended.
    const term = out.statements.find(
      (s): s is Terminology => s.type === "Terminology" && s.name === "Adult Patient",
    );
    expect(term).toBeDefined();
    expect(term!.body).toEqual([
      expect.objectContaining({ type: "TerminologySystem", system: "urn:crl:codesystem:t-local" }),
      expect.objectContaining({ type: "TerminologyCode", code: "adult-18-or-older" }),
    ]);

    // The concept now carries a CodedFromDefinition bare-ref'ing the code name,
    // and its `code` has been cleared (idempotency).
    const concept = out.statements.find(
      (s): s is Concept => s.type === "Concept" && s.name === "Adult Patient",
    );
    expect(concept!.code).toBeUndefined();
    expect(concept!.definition).toEqual(
      expect.objectContaining({ type: "CodedFromDefinition", terminologyName: "Adult Patient" }),
    );
  });

  it("is idempotent — a second pass over already-lowered output is a no-op", () => {
    const ast = parse(
      lib(`
concept "X":
- type is Observation.
- code is \`x\`.
`),
    );
    const first = lowerLocalCodes(ast);
    expect(first.errors).toHaveLength(0);
    const second = lowerLocalCodes(first.ast);
    expect(second.errors).toHaveLength(0);
    // No new synthetic terminology added on the second pass.
    const termCount = (a: CRL): number => a.statements.filter((s) => s.type === "Terminology").length;
    expect(termCount(second.ast)).toBe(termCount(first.ast));
    expect(second.ast).toBe(first.ast); // fast-path returns input untouched
  });

  it("does NOT mutate the input AST", () => {
    const ast = parse(
      lib(`
concept "X":
- type is Observation.
- code is \`x\`.
`),
    );
    lowerLocalCodes(ast);
    const concept = ast.statements.find(
      (s): s is Concept => s.type === "Concept" && s.name === "X",
    );
    expect(concept!.code).toBe("x"); // original still carries its code
    expect(concept!.definition).toBeUndefined();
  });

  it("leaves a `code is` + `possible representation` concept UNTOUCHED (out of scope)", () => {
    const ast = parse(
      lib(`
terminology "Height VS":
- valueset is \`http://example.org/height\`.

concept "Height":
- type is Observation.
- value type is Quantity.
- code is \`height\`.
- source representation: - coded from "Height VS".
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);
    const concept = out.statements.find(
      (s): s is Concept => s.type === "Concept" && s.name === "Height",
    );
    // Code preserved, no synthetic CodedFromDefinition installed.
    expect(concept!.code).toBe("height");
    expect(concept!.definition).toBeUndefined();
  });

  it("localCodesystemUrn slugs the library name (and falls back to `unnamed`)", () => {
    expect(localCodesystemUrn("Risankizumab Coverage")).toBe(
      "urn:crl:codesystem:risankizumab-coverage-local",
    );
    expect(localCodesystemUrn("  Weird--Name!! ")).toBe("urn:crl:codesystem:weird-name-local");
    expect(localCodesystemUrn("日本語")).toBe("urn:crl:codesystem:unnamed-local");
  });
});

describe("lowerLocalCodes — diagnostics (hard errors)", () => {
  it("`code is` with NO `type is` → emit-local-code-missing-type (no Observation default)", () => {
    const ast = parse(
      lib(`
concept "No Type":
- code is \`x\`.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("emit-local-code-missing-type");
    expect(errors[0].message).toMatch(/No Type/);
  });

  it("two `code is` concepts with the SAME code value → emit-duplicate-local-code", () => {
    const ast = parse(
      lib(`
concept "A":
- type is Observation.
- code is \`dup\`.

concept "B":
- type is Condition.
- code is \`dup\`.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-duplicate-local-code")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-duplicate-local-code")!.message).toMatch(/dup/);
  });

  it("empty `code is` value (+ a real definition) → emit-empty-local-code", () => {
    // An empty-code-ONLY concept is a parse error (no real body), so pair the
    // empty code with a representation to keep it parseable... but a
    // representation-bearing concept is skipped. Use empty code + nothing else
    // is unparseable; instead assert via a directly-constructed AST node.
    const ast = parse(
      lib(`
concept "Real":
- type is Observation.
- code is \`real\`.
`),
    );
    // Inject an empty-code concept (builder preserves `code: ""` when the line
    // is present, but an empty-code-only concept fails the body check; emulate
    // the surviving shape directly).
    const empty: Concept = {
      type: "Concept",
      name: "Empty",
      conceptType: "Observation",
      valueTypes: [],
      code: "",
      representations: [],
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const withEmpty: CRL = { ...ast, statements: [...ast.statements, empty] };
    const { errors } = lowerLocalCodes(withEmpty);
    expect(errors.some((e) => e.kind === "emit-empty-local-code")).toBe(true);
  });

  it("empty `code is` + a definition reports emit-empty-local-code (NOT mixed) — empty checked first", () => {
    const ast = parse(
      lib(`
concept "Leaf":
- type is Observation.
- coded from "VS".

terminology "VS":
- valueset is \`vs\`.

concept "EmptyMixed":
- type is Observation.
- coded from "VS".
`),
    );
    // Force an empty code onto a concept that also carries a definition.
    const idx = ast.statements.findIndex((s) => s.type === "Concept" && s.name === "EmptyMixed");
    const stmts = [...ast.statements];
    stmts[idx] = { ...(stmts[idx] as Concept), code: "" };
    const withEmptyMixed: CRL = { ...ast, statements: stmts };
    const { errors } = lowerLocalCodes(withEmptyMixed);
    expect(errors.some((e) => e.kind === "emit-empty-local-code")).toBe(true);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
  });

  it("`code is` + top-level `definition` (mixed) → emit-mixed-code-and-definition", () => {
    const ast = parse(
      lib(`
concept "Leaf":
- type is Observation.
- coded from "VS".

terminology "VS":
- valueset is \`vs\`.

concept "Mixed":
- type is Observation.
- value type is boolean.
- code is \`mixed\`.
- defined as "Leaf".
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message).toMatch(/Mixed/);
  });

  it("empty `code is` + representation → emit-empty-local-code (empty checked BEFORE representation skip)", () => {
    // A representation-bearing concept is normally skipped (out of scope), but
    // an EMPTY code is malformed regardless — the empty check runs first, so the
    // hard error still fires rather than the concept escaping silently.
    const ast = parse(
      lib(`
terminology "Height VS":
- valueset is \`http://example.org/height\`.

concept "Height":
- type is Observation.
- value type is Quantity.
- code is \`height\`.
- source representation: - coded from "Height VS".
`),
    );
    // Force the representation-bearing concept's code empty.
    const idx = ast.statements.findIndex((s) => s.type === "Concept" && s.name === "Height");
    const stmts = [...ast.statements];
    stmts[idx] = { ...(stmts[idx] as Concept), code: "" };
    const withEmpty: CRL = { ...ast, statements: stmts };
    const { errors } = lowerLocalCodes(withEmpty);
    expect(errors.some((e) => e.kind === "emit-empty-local-code")).toBe(true);
  });

  it("`code is` + `defined as` + representation → emit-mixed-code-and-definition (mixed checked BEFORE representation skip)", () => {
    // A mixed code+definition concept that ALSO bears a representation must STILL
    // raise the mixed hard error (not be silently skipped via the representation
    // lane and emit only the definition, dropping the code-source side).
    const ast = parse(
      lib(`
concept "Leaf":
- type is Observation.
- coded from "VS".

terminology "VS":
- valueset is \`vs\`.

terminology "Height VS":
- valueset is \`http://example.org/height\`.

concept "MixedRep":
- type is Observation.
- value type is boolean.
- code is \`mixed-rep\`.
- defined as "Leaf".
- source representation: - coded from "Height VS".
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message).toMatch(/MixedRep/);
  });

  it("`code is` + representation (no top-level definition) → SKIPPED (no error, code preserved, input untouched)", () => {
    const ast = parse(
      lib(`
terminology "Height VS":
- valueset is \`http://example.org/height\`.

concept "Height":
- type is Observation.
- value type is Quantity.
- code is \`height\`.
- source representation: - coded from "Height VS".
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);
    // No synthetic terminology was synthesized; the concept keeps its code and
    // gains no definition. The whole AST is returned untouched (===) so the
    // imports-path `didLower` identity check stays correct.
    expect(out).toBe(ast);
    const concept = out.statements.find(
      (s): s is Concept => s.type === "Concept" && s.name === "Height",
    );
    expect(concept!.code).toBe("height");
    expect(concept!.definition).toBeUndefined();
    expect(out.statements.some((s) => s.type === "Terminology" && s.name === "Height")).toBe(false);
  });

  it("two `code is` concepts with the SAME name → emit-duplicate-local-concept", () => {
    // Concept-name uniqueness is normally a validator concern, but direct
    // emitCQL/emitCQLFromAST don't run it; two same-named `code is` concepts
    // would synthesize two same-named terminologies and collapse — diagnose.
    const ast = parse(
      lib(`
concept "Dup":
- type is Observation.
- code is \`a\`.
`),
    );
    const second: Concept = {
      type: "Concept",
      name: "Dup",
      conceptType: "Condition",
      valueTypes: [],
      code: "b",
      representations: [],
      location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    };
    const withDup: CRL = { ...ast, statements: [...ast.statements, second] };
    const { errors } = lowerLocalCodes(withDup);
    expect(errors.some((e) => e.kind === "emit-duplicate-local-concept")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-duplicate-local-concept")!.message).toMatch(/Dup/);
  });

  it("synthetic terminology name collides with an existing terminology → emit-local-code-terminology-collision", () => {
    const ast = parse(
      lib(`
terminology "Clash":
- valueset is \`vs\`.

concept "Clash":
- type is Observation.
- code is \`clash\`.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-local-code-terminology-collision")).toBe(true);
  });
});

describe("emitCQL — `code is` end-to-end (per-CRL inline)", () => {
  it("emits a local codesystem (URN) + code + retrieve, replacing the TODO stub", () => {
    const r = emitCQL(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult-18-or-older\`.
`),
      { libraryName: "T" },
    );
    expect(r.success).toBe(true);
    const cql = r.result ?? "";
    // detectCollisions suffixes the same-named terminology to "<Concept> Code".
    expect(cql).toContain(
      "codesystem \"Adult Patient Code System\": 'urn:crl:codesystem:t-local'",
    );
    expect(cql).toContain(
      "code \"Adult Patient Code\": 'adult-18-or-older' from \"Adult Patient Code System\"",
    );
    expect(cql).toContain('define "Adult Patient":');
    expect(cql).toContain('[Observation: "Adult Patient Code"]');
    expect(cql).not.toContain("TODO");
  });

  it("surfaces a missing-type `code is` concept as a hard error in EmitResult.errors", () => {
    const r = emitCQL(
      lib(`
concept "No Type":
- code is \`x\`.
`),
      { libraryName: "T" },
    );
    expect(r.success).toBe(false);
    expect(r.errors?.[0]?.kind).toBe("emit-local-code-missing-type");
  });
});
