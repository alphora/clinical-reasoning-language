import { readFileSync } from "fs";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { validateCRLImports } from "../../imports/validate";
import { buildCRL } from "../../index";
import type {
  RepresentationShapeError,
  UseSiteTypeMismatchError,
  UseSiteTypeRule,
} from "../validator";
import { Validator } from "../validator";

// concept boolean composition, Todo 2 (validate-only): the `defined as ( <boolean> )` family gets its type
// contract (design §2/§6; plan-panel disc 457). A boolean composition must publish a declared `Scalar<Boolean>`,
// its operands must each resolve to a `Scalar<Boolean>` (by RESULT type, not datum value type), and the concept is
// PURE-DERIVED (no local `code is` / source rep). ALL three constrain ONLY the new family, so zero existing corpus
// is touched. #189 Slice 0b LOWERS the family (emit + CRE). Assertions are DELTAS (the specific `use-site-type-mismatch`
// rule), never "zero errors overall" — helper concepts carry unrelated migration warnings.

// A clean record source concept the exists-reduced boolean operands read from.
const REC = `concept "R":
- shape is RecordSet.
- type is Observation.
- code is \`r\`.`;
// A clean scalar-boolean operand (exists-reduced, not a bare \`code is\` boolean which is migration-invalid).
const BOOLOP = (name: string) => `concept "${name}":
- value type is boolean.
- defined as exists ("R").`;

const rulesFor = (src: string): UseSiteTypeRule[] => {
  const built = buildCRL(src);
  if (!built.success || !built.result) throw new Error("parse failed: " + JSON.stringify(built.errors));
  return new Validator()
    .validate(built.result)
    .errors.filter((e): e is UseSiteTypeMismatchError => e.kind === "use-site-type-mismatch")
    .map((e) => e.rule);
};

const bcRules = (src: string): UseSiteTypeRule[] =>
  rulesFor(src).filter((r) => r.startsWith("boolean-composition-"));

// T2.3 (no local `code is` / source rep) is a REPRESENTATION-SHAPE rule (a representation-source coherence
// defect that can fire with no value type declared), NOT a use-site type mismatch — disc 457, both arms.
const repShapeRules = (src: string): string[] => {
  const built = buildCRL(src);
  if (!built.success || !built.result) throw new Error("parse failed: " + JSON.stringify(built.errors));
  return new Validator()
    .validate(built.result)
    .errors.filter((e): e is RepresentationShapeError => e.kind === "representation-shape")
    .map((e) => e.rule);
};

