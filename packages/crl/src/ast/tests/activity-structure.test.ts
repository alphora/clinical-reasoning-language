// Removed unused CRLAstBuilder import

import { Activity } from "../types";

import { parseInput } from "./parseInput";

describe("Activity Structure", () => {
  // Removed unused builder variable

  it("should correctly structure activity with type", () => {
    const input = 'activity "Vaccinate":\n- request CPGImmunizationRequest.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Vaccinate");
    expect(activity.body.request.activityType).toBe("CPGImmunizationRequest");
  });

  it("should correctly structure activity with type and terminology", () => {
    const input = 'activity "Indicate":\n- request CPGProposeDiagnosisTask\n- with "Colonoscopy".';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Indicate");
    expect(activity.body.request.activityType).toBe("CPGProposeDiagnosisTask");
    expect(activity.body.withClause?.terminologyReference).toBe("Colonoscopy");
  });

  it("should correctly structure activity with type and free text", () => {
    const input =
      'activity "another thing":\n- request CPGCommunicationRequest\n- with `The message`.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify structure for free text
    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("another thing");
    expect(activity.body.request.activityType).toBe("CPGCommunicationRequest");
    expect(activity.body.withClause?.activityTypeValue).toBe("The message");
  });

  it("should correctly structure activity with type and terminology or free text", () => {
    const input1 = 'activity "Indicate":\n- request CPGProposeDiagnosisTask\n- with "Colonoscopy".';
    const input2 =
      'activity "Notify":\n- request CPGCommunicationRequest\n- with `A notification message`.';

    const result1 = parseInput(input1);
    const result2 = parseInput(input2);
    const activity1 = result1.statements[0] as Activity;
    const activity2 = result2.statements[0] as Activity;

    // Terminology reference
    expect(activity1.body.withClause?.terminologyReference).toBe("Colonoscopy");
    expect(activity1.body.withClause?.activityTypeValue).toBeUndefined();
    // Free text
    expect(activity2.body.withClause?.activityTypeValue).toBe("A notification message");
    expect(activity2.body.withClause?.terminologyReference).toBeUndefined();
  });

  it("should correctly structure activity with empty free text", () => {
    const input = 'activity "Empty Free Text":\n- request CPGCommunicationRequest\n- with ``.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Empty Free Text");
    expect(activity.body.request.activityType).toBe("CPGCommunicationRequest");
    expect(activity.body.withClause?.activityTypeValue).toBeUndefined();
    expect(activity.body.withClause?.terminologyReference).toBeUndefined();
  });

  it("should correctly structure activity with do not perform", () => {
    const input = 'activity "Contraindicated":\n- request do not perform CPGImmunizationRequest.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    expect(activity.type).toBe("Activity");
    expect(activity.name).toBe("Contraindicated");
    expect(activity.body.request.activityType).toBe("CPGImmunizationRequest");
    expect(activity.body.request.doNotPerform).toBe(true);
  });
});
