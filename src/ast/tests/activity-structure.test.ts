// Removed unused CRLAstBuilder import

import { Activity } from "../types";

import { parseInput } from "./parseInput";

describe("Activity Structure", () => {
  // Removed unused builder variable

  it("should correctly structure activity with type", () => {
    const input = 'activity "Vaccinate" request CPGImmunizationRequest.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Vaccinate");
    expect(activity.request).toBe("CPGImmunizationRequest");
  });

  it("should correctly structure activity with type and terminology", () => {
    const input = 'activity "Indicate" request CPGProposeDiagnosisTask with "Colonoscopy".';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Indicate");
    expect(activity.request).toBe("CPGProposeDiagnosisTask");
    expect(activity.terminologyReference).toBe("Colonoscopy");
  });

  it("should correctly structure activity with type and free text", () => {
    const input = 'activity "another thing" request CPGCommunicationRequest with `The message`.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify structure for free text
    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("another thing");
    expect(activity.request).toBe("CPGCommunicationRequest");
    expect(activity.activityTypeValue).toBe("The message");
    expect(activity.terminologyReference).toBeUndefined();
  });

  it("should correctly structure activity with type and terminology or free text", () => {
    const input1 = 'activity "Indicate" request CPGProposeDiagnosisTask with "Colonoscopy".';
    const input2 =
      'activity "Notify" request CPGCommunicationRequest with `A notification message`.';

    const result1 = parseInput(input1);
    const result2 = parseInput(input2);
    const activity1 = result1.statements[0] as Activity;
    const activity2 = result2.statements[0] as Activity;

    // Terminology reference
    expect(activity1.terminologyReference).toBe("Colonoscopy");
    expect(activity1.activityTypeValue).toBeUndefined();
    // Free text
    expect(activity2.activityTypeValue).toBe("A notification message");
    expect(activity2.terminologyReference).toBeUndefined();
  });

  it("should correctly structure activity with empty free text", () => {
    const input = 'activity "Empty Free Text" request CPGCommunicationRequest with ``.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Empty Free Text");
    expect(activity.request).toBe("CPGCommunicationRequest");
    expect(activity.activityTypeValue).toBe("");
    expect(activity.terminologyReference).toBeUndefined();
  });

  it("should correctly structure activity with do not perform", () => {
    const input = 'activity "Contraindicated" request do not perform CPGImmunizationRequest.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Contraindicated");
    expect(activity.request).toBe("CPGImmunizationRequest");
    expect(activity.doNotPerform).toBe(true);
  });
});
