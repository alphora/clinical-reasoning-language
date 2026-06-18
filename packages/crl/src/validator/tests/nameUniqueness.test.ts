import { CRL } from "../../ast/types";

import { Validator } from "../validator";

import { makeTestCRL } from "./testUtils";

const L = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

describe("NameUniquenessValidator", () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe("Decision Name Uniqueness", () => {
    it("should detect duplicate decision names", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Decision",
            name: "MyDecision",
            body: { type: "DecisionBody", statements: [], location: L },
            location: L,
          },
          {
            type: "Decision",
            name: "MyDecision",
            body: { type: "DecisionBody", statements: [], location: L },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].kind).toBe("duplicate-name");
      expect(result.errors[0].message).toContain("Duplicate decision name: MyDecision");
    });

    it("should allow different decision names", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Decision",
            name: "FirstDecision",
            body: { type: "DecisionBody", statements: [], location: L },
            location: L,
          },
          {
            type: "Decision",
            name: "SecondDecision",
            body: { type: "DecisionBody", statements: [], location: L },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Concept Name Uniqueness", () => {
    it("should detect duplicate concept names", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Concept",
            name: "MyConcept",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "CodedFromDefinition",
              terminologyName: "SomeTerminology",
              location: L,
            },
            location: L,
          },
          {
            type: "Concept",
            name: "MyConcept",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "CodedFromDefinition",
              terminologyName: "SomeTerminology",
              location: L,
            },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      const dupes = result.errors.filter((e) => e.kind === "duplicate-name");
      expect(dupes).toHaveLength(1);
      expect(dupes[0].message).toContain("Duplicate concept name: MyConcept");
    });
  });

  describe("Terminology Name Uniqueness", () => {
    it("should detect duplicate terminology names", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Terminology",
            name: "MyTerminology",
            body: [
              { type: "TerminologyValueset", valuesetName: "some-valueset", location: L },
            ],
            location: L,
          },
          {
            type: "Terminology",
            name: "MyTerminology",
            body: [
              { type: "TerminologyValueset", valuesetName: "another-valueset", location: L },
            ],
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].kind).toBe("duplicate-name");
      expect(result.errors[0].message).toContain("Duplicate terminology name: MyTerminology");
    });
  });

  describe("Activity Name Uniqueness", () => {
    it("should detect duplicate activity names", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Activity",
            name: "MyActivity",
            body: {
              type: "ActivityBody",
              request: { type: "ActivityRequest", activityType: "CPGImmunizationRequest", location: L },
              location: L,
            },
            location: L,
          },
          {
            type: "Activity",
            name: "MyActivity",
            body: {
              type: "ActivityBody",
              request: { type: "ActivityRequest", activityType: "CPGImmunizationRequest", location: L },
              location: L,
            },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].kind).toBe("duplicate-name");
      expect(result.errors[0].message).toContain("Duplicate activity name: MyActivity");
    });
  });

  describe("Cross-Category Name Uniqueness", () => {
    it("should allow same name across different categories", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Decision",
            name: "CommonName",
            body: { type: "DecisionBody", statements: [], location: L },
            location: L,
          },
          {
            type: "Concept",
            name: "CommonName",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "CodedFromDefinition",
              terminologyName: "SomeTerminology",
              location: L,
            },
            location: L,
          },
          {
            type: "Activity",
            name: "CommonName",
            body: {
              type: "ActivityBody",
              request: { type: "ActivityRequest", activityType: "CPGImmunizationRequest", location: L },
              location: L,
            },
            location: L,
          },
          {
            type: "Terminology",
            name: "CommonName",
            body: [
              { type: "TerminologyValueset", valuesetName: "some-valueset", location: L },
            ],
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      // Cross-kind same-name is fine for declarations; the only ref in
      // the AST is the concept's `coded from "SomeTerminology"` which
      // doesn't resolve in this fixture (no terminology with that name).
      // Filter to duplicate-name errors specifically.
      const dupes = result.errors.filter((e) => e.kind === "duplicate-name");
      expect(dupes).toHaveLength(0);
    });
  });
});
