import { describe, expect, it } from "@jest/globals";

import { buildCRL } from "../../index";
import type { CRL, Concept, Terminology, Location } from "../../ast/types";
import { emitCQL, emitCQLFromAST } from "../emitCQL";
import { lowerLocalCodes, localCodeSystemUrl } from "../lowerLocalCodes";

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

  it("forces `retrieveResourceType: \"Observation\"` on the synthetic CodedFromDefinition while keeping the concept's `type is` (conceptType)", () => {
    // Every local `code is` query is an Observation/boolean determination, so the
    // LOWERED retrieve must be `[Observation: …]` regardless of `type is`. The
    // author's `type is Condition` must survive on `Concept.conceptType` (the
    // Phase-2/3 inferred transform still needs it).
    const ast = parse(
      lib(`
concept "Active Crohns Disease":
- type is Condition.
- code is \`active-crohns-disease\`.
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);

    const concept = out.statements.find(
      (s): s is Concept => s.type === "Concept" && s.name === "Active Crohns Disease",
    );
    // The synthetic CodedFromDefinition forces Observation for the retrieve.
    expect(concept!.definition).toEqual(
      expect.objectContaining({
        type: "CodedFromDefinition",
        terminologyName: "Active Crohns Disease",
        retrieveResourceType: "Observation",
      }),
    );
    // ...but the author's `type is` is UNTOUCHED on the concept.
    expect(concept!.conceptType).toBe("Condition");
  });

  it("slice 4b — all synthetic terminologies carry the SAME shared codesystem decl name (the domain), URL unchanged", () => {
    const ast = parse(
      lib(
        `
concept "Adult Patient":
- type is Observation.
- code is \`adult-18-or-older\`.

concept "Active Crohns Disease":
- type is Condition.
- code is \`active-crohns-disease\`.
`,
        "Code Is Basic",
      ),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);

    const terms = out.statements.filter(
      (s): s is Terminology => s.type === "Terminology",
    );
    expect(terms).toHaveLength(2);

    const systemLines = terms.map(
      (t) =>
        t.body.find(
          (l): l is import("../../ast/types").TerminologySystem =>
            l.type === "TerminologySystem",
        )!,
    );
    // Every synthetic terminology's system line carries the SAME shared domain
    // codesystem decl name, derived from the SOURCE library name.
    for (const sl of systemLines) {
      expect(sl.name).toBe("Code Is Basic Local Codes");
    }
    // ...and the URL is unchanged (the single implicit local domain URN).
    for (const sl of systemLines) {
      expect(sl.system).toBe("urn:crl:codesystem:code-is-basic-local");
    }
    // The per-concept terminology NAMES are still the concept names (unchanged).
    expect(terms.map((t) => t.name).sort()).toEqual([
      "Active Crohns Disease",
      "Adult Patient",
    ]);
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

  it("localCodeSystemUrl falls back to a URN when canonicalBase is undefined (and slugs the library name)", () => {
    expect(localCodeSystemUrl(undefined, "Risankizumab Coverage")).toBe(
      "urn:crl:codesystem:risankizumab-coverage-local",
    );
    expect(localCodeSystemUrl(undefined, "  Weird--Name!! ")).toBe(
      "urn:crl:codesystem:weird-name-local",
    );
    expect(localCodeSystemUrl(undefined, "日本語")).toBe("urn:crl:codesystem:unnamed-local");
  });

  it("localCodeSystemUrl publishes under canonicalBase when set (byte-equal with the FHIR lane)", () => {
    expect(localCodeSystemUrl("http://example.org/crl/x", "Risankizumab Coverage")).toBe(
      "http://example.org/crl/x/CodeSystem/risankizumab-coverage-local",
    );
    expect(localCodeSystemUrl("http://example.org/crl/x", "日本語")).toBe(
      "http://example.org/crl/x/CodeSystem/unnamed-local",
    );
  });

  it("canonicalBase threads into the synthetic codesystem URL when passed to lowerLocalCodes", () => {
    const ast = parse(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult-18-or-older\`.
`),
    );
    const { ast: out } = lowerLocalCodes(ast, { canonicalBase: "http://example.org/crl/x" });
    const term = out.statements.find(
      (s): s is Terminology => s.type === "Terminology" && s.name === "Adult Patient",
    );
    expect(term!.body).toEqual([
      expect.objectContaining({
        type: "TerminologySystem",
        system: "http://example.org/crl/x/CodeSystem/t-local",
      }),
      expect.objectContaining({ type: "TerminologyCode", code: "adult-18-or-older" }),
    ]);
  });

  it("lowerLocalCodes().localCodes returns EXACTLY the lowered code-is concepts (the FHIR lane's selector)", () => {
    const ast = parse(
      lib(`
terminology "Height VS":
- valueset is \`http://example.org/height\`.

concept "Adult Patient":
- type is Observation.
- code is \`adult-18-or-older\`.

concept "Active Crohns Disease":
- type is Condition.
- code is \`active-crohns-disease\`.

concept "Height":
- type is Observation.
- value type is Quantity.
- code is \`height\`.
- source representation: - coded from "Height VS".
`),
    );
    // `Height` is representation-bearing → out of scope (NOT lowered, NOT selected).
    expect(lowerLocalCodes(ast).localCodes).toEqual([
      { concept: "Adult Patient", code: "adult-18-or-older", conceptType: "Observation" },
      { concept: "Active Crohns Disease", code: "active-crohns-disease", conceptType: "Condition" },
    ]);
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

  it("D2 — shared local codesystem decl name collides with a top-level concept → emit-local-codesystem-name-collision", () => {
    // Library "T" → shared local codesystem decl name "T Local Codes". A concept
    // literally named "T Local Codes" would emit a duplicate top-level CQL
    // identifier (codesystem vs define share the namespace). Diagnose instead.
    const ast = parse(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult\`.

concept "T Local Codes":
- type is Observation.
- value type is boolean.
- definition is most recent "Adult Patient".
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-local-codesystem-name-collision")).toBe(true);
    expect(
      errors.find((e) => e.kind === "emit-local-codesystem-name-collision")!.message,
    ).toMatch(/T Local Codes/);
  });

  it("D2 — no collision when no top-level identifier matches the shared decl name", () => {
    const ast = parse(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult\`.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-local-codesystem-name-collision")).toBe(false);
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
    // Slice 4b — ONE shared local codesystem decl ("<Lib> Local Codes"); the
    // per-concept code NAME still gets the per-CRL "<Concept> Code" suffix
    // (detectCollisions, same-named concept co-resides) and references the
    // shared decl via `from`.
    expect(cql).toContain(
      "codesystem \"T Local Codes\": 'urn:crl:codesystem:t-local'",
    );
    expect(cql).toContain(
      "code \"Adult Patient Code\": 'adult-18-or-older' from \"T Local Codes\"",
    );
    expect(cql).toContain('define "Adult Patient":');
    expect(cql).toContain('[Observation: "Adult Patient Code"]');
    expect(cql).not.toContain("TODO");
  });

  it("emits `[Observation: …]` for a synthetic CodedFromDefinition with `retrieveResourceType:\"Observation\"` even when conceptType is Condition", () => {
    // Build the lowered AST shape directly (the parser never sets
    // `retrieveResourceType`): a `type is Condition` concept whose synthetic
    // local-source definition forces the retrieve resource to Observation. The
    // emitted retrieve must be `[Observation: …]`, NOT `[Condition: …]`.
    const LOC: Location = { start: { line: 3, column: 0 }, end: { line: 3, column: 0 } };
    const term: Terminology = {
      type: "Terminology",
      name: "Active Crohns Disease",
      body: [
        { type: "TerminologySystem", system: "urn:crl:codesystem:t-local", name: "T Local Codes", location: LOC },
        { type: "TerminologyCode", code: "active-crohns-disease", location: LOC },
      ],
      location: LOC,
    };
    const concept: Concept = {
      type: "Concept",
      name: "Active Crohns Disease",
      conceptType: "Condition",
      valueTypes: [],
      representations: [],
      definition: {
        type: "CodedFromDefinition",
        terminologyName: "Active Crohns Disease",
        retrieveResourceType: "Observation",
        location: LOC,
      },
      location: LOC,
    };
    const ast: CRL = {
      type: "CRL",
      library: { type: "LibraryDeclaration", name: "T", location: LOC },
      includes: [],
      statements: [term, concept],
      location: LOC,
    };
    const r = emitCQLFromAST(ast, { libraryName: "T" });
    expect(r.success).toBe(true);
    const cql = r.result ?? "";
    expect(cql).toContain('define "Active Crohns Disease":');
    expect(cql).toContain('[Observation: "Active Crohns Disease Code"]');
    expect(cql).not.toContain("[Condition:");
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

describe("emitCQLFromAST — D1 codesystem url-conflict guard", () => {
  const LOC: Location = { start: { line: 3, column: 0 }, end: { line: 3, column: 0 } };

  // A terminology body with TWO `TerminologySystem` lines sharing one decl name
  // (`.name`) but DIFFERENT urls. The grammar allows multiple system lines; the
  // emitter resolves ONE codesystem decl name from the body, so the second line
  // maps to the same decl name with a conflicting url. (`.name` on a system line
  // is the synthetic-emitter field; the parser never sets it, so this AST is
  // built directly.)
  function astWithConflictingCodesystem(): CRL {
    const term: Terminology = {
      type: "Terminology",
      name: "Local",
      body: [
        { type: "TerminologySystem", system: "urn:crl:codesystem:a", name: "Shared", location: LOC },
        { type: "TerminologySystem", system: "urn:crl:codesystem:b", name: "Shared", location: LOC },
        { type: "TerminologyCode", code: "x", location: LOC },
      ],
      location: LOC,
    };
    return {
      type: "CRL",
      library: { type: "LibraryDeclaration", name: "T", location: LOC },
      includes: [],
      statements: [term],
      location: LOC,
    };
  }

  it("two system lines, same decl name, different urls → emit-codesystem-url-conflict + success:false", () => {
    const r = emitCQLFromAST(astWithConflictingCodesystem(), { libraryName: "T" });
    expect(r.success).toBe(false);
    expect(r.errors).toBeDefined();
    const conflict = r.errors!.find((e) => e.kind === "emit-codesystem-url-conflict");
    expect(conflict).toBeDefined();
    expect(conflict!.message).toMatch(/urn:crl:codesystem:a/);
    expect(conflict!.message).toMatch(/urn:crl:codesystem:b/);
  });

  it("clean-error-channel path: BOTH conflicting codesystem decls are still emitted (no silent drop)", () => {
    const r = emitCQLFromAST(astWithConflictingCodesystem(), { libraryName: "T" });
    const cql = r.result ?? "";
    // Both urls appear — the second decl is NOT silently dropped + mis-bound to
    // the first url; the conflict is visible in the emitted (invalid) CQL.
    expect(cql).toContain("codesystem \"Shared\": 'urn:crl:codesystem:a'");
    expect(cql).toContain("codesystem \"Shared\": 'urn:crl:codesystem:b'");
  });

  it("same decl name + SAME url is the legitimate dedup (no conflict, decl emitted once)", () => {
    const term: Terminology = {
      type: "Terminology",
      name: "Local",
      body: [
        { type: "TerminologySystem", system: "urn:crl:codesystem:a", name: "Shared", location: LOC },
        { type: "TerminologySystem", system: "urn:crl:codesystem:a", name: "Shared", location: LOC },
        { type: "TerminologyCode", code: "x", location: LOC },
      ],
      location: LOC,
    };
    const ast: CRL = {
      type: "CRL",
      library: { type: "LibraryDeclaration", name: "T", location: LOC },
      includes: [],
      statements: [term],
      location: LOC,
    };
    const r = emitCQLFromAST(ast, { libraryName: "T" });
    expect(r.success).toBe(true);
    const cql = r.result ?? "";
    // Exactly one codesystem decl line for "Shared".
    const occurrences = cql.split("codesystem \"Shared\":").length - 1;
    expect(occurrences).toBe(1);
  });
});
