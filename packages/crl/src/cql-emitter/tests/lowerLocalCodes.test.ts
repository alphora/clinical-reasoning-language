import { describe, expect, it } from "vitest";

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

  it("`code is` + `coded from` (mixed, NON-`defined as`) → emit-mixed-code-and-definition", () => {
    // `code is` + `defined as` is now SUPPORTED (both-representation, see the
    // split tests below). A NON-`defined as` definition mixed with `code is`
    // (`coded from` here; `definition is` likewise) remains a hard error.
    const ast = parse(
      lib(`
terminology "VS":
- valueset is \`vs\`.

terminology "Other VS":
- valueset is \`other\`.

concept "Mixed":
- type is Observation.
- value type is boolean.
- code is \`mixed\`.
- coded from "Other VS".
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message).toMatch(/Mixed/);
  });

  it("`code is` + `defined as` (both-representation) is NOT a mixed error — it SPLITS", () => {
    const ast = parse(
      lib(`
concept "Leaf":
- type is Observation.
- coded from "VS".

terminology "VS":
- valueset is \`vs\`.

concept "Both":
- type is Observation.
- value type is boolean.
- code is \`both\`.
- defined as "Leaf".
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
    // The both-rep concept SPLITS into a LocalSource retrieve twin (CodedFromDefinition,
    // forced Observation) + an Inferred fold-in twin (its `defined as`, marked).
    const both = out.statements.filter(
      (s): s is Concept => s.type === "Concept" && s.name === "Both",
    );
    expect(both.length).toBe(2);
    const localTwin = both.find((c) => c.definition?.type === "CodedFromDefinition");
    const inferredTwin = both.find((c) => c.definition?.type === "DefinedAsDefinition");
    expect(localTwin).toBeDefined();
    expect((localTwin!.definition as { retrieveResourceType?: string }).retrieveResourceType).toBe(
      "Observation",
    );
    expect(inferredTwin).toBeDefined();
    expect(inferredTwin!.__bothRepFoldInLocalSource).toBe("Both");
    expect(localTwin!.code).toBeUndefined();
    expect(inferredTwin!.code).toBeUndefined();
  });

  it("`code is` + `definition is age today at least <n> years` (patient-age both-rep) SPLITS with merge:recency", () => {
    const ast = parse(
      lib(`
concept "Age 18 Or Older":
- type is Observation.
- value type is boolean.
- code is \`age-18-or-older\`.
- definition is age today at least 18 years.
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
    const twins = out.statements.filter(
      (s): s is Concept => s.type === "Concept" && s.name === "Age 18 Or Older",
    );
    expect(twins.length).toBe(2);
    const localTwin = twins.find((c) => c.definition?.type === "CodedFromDefinition");
    const inferredTwin = twins.find((c) => c.definition?.type === "DefinitionIsDefinition");
    expect(localTwin).toBeDefined();
    expect(inferredTwin).toBeDefined();
    expect(inferredTwin!.__bothRepFoldInLocalSource).toBe("Age 18 Or Older");
    expect(inferredTwin!.__bothRepMerge).toBe("recency");
    expect(inferredTwin!.__bothRepRecencyThreshold).toBe("18 'years'");
    expect(localTwin!.code).toBeUndefined();
    expect(inferredTwin!.code).toBeUndefined();
  });

  it("`code is` + a NON-age `definition is` is STILL emit-mixed-code-and-definition (only age-today allowed)", () => {
    const ast = parse(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult\`.

concept "Mixed Def":
- type is Observation.
- value type is boolean.
- code is \`mixed-def\`.
- definition is most recent "Adult Patient".
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message).toMatch(/Mixed Def/);
  });

  it("`code is` + `definition is age today at least 18 months` (NON-year unit) → emit-mixed-code-and-definition (unit guard)", () => {
    // AgeAt() is age-in-YEARS and AtLeast is unit-blind; a non-year threshold
    // would silently mean `ageYears >= 18`. The unit guard rejects it → the
    // narrative is not the accepted age-today pattern → hard error.
    const ast = parse(
      lib(`
concept "Age Months":
- type is Observation.
- value type is boolean.
- code is \`age-months\`.
- definition is age today at least 18 months.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message).toMatch(/Age Months/);
  });

  it("`code is` + age `definition is` on a NON-Observation `type is` → emit-mixed-code-and-definition (recency shape guard)", () => {
    // The recency merge emits an Observation-boolean retrieve; a `type is Condition`
    // recency concept would mis-emit against it. Require `type is Observation`.
    const ast = parse(
      lib(`
concept "Age Cond":
- type is Condition.
- value type is boolean.
- code is \`age-cond\`.
- definition is age today at least 18 years.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    const msg = errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message;
    expect(msg).toMatch(/Age Cond/);
    expect(msg).toMatch(/type is Observation/);
  });

  it("`code is` + age `definition is` + `source representation` (3-way) → emit-mixed-code-and-definition, NOT a silent pass-through", () => {
    // A both-rep age concept that ALSO carries a `source representation` must NOT
    // fall through the representation skip un-split (which would drop the local
    // code side). Diagnose loudly.
    const ast = parse(
      lib(`
terminology "Ext VS":
- valueset is \`http://example.org/ext\`.

concept "Age Rep":
- type is Observation.
- value type is boolean.
- code is \`age-rep\`.
- definition is age today at least 18 years.
- source representation: - coded from "Ext VS".
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
    expect(errors.find((e) => e.kind === "emit-mixed-code-and-definition")!.message).toMatch(/Age Rep/);
    // NOT silently split/passed: no recency Inferred twin was synthesized.
    const recencyTwin = out.statements.find(
      (s): s is Concept => s.type === "Concept" && s.__bothRepMerge === "recency",
    );
    expect(recencyTwin).toBeUndefined();
  });

  it("emits the recency merge in the Inferred lane (CFH.recencyAgeTruths + newest-Observation filter + computed AtLeast(AgeAt(), Q)), carrying the @business-logic-deferred block comment", () => {
    const ast = parse(
      lib(`
concept "Age 18 Or Older":
- type is Observation.
- value type is boolean.
- meta is \`@business-logic-deferred: answer resource must not persist beyond the session (#190)\`.
- code is \`age-18-or-older\`.
- definition is age today at least 18 years.
`),
    );
    const { ast: lowered, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);
    // Emit only the Inferred twin in the inferred truth-set lane.
    const inferredTwin = lowered.statements.find(
      (s): s is Concept =>
        s.type === "Concept" &&
        s.name === "Age 18 Or Older" &&
        s.__bothRepMerge === "recency",
    );
    expect(inferredTwin).toBeDefined();
    const syntheticInferred: CRL = { ...lowered, statements: [inferredTwin!] };
    const r = emitCQLFromAST(syntheticInferred, {
      libraryName: "T Inferred",
      caseFeature: {
        kind: "inferred",
        localSourceLibrary: "T LocalSource",
        inferredLibrary: "T Inferred",
      },
    });
    expect(r.success).toBe(true);
    expect(r.result).toContain("CFH.recencyAgeTruths(");
    expect(r.result).toContain('"T LocalSource"."Age 18 Or Older"');
    // NO status filter (extracted answers aren't stamped `final`); recency keys on
    // `effective` (what DTR extraction populates), with a deterministic `id` tie-break.
    expect(r.result).not.toContain("O.status in");
    expect(r.result).toContain("O.value is FHIR.boolean");
    expect(r.result).toContain("sort by (effective as FHIR.dateTime).value, id");
    expect(r.result).toContain("CRLCommon.AtLeast(CRLCommon.AgeAt(), 18 'years')");
    // The @business-logic-deferred marker lands as a block comment above the Inferred define.
    expect(r.result).toMatch(
      /\/\*[\s\S]*@business-logic-deferred:[\s\S]*\*\/\ndefine "Age 18 Or Older":/,
    );
  });

  // ── #215: UPPER-BOUND age predicates (`at most` ≤, `under`/`younger than` <) ──
  // Same both-rep recency machinery as `at least`, carrying the comparator op.
  const lowerAgeConcept = (name: string, code: string, predicate: string) =>
    lowerLocalCodes(
      parse(
        lib(`
concept "${name}":
- type is Observation.
- value type is boolean.
- code is \`${code}\`.
- definition is ${predicate}.
`),
      ),
    );
  const recencyTwinOf = (lowered: CRL, name: string) =>
    lowered.statements.find(
      (s): s is Concept =>
        s.type === "Concept" && s.name === name && s.__bothRepMerge === "recency",
    );
  const emitRecency = (lowered: CRL, twin: Concept) =>
    emitCQLFromAST(
      { ...lowered, statements: [twin] },
      {
        libraryName: "T Inferred",
        caseFeature: { kind: "inferred", localSourceLibrary: "T LocalSource", inferredLibrary: "T Inferred" },
      },
    );

  it("`age today at most <n> years` (INCLUSIVE ≤) SPLITS merge:recency carrying op AtMost, emits CRLCommon.AtMost", () => {
    const { ast: out, errors } = lowerAgeConcept("Age At Most 21", "age-le-21", "age today at most 21 years");
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
    const twin = recencyTwinOf(out, "Age At Most 21")!;
    expect(twin).toBeDefined();
    expect(twin.__bothRepRecencyThreshold).toBe("21 'years'");
    expect(twin.__bothRepRecencyOp).toBe("AtMost");
    const r = emitRecency(out, twin);
    expect(r.success).toBe(true);
    expect(r.result).toContain("CFH.recencyAgeTruths(");
    expect(r.result).toContain("CRLCommon.AtMost(CRLCommon.AgeAt(), 21 'years')");
    expect(r.result).not.toContain("CRLCommon.AtLeast(");
  });

  it("`age today under <n> years` (EXCLUSIVE <) SPLITS merge:recency carrying op Below, emits CRLCommon.Below", () => {
    const { ast: out, errors } = lowerAgeConcept("Under 21", "age-under-21", "age today under 21 years");
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
    const twin = recencyTwinOf(out, "Under 21")!;
    expect(twin.__bothRepRecencyThreshold).toBe("21 'years'");
    expect(twin.__bothRepRecencyOp).toBe("Below");
    const r = emitRecency(out, twin);
    expect(r.success).toBe(true);
    expect(r.result).toContain("CRLCommon.Below(CRLCommon.AgeAt(), 21 'years')");
  });

  it("`younger than` ≡ `under`: both lower to op Below with an IDENTICAL emitted computed arm (one canonical semantic, two spellings)", () => {
    const under = lowerAgeConcept("Y", "age-y", "age today under 21 years");
    const younger = lowerAgeConcept("Y", "age-y", "age today younger than 21 years");
    const tUnder = recencyTwinOf(under.ast, "Y")!;
    const tYounger = recencyTwinOf(younger.ast, "Y")!;
    expect(tUnder.__bothRepRecencyOp).toBe("Below");
    expect(tYounger.__bothRepRecencyOp).toBe("Below");
    expect(tYounger.__bothRepRecencyThreshold).toBe(tUnder.__bothRepRecencyThreshold);
    // The ENTIRE emitted Inferred result is byte-identical (same name/code/threshold/op),
    // so the two spellings are provably one canonical semantic — not merely both-contain-Below.
    const rUnder = emitRecency(under.ast, tUnder).result;
    const rYounger = emitRecency(younger.ast, tYounger).result;
    expect(rYounger).toBe(rUnder);
    expect(rUnder).toContain("CRLCommon.Below(CRLCommon.AgeAt(), 21 'years')");
  });

  it("NON-year unit on EVERY upper-bound spelling (both-rep) → emit-mixed-code-and-definition (year-only at the match, per comparator)", () => {
    for (const pred of [
      "age today at most 216 months",
      "age today under 216 months",
      "age today younger than 216 months",
    ]) {
      const { errors } = lowerAgeConcept("Age Months", "age-months", pred);
      expect(
        errors.some((e) => e.kind === "emit-mixed-code-and-definition"),
        `year-guard should fire for "${pred}"`,
      ).toBe(true);
    }
  });

  it("COMPUTE-ONLY NON-year age narrative does NOT silently emit a unit-blind comparator call (#215 [critical] fix)", () => {
    // Before the matcher year-guard, `age today under 216 months` (no `code is`) would
    // resolve via the new `Below(Integer, System.Quantity)` overload to a unit-BLIND
    // `Below(AgeAt(), 216 'months')` ≡ `ageYears < 216` — a silent miscompile. Year-only
    // at the match means it is NOT a recognized age predicate → soft-compiles unknown →
    // LOUD sentinel, never a resolved age call.
    for (const pred of ["age today under 216 months", "age today at most 216 months"]) {
      const src = `# T\nlibrary "T".\nconcept "Age Gate":\n- type is Observation.\n- value type is boolean.\n- definition is ${pred}.\n`;
      const r = emitCQL(src, { libraryName: "T" });
      expect(r.result ?? "").not.toMatch(/CRLCommon\.(Below|AtMost)\(CRLCommon\.AgeAt\(\), 216 'months'\)/);
      expect(
        r.success === false || (r.result ?? "").includes("UnmatchedNarrative"),
        `non-year age narrative "${pred}" must fail loudly, not emit a resolved call`,
      ).toBe(true);
    }
  });

  it("COLLISION GUARD (#215): a `code is X` + generic `<ConceptRef> <at least|at most|below> <Q>` (SAME canonical names, ConceptRef arg[0]) stays emit-mixed-code-and-definition — the AgeAt()-no-arg operand guard blocks a spurious age-recency merge for EVERY comparator", () => {
    // The generic comparator matchers (atLeast/atMost/below) emit the SAME canonical
    // names as the age forms but with a ConceptRef at arg[0], not a no-arg AgeAt(). The
    // gate's arg[0] guard is what keeps each one OUT of the age-recency lane.
    for (const def of [
      '"Weight" at least 100 \'kg\'',
      '"Weight" at most 100 \'kg\'',
      '"Weight" below 100 \'kg\'',
    ]) {
      const ast = parse(
        lib(`
concept "Weight":
- type is Observation.
- code is \`weight\`.

concept "Heavy":
- type is Observation.
- value type is boolean.
- code is \`heavy\`.
- definition is ${def}.
`),
      );
      const { ast: out, errors } = lowerLocalCodes(ast);
      expect(
        errors.some((e) => e.kind === "emit-mixed-code-and-definition"),
        `generic "${def}" must NOT be mis-detected as age-recency`,
      ).toBe(true);
      expect(
        out.statements.find((s): s is Concept => s.type === "Concept" && s.name === "Heavy" && s.__bothRepMerge === "recency"),
        `no spurious recency twin for "${def}"`,
      ).toBeUndefined();
    }
    // (The anchored `age at start of <ref> at least <Q>` form emits AgeAt with ONE arg,
    // also excluded by the args.length !== 0 leg of the same guard — out of #215 scope.)
  });

  it("COMPUTE-ONLY (no `code is`): `definition is age today under|at most <n> years` emits the generic comparator call (Below/AtMost), no recency merge", () => {
    for (const [pred, call] of [
      ["age today under 21 years", "CRLCommon.Below(CRLCommon.AgeAt(), 21 'years')"],
      ["age today at most 21 years", "CRLCommon.AtMost(CRLCommon.AgeAt(), 21 'years')"],
      ["age today younger than 21 years", "CRLCommon.Below(CRLCommon.AgeAt(), 21 'years')"],
    ] as const) {
      const src = `# T\nlibrary "T".\nconcept "Age Gate":\n- type is Observation.\n- value type is boolean.\n- definition is ${pred}.\n`;
      const r = emitCQL(src, { libraryName: "T" });
      expect(r.success, `compute-only emit should succeed for "${pred}"`).toBe(true);
      expect(r.result).toContain(call);
      // scalar comparator, NOT the List<Observation> `exists` overload (guards a
      // PATTERN_RETURN_SHAPE regression that would wrap the call in `exists`).
      expect(r.result).not.toContain("exists CRLCommon.");
    }
  });

  it("ANCHORED upper-bound (#215): `age at start of <X> at most|under|younger than <n> years` emits AtMost/Below over AgeAt(start of …)", () => {
    for (const [pred, call] of [
      ['age at start of "Measurement Period" at most 65 years', `CRLCommon.AtMost(CRLCommon.AgeAt(start of "Measurement Period"), 65 'years')`],
      ['age at start of "Measurement Period" under 65 years', `CRLCommon.Below(CRLCommon.AgeAt(start of "Measurement Period"), 65 'years')`],
      ['age at start of "Measurement Period" younger than 65 years', `CRLCommon.Below(CRLCommon.AgeAt(start of "Measurement Period"), 65 'years')`],
    ] as const) {
      const src = `# T\nlibrary "T".\nconcept "Age Gate":\n- type is Observation.\n- value type is boolean.\n- definition is ${pred}.\n`;
      const r = emitCQL(src, { libraryName: "T" });
      expect(r.success, `anchored emit should succeed for "${pred}"`).toBe(true);
      expect(r.result).toContain(call);
    }
  });

  it("ANCHORED NON-year (#215): `age at start of <X> <cmp> <n> months` does NOT silently emit a unit-blind call (year-only at the match — also fixes the pre-existing `at least`)", () => {
    for (const pred of [
      'age at start of "Measurement Period" at least 65 months',
      'age at start of "Measurement Period" at most 65 months',
      'age at start of "Measurement Period" under 65 months',
    ]) {
      const src = `# T\nlibrary "T".\nconcept "Age Gate":\n- type is Observation.\n- value type is boolean.\n- definition is ${pred}.\n`;
      const r = emitCQL(src, { libraryName: "T" });
      expect(r.result ?? "").not.toMatch(/CRLCommon\.(AtLeast|AtMost|Below)\(CRLCommon\.AgeAt\(start of[^)]*\), 65 'months'\)/);
      expect(
        r.success === false || (r.result ?? "").includes("UnmatchedNarrative"),
        `non-year anchored "${pred}" must fail loudly, not emit a resolved call`,
      ).toBe(true);
    }
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

  it("`code is` + `coded from` + representation → emit-mixed-code-and-definition (mixed checked BEFORE representation skip)", () => {
    // A NON-`defined as` mixed code+definition concept that ALSO bears a
    // representation must STILL raise the mixed hard error (not be silently
    // skipped via the representation lane and drop the code-source side).
    const ast = parse(
      lib(`
terminology "VS":
- valueset is \`vs\`.

terminology "Height VS":
- valueset is \`http://example.org/height\`.

concept "MixedRep":
- type is Observation.
- value type is boolean.
- code is \`mixed-rep\`.
- coded from "VS".
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
