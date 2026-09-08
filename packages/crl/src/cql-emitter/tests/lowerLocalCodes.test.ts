import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept, Terminology, Location } from "../../ast/types";
import { emitCQL as emitCQLRaw, emitCQLFromAST as emitCQLFromASTRaw } from "../emitCQL";
import { lowerLocalCodes as lowerLocalCodesRaw } from "../lowerLocalCodes";
import { localCodeSystemUrl } from "../../fhir-emitter/slug";

// #271 — `crl.canonicalBase` is now REQUIRED to lower local `code is` concepts
// (no urn fallback). These wrappers thread a fixed test base so the existing
// lowering/emit unit tests exercise mechanics without repeating it at every call.
// An explicit `canonicalBase` in a test's own opts overrides the default (the
// spread order below), and a test that wants the missing-base error passes
// `{ canonicalBase: "" }`.
const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });
const emitCQLFromAST: typeof emitCQLFromASTRaw = (ast, opts) =>
  emitCQLFromASTRaw(ast, { canonicalBase: TEST_CB, ...(opts ?? {}) });
const emitCQL: typeof emitCQLRaw = (src, opts) =>
  emitCQLRaw(src, { canonicalBase: TEST_CB, ...(opts ?? {}) });

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
      expect.objectContaining({ type: "TerminologySystem", system: "http://example.org/crl/test/CodeSystem/t-local" }),
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
      expect(sl.system).toBe("http://example.org/crl/test/CodeSystem/code-is-basic-local");
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

  it("localCodeSystemUrl THROWS when canonicalBase is absent (#271 — no urn fallback)", () => {
    expect(() => localCodeSystemUrl(undefined, "Risankizumab Coverage")).toThrow(/canonicalBase/);
    expect(() => localCodeSystemUrl("", "Risankizumab Coverage")).toThrow(/canonicalBase/);
    expect(() => localCodeSystemUrl("   ", "Risankizumab Coverage")).toThrow(/canonicalBase/);
  });

  it("localCodeSystemUrl slugs the domain id under canonicalBase (library-name fallback slugs)", () => {
    expect(localCodeSystemUrl("http://example.org/crl/x", "  Weird--Name!! ")).toBe(
      "http://example.org/crl/x/CodeSystem/weird-name-local",
    );
    expect(localCodeSystemUrl("http://example.org/crl/x", "日本語")).toBe(
      "http://example.org/crl/x/CodeSystem/unnamed-local",
    );
  });

  it("localCodeSystemUrl publishes under canonicalBase when set (byte-equal with the FHIR lane)", () => {
    expect(localCodeSystemUrl("http://example.org/crl/x", "Risankizumab Coverage")).toBe(
      "http://example.org/crl/x/CodeSystem/risankizumab-coverage-local",
    );
    expect(localCodeSystemUrl("http://example.org/crl/x", "日本語")).toBe(
      "http://example.org/crl/x/CodeSystem/unnamed-local",
    );
  });

  it("#271 — a lowerable `code is` concept with NO canonicalBase hard-errors `missing-canonical-url-base` (no urn fallback)", () => {
    const ast = parse(
      lib(`
concept "Adult Patient":
- type is Observation.
- code is \`adult-18-or-older\`.
`),
    );
    // Explicit empty base OVERRIDES the wrapper's TEST_CB (spread order) — the real
    // user-facing structured error, not the low-level `localCodeSystemUrl` throw.
    const r = lowerLocalCodesRaw(ast, { canonicalBase: "" });
    expect(r.errors.find((e) => e.kind === "missing-canonical-url-base")).toBeDefined();
    expect(r.localCodes).toEqual([]); // nothing lowered
    expect(r.ast).toBe(ast); // returned BY IDENTITY — imports/emit.ts:481 relies on this
    // A whitespace-only base is treated as absent too.
    expect(
      lowerLocalCodesRaw(ast, { canonicalBase: "   " }).errors.some(
        (e) => e.kind === "missing-canonical-url-base",
      ),
    ).toBe(true);
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

  it("#189 Slice B2a — a NON-boolean `most recent this` value read is DEFERRED (emit-reduction-not-active; not the generic mixed error)", () => {
    // B2a activates only the Scalar BOOLEAN `most recent this` value read; a NON-boolean value read stays
    // validate-only (Slice C — the per-type FHIR value conversion is not yet built) via the dedicated
    // `emit-reduction-not-active` sentinel, NOT `emit-mixed-code-and-definition` interpolating the raw type.
    const ast = parse(
      lib(`
concept "C":
- type is Observation.
- value type is Quantity.
- code is \`c\`.
- definition is most recent this.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-reduction-not-active")).toBe(true);
    expect(errors.some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
    const msg = errors.find((e) => e.kind === "emit-reduction-not-active")!.message;
    expect(msg).toMatch(/most recent this/);
    expect(msg).toMatch(/Slice C/);
    expect(msg).not.toMatch(/ReductionDefinition/); // no raw AST type name
  });

  it("#189 Slice B2a — a Scalar boolean `most recent this` lowers to a records twin + a retargeted mostRecent reduction carrying the descriptor", () => {
    const ast = parse(
      lib(`
concept "C":
- type is Observation.
- value type is boolean.
- code is \`c\`.
- definition is most recent this.
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);
    const concepts = out.statements.filter((s): s is Concept => s.type === "Concept");
    expect(concepts.find((c) => c.name === "C Records")?.shape).toBe("RecordSet");
    const reduced = concepts.find((c) => c.name === "C");
    const red = (reduced!.definition as { reduction: { kind: string; target: { type: string; ref?: unknown } } })
      .reduction;
    expect(red.kind).toBe("mostRecent");
    expect(red.target.type).toBe("ReductionConceptRef");
    expect(red.target.ref).toBe("C Records");
    // The resolved effective-representation descriptor is attached for emit (recency + value element).
    const desc = (reduced as { __effectiveDescriptor?: { arm?: string; valueElement?: string } }).__effectiveDescriptor;
    expect(desc?.arm).toBe("local-exact");
    expect(desc?.valueElement).toBe("value");
  });

  it("#189 Slice B2b — a `shape is Record` `most recent this` lowers to a records twin + a retargeted mostRecent reduction carrying a DATUM-LESS descriptor (any registry resource)", () => {
    const ast = parse(
      lib(`
concept "C":
- type is Procedure.
- shape is Record.
- code is \`c\`.
- definition is most recent this.
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);
    const concepts = out.statements.filter((s): s is Concept => s.type === "Concept");
    // The records twin is a RecordSet retrieve at the NATURAL resource (Procedure, not forced-Observation).
    expect(concepts.find((c) => c.name === "C Records")?.shape).toBe("RecordSet");
    const reduced = concepts.find((c) => c.name === "C");
    const red = (reduced!.definition as { reduction: { kind: string; target: { type: string; ref?: unknown } } })
      .reduction;
    expect(red.kind).toBe("mostRecent");
    expect(red.target.type).toBe("ReductionConceptRef");
    expect(red.target.ref).toBe("C Records");
    // A record select reads NO value: the descriptor carries a recency but NO datum (valueElement /
    // datumValueType undefined), over the natural (non-Observation) resource.
    const desc = (
      reduced as {
        __effectiveDescriptor?: {
          arm?: string;
          resourceType?: string;
          valueElement?: string;
          datumValueType?: string;
          recency?: unknown;
        };
      }
    ).__effectiveDescriptor;
    expect(desc?.arm).toBe("local-exact");
    expect(desc?.resourceType).toBe("Procedure");
    expect(desc?.valueElement).toBeUndefined();
    expect(desc?.datumValueType).toBeUndefined();
    expect(desc?.recency).toBeDefined();
  });

  it("#189 Slice B2a — a boolean `most recent this` on a VALUELESS resource (Condition) errors `value-read-valueless` without prescribing existence", () => {
    const ast = parse(
      lib(`
concept "C":
- type is Condition.
- value type is boolean.
- code is \`c\`.
- definition is most recent this.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    const e = errors.find((x) => x.kind === "value-read-valueless");
    expect(e).toBeDefined();
    expect(e!.message).toMatch(/preserve the intended question/);
  });

  it("#189 Slice B2a/B2b — `most recent this` coherence/defer matrix (shape × value-type × resource)", () => {
    const run = (body: string) => lowerLocalCodes(parse(lib(`concept "C":\n${body}\n`)));
    const kinds = (body: string) => run(body).errors.map((e) => e.kind);
    // Record shape, NO value type → ACTIVE (B2b: select the newest RECORD) — lowers cleanly, no error.
    expect(
      kinds("- type is Procedure.\n- shape is Record.\n- code is `c`.\n- definition is most recent this."),
    ).toHaveLength(0);
    // Record shape WITH an OPTIONAL value type (the record's DATUM, design §1) → ALSO active: a bare record
    // select ignores the datum. The validator is clean on this cell (`useSiteType.test.ts`), so emit must be
    // too — NOT an emit-only rejection (crl-emit B2b panel #1, both arms).
    expect(
      kinds("- type is Procedure.\n- shape is Record.\n- value type is boolean.\n- code is `c`.\n- definition is most recent this."),
    ).toHaveLength(0);
    // RecordSet shape → incoherent (a set publishes its records, not a reduced value).
    expect(
      kinds("- type is Observation.\n- shape is RecordSet.\n- value type is boolean.\n- code is `c`.\n- definition is most recent this."),
    ).toContain("emit-reduction-shape-incoherent");
    // Multiple value types → incoherent.
    expect(
      kinds("- type is Observation.\n- value type is boolean.\n- value type is Quantity.\n- code is `c`.\n- definition is most recent this."),
    ).toContain("emit-reduction-shape-incoherent");
    // Single non-boolean value type on a VALUE-BEARING resource → deferred (Slice C).
    expect(
      kinds("- type is Observation.\n- value type is integer.\n- code is `c`.\n- definition is most recent this."),
    ).toContain("emit-reduction-not-active");
    // Single non-boolean value type on a VALUELESS resource → the valueless error + faithful-representation
    // prompt, NOT the Slice-C defer (Claude #1: the deriver's valueless check runs before the non-boolean
    // split, so Condition never gets told to "wait for Slice C" for a form Slice C can't fix).
    const condQ = run("- type is Condition.\n- value type is Quantity.\n- code is `c`.\n- definition is most recent this.");
    expect(condQ.errors.map((e) => e.kind)).toContain("value-read-valueless");
    expect(condQ.errors.map((e) => e.kind)).not.toContain("emit-reduction-not-active");
    expect(condQ.errors.find((e) => e.kind === "value-read-valueless")!.message).toMatch(/preserve the intended question/);
    // Zero value types → incoherent (needs exactly one).
    expect(
      kinds("- type is Observation.\n- code is `c`.\n- definition is most recent this."),
    ).toContain("emit-reduction-shape-incoherent");
    // ⭐ Encounter now fails for the RIGHT reason. The comment here used to say "Encounter is not a registry
    // row", which was never true — it always had a row, with `caseFeature: false`. So a boolean `most recent
    // this` on it reported `unsupported-resource`, blaming the resource for what is really a value-read
    // problem. With the flag flipped it reports `value-read-valueless`: Encounter HAS no value element, so a
    // value-reading reduction is invalid; the diagnostic must not substitute an existence question.
    const enc = run("- type is Encounter.\n- value type is boolean.\n- code is `c`.\n- definition is most recent this.");
    expect(enc.errors.map((e) => e.kind)).toContain("value-read-valueless");
    expect(enc.errors.some((e) => /preserve the intended question/.test(e.message ?? ""))).toBe(true);

    // A genuinely unlisted resource still reports `unsupported-resource`, with NO exists-this prompt —
    // nothing is known about it, so suggesting a reduction would be a guess.
    const goal = run("- type is Goal.\n- value type is boolean.\n- code is `g`.\n- definition is most recent this.");
    expect(goal.errors.map((e) => e.kind)).toContain("unsupported-resource");
    expect(goal.errors.every((e) => !/exists this/.test(e.message ?? ""))).toBe(true);
  });

  it("#189 Slice B2a — a rejected `most recent this` leaves NO dedup residue for a later valid concept reusing the name/code shape", () => {
    // The derive-error `continue`s BEFORE any dedup-state mutation, so a valid concept declared after a
    // rejected one must NOT inherit a spurious duplicate/collision error (gpt56 impl #1).
    const ast = parse(
      lib(`
concept "C":
- type is Condition.
- value type is boolean.
- code is \`c\`.
- definition is most recent this.

concept "D":
- type is Observation.
- value type is boolean.
- code is \`d\`.
- definition is exists this.
`),
    );
    const { ast: out, errors } = lowerLocalCodes(ast);
    // "C" errors (valueless), but "D" still lowers cleanly with no dup/collision fallout.
    expect(errors.some((e) => e.kind === "value-read-valueless")).toBe(true);
    expect(errors.some((e) => /duplicate|collision/.test(e.kind ?? ""))).toBe(false);
    const concepts = out.statements.filter((s): s is Concept => s.type === "Concept");
    expect(concepts.find((c) => c.name === "D Records")?.shape).toBe("RecordSet");
  });

  it("#189 Slice B1 — `code is` + `count this at least N` lowers to a records twin + a retargeted count reduction (atLeast preserved)", () => {
    const ast = parse(
      lib(`
concept "C":
- type is Condition.
- value type is boolean.
- code is \`c\`.
- definition is count this at least 2.
`),
    );
    const { ast: out, errors, localCodes } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);
    const concepts = out.statements.filter((s): s is Concept => s.type === "Concept");
    expect(concepts.find((c) => c.name === "C Records")?.shape).toBe("RecordSet");
    const reduced = concepts.find((c) => c.name === "C");
    expect(reduced!.definition?.type).toBe("ReductionDefinition");
    const red = (reduced!.definition as { reduction: { kind: string; atLeast?: number; target: { type: string; ref?: unknown } } })
      .reduction;
    expect(red.kind).toBe("count");
    expect(red.atLeast).toBe(2);
    expect(red.target.type).toBe("ReductionConceptRef");
    expect(red.target.ref).toBe("C Records");
    expect(localCodes).toEqual([{ concept: "C", code: "c", conceptType: "Condition" }]);
  });

  it("#189 Slice A2 — `code is` + `exists this` SPLITS into a records twin + a retargeted named `exists`", () => {
    // "C" lowers to: (1) a synthetic terminology "C" (drives the "C Code" collision-suffixed code);
    // (2) a records twin concept "C Records" — `shape is RecordSet`, a CodedFromDefinition at the
    // NATURAL resource (Condition, NOT forced Observation); (3) the retargeted reduction concept "C"
    // (`exists "C Records"`), still a ReductionDefinition so the library routes `none`. Both concepts
    // clear `code`. The lowered local code is surfaced on the TWIN.
    const ast = parse(
      lib(`
concept "C":
- type is Condition.
- value type is boolean.
- code is \`c\`.
- definition is exists this.
`),
    );
    const { ast: out, errors, localCodes } = lowerLocalCodes(ast);
    expect(errors).toHaveLength(0);

    const concepts = out.statements.filter((s): s is Concept => s.type === "Concept");
    const twin = concepts.find((c) => c.name === "C Records");
    const reduced = concepts.find((c) => c.name === "C");

    // (2) the records twin — RecordSet retrieve at the natural resource, code cleared, NO inherited
    //     scalar value type (it publishes records, not the boolean).
    expect(twin).toBeDefined();
    expect(twin!.shape).toBe("RecordSet");
    expect(twin!.code).toBeUndefined();
    expect(twin!.valueTypes).toEqual([]);
    expect(twin!.definition?.type).toBe("CodedFromDefinition");
    const twinDef = twin!.definition as { retrieveResourceType?: string; terminologyName?: unknown };
    expect(twinDef.retrieveResourceType).toBe("Condition");
    expect(twinDef.terminologyName).toBe("C"); // resolves to "C Code" via the collision suffix at emit

    // (3) the retargeted reduction concept — `exists "C Records"`, still a ReductionDefinition, code cleared.
    expect(reduced).toBeDefined();
    expect(reduced!.code).toBeUndefined();
    expect(reduced!.definition?.type).toBe("ReductionDefinition");
    const red = (reduced!.definition as { reduction: { kind: string; target: { type: string; ref?: unknown } } })
      .reduction;
    expect(red.kind).toBe("exists");
    expect(red.target.type).toBe("ReductionConceptRef");
    expect(red.target.ref).toBe("C Records");

    // (1) the synthetic terminology named after the concept.
    expect(out.statements.some((s) => s.type === "Terminology" && s.name === "C")).toBe(true);

    // The lowered local code is surfaced under the AUTHORED identity "C" (NOT the synthetic twin) so
    // the FHIR CodeSystem display / SD / leaf-eligibility use the public concept, at the natural resource.
    expect(localCodes).toEqual([{ concept: "C", code: "c", conceptType: "Condition" }]);
  });

  it("#189 Slice A2 — an INCOHERENT `code is` + `exists this` (non-Scalar shape / non-boolean value type) is a hard error, not a lowered Boolean", () => {
    // `exists this` publishes a Scalar boolean; a `shape is RecordSet` or `value type is Quantity`
    // declaration contradicts that. emitCQL runs no validator, so lowering enforces it (charter: never
    // emit a value shape the declaration denies) rather than manufacture a Boolean.
    const recordSetShape = parse(
      lib(`
concept "C":
- type is Condition.
- shape is RecordSet.
- code is \`c\`.
- definition is exists this.
`),
    );
    const r1 = lowerLocalCodes(recordSetShape);
    expect(r1.errors.some((e) => e.kind === "emit-reduction-shape-incoherent")).toBe(true);
    expect(r1.localCodes).toEqual([]); // nothing lowered

    const nonBooleanVt = parse(
      lib(`
concept "C":
- type is Observation.
- value type is Quantity.
- code is \`c\`.
- definition is exists this.
`),
    );
    const r2 = lowerLocalCodes(nonBooleanVt);
    expect(r2.errors.some((e) => e.kind === "emit-reduction-shape-incoherent")).toBe(true);

    // Absent value type is ALSO incoherent — the classifier requires exactly one `boolean`, and an
    // absent value type on a Scalar concept is itself an A.10 validator error (guard ⊆ classifier).
    const absentVt = parse(
      lib(`
concept "C":
- type is Observation.
- code is \`c\`.
- definition is exists this.
`),
    );
    const r3 = lowerLocalCodes(absentVt);
    expect(r3.errors.some((e) => e.kind === "emit-reduction-shape-incoherent")).toBe(true);
  });

  it("#189 Slice A2 — a records-twin name that collides with an existing top-level identifier is diagnosed, not clobbered", () => {
    // "C" would synthesize a twin "C Records", but the library already declares a concept "C Records".
    // The twin's `define "C Records"` would duplicate that identifier — diagnose instead of clobber.
    const ast = parse(
      lib(`
concept "C":
- type is Condition.
- value type is boolean.
- code is \`c\`.
- definition is exists this.

concept "C Records":
- type is Observation.
- code is \`c-records\`.
`),
    );
    const { errors } = lowerLocalCodes(ast);
    expect(errors.some((e) => e.kind === "emit-records-twin-name-collision")).toBe(true);
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
    // The both-rep concept SPLITS into a LocalPrimitives retrieve twin (CodedFromDefinition,
    // forced Observation) + an Inferences fold-in twin (its `defined as`, marked).
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
    expect(inferredTwin!.__bothRepFoldInLocalPrimitives).toBe("Both");
    expect(localTwin!.code).toBeUndefined();
    expect(inferredTwin!.code).toBeUndefined();
  });

  // REFACTOR:grounded (#320, plan585): anchored age remains a separate pattern.
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

  it("ANCHORED NON-year (#215/#257 T2): `age at start of <X> <cmp> <n> months` does NOT silently emit a unit-blind call — anchored stays YEARS-ONLY even though age-today widened to months (Q2: the sanctioned-months unit did NOT leak into the four ageAtStartOf* matchers)", () => {
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
      "codesystem \"T Local Codes\": 'http://example.org/crl/test/CodeSystem/t-local'",
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
        { type: "TerminologySystem", system: "http://example.org/crl/test/CodeSystem/t-local", name: "T Local Codes", location: LOC },
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

  // ⭐⭐ #316 END-TO-END: this fixture is the one path that still emits a genuine duplicate top-level
  // identifier, so it is where the duplicate POSTFLIGHT is pinned driving a real `emitCQLFromAST` run.
  //
  // ⚠ ONE CAUSE, TWO ERRORS, ON PURPOSE. D1 emits both conflicting decls deliberately so the divergence is
  // visible rather than silently mis-bound; the postflight then also reports the resulting duplicate. Both
  // statements are true — the CQL is invalid, and invalid for both stated reasons — so the overlap is noise,
  // not a defect. Do NOT "fix" it by suppressing one: the postflight must stay ignorant of why a duplicate
  // arose, which is the property that lets it catch a cause nobody has thought of yet.
  it("#316: the duplicate postflight ALSO fires here, and flips success", () => {
    const r = emitCQLFromAST(astWithConflictingCodesystem(), { libraryName: "T" });
    expect(r.success).toBe(false);
    const dup = r.errors!.find((e) => e.kind === "emit-duplicate-top-level-identifier");
    expect(dup).toBeDefined();
    expect(dup!.message).toMatch(/`Shared` 2 times/);
    // Both reports survive — neither suppresses the other.
    expect(r.errors!.some((e) => e.kind === "emit-codesystem-url-conflict")).toBe(true);
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
