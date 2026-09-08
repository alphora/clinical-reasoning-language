import { resolve } from "node:path";
import { expect, it } from "vitest";
import { emitFhirDefFromPath } from "../closureOrchestrator";

// Readable customer-fixture oracle: clinical concept, authored question, authored guidance.
const expected = [
  [
    "Blepharoplasty Requested",
    "Is blepharoplasty requested?",
    "Confirm whether this request includes blepharoplasty."
  ],
  [
    "Blepharoptosis Repair Requested",
    "Is blepharoptosis repair requested?",
    "Confirm whether this request includes blepharoptosis repair."
  ],
  [
    "Cosmetic Surgical Purpose",
    "Is the requested surgery being performed for cosmetic purposes?",
    "Answer for the purpose of the surgery under review."
  ],
  [
    "Functional Or Reconstructive Surgical Indication",
    "Which listed indication is this functional or reconstructive surgery performed to correct?",
    "Select the indication the requested surgery is intended to correct, including the stated causal relationship. Select none of the listed indications when none applies."
  ],
  [
    "Documented Patient Complaint",
    "Which complaint has the patient reported?",
    "Select the documented complaint supporting this request, or none of the listed complaints."
  ],
  [
    "Photographic Demonstration Submitted",
    "What does the submitted photograph demonstrate?",
    "Select the finding demonstrated by the photograph, or none of the listed photographic demonstrations. An attachment alone does not establish a finding."
  ],
  [
    "Visual Field Demonstration Submitted",
    "What does the submitted visual field examination demonstrate?",
    "Select the finding demonstrated by the visual field printout, or none of the listed visual field demonstrations."
  ],
  [
    "Photograph Submission Standards Met",
    "Do the submitted photographs conform to the photograph submission standards?",
    "Assess the submitted photographs against the policy's photograph submission standards."
  ],
  [
    "Visual Field Examination Standards Met",
    "Does the submitted visual field examination conform to the visual field examination standards?",
    "Assess the submitted examination against the policy's visual field examination standards."
  ],
  [
    "Individual Blepharoplasty Documentation",
    "Is the requested blepharoplasty individually documented?",
    "Assess the documentation supporting the blepharoplasty request independently of any concurrent blepharoptosis repair."
  ],
  [
    "Individual Blepharoptosis Repair Documentation",
    "Is the requested blepharoptosis repair individually documented?",
    "Assess the documentation supporting the blepharoptosis repair request independently of any concurrent blepharoplasty."
  ]
] as const;
function inputs(value: any): any[] {
  return value && typeof value === "object" ? [...(Array.isArray(value.input) ? value.input : []),
    ...Object.entries(value).filter(([key]) => key !== "input").flatMap(([, child]) => inputs(child))] : [];
}
it("maps all eleven Bleph concepts to the intended action-input text and description", () => {
  const file = resolve(__dirname, "../../../test/acceptance/bleph/src/crl/blepharoplasty-blepharoptosis-repair.crl");
  const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  const allInputs = inputs(result.resources);
  for (const [name, text, description] of expected) {
    const profile = result.resources.find((r) => r.resourceType === "StructureDefinition" && (r.resource as any).title === name)?.resource as any;
    expect(profile, name).toBeDefined();
    const occurrences = allInputs.filter((input) => input.profile?.includes(profile.url));
    expect(occurrences.length, name).toBeGreaterThan(0);
    for (const input of occurrences) {
      expect(input.extension.find((e: any) => e.url.endsWith("cpg-input-text")), name).toMatchObject({ valueString: text });
      expect(input.extension.find((e: any) => e.url.endsWith("cpg-input-description")), name).toMatchObject({ valueMarkdown: description });
    }
  }
});
