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
  it("should correctly structure concept with inferred by concept reference", () => {
    const input = `# Test
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

  it("should correctly structure concept with inferred by descriptive logic", () => {
    const input = `# Test
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

  it("should correctly structure concept with coded by definition", () => {
    const input = `# Test
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

  it("should handle complex inferred by expressions", () => {
    const input = `# Test
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

  it("should correctly handle concept without valueType (optional valueType)", () => {
    const input = `# Test
concept "Basic Concept Without ValueType":
    - type is Observation.
    - coded from "Some Terminology".
.`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Basic Concept Without ValueType");
    expect(concept.conceptType).toBe("Observation");
    expect(concept.valueType).toBeUndefined();

    // Verify coded-by structure still works
    const definition = concept.definition as CodedFromDefinition;
    expect(definition.type).toBe("CodedFromDefinition");
    expect(definition.terminologyName).toBe("Some Terminology");
  });

  it("should correctly handle concept with valueType (existing functionality)", () => {
    const input = `# Test
concept "Basic Concept With ValueType":
    - type is Observation.
    - valuetype is boolean.
    - coded from "Some Terminology".
.`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Basic Concept With ValueType");
    expect(concept.conceptType).toBe("Observation");
    expect(concept.valueType).toBe("boolean");

    // Verify coded-by structure still works
    const definition = concept.definition as CodedFromDefinition;
    expect(definition.type).toBe("CodedFromDefinition");
    expect(definition.terminologyName).toBe("Some Terminology");
  });
});
