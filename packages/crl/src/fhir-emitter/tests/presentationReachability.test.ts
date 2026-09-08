import { describe, expect, it } from "vitest";
import { checkPresentationReachability } from "../presentationReachability";
import type { EmittedResource } from "../types";
const base = "https://example.org/";
const text = (wording: string) => ({ profile: [`${base}StructureDefinition/answer`], extension: [
  { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text", valueString: wording },
] });
const guard = [{}];
const first = [{ url: "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior", valueString: "any" }];
const plan = (name: string, action: unknown[]): EmittedResource => ({ resourceType: "PlanDefinition",
  relativePath: `PlanDefinition/${name}.json`, sourceKind: "Decision", sourceName: name,
  resource: { resourceType: "PlanDefinition", url: `${base}PlanDefinition/${name}`, action } });
describe("presentation form reachability", () => {
  it("compares missing wording using the actual concept-name fallback", () => {
    const profile: EmittedResource = { resourceType: "StructureDefinition", relativePath: "StructureDefinition/answer.json",
      resource: { resourceType: "StructureDefinition", url: `${base}StructureDefinition/answer`, title: "Answer" } };
    const p = plan("P", [{ input: [{ profile: [`${base}StructureDefinition/answer`] }] }, { input: [text("Answer")] }]);
    expect(checkPresentationReachability([profile, p])).toEqual([]);
    expect(checkPresentationReachability([profile, plan("P", [{ input: [{ profile: [`${base}StructureDefinition/answer`] }] }, { input: [text("Different?")] }])]))
      .toMatchObject([{ kind: "presentation-overlap" }]);
  });
  it("rejects earlier false guard wording that can coexist with a later guard", () => {
    const p = plan("P", [{ extension: first, action: [
      { condition: guard, input: [text("Earlier?")] }, { condition: guard, input: [text("Later?")] },
    ] }]);
    expect(checkPresentationReachability([p])).toMatchObject([{ kind: "presentation-overlap" }]);
  });
  it("accepts different wording in mutually exclusive branch descendants", () => {
    const p = plan("P", [{ extension: first, action: [
      { condition: guard, action: [{ input: [text("Inside earlier?")] }] },
      { condition: guard, action: [{ input: [text("Inside later?")] }] },
    ] }]);
    expect(checkPresentationReachability([p])).toEqual([]);
  });
  it("includes delegated decisions in the caller's form", () => {
    const p = plan("P", [{ definitionCanonical: `${base}PlanDefinition/A` }, { definitionCanonical: `${base}PlanDefinition/B` }]);
    expect(checkPresentationReachability([p, plan("A", [{ input: [text("A?")] }]), plan("B", [{ input: [text("B?")] }])]))
      .toMatchObject([{ kind: "presentation-overlap" }]);
  });
  it("does not visit siblings after an unconditional first match", () => {
    expect(checkPresentationReachability([plan("P", [{ extension: first, action: [
      { input: [text("First?")] }, { input: [text("Unreachable?")] },
    ] }])])).toEqual([]);
  });
  it("refuses unresolved delegation instead of certifying it", () => {
    expect(checkPresentationReachability([plan("P", [{ definitionCanonical: `${base}PlanDefinition/Missing` }])]))
      .toMatchObject([{ kind: "presentation-delegation-unverified" }]);
  });
  it("does not duplicate a missing-target error for an already diagnosed resource collision", () => {
    expect(checkPresentationReachability([plan("P", [{ definitionCanonical: `${base}PlanDefinition/Missing` }])], new Set(["PlanDefinition/Missing.json"]))).toEqual([]);
  });
});
