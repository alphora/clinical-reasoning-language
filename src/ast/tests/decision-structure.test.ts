import {
  Decision,
  WhenBlock,
  BlockBody,
  ActionStatement,
  SingleAction,
  RecommendActivity,
  UseDecision,
} from "../types";

import { parseInput } from "./parseInput";

/**
 * This test suite verifies the correct structure of nested decisions in the AST.
 * It ensures that the AST builder correctly parses and structures nested decision blocks.
 *
 * Note: For actual duplication checks, see the validator tests in:
 * - whenBlockUniqueness.test.ts
 * - actionUniqueness.test.ts
 * - nameUniqueness.test.ts
 */
describe("Decision Structure", () => {
  it("should maintain correct structure for nested decisions", () => {
    const input = `# Test
decision "IMMZ.D2.D5.Measles":
    - when "Measles Routine Immunization Schedule Incomplete" then:
        any:
            - when "No Primary Series Doses Administered" then:
                - when "Client Age Less Than 12 Months" then recommend activity "Indicate".
                - when "Last Live Vaccine Administered has had in 4 Weeks" then use decision "Elderly Based".
            - end when
            - when "Client Is Due For MCV12" then recommend activity "Vaccinate".
        - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure
    expect(decision.body.statements).toHaveLength(1);

    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2);

    const nestedWhenBlock = firstBlockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2);
  });

  it("should handle single action statements", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then recommend activity "Vaccinate".`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const singleAction = whenBlock.body as SingleAction;
    const doActivity = singleAction.action as RecommendActivity;

    expect(singleAction.type).toBe("ActionStatement");
    expect(doActivity.type).toBe("RecommendActivity");
    expect(doActivity.activityName).toBe("Vaccinate");
  });

  it("should handle block bodies with any qualifier", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then:
        any:
            - when "Greater Than 18" then recommend activity "Adult Protocol".
            - when "Less Than 65" then recommend activity "Standard Care".
        - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;

    expect(blockBody.qualifier).toBe("any");
    expect(blockBody.statements).toHaveLength(2);
  });

  it("should handle block bodies with all qualifier", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then:
        all:
            - when "Greater Than 18" then recommend activity "Adult Protocol".
            - when "Less Than 65" then recommend activity "Standard Care".
        - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;

    expect(blockBody.qualifier).toBe("all");
    expect(blockBody.statements).toHaveLength(2);
  });

  it("should handle mixed action types in block bodies", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then:
        - recommend activity "Vaccinate".
        - use decision "Protocol".
    - end when
    - when "Condition" then recommend activity "Action".`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;

    expect(blockBody.statements).toHaveLength(2);

    const doAction = blockBody.statements[0] as ActionStatement;
    expect(doAction.type).toBe("ActionStatement");
    expect(doAction.action.type).toBe("RecommendActivity");

    const useAction = blockBody.statements[1] as ActionStatement;
    expect(useAction.type).toBe("ActionStatement");
    expect(useAction.action.type).toBe("UseDecision");

    const nestedWhen = blockBody.statements[2] as WhenBlock;
    expect(nestedWhen.type).toBe("WhenBlock");
    expect(nestedWhen.conceptName).toBe("Condition");

    const singleAction = nestedWhen.body as SingleAction;
    expect(singleAction.type).toBe("ActionStatement");
    expect(singleAction.action.type).toBe("RecommendActivity");
  });

  it("should not duplicate when blocks in nested decisions", () => {
    const input = `# Test
decision "IMMZ.D2.D5.Measles":
    - when "Measles Routine Immunization Schedule Incomplete" then:
        any:
        - when "No Primary Series Doses Administered" then:
            - when "Client Age Less Than 12 Months" then recommend activity "Indicate".
            - when "Last Live Vaccine Administered has had in 4 Weeks" then use decision "Elderly Based".
        - end when
        - when "Client Is Due For MCV12" then recommend activity "Vaccinate".
    - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure without duplicates
    expect(decision.body.statements).toHaveLength(1);

    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2); // Should only have 2 when blocks

    const nestedWhenBlock = firstBlockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2); // Should only have 2 when blocks
  });

  it("should not duplicate action statements in block bodies", () => {
    const input = `# Test
decision "Elderly Based":
    - when "Client Age Less Than 60" then:
        - recommend activity "Vaccinate".
        - recommend activity "another thing".
        - recommend activity "something else".
    - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(3); // Should only have 3 unique actions
  });

  it("should not duplicate nested when blocks with the same concept name", () => {
    const input = `# Test
decision "Elderly Based":
    - when "Client Age Greater Than 60" then:
        - when "Most Recent BMI" then:
            - use decision "Some Other Decision".
            - use decision "Some Other Other Decision".
        - end when
    - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(1); // Should only have 1 when block

    const nestedWhenBlock = blockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2); // Should only have 2 unique actions
  });

  it("should handle complex nested decisions without duplication", () => {
    const input = `# Test
decision "IMMZ.D2.D5.Measles":
    - when "Measles Routine Immunization Schedule Incomplete" then:
        any:
        - when "No Primary Series Doses Administered" then:
            - when "Client Age Less Than 12 Months" then recommend activity "Indicate".
            - when "Last Live Vaccine Administered has had in 4 Weeks" then use decision "Elderly Based".
        - end when
        - when "Client Is Due For MCV12" then recommend activity "Vaccinate".
    - end when
    - when "One Primary Series Dose Administered" then:
        all:
        - when "Client Age Less Than 15 Months" then recommend activity "Indicate".
        - when "Last Live Vaccine Administered has had in 4 Weeks" then use decision "Elderly Based".
        - when "Client Is Due For MCV12" then recommend activity "Vaccinate".
    - end when
    - when "Two Primary Series Doses Administered" then recommend activity "Indicate".`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure without duplicates
    expect(decision.body.statements).toHaveLength(3);

    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2);

    const secondWhenBlock = decision.body.statements[1] as WhenBlock;
    const secondBlockBody = secondWhenBlock.body as BlockBody;
    expect(secondBlockBody.statements).toHaveLength(3);

    const thirdWhenBlock = decision.body.statements[2] as WhenBlock;
    expect(thirdWhenBlock.body.type).toBe("ActionStatement");
  });
});