describe("T2.1 — result type must be a declared Scalar<Boolean>", () => {
  it("a RecordSet-shaped boolean composition → `boolean-composition-result-nonscalar` (renders the record result)", () => {
    const src = `library "T".
concept "A":
- shape is RecordSet.
- type is Observation.
- value type is boolean.
- defined as ("B" and "C").
${BOOLOP("B")}
${BOOLOP("C")}
${REC}`;
    expect(bcRules(src)).toContain("boolean-composition-result-nonscalar");
    const err = new Validator()
      .validate(buildCRL(src).result!)
      .errors.find(
        (e): e is UseSiteTypeMismatchError =>
          e.kind === "use-site-type-mismatch" && e.rule === "boolean-composition-result-nonscalar",
      );
    expect(err?.actual).toBe("RecordSet<Observation>"); // the rendered RESULT type, not the datum value type
  });

  it("a non-boolean Scalar value type → `boolean-composition-result-nonboolean`", () => {
    const src = `library "T".
concept "A":
- value type is Quantity.
- defined as ("B" and "C").
${BOOLOP("B")}
${BOOLOP("C")}
${REC}`;
    expect(bcRules(src)).toContain("boolean-composition-result-nonboolean");
  });

  it("a `value type is boolean` (default Scalar) composition of boolean operands → NO result rule", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("B" and "C").
${BOOLOP("B")}
${BOOLOP("C")}
${REC}`;
    expect(bcRules(src)).toEqual([]);
  });
});

describe("T2.2 — every operand must resolve to a Scalar<Boolean> (by RESULT type)", () => {
  it("a TYPED record operand (`shape is RecordSet` + `value type is boolean`) → operand rule", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("Rec Bool" and "B").
concept "Rec Bool":
- shape is RecordSet.
- type is Observation.
- value type is boolean.
- coded from "VS".
${BOOLOP("B")}
${REC}
terminology "VS":
- valueset is \`http://example.org/vs\`.`;
    expect(bcRules(src)).toContain("boolean-composition-operand-nonboolean");
  });

  it("an UNTYPED record operand (`shape is RecordSet` + `code is`, no value type) → operand rule (the paradigm mistake)", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("Rec" and "B").
concept "Rec":
- shape is RecordSet.
- type is Observation.
- code is \`rec\`.
${BOOLOP("B")}
${REC}`;
    const err = new Validator()
      .validate(buildCRL(src).result!)
      .errors.find(
        (e): e is UseSiteTypeMismatchError =>
          e.kind === "use-site-type-mismatch" && e.rule === "boolean-composition-operand-nonboolean",
      );
    expect(err).toBeDefined();
    expect(err?.actual).toBe("RecordSet<Observation>"); // the record RESULT, though the datum value type is absent
  });

  it("a `not <record>` operand is WALKED, not dropped → operand rule still fires", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as (not "Rec").
concept "Rec":
- shape is RecordSet.
- type is Observation.
- code is \`rec\`.`;
    expect(bcRules(src)).toContain("boolean-composition-operand-nonboolean");
  });

  it("exists-reduced boolean operands → NO operand rule", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("B" and "C").
${BOOLOP("B")}
${BOOLOP("C")}
${REC}`;
    expect(bcRules(src)).toEqual([]);
  });

  it("a Scalar NON-boolean operand (Quantity) → operand rule, steered to a boolean REDUCTION not `exists`", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("Q" and "B").
concept "Q":
- value type is Quantity.
- definition is most recent "R".
${BOOLOP("B")}
${REC}`;
    const err = new Validator()
      .validate(buildCRL(src).result!)
      .errors.find(
        (e): e is UseSiteTypeMismatchError =>
          e.kind === "use-site-type-mismatch" && e.rule === "boolean-composition-operand-nonboolean",
      );
    expect(err).toBeDefined();
    // A Scalar has no instance stream — the fix must NOT steer to `exists` (that would be silent-always-true).
    expect(err?.message).not.toContain("exists");
    expect(err?.message).toContain("boolean");
  });

  it("an UNRESOLVABLE cross-lib operand does NOT false-error (fail-open) — only the reference diagnostic", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("B" and "Other"."X").
${BOOLOP("B")}
${REC}`;
    // The unindexed `"Other"."X"` resolves to undefined → NO boolean-composition-operand error (fail-open; T3 is
    // the fail-closed point). The reference-family diagnostic still fires (owned by the reference/imports layer).
    expect(bcRules(src)).toEqual([]);
    const kinds = new Validator().validate(buildCRL(src).result!).errors.map((e) => e.kind);
    expect(kinds.some((k) => k === "unresolved-reference" || k === "external-library-not-included")).toBe(true);
  });

  it("a VISIBLE (indexed sibling-library) operand IS checkable: foreign boolean clean, foreign record errors", () => {
    // project mode — proves `resolveConceptResultType` reaches an indexed sibling library (NOT the fail-open path).
    const result = validateCRLImports(
      path.join(__dirname, "fixtures", "boolcomp-cross-lib", "root.crl"),
    );
    const opErrs = result.validationErrors.filter(
      (e): e is UseSiteTypeMismatchError =>
        e.kind === "use-site-type-mismatch" && e.rule === "boolean-composition-operand-nonboolean",
    );
    // Exactly ONE: the foreign RecordSet operand "Vitals"."Obs". The foreign boolean "Vitals"."Flag" is CLEAN.
    expect(opErrs).toHaveLength(1);
    expect(JSON.stringify(opErrs[0])).toContain("Obs");
    expect(JSON.stringify(opErrs[0])).not.toContain('"Flag"');
  });
});

describe("T2.3 — a boolean composition is PURE-DERIVED (no local source) — a REPRESENTATION-SHAPE rule", () => {
  it("`code is` + boolean composition → `boolean-composition-not-pure-derived` (representation-shape kind)", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- code is \`a\`.
- defined as ("B" and "C").
${BOOLOP("B")}
${BOOLOP("C")}
${REC}`;
    expect(repShapeRules(src)).toContain("boolean-composition-not-pure-derived");
    // It is NOT a use-site type mismatch (the taxonomy fix).
    expect(bcRules(src)).toEqual([]);
  });

  it("a `source representation` + boolean composition → `boolean-composition-not-pure-derived`", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("B" and "C").
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is boolean.
${BOOLOP("B")}
${BOOLOP("C")}
${REC}`;
    expect(repShapeRules(src)).toContain("boolean-composition-not-pure-derived");
  });
});

describe("T2 — corpus is untouched (no new boolean-composition diagnostics)", () => {
  const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
  const CORPUS = path.join(REPO_ROOT, "packages/crl/src/tests/fixtures/corpus");
  // These two worked-corpus libraries build single-file today (T1 parse-superset). Assert build success (no
  // silent vacuous pass — disc 457) AND that the T2 family fires zero rules on them, in EITHER kind (the
  // structural guarantee is that the rules key on `DefinedAsBooleanComposition`, which no corpus form produces).
  it.each(["cms22/cms22-inferred.crl", "cms69/cms69-inferred.crl"])(
    "%s builds and introduces ZERO boolean-composition-* diagnostics",
    (rel) => {
      const built = buildCRL(readFileSync(path.join(CORPUS, rel), "utf8"));
      expect(built.success && built.result).toBeTruthy();
      const errs = new Validator().validate(built.result!).errors;
      const bcUseSite = errs
        .filter((e): e is UseSiteTypeMismatchError => e.kind === "use-site-type-mismatch")
        .map((e) => e.rule)
        .filter((r) => r.startsWith("boolean-composition-"));
      const bcRep = errs
        .filter((e): e is RepresentationShapeError => e.kind === "representation-shape")
        .map((e) => e.rule)
        .filter((r) => r.startsWith("boolean-composition-"));
      expect([...bcUseSite, ...bcRep]).toEqual([]);
    },
  );
});
