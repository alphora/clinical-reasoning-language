import { CRL } from "../../ast/types";

import { Validator } from "../validator";

import { makeTestCRL } from "./testUtils";

const L = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

/**
 * `CycleDetector` finds cycles in concept reference graphs (via `defined as`
 * composition refs and `definition is` narrative refs). It does NOT track
 * decision-reference cycles — that validator was never implemented and the
 * tests for it were removed in v2.1.0 commit 2b.
 */
describe("CycleDetector", () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe("Concept Inference Cycles", () => {
    it("should detect direct cycles in concept defined-as references", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Concept",
            name: "ConceptA",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: {
                type: "DefinedAsBareRef",
                ref: "ConceptB",
                location: L,
              },
              location: L,
            },
            location: L,
          },
          {
            type: "Concept",
            name: "ConceptB",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: {
                type: "DefinedAsBareRef",
                ref: "ConceptA",
                location: L,
              },
              location: L,
            },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      const cycle = result.errors.find((e) => e.kind === "reference-cycle");
      expect(cycle).toBeDefined();
      expect(cycle?.message).toContain("Reference cycle detected");
    });

    it("should detect indirect cycles in concept defined-as references", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Concept",
            name: "ConceptA",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: { type: "DefinedAsBareRef", ref: "ConceptB", location: L },
              location: L,
            },
            location: L,
          },
          {
            type: "Concept",
            name: "ConceptB",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: { type: "DefinedAsBareRef", ref: "ConceptC", location: L },
              location: L,
            },
            location: L,
          },
          {
            type: "Concept",
            name: "ConceptC",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: { type: "DefinedAsBareRef", ref: "ConceptA", location: L },
              location: L,
            },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      const cycle = result.errors.find((e) => e.kind === "reference-cycle");
      expect(cycle).toBeDefined();
    });

    it("should allow valid concept defined-as chains without cycles", () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: "Concept",
            name: "ConceptA",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: { type: "DefinedAsBareRef", ref: "ConceptB", location: L },
              location: L,
            },
            location: L,
          },
          {
            type: "Concept",
            name: "ConceptB",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: { type: "DefinedAsBareRef", ref: "ConceptC", location: L },
              location: L,
            },
            location: L,
          },
          {
            type: "Concept",
            name: "ConceptC",
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
            type: "Terminology",
            name: "SomeTerminology",
            body: [
              { type: "TerminologyValueset", valuesetName: "vs", location: L },
            ],
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "reference-cycle");
      expect(cycles).toHaveLength(0);
    });
  });
});
