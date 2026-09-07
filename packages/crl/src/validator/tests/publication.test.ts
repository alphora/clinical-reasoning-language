import { describe, expect, it } from "vitest";
import { parseInput } from "../../ast/tests/parseInput";
import type { Concept } from "../../ast/types";
import { Validator } from "../validator";
import { buildCRL } from "../../index";

// REFACTOR:grounded (#320, review 560): authored final selection satisfies the Record contract.
const publication = `concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.`;
const activities = `activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.`;

const validate = (body: string) => {
  const built = buildCRL(`library "P".
${publication}
${activities}
${body}`);
  if (!built.success || !built.result) throw new Error(JSON.stringify(built.errors));
  return new Validator().validate(built.result);
};

describe("selected Boolean publication authoring", () => {
  // REFACTOR:grounded (#320, review 561 E2): teach the admitted local-only boundary
  // without rejecting the authored selector or changing its equal-time behavior.
  it("warns at an admitted prefer-local clause that local/local ties remain ambiguous", () => {
    const ast = parseInput(`library "P".\n${publication.replace("most recent.", "most recent, on equal time prefer local.")}`);
    const concept = ast.statements[0] as Concept;
    const result = new Validator().validate(ast);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      kind: "reduction-shape",
      rule: "publication-local-tie-preference-no-op",
      severity: "warning",
      conceptName: "Answer",
      location: concept.shapeReduction!.location,
    });
    expect(result.warnings[0].message).toContain("currently has no effect for this local-only selected Record publication");
    expect(result.warnings[0].message).toContain("Two local candidates at the same maximal time still cause an ambiguous-selection error");
    expect(result.warnings[0].message).toContain("no automatic chronological or insertion-order precedence");
    expect(result.warnings[0].message).toContain("an answer does not automatically win");
    expect(concept.shapeReduction!.equalTime).toBe("preferLocal");
  });

  it("does not warn about a local preference when the admitted selector has no preference", () => {
    const result = new Validator().validate(parseInput(`library "P".\n${publication}`));
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("does not teach an admitted local preference for an unsupported publication form", () => {
    const ast = parseInput(`library "P".\n${publication.replace("most recent.", "most recent, on equal time prefer local.")}`);
    (ast.statements[0] as Concept).valueTypes = ["string"];
    const result = new Validator().validate(ast);
    expect(result.errors.some((e) => "rule" in e && e.rule === "publication-unsupported-form")).toBe(true);
    expect(result.warnings.some((w) => "rule" in w && w.rule === "publication-local-tie-preference-no-op")).toBe(false);
  });

  it("accepts the exact declaration with direct, self-qualified, criterion and compound nullable guards", () => {
    const result = validate(`criterion "Known":
- when ("Answer" or not "P"."Answer").
decision "D":
first:
- when "Known" then recommend activity "Approve".
- when "Answer" and not "P"."Answer" then recommend activity "Deny".
- otherwise then recommend activity "Deny".`);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it.each([
    ['Scalar', (c: Concept) => { c.shape = "Scalar"; }],
    ['string', (c: Concept) => { c.valueTypes = ["string"]; }],
    ['empty code', (c: Concept) => { c.code = ""; }],
    ['producer', (c: Concept) => { c.definition = (parseInput('library "X". concept "X": - value type is boolean. - definition is exists this.').statements[0] as Concept).definition; }],
  ] as const)("rejects unsupported %s opt-in with the shared admission diagnostic", (_name, mutate) => {
    const ast = parseInput(`library "P". ${publication}`);
    mutate(ast.statements[0] as Concept);
    const result = new Validator().validate(ast);
    expect(result.errors.some((e) => "rule" in e && e.rule === "publication-unsupported-form")).toBe(true);
    expect(result.errors.some((e) => "rule" in e && e.rule === "record-shape-invariant")).toBe(false);
  });

  it.each([
    '- defined as "Answer".',
    '- defined as ("Answer" and "Answer").',
    '- defined as exists ("Answer").',
    '- definition is exists "Answer".',
    '- defined as ("Answer" sem-or "Answer").',
    '- definition is most recent "Answer".',
  ])("scopes unsupported dependent context %s without existence advice", (definition) => {
    const result = validate(`concept "Dependent":
- shape is Scalar.
- value type is boolean.
${definition}`);
    const scoped = result.errors.filter((e) => "rule" in e && e.rule === "publication-unsupported-context");
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((e) => !e.message.includes("defined as exists"))).toBe(true);
  });

  it("warns about legacy false-on-missing behavior only beside an admitted publication", () => {
    const result = validate(`concept "Legacy":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`legacy\`.
- definition is most recent this.`);
    const warning = result.warnings.find((w) => "rule" in w && w.rule === "legacy-boolean-publication-absence");
    expect(warning?.message).toContain("missing selected value is emitted as false");
    expect(warning?.message).toContain("missing value remains null");
  });

  it.each(["unless", "only when"])("refuses %s publication action guards explicitly", (polarity) => {
    const result = validate(`decision "D":
first:
- when "Answer" then:
  any:
  - recommend activity "Approve" ${polarity} "Answer".
  - recommend activity "Deny".
  end.
- otherwise then recommend activity "Deny".`);
    expect(result.errors.some((e) => "rule" in e && e.rule === "publication-unsupported-context")).toBe(true);
  });
});
