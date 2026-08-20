import { readFileSync } from "fs";
import * as path from "path";

import { buildCEL, tokenizeCEL, parseCEL } from "../index";
import type { CEL, CELCase, CELFact, CELFactRefField, CELDefinedByField } from "../ast/types";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const CORPUS = {
  cms22: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22.cel"),
  cms22Strategy: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.cel"),
  cms69: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69.cel"),
  cms69Strategy: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69-strategy.cel"),
  syntaxRef: path.join(__dirname, "fixtures/cel-syntax-reference.cel"),
};

function readSource(p: string): string {
  return readFileSync(p, "utf-8");
}

describe("CEL Todo 2 — buildCEL regression on worked corpus", () => {
  test("cms22.cel parses cleanly", () => {
    const r = buildCEL(readSource(CORPUS.cms22));
    expect(r.errors).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.result?.library.name).toBe("CMS22 Blood Pressure Screening");
    expect(r.result?.covers?.name).toBe("cms22");
    expect(r.result?.statements.length).toBeGreaterThan(0);
  });

  test("cms22-strategy.cel parses cleanly", () => {
    const r = buildCEL(readSource(CORPUS.cms22Strategy));
    expect(r.errors).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.result?.library.name).toBe("CMS22 BP Cognitive Support — Hypertensive Reading");
    expect(r.result?.covers?.name).toBe("cms22-strategy");
  });

  test("cms69.cel parses cleanly + Recommend Counseling repurposing landed", () => {
    const r = buildCEL(readSource(CORPUS.cms69));
    expect(r.errors).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.result?.library.name).toBe("CMS69 BMI Screening");
    const wareFact = r.result?.statements.find(
      (s): s is CELFact => s.type === "CELFact" && s.name === "Weight Assessment Referral Order",
    );
    expect(wareFact).toBeDefined();
    const definedBy = wareFact!.body.find(
      (b): b is CELDefinedByField => b.type === "CELDefinedByField",
    );
    expect(definedBy).toBeDefined();
    // The qualified ref should resolve to the strategy library's
    // Order Weight Assessment Referral activity per Todo 1's corpus repair.
    expect(definedBy!.ref).not.toBe("string");
    if (typeof definedBy!.ref === "string") throw new Error("Expected qualified ref");
    expect(definedBy!.ref.libraryName).toBe("cms69-strategy");
    expect(definedBy!.ref.name).toBe("Order Weight Assessment Referral");
  });

  test("cms69-strategy.cel parses cleanly", () => {
    const r = buildCEL(readSource(CORPUS.cms69Strategy));
    expect(r.errors).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.result?.library.name).toBe("CMS69 BMI Cognitive Support — High BMI");
  });

  test("cel-syntax-reference.cel fixture parses cleanly (normative coverage)", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    if (r.errors) {
      // Surface useful diagnostics if it fails.
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(r.errors, null, 2));
    }
    expect(r.errors).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.result?.library.name).toBe("CEL Syntax Reference");
    expect(r.result?.covers?.name).toBe("Some Strategy Library");
    expect(r.result?.includes).toHaveLength(1);
    expect(r.result?.includes[0].name).toBe("External Demo Package");
    // Cases 1-4 from the syntax reference all present.
    const cases = (r.result as CEL).statements.filter(
      (s): s is CELCase => s.type === "CELCase",
    );
    expect(cases.length).toBe(4);
  });
});

