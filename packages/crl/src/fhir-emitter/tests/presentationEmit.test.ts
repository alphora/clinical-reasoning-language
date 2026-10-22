// REFACTOR:grounded (MR10): authored activities use CPGTaskRequest and produce FHIR Task.
import { planPresentationEdit } from "../../editing/presentationEdit";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emitFhirDefFromPath } from "../closureOrchestrator";
import { isFhirDefError } from "../types";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));
const answer = `concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
`;
const activity = `activity "Met": - request CPGTaskRequest. - with \`MET\`.
`;
const wording = `presentation for "Answer":
- question text is "Has the answer been documented?".
- question description is "Use the documented finding.".
`;
function emit(source: string, sibling?: string) {
  const directory = mkdtempSync(join(tmpdir(), "crl-presentation-")); directories.push(directory);
  mkdirSync(join(directory, "src", "crl"), { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "presentation", version: "1.0.0", crl: { canonicalBase: "https://example.org/presentation" } }));
  const file = join(directory, "src", "crl", "policy.crl"); writeFileSync(file, source);
  if (sibling) writeFileSync(join(directory, "src", "crl", "shared.crl"), sibling);
  return emitFhirDefFromPath(file, { date: "2026-09-08" });
}
function inputs(value: any): any[] {
  return value && typeof value === "object" ? [...(Array.isArray(value.input) ? value.input : []),
    ...Object.entries(value).filter(([key]) => key !== "input").flatMap(([, child]) => inputs(child))] : [];
}
function inputText(input: any) { return input.extension?.find((e: any) => e.url.endsWith("cpg-input-text"))?.valueString; }

