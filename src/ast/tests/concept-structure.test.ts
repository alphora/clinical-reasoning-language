import {
  Concept,
  InferredFromDefinition,
  InferredFromConcept,
  InferredFromExpression,
  CodedFromDefinition,
  GroupExpression,
  InformalAnd,
} from "../types";

import { parseInput } from "./parseInput";

describe("Concept Structure", () => {
  it("should correctly structure concept with inferred by concept reference", () => {
    const input = `
concept "Client Age Less Than 12 Months":
    type is Condition.
    valuetype is boolean.
    inferred from "Less Than" "Age 12 Months".
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Client Age Less Than 12 Months");
    expect(concept.conceptType).toBe("Condition");
    expect(concept.valueType).toBe("boolean");

    // Verify inferred-by structure
    const definition = concept.definition as InferredFromDefinition;
    expect(definition.type).toBe("InferredFromDefinition");

    const body = definition.body as InferredFromConcept;
    expect(body.type).toBe("InferredFromDefinitionConcept");
    expect(body.pattern).toBeUndefined();
    expect(body.concept).toBe("Less Than");
  });

  it("should correctly structure concept with inferred by descriptive logic", () => {
    const input = `
concept "Client Is Due For MCV12":
    type is Condition.
    valuetype is boolean.
    inferred from ("Last MCV Dose Administered" and "More Than 4 Weeks Ago").
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe("Concept");
    expect(concept.name).toBe("Client Is Due For MCV12");
    expect(concept.conceptType).toBe("Condition");
    expect(concept.valueType).toBe("boolean");

    // Verify inferred-by structure
    const definition = concept.definition as InferredFromDefinition;
    expect(definition.type).toBe("InferredFromDefinition");

    const body = definition.body as InferredFromExpression;
    expect(body.type).toBe("AndExpression");
  });

  it("should correctly structure concept with coded by definition", () => {
    const input = `
concept "Measles Vaccine":
    type is Immunization.
    valuetype is CodeableConcept.
    coded from "MeaslesVaccineCodes".
done`;

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
    const input = `
concept "Complex Condition":
    type is Condition.
    valuetype is boolean.
    inferred from (not ("Age Greater Than 18" and "Age Less Than 65")).
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;
    const definition = concept.definition as InferredFromDefinition;

    expect(definition.type).toBe("InferredFromDefinition");
    const body = definition.body as InferredFromExpression;
    expect(body.type).toBe("NotExpression");

    const groupExpr = (body as GroupExpression).expression as InferredFromExpression;
    expect(groupExpr.type).toBe("GroupExpression");

    const andExpr = (groupExpr as GroupExpression).expression as InformalAnd;
    expect(andExpr.type).toBe("AndExpression");
  });
});
