import { CRL, Statement } from "../../ast/types";

import { Validator } from "../validator";

import { makeTestCRL } from "./testUtils";

const L = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

/**
 * `CycleDetector` finds cycles in BOTH concept-reference and decision-
 * delegation graphs. T02 / #96 added the decision-delegation pass; the
 * validator emits `kind: "decision-delegation-cycle"` for that case
 * (distinct from concepts' `reference-cycle` and from the FHIR-emitter's
 * own `circular-decision-reference`).
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

    // T02 round-2 catch #5 (Claude): the existing flat-mode `addEdge` stripped
    // the qualifier for ALL qualified refs, so a foreign-qualified ref like
    // `defined as ("Other"."ConceptA")` with a local `ConceptA` would
    // phantom-self-loop. v3 fix: foreign-qualified refs in flat mode are
    // ignored (ReferenceResolver flags them separately).
    it("flat mode: foreign-qualified concept ref does NOT phantom-cycle local same-name target", () => {
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
                type: "DefinedAsComposition",
                expression: {
                  type: "CompositionRef",
                  ref: {
                    type: "QualifiedReference",
                    libraryName: "OtherLib",
                    name: "ConceptA",
                    location: L,
                  },
                  location: L,
                },
                location: L,
              },
              location: L,
            },
            location: L,
          },
        ],
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "reference-cycle");
      expect(cycles).toHaveLength(0);
    });
  });

  describe("Decision Delegation Cycles (T02 / #96)", () => {
    function decisionFixture(name: string, useDecisionName: string): Statement {
      return {
        type: "Decision",
        name,
        body: {
          type: "DecisionBody",
          statements: [
            {
              type: "WhenBlock",
              conceptName: "Gate",
              body: {
                type: "ActionStatement",
                action: {
                  type: "UseDecision",
                  decisionName: useDecisionName,
                  location: L,
                },
                location: L,
              },
              location: L,
            },
          ],
          location: L,
        },
        location: L,
      } as Statement;
    }

    it("self-loop: decision delegating to itself produces 1 decision-delegation-cycle error with pinned message", () => {
      const ast: CRL = {
        ...makeTestCRL([decisionFixture("D", "D")]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
      expect(cycles[0].message).toBe('Decision delegation cycle detected: "D" → "D"');
    });

    it("2-cycle A→B→A produces 1 error", () => {
      const ast: CRL = {
        ...makeTestCRL([decisionFixture("A", "B"), decisionFixture("B", "A")]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
      expect(cycles[0].message).toContain("Decision delegation cycle detected");
      expect(cycles[0].message).toContain('"A"');
      expect(cycles[0].message).toContain('"B"');
    });

    it("3-cycle A→B→C→A produces 1 error", () => {
      const ast: CRL = {
        ...makeTestCRL([
          decisionFixture("A", "B"),
          decisionFixture("B", "C"),
          decisionFixture("C", "A"),
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
    });

    it("acyclic chain A→B→C produces 0 errors", () => {
      const ast: CRL = {
        ...makeTestCRL([
          decisionFixture("A", "B"),
          decisionFixture("B", "C"),
          {
            type: "Decision",
            name: "C",
            body: { type: "DecisionBody", statements: [], location: L },
            location: L,
          } as Statement,
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(0);
    });

    it("decision with no `use decision` (only RecommendActivity) produces 0 cycle errors and does not crash", () => {
      const ast: CRL = {
        ...makeTestCRL([
          {
            type: "Decision",
            name: "D",
            body: {
              type: "DecisionBody",
              statements: [
                {
                  type: "WhenBlock",
                  conceptName: "Gate",
                  body: {
                    type: "ActionStatement",
                    action: {
                      type: "RecommendActivity",
                      activityName: "SomeActivity",
                      location: L,
                    },
                    location: L,
                  },
                  location: L,
                },
              ],
              location: L,
            },
            location: L,
          } as Statement,
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(0);
    });

    it("cycle hidden inside `any:` BlockBody is still detected", () => {
      const ast: CRL = {
        ...makeTestCRL([
          {
            type: "Decision",
            name: "A",
            body: {
              type: "DecisionBody",
              statements: [
                {
                  type: "WhenBlock",
                  conceptName: "Gate",
                  body: {
                    type: "BlockBody",
                    qualifier: "any",
                    statements: [
                      {
                        type: "WhenBlock",
                        conceptName: "Sub",
                        body: {
                          type: "ActionStatement",
                          action: { type: "UseDecision", decisionName: "B", location: L },
                          location: L,
                        },
                        location: L,
                      },
                    ],
                    location: L,
                  },
                  location: L,
                },
              ],
              location: L,
            },
            location: L,
          } as Statement,
          decisionFixture("B", "A"),
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
    });

    it("BlockBody.statements containing direct ActionStatement (not nested WhenBlock) with UseDecision is walked", () => {
      const ast: CRL = {
        ...makeTestCRL([
          {
            type: "Decision",
            name: "A",
            body: {
              type: "DecisionBody",
              statements: [
                {
                  type: "WhenBlock",
                  conceptName: "Gate",
                  body: {
                    type: "BlockBody",
                    qualifier: "all",
                    statements: [
                      {
                        type: "ActionStatement",
                        action: { type: "UseDecision", decisionName: "A", location: L },
                        location: L,
                      },
                    ],
                    location: L,
                  },
                  location: L,
                },
              ],
              location: L,
            },
            location: L,
          } as Statement,
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
    });

    it("disjoint cycles (A↔B AND C↔D) produce 2 distinct errors, no cross-dedupe", () => {
      const ast: CRL = {
        ...makeTestCRL([
          decisionFixture("A", "B"),
          decisionFixture("B", "A"),
          decisionFixture("C", "D"),
          decisionFixture("D", "C"),
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(2);
    });

    it("flat mode: foreign-qualified `use decision \"Other\".\"A\"` with local `decision \"A\"` does NOT phantom-cycle", () => {
      const ast: CRL = {
        ...makeTestCRL([
          {
            type: "Decision",
            name: "A",
            body: {
              type: "DecisionBody",
              statements: [
                {
                  type: "WhenBlock",
                  conceptName: "Gate",
                  body: {
                    type: "ActionStatement",
                    action: {
                      type: "UseDecision",
                      decisionName: {
                        type: "QualifiedReference",
                        libraryName: "Other",
                        name: "A",
                        location: L,
                      },
                      location: L,
                    },
                    location: L,
                  },
                  location: L,
                },
              ],
              location: L,
            },
            location: L,
          } as Statement,
        ]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(0);
    });

    it("flat mode: same-library qualified self-ref `\"Self\".\"A\"` IS a self-loop", () => {
      const ast: CRL = {
        ...makeTestCRL(
          [
            {
              type: "Decision",
              name: "A",
              body: {
                type: "DecisionBody",
                statements: [
                  {
                    type: "WhenBlock",
                    conceptName: "Gate",
                    body: {
                      type: "ActionStatement",
                      action: {
                        type: "UseDecision",
                        decisionName: {
                          type: "QualifiedReference",
                          libraryName: "Self",
                          name: "A",
                          location: L,
                        },
                        location: L,
                      },
                      location: L,
                    },
                    location: L,
                  },
                ],
                location: L,
              },
              location: L,
            } as Statement,
          ],
          "Self",
        ),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
    });

    it("decision name collides with concept name (Foo) — concept-cycle on Foo + decision-cycle on Foo produce 2 distinct kinds", () => {
      const ast: CRL = {
        ...makeTestCRL([
          {
            type: "Concept",
            name: "Foo",
            conceptType: "Observation",
            valueTypes: ["boolean"],
            definition: {
              type: "DefinedAsDefinition",
              body: { type: "DefinedAsBareRef", ref: "Foo", location: L },
              location: L,
            },
            location: L,
          },
          decisionFixture("Foo", "Foo"),
        ]),
      };

      const result = validator.validate(ast);
      const conceptCycles = result.errors.filter((e) => e.kind === "reference-cycle");
      const decisionCycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(conceptCycles).toHaveLength(1);
      expect(decisionCycles).toHaveLength(1);
    });

    it("unresolved `use decision \"DoesNotExist\"` does NOT produce a cycle error", () => {
      const ast: CRL = {
        ...makeTestCRL([decisionFixture("A", "DoesNotExist")]),
      };

      const result = validator.validate(ast);
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(0);
    });

    it("error location pins to the Decision declaration (deferred-edge-location behavior, locked here)", () => {
      const loc = { start: { line: 7, column: 3 }, end: { line: 7, column: 20 } };
      const ast: CRL = {
        ...makeTestCRL([
          {
            type: "Decision",
            name: "D",
            body: {
              type: "DecisionBody",
              statements: [
                {
                  type: "WhenBlock",
                  conceptName: "Gate",
                  body: {
                    type: "ActionStatement",
                    action: { type: "UseDecision", decisionName: "D", location: L },
                    location: L,
                  },
                  location: L,
                },
              ],
              location: L,
            },
            location: loc,
          } as Statement,
        ]),
      };

      const result = validator.validate(ast);
      const cycle = result.errors.find((e) => e.kind === "decision-delegation-cycle");
      expect(cycle?.location).toEqual(loc);
    });

    it("soft mode: decision cycles are NOT demoted to warnings (structural defect)", () => {
      const ast: CRL = {
        ...makeTestCRL([decisionFixture("D", "D")]),
      };

      const result = validator.validate(ast, { soft: true });
      const cycles = result.errors.filter((e) => e.kind === "decision-delegation-cycle");
      expect(cycles).toHaveLength(1);
      const warningCycles = result.warnings.filter((e) => e.kind === "decision-delegation-cycle");
      expect(warningCycles).toHaveLength(0);
    });
  });
});
