import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCRL } from "../../index";
import { createPresentationCatalog } from "../presentation";

const head = `library "P".
concept "Complaint":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`complaint\`.
criterion "Complaint Review": - when ("Complaint").
decision "Coverage":
- when "Complaint Review" then recommend activity "Met".
decision "Other Review":
- when "Complaint" then recommend activity "Met".
`;
const base = `presentation for "Complaint":
- question text is "What complaint was reported?".
- question description is "Use the documented complaint.".
`;
function ast(source: string) {
  const result = buildCRL(source);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.result!;
}
describe("explicit presentation declarations", () => {
  it("keeps text out of computational identity and preserves both fields", () => {
    const root = ast(head + base);
    expect(root.statements.some((s) => s.name === "Patient complaint")).toBe(false);
    expect(root.presentations).toHaveLength(1);
    const catalog = createPresentationCatalog(root);
    expect(catalog.diagnostics).toEqual([]);
    expect(catalog.resolve("Complaint")).toEqual({ questionText: "What complaint was reported?", questionDescription: "Use the documented complaint." });
  });
  it("inherits omitted fields and allows disjoint alternative contexts", () => {
    const catalog = createPresentationCatalog(ast(head + base + `
presentation for "Complaint":
- in criterion "Complaint Review".
- in decision "Other Review".
- question text is "Which complaint supports this request?".
`));
    expect(catalog.diagnostics).toEqual([]);
    for (const context of [{ decision: "Coverage", criteria: new Set(["Complaint Review"]) }, { decision: "Other Review", criteria: new Set<string>() }]) {
      expect(catalog.resolve("Complaint", context)).toMatchObject({ questionText: "Which complaint supports this request?", questionDescription: "Use the documented complaint." });
    }
  });
  it("rejects overlapping decision and criterion contexts even inside one declaration", () => {
    const catalog = createPresentationCatalog(ast(head + base + `
presentation for "Complaint":
- in criterion "Complaint Review".
- in decision "Coverage".
- question text is "Which complaint?".
`));
    expect(catalog.diagnostics.some((d) => d.kind === "presentation-overlap")).toBe(true);
  });
  it("rejects duplicate defaults even if their text differs", () => {
    const catalog = createPresentationCatalog(ast(head + base + 'presentation for "Complaint": - question text is "Other".'));
    expect(catalog.diagnostics.some((d) => d.kind === "presentation-overlap")).toBe(true);
  });
  it.each(['presentation for "Missing": - question text is "X".', 'presentation for "Complaint": - in criterion "Coverage". - question text is "X".'])("rejects unresolved or wrong-kind references: %s", (source) => {
    expect(createPresentationCatalog(ast(head + source)).diagnostics.some((d) => d.kind === "presentation-reference")).toBe(true);
  });
  it("diagnoses the deferred foreign override instead of guessing ownership", () => {
    const catalog = createPresentationCatalog(ast(head + 'presentation for "Shared"."Complaint": - question text is "Which complaint?".'));
    expect(catalog.diagnostics[0].kind).toBe("presentation-override-unsupported");
  });
  it.each(['- question text is "".', '- question text is "First".\n- question text is "Second".'])("rejects empty and repeated fields", (fields) => {
    expect(buildCRL(head + 'presentation for "Complaint":\n' + fields).success).toBe(false);
  });
  it.each(['- label is "Short".', '- short is "Short".', '- question description is "Guidance only".'])("rejects unsupported short fields and missing question text: %s", (fields) => {
    expect(buildCRL(head + 'presentation for "Complaint":\n' + fields).success).toBe(false);
  });
  it.each(["boolean", "CodeableConcept", "Quantity"])("accepts coded %s presentation targets", (type) => {
    expect(createPresentationCatalog(ast(head.replace("value type is boolean", `value type is ${type}`) + base)).diagnostics).toEqual([]);
  });
  it("rejects presentation on an uncoded computation", () => {
    expect(createPresentationCatalog(ast(head.replace('- code is `complaint`.', '') + base)).diagnostics)
      .toMatchObject([{ kind: "presentation-target-not-question-enabled", severity: "error" }]);
  });
  it("warns for an unused coded concept with no presentation", () => {
    const catalog = createPresentationCatalog(ast('library "P". concept "Unused": - type is Observation. - value type is boolean. - code is `unused`.'));
    expect(catalog.diagnostics).toMatchObject([{ kind: "presentation-question-text-missing", severity: "warning" }]);
  });
  it.each([true, false])("resolves same-named concept and decision independently, decision first=%s", (decisionFirst) => {
    const concept = 'concept "Coverage": - type is Observation. - value type is boolean. - code is `coverage`.\n';
    const decision = 'decision "Coverage": - when "Coverage" then recommend activity "Met".\n';
    const root = ast('library "P".\n' + (decisionFirst ? decision + concept : concept + decision) +
      'presentation for "Coverage": - in decision "Coverage". - question text is "Is coverage supported?".');
    expect(createPresentationCatalog(root).diagnostics).toEqual([]);
  });
  it("migrates Bleph identity separately from explicit wording and named answer sets", () => {
    const source = readFileSync(resolve(__dirname, "../../../test/acceptance/bleph/src/crl/blepharoplasty-blepharoptosis-repair.crl"), "utf8");
    const root = ast(source);
    expect(root.presentations).toHaveLength(11);
    const catalog = createPresentationCatalog(root);
    expect(catalog.diagnostics).toEqual([]);
    expect(catalog.resolve("Functional Or Reconstructive Surgical Indication").questionText).toBe("Which listed indication is this functional or reconstructive surgery performed to correct?");
    expect(root.statements.some((s) => s.name.startsWith("Which Listed"))).toBe(false);
    expect(source).not.toContain("- value from:");
  });
});