describe("CEL Todo 2 — AST shape spot-checks", () => {
  test("anchor named form lexes + parses (`anchor \"admission\" is now`)", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    expect(r.success).toBe(true);
    const multiAnchorCase = (r.result as CEL).statements.find(
      (s): s is CELCase =>
        s.type === "CELCase" && s.name === "Multi-anchor inpatient-flow scenario",
    );
    expect(multiAnchorCase).toBeDefined();
    const anchors = multiAnchorCase!.body.filter((b) => b.type === "CELAnchorField");
    expect(anchors).toHaveLength(2);
    expect((anchors[0] as { name?: string }).name).toBe("admission");
    expect((anchors[1] as { name?: string }).name).toBe("discharge");
  });

  test("at-anchor offset arithmetic with TIME_UNIT (`at anchor + 6 months`)", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    expect(r.success).toBe(true);
    // Case 1: "Dynamic-anchor scenario" — `fact is "Follow-up Reading" at anchor + 6 months.`
    const dynCase = (r.result as CEL).statements.find(
      (s): s is CELCase => s.type === "CELCase" && s.name === "Dynamic-anchor scenario",
    );
    expect(dynCase).toBeDefined();
    const followUp = dynCase!.body.find(
      (b): b is CELFactRefField =>
        b.type === "CELFactRefField" && b.factName === "Follow-up Reading",
    );
    expect(followUp).toBeDefined();
    expect(followUp!.at?.type).toBe("CELAtAnchor");
    const off = (followUp!.at as { offset?: { sign: string; value: number; unit: string } }).offset;
    expect(off?.sign).toBe("+");
    expect(off?.value).toBe(6);
    expect(off?.unit).toBe("months");
  });

  test("at-named-anchor offset (`at \"discharge\" + 30 days`)", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    expect(r.success).toBe(true);
    const multi = (r.result as CEL).statements.find(
      (s): s is CELCase =>
        s.type === "CELCase" && s.name === "Multi-anchor inpatient-flow scenario",
    );
    const rec = multi!.body.find(
      (b): b is CELFactRefField =>
        b.type === "CELFactRefField" && b.factName === "Recommended Activity",
    );
    expect(rec).toBeDefined();
    expect(rec!.at?.type).toBe("CELAtNamedAnchor");
    expect((rec!.at as { anchorName: string }).anchorName).toBe("discharge");
  });

  test("absolute-date `on` escape hatch (`on 2024-06-30`)", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    expect(r.success).toBe(true);
    const fixed = (r.result as CEL).statements.find(
      (s): s is CELCase =>
        s.type === "CELCase" && s.name === "Fixed-anchor scenario with intent variants",
    );
    const performed = fixed!.body.find(
      (b): b is CELFactRefField =>
        b.type === "CELFactRefField" && b.factName === "Performed Event",
    );
    expect(performed!.at?.type).toBe("CELAtAbsoluteDate");
    expect((performed!.at as { date: string }).date).toBe("2024-06-30");
  });

  test("intent modifiers (`with absent intent`, `with negative intent`)", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    expect(r.success).toBe(true);
    const fixed = (r.result as CEL).statements.find(
      (s): s is CELCase =>
        s.type === "CELCase" && s.name === "Fixed-anchor scenario with intent variants",
    );
    const absentRefs = fixed!.body.filter(
      (b): b is CELFactRefField =>
        b.type === "CELFactRefField" && b.intent === "absent",
    );
    expect(absentRefs.length).toBeGreaterThan(0);
    const negRefs = fixed!.body.filter(
      (b): b is CELFactRefField =>
        b.type === "CELFactRefField" && b.intent === "negative",
    );
    expect(negRefs.length).toBeGreaterThan(0);
  });

  test("cross-resource wiring — all six relations present in syntax-ref Case 4", () => {
    const r = buildCEL(readSource(CORPUS.syntaxRef));
    expect(r.success).toBe(true);
    const c4 = (r.result as CEL).statements.find(
      (s): s is CELCase =>
        s.type === "CELCase" && s.name === "Cross-resource reference scenario",
    );
    const wiringFields = c4!.body.filter((b) => b.type === "CELCrossResourceField");
    const relations = wiringFields.map(
      (f) => (f as { relation: string }).relation,
    ) as string[];
    expect(relations).toContain("based-on");
    expect(relations).toContain("part-of");
    expect(relations).toContain("during-encounter");
    expect(relations).toContain("requested-by");
    expect(relations).toContain("performed-by");
    expect(relations).toContain("not-done-because");
  });

  test("result is — boolean + branch values both supported", () => {
    const cms22 = buildCEL(readSource(CORPUS.cms22));
    expect(cms22.success).toBe(true);
    const cms22Cases = (cms22.result as CEL).statements.filter(
      (s): s is CELCase => s.type === "CELCase",
    );
    const c = cms22Cases[0];
    const numerator = c.body.find(
      (b) => b.type === "CELResultField" && (b as { leafName: string }).leafName === "Numerator",
    );
    // #189 Slice 1 / #285: Maria's Numerator was reframed true→false — the constant-true
    // `exists(<boolean>)` miscompile was corrected to a real disjunction, and CEL cannot model
    // her systolic/diastolic as `component of` the BP panel, so Normal BP Reading is false here.
    // Still exercises the boolean-valued `result is` parse (false is as first-class as true).
    expect((numerator as { value: { type: string; value: boolean } }).value.value).toBe(false);

    const strat = buildCEL(readSource(CORPUS.cms22Strategy));
    const stratCase = (strat.result as CEL).statements.find(
      (s): s is CELCase => s.type === "CELCase",
    );
    const branchResult = stratCase!.body.find(
      (b) => b.type === "CELResultField",
    );
    const v = (branchResult as { value: { type: string; branchName?: string } }).value;
    expect(v.type).toBe("CELBranchResult");
    expect(v.branchName).toBe("Antihypertensive Medication");
  });
});

