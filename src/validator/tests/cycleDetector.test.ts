import { File } from '../../ast/types';
import { Validator } from '../validator';

describe('CycleDetector', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Decision Cycles', () => {
    it('should detect direct cycles in decision references', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'DecisionA',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'SomeConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionB',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                    ],
                    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                  },
                  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                },
              ],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'DecisionB',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'SomeConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionA', // Creates cycle
                          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                        },
                        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                      },
                    ],
                    location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                  },
                  location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                },
              ],
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Cycle detected in decision references');
    });

    it('should detect indirect cycles in decision references', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'DecisionA',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'SomeConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionB',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                    ],
                    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                  },
                  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                },
              ],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'DecisionB',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'SomeConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionC',
                          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                        },
                        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                      },
                    ],
                    location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                  },
                  location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                },
              ],
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'DecisionC',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'SomeConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionA', // Creates cycle A -> B -> C -> A
                          location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
                        },
                        location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
                      },
                    ],
                    location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
                  },
                  location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
                },
              ],
              location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
            },
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Cycle detected in decision references');
    });
  });

  describe('Concept Inference Cycles', () => {
    it('should detect direct cycles in concept inferences', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Concept',
            name: 'ConceptA',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptB',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'ConceptB',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptA', // Creates cycle
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Cycle detected in concept inferences');
    });

    it('should detect indirect cycles in concept inferences', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Concept',
            name: 'ConceptA',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptB',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'ConceptB',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptC',
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'ConceptC',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptA', // Creates cycle A -> B -> C -> A
              location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
            },
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Cycle detected in concept inferences');
    });

    it('should allow valid concept inference chains without cycles', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Concept',
            name: 'ConceptA',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptB',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'ConceptB',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'InferredByDefinition',
              concept: 'ConceptC',
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'ConceptC',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition', // Terminates the chain with a coded definition
              terminologyName: 'SomeTerminology',
              location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
            },
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
