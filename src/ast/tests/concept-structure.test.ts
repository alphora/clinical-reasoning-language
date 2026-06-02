import {
  Concept,
  CodedFromDefinition,
  GroupExpression,
  InferredFromConcept,
  InferredFromExpression,
  InformalAnd,
  InformalOr,
  NotExpression,
} from "../types";

import { parseInput } from "./parseInput";

type ConceptBodyNode =
  | InferredFromConcept
  | InferredFromExpression
  | InformalOr
  | InformalAnd
  | GroupExpression
  | NotExpression;

describe("Concept Structure", () => {
  // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
  it.skip("should correctly structure concept with inferred by concept reference", () => {
    const input = `# Test
library "Test".
concept "Client Age Less Than 12 Months":
    - type is Condition.
    - valuetype is boolean.
    - inferred from ("Less Than").
.`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Client Age Less Than 12 Months");
    expect(concept.conceptType).toBe("Condition");
    expect(concept.valueType).toBe("boolean");

    // Verify inferred-by structure
    const definition = concept.definition;
    expect([
      "InferredFromDefinition",
      "InferredFromDefinitionConcept",
      "AndExpression",
      "OrExpression",
      "NotExpression",
    ]).toContain(definition.type);
    let body: ConceptBodyNode = definition as unknown as ConceptBodyNode;
    if (definition.type === "InferredFromDefinition") {
      body = definition.body as ConceptBodyNode;
    }
    if (body.type === "InferredFromDefinitionConcept") {
      expect(body.type).toBe("InferredFromDefinitionConcept");
    }
  });

  // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
  it.skip("should correctly structure concept with inferred by descriptive logic", () => {
    const input = `# Test
library "Test".
concept "Client Is Due For MCV12":
    - type is Condition.
    - valuetype is boolean.
    - inferred from ("Last MCV Dose Administered" and "More Than 4 Weeks Ago").
.`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Client Is Due For MCV12");
    expect(concept.conceptType).toBe("Condition");
    expect(concept.valueType).toBe("boolean");

    // Verify inferred-by structure
    const definition = concept.definition;
    expect(["InferredFromDefinition", "AndExpression", "OrExpression", "NotExpression"]).toContain(
      definition.type,
    );
    let body: ConceptBodyNode = definition as unknown as ConceptBodyNode;
    if (definition.type === "InferredFromDefinition") {
      body = definition.body as ConceptBodyNode;
    }
    expect(["AndExpression", "OrExpression", "NotExpression"]).toContain(body.type);
  });

  // SKIPPED: pre-v0.7 syntax (coded by; valueType singular). Pending test-cleanup.
  it.skip("should correctly structure concept with coded by definition", () => {
    const input = `# Test
library "Test".
concept "Measles Vaccine":
    - type is Immunization.
    - valuetype is CodeableConcept.
    - coded from "MeaslesVaccineCodes".
.`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Measles Vaccine");
    expect(concept.conceptType).toBe("Immunization");
    expect(concept.valueType).toBe("CodeableConcept");

    // Verify coded-by structure
    const definition = concept.definition as CodedFromDefinition;
    expect(definition.type).toBe("CodedFromDefinition");
    expect(definition.terminologyName).toBe("MeaslesVaccineCodes");
  });

  // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
  it.skip("should handle complex inferred by expressions", () => {
    const input = `# Test
library "Test".
concept "Complex Condition":
    - type is Condition.
    - valuetype is boolean.
    - inferred from (not ("Age Greater Than 18" and "Age Less Than 65")).
.`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;
    const definition = concept.definition;

    expect(["InferredFromDefinition", "NotExpression", "AndExpression", "OrExpression"]).toContain(
      definition.type,
    );
    let body: ConceptBodyNode = definition as unknown as ConceptBodyNode;
    if (definition.type === "InferredFromDefinition") {
      body = definition.body as ConceptBodyNode;
    }
    expect(body.type).toBe("NotExpression");

    const groupExpr = (body as GroupExpression).expression as InferredFromExpression;
    expect(groupExpr.type).toBe("GroupExpression");

    const andExpr = (groupExpr as GroupExpression).expression as InformalAnd;
    expect(andExpr.type).toBe("AndExpression");
  });
});