describe("CEL Todo 2 — tokenizeCEL + parseCEL sibling functions", () => {
  test("tokenizeCEL yields tokens", () => {
    const r = tokenizeCEL(readSource(CORPUS.cms22));
    expect(r.success).toBe(true);
    expect(r.result?.length).toBeGreaterThan(0);
    expect(r.result?.[0].type).toBe("HEADER");
  });

  test("parseCEL yields parse tree", () => {
    const r = parseCEL(readSource(CORPUS.cms22));
    expect(r.success).toBe(true);
    expect(r.result).toBeDefined();
  });
});

describe("CEL Todo 2 — negative fixtures (parse-success boundary cases)", () => {
  test("quoted stage value fails to parse (v1 limitation per R3-B)", () => {
    const src = [
      "# Negative",
      "library \"Neg\".",
      "fact \"X\":",
      "- stage is \"ordered\".",
      "- defined by \"Patient\".",
    ].join("\n");
    const r = buildCEL(src);
    expect(r.success).toBe(false);
  });

  test("bare codes without canonical-token form parse-succeed (R3-A: documented permissive)", () => {
    const src = [
      "# Permissive",
      "library \"Perm\".",
      "fact \"X\":",
      "- code is \"no-pipe-here\".",
      "- defined by \"Patient\".",
    ].join("\n");
    const r = buildCEL(src);
    expect(r.success).toBe(true);
  });

  test("malformed input — invalid token surfaces parse error", () => {
    const r = buildCEL("@@@ not valid");
    expect(r.success).toBe(false);
    expect(r.errors?.length).toBeGreaterThan(0);
  });

  test("empty file — library required (header is optional, library is not)", () => {
    const r = buildCEL("");
    expect(r.success).toBe(false);
  });

  test("header-only — library required", () => {
    const r = buildCEL("# header only\n");
    expect(r.success).toBe(false);
  });
});

describe("CEL #189 S1 — `value is true` / `value is false` (first-class boolean fact value)", () => {
  const boolSrc = (v: string) =>
    ['library "T".', 'fact "Determination":', `- value is ${v}.`, '- defined by "Some Concept".'].join("\n");

  test("`value is true` builds a boolean CELValueField (value === true)", () => {
    const r = buildCEL(boolSrc("true"));
    expect(r.success).toBe(true);
    const fact = (r.result as CEL).statements.find((s): s is CELFact => s.type === "CELFact");
    const vf = fact!.body.find((b) => b.type === "CELValueField") as { value: unknown } | undefined;
    expect(vf?.value).toBe(true);
    expect(typeof vf?.value).toBe("boolean");
  });

  test("`value is false` builds a boolean CELValueField (value === false — distinct from absent)", () => {
    const r = buildCEL(boolSrc("false"));
    expect(r.success).toBe(true);
    const fact = (r.result as CEL).statements.find((s): s is CELFact => s.type === "CELFact");
    const vf = fact!.body.find((b) => b.type === "CELValueField") as { value: unknown } | undefined;
    expect(vf?.value).toBe(false);
    expect(typeof vf?.value).toBe("boolean");
  });

  test("`value is 42` still builds a numeric value (no regression), `value is \"text\"` a string", () => {
    const num = buildCEL(boolSrc("42"));
    expect(num.success).toBe(true);
    const numFact = (num.result as CEL).statements.find((s): s is CELFact => s.type === "CELFact");
    expect((numFact!.body.find((b) => b.type === "CELValueField") as { value: unknown }).value).toBe(42);
    const str = buildCEL(boolSrc('"documented"'));
    expect(str.success).toBe(true);
    const strFact = (str.result as CEL).statements.find((s): s is CELFact => s.type === "CELFact");
    expect((strFact!.body.find((b) => b.type === "CELValueField") as { value: unknown }).value).toBe("documented");
  });
});

describe("CEL #135 — leading `# header` is optional (library stays required)", () => {
  test("no header — a file starting directly with `library` parses", () => {
    const src = ['library "NoHdr".', 'fact "X":', '- code is "s|c".', '- defined by "Patient".'].join("\n");
    const r = buildCEL(src);
    expect(r.success).toBe(true);
    expect(r.result?.header).toBeUndefined(); // omitted, not ""
  });

  test("with header — still allowed; raw text preserved", () => {
    const src = ['# A Title', 'library "Hdr".', 'fact "X":', '- code is "s|c".', '- defined by "Patient".'].join("\n");
    const r = buildCEL(src);
    expect(r.success).toBe(true);
    expect(r.result?.header).toBe("# A Title");
  });

  test("header AFTER library — rejected (header is only the optional leading slot)", () => {
    const src = ['library "Late".', '# late header', 'fact "X":', '- defined by "Patient".'].join("\n");
    expect(buildCEL(src).success).toBe(false);
  });

  test("two leading `#` lines — rejected (only a single optional header)", () => {
    const src = ['# one', '# two', 'library "Two".', 'fact "X":', '- defined by "Patient".'].join("\n");
    expect(buildCEL(src).success).toBe(false);
  });
});