describe("choice group descriptors", () => {
  const group = `presentation group "Panel": - question text is "Select all that apply". - columns is 2. - control is checkbox.
presentation for "Answer": - question text is "Answer?". - choice group is "Panel".
presentation for "Later": - question text is "Later?". - choice group is "Panel".
`;
  const concepts = answer + answer.replaceAll("Answer", "Later").replace("`answer`", "`later`");
  // @kit concept-presentation:choice-group-emission
  it("carries every ordered member including an otherwise unused question, with stable semantic identity", () => {
    const source = `library "P". ${concepts}${activity}${group}decision "D": - when "Answer" then recommend activity "Met".`;
    const result = emit(source);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const descriptors = inputs(result.resources).flatMap(i => i.extension?.filter((e: any) => e.url.endsWith("/presentation-choice-group")) ?? []);
    expect(descriptors.length).toBeGreaterThan(0);
    const data = descriptors[0].extension;
    expect(data.find((e: any) => e.url === "protocol").valueInteger).toBe(1);
    const identity = JSON.parse(data.find((e: any) => e.url === "id").valueString);
    expect(identity).toEqual([expect.stringContaining("/Library/"), "1.0.0", "Panel"]);
    const members = data.filter((e: any) => e.url === "member").map((e: any) => e.extension);
    expect(members.map((m: any) => m.find((e: any) => e.url === "text").valueString)).toEqual(["Answer?", "Later?"]);
    // Ordinary CPG consumers keep the authored group question; capable engines use original member text above.
    const groupedInputs = inputs(result.resources).filter(i => i.extension?.some((e: any) => e.url.endsWith("/presentation-choice-group")));
    expect(groupedInputs.every(i => inputText(i)?.startsWith("Select all that apply: "))).toBe(true);
    for (const m of members) expect(result.resources.some(r => (r.resource as any).url === m.find((e: any) => e.url === "profile").valueCanonical)).toBe(true);
    expect(inputs(emit(source).resources).flatMap(i => i.extension ?? []).filter((e: any) => e.url.endsWith("/presentation-choice-group"))).toEqual(descriptors);
  });
  // @kit concept-presentation:choice-group-coexistence
  it("rejects later conflicting scoped wording exposed by collective gathering", () => {
    const result = emit(`library "P". ${concepts}${activity}${group}
criterion "Later Scope": - when ("Later").
presentation for "Later": - in criterion "Later Scope". - question text is "Different later?".
decision "D": - when "Answer" then: - when "Later Scope" then recommend activity "Met". end.`);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.kind === "presentation-overlap")).toBe(true);
  });
  it("uses the actual imported owner, including across delegated decisions", () => {
    const result = emit(`library "P". ${activity}
decision "D": - when "Shared"."Answer" then use decision "Nested".
decision "Nested": - when "Shared"."Later" then recommend activity "Met".`, `library "Shared". ${concepts}${group}`);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const descriptors = inputs(result.resources).flatMap(i => i.extension?.filter((e: any) => e.url.endsWith("/presentation-choice-group")) ?? []);
    expect(descriptors.length).toBeGreaterThan(1);
    expect(new Set(descriptors.map((d: any) => JSON.stringify(d))).size).toBe(1);
    const id = JSON.parse(descriptors[0].extension.find((e: any) => e.url === "id").valueString);
    expect(id[0]).toContain("Shared");
    expect(id[0]).not.toContain(":\\");
  });
  it("does not alter clinical CQL or existing Boolean profile contracts", () => {
    const ordinary=`library "P". ${concepts}${activity}decision "D": - when "Answer" then recommend activity "Met".
presentation for "Answer": - question text is "Answer?".
presentation for "Later": - question text is "Later?".`;
    const grouped=ordinary.replace('question text is "Answer?".', 'question text is "Answer?". - choice group is "Panel".')
      .replace('question text is "Later?".', 'question text is "Later?". - choice group is "Panel".')
      + '\npresentation group "Panel": - question text is "Symptoms".';
    const a=emit(ordinary),b=emit(grouped);expect(a.success).toBe(true);expect(b.success,JSON.stringify(b.errors)).toBe(true);
    const libraries=(r:typeof a)=>r.resources.filter(x=>x.resourceType==='Library').map(x=>x.resource);
    expect(libraries(b)).toEqual(libraries(a));
    const originalProfile=a.resources.find(r=>r.resourceType==='StructureDefinition'&&(r.resource as any).title==='Answer');
    expect(b.resources.find(r=>(r.resource as any).url===(originalProfile!.resource as any).url)).toEqual(originalProfile);
  });
});
describe("authored presentation in emitted question inputs", () => {
  it("a source-valid wording edit still requires emission coexistence checks", () => {
    const source = `library "P".\n${answer}${activity}
criterion "A": - when ("Answer").
criterion "B": - when ("Answer").
presentation for "Answer": - in criterion "A". - question text is "Same?".
presentation for "Answer": - in criterion "B". - question text is "Same?".
decision "D": - when ("A" or "B") then recommend activity "Met".`;
    expect(emit(source).success).toBe(true);
    const plan = planPresentationEdit(source, {library:"P", concept:"Answer", context:{decision:"D",criteria:["A"]}, questionText:"Different?"});
    expect(plan.validation.remaining).toContain("Emission presentation coexistence checks");
    const emitted = emit(plan.candidateSource);
    expect(emitted.success).toBe(false);
    expect(emitted.errors.some(e => e.kind === "presentation-overlap")).toBe(true);
  });

  it("still rejects conflicting same-profile wording on DNF guard arms", () => {
    const result = emit(`library "P".\n${answer}${activity}
criterion "A": - when ("Answer").
criterion "B": - when ("Answer").
presentation for "Answer": - in criterion "A". - question text is "A?".
presentation for "Answer": - in criterion "B". - question text is "B?".
decision "D": - when ("A" or "B") then recommend activity "Met".`);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.kind === "presentation-overlap")).toBe(true);
  });
  it("accepts different wording for the same concept inside mutually exclusive branch descendants", () => {
    const gate = answer.replaceAll('"Answer"', '"Gate"').replace('`answer`', '`gate`');
    const result = emit(`library "P".\n${answer}${gate}${activity}
criterion "A": - when ("Answer").
criterion "B": - when ("Answer").
presentation for "Gate": - question text is "Which path?".
presentation for "Answer": - in criterion "A". - question text is "Answer on path A?".
presentation for "Answer": - in criterion "B". - question text is "Answer on path B?".
decision "D": first:
- when "Gate" then:
  - when "A" then recommend activity "Met".
  end.
- otherwise then:
  - when "B" then recommend activity "Met".
  end.
`);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(inputs(result.resources).map(inputText)).toEqual(expect.arrayContaining(["Answer on path A?", "Answer on path B?"]));
  });
  it("accepts free text containing double quotes in a backtick presentation", () => {
    const result = emit(`library "P".\n${answer}${activity}presentation for "Answer":
- question text is \`Was "chronic" recorded?\`.
- question description is \`Use the clinician's "chronic" designation.\`.
decision "D": - when "Answer" then recommend activity "Met".`);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(inputText(inputs(result.resources)[0])).toBe('Was "chronic" recorded?');
  });
  // @kit concept-presentation:text-description-identity
  it("keeps text, description, and identity distinct", () => {
    const result = emit(`library "P".\n${answer}${activity}${wording}decision "D": - when "Answer" then recommend activity "Met".`);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.errors).toEqual([]);
    const input = inputs(result.resources)[0];
    expect(inputText(input)).toBe("Has the answer been documented?");
    expect(input.extension.find((e: any) => e.url.endsWith("cpg-input-description"))).toMatchObject({ valueMarkdown: "Use the documented finding." });
    const profile = result.resources.find((r) => r.resourceType === "StructureDefinition")!.resource as any;
    expect(profile.title).toBe("Answer");
    expect(profile.url).toMatch(/answer$/);
    expect(profile.differential.element.find((e: any) => e.path === "Observation.value[x]").short).toBe("Answer");
    expect(profile.differential.element.find((e: any) => e.path === "Observation.code").patternCodeableConcept.coding[0].code).toBe("answer");
  });
  // @kit concept-presentation:imported-owner
  it("inherits imported input wording from its owner without accepting local overrides", () => {
    const result = emit(`library "P".\n${activity}decision "D": - when "Shared"."Answer" then recommend activity "Met".`, `library "Shared".\n${answer}${wording}`);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(inputText(inputs(result.resources)[0])).toBe("Has the answer been documented?");
    expect(result.errors.filter(isFhirDefError)).toEqual([]);
  });
  it("uses the criterion ancestry of this input rather than every criterion in a compound", () => {
    const source = `library "P".\n${answer}${answer.replaceAll('"Answer"', '"Other"').replace('`answer`', '`other`')}${activity}
criterion "A": - when ("Answer").
criterion "B": - when ("Other").
presentation for "Answer": - in criterion "A". - question text is "Answer in A?".
presentation for "Other": - in criterion "B". - question text is "Other in B?".
decision "D": - when ("A" and "B") then recommend activity "Met".`;
    const result = emit(source);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(inputs(result.resources).map(inputText)).toEqual(["Answer in A?", "Other in B?"]);
  });
  it("diagnoses missing wording without silently inventing a question", () => {
    const result = emit(`library "P".\n${answer}${activity}decision "D": - when "Answer" then recommend activity "Met".`);
    expect(result.success).toBe(true);
    expect(result.errors).toMatchObject([{ kind: "presentation-question-text-missing" }]);
    expect(inputs(result.resources)[0].extension).toBeUndefined();
  });
  it("refuses overlapping scopes before returning a successful artifact", () => {
    const result = emit(`library "P".\n${answer}${activity}
criterion "A": - when ("Answer").
presentation for "Answer": - in criterion "A". - in decision "D". - question text is "Overlapping?".
decision "D": - when "A" then recommend activity "Met".`);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.kind === "presentation-overlap")).toBe(true);
    expect(result.resources.some((r) => r.sourceKind === "Decision")).toBe(false);
  });
});
