import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { createPresentationCatalog } from "../presentation";
import { planPresentationEdit } from "../../editing/presentationEdit";

const member = (name: string) => `concept "${name}":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`${name.toLowerCase()}\`.
- shape reduction is most recent.
presentation for "${name}": - question text is "${name}?". - choice group is "Symptoms".
`;
const declaration = `presentation group "Symptoms":
- question text is "Which symptoms apply?".
- question description is "Select each documented symptom.".
- columns is 3.
- control is checkbox.
`;
const source = `library "P".\n${declaration}${member("Blurred")}${member("Strain")}`;
function catalog(text = source) {
  const result = buildCRL(text);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return createPresentationCatalog(result.result!);
}
describe("independent Boolean choice groups", () => {
  // @kit concept-presentation:choice-group-annotation
  it("keeps groups outside computational statements and preserves declaration order", () => {
    const result = buildCRL(source).result!;
    expect(result.statements.map(s => s.type)).toEqual(["Concept", "Concept"]);
    expect(catalog().diagnostics).toEqual([]);
    expect(catalog().groupFor("Blurred")).toMatchObject({ name: "Symptoms", columns: 3, control: "checkbox", members: ["Blurred", "Strain"] });
    expect(catalog().resolve("Blurred")).toEqual({ questionText: "Blurred?" });
  });
  // @kit concept-presentation:choice-group-validation
  it.each(["0", "1.5", "2147483648"])("rejects invalid columns %s", value => {
    expect(buildCRL(source.replace("columns is 3", `columns is ${value}`)).success).toBe(false);
  });
  it.each(["- control is dropdown.", "- columns is 2. - columns is 3.", '- question text is "".'])("rejects invalid group fields %s", line => {
    expect(buildCRL(`library "P". presentation group "Symptoms": ${line}`).success).toBe(false);
  });
  it("does not reserve checkbox or radio in existing narratives", () => {
    expect(buildCRL('library "P". concept "Narrative": - definition is checkbox radio.').success).toBe(true);
    expect(buildCRL('library "P". concept "Narrative": - definition is control is checkbox columns is radio choice group is presentation group.').success).toBe(true);
  });
  it("defaults to one column and ordinary Boolean controls", () => {
    expect(catalog(source.replace("- columns is 3.", "").replace("- control is checkbox.", "")).groupFor("Strain")).toMatchObject({ columns: 1, control: "radio" });
  });
  it.each([
    source.replace('choice group is "Symptoms"', 'choice group is "Missing"'),
    source + declaration,
    `library "P". ${declaration}`,
    source.replace('presentation for "Blurred":', 'decision "D": - when "Blurred" then recommend activity "Met". presentation for "Blurred": - in decision "D".'),
    source.replace("value type is boolean", "value type is string"),
    source.replace("- shape reduction is most recent.", ""),
    source.replace('- code is `blurred`.', ""),
    source + 'presentation for "Blurred": - question text is "Again?". - choice group is "Symptoms".',
  ])("rejects invalid membership", text => {
    expect(catalog(text).diagnostics.some(d => d.kind === "presentation-group-invalid")).toBe(true);
  });
  // @kit concept-presentation:choice-group-edit-preservation
  it("question edits preserve the group declaration and membership", () => {
    const plan = planPresentationEdit(source, { library: "P", concept: "Blurred", questionText: "Blurred vision?" });
    expect(plan.candidateSource).toContain(declaration);
    expect(catalog(plan.candidateSource).groupFor("Blurred")).toEqual(catalog().groupFor("Blurred"));
    expect(catalog(plan.candidateSource).resolve("Blurred").questionText).toBe("Blurred vision?");
  });
});