describe("Repeated Statements in Decision Blocks", () => {
  it("should preserve repeated when statements", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age Greater Than 18" then recommend activity "Standard Care".
    - when "Age Greater Than 18" then recommend activity "Monitor Vital Signs".`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    expect(decision.body.statements).toHaveLength(2);
    const whenBlock1 = decision.body.statements[0] as WhenBlock;
    const whenBlock2 = decision.body.statements[1] as WhenBlock;
    expect(whenBlock1.conceptName).toBe("Age Greater Than 18");
    expect(whenBlock2.conceptName).toBe("Age Greater Than 18");
  });

  it("should preserve repeated use statements", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then:
        - use decision "Protocol1".
        - use decision "Protocol2".
    - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(2);

    const useAction1 = blockBody.statements[0] as ActionStatement;
    const useAction2 = blockBody.statements[1] as ActionStatement;

    expect(useAction1.type).toBe("ActionStatement");
    expect(useAction2.type).toBe("ActionStatement");

    expect(useAction1.action.type).toBe("UseDecision");
    expect(useAction2.action.type).toBe("UseDecision");

    expect((useAction1.action as UseDecision).decisionName).toBe("Protocol1");
    expect((useAction2.action as UseDecision).decisionName).toBe("Protocol2");
  });

  it("should preserve repeated do statements", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then:
        - recommend activity "Action1".
        - recommend activity "Action2".
    - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(2);

    const doAction1 = blockBody.statements[0] as ActionStatement;
    const doAction2 = blockBody.statements[1] as ActionStatement;

    expect(doAction1.type).toBe("ActionStatement");
    expect(doAction2.type).toBe("ActionStatement");

    expect(doAction1.action.type).toBe("RecommendActivity");
    expect(doAction2.action.type).toBe("RecommendActivity");

    expect((doAction1.action as RecommendActivity).activityName).toBe("Action1");
    expect((doAction2.action as RecommendActivity).activityName).toBe("Action2");
  });

  it("should preserve mixed repeated statements", () => {
    const input = `# Test
decision "Test Decision":
    - when "Age" then:
        - recommend activity "Action1".
        - use decision "Protocol1".
        - recommend activity "Action2".
        - use decision "Protocol2".
    - end when`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;

    // Verify statements
    expect(blockBody.statements).toHaveLength(4);

    const doAction1 = blockBody.statements[0] as ActionStatement;
    const useAction1 = blockBody.statements[1] as ActionStatement;
    const doAction2 = blockBody.statements[2] as ActionStatement;
    const useAction2 = blockBody.statements[3] as ActionStatement;

    expect(doAction1.type).toBe("ActionStatement");
    expect(useAction1.type).toBe("ActionStatement");
    expect(doAction2.type).toBe("ActionStatement");
    expect(useAction2.type).toBe("ActionStatement");

    expect(doAction1.action.type).toBe("RecommendActivity");
    expect(useAction1.action.type).toBe("UseDecision");
    expect(doAction2.action.type).toBe("RecommendActivity");
    expect(useAction2.action.type).toBe("UseDecision");

    expect((doAction1.action as RecommendActivity).activityName).toBe("Action1");
    expect((useAction1.action as UseDecision).decisionName).toBe("Protocol1");
    expect((doAction2.action as RecommendActivity).activityName).toBe("Action2");
    expect((useAction2.action as UseDecision).decisionName).toBe("Protocol2");
  });
});
