import { File } from '../../ast/types';
import { Validator } from '../validator';

describe('ActionUniquenessValidator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Do Statement Uniqueness', () => {
    it('should detect duplicate do statements in the same block', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'TestDecision',
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
                          type: 'DoActivity',
                          activityName: 'Vaccinate',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'DoActivity',
                          activityName: 'Vaccinate', // Duplicate do statement
                          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                        },
                        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                      },
                    ],
                    location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
                  },
                  location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
                },
              ],
              location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Duplicate do statement: Vaccinate');
    });

    it('should allow same do statements in different blocks', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'TestDecision',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'FirstConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'DoActivity',
                          activityName: 'Vaccinate',
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
                  type: 'WhenBlock',
                  conceptName: 'SecondConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'DoActivity',
                          activityName: 'Vaccinate', // Same activity in different block
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
            },
            location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Use Statement Uniqueness', () => {
    it('should detect duplicate use statements in the same block', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'TestDecision',
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
                          decisionName: 'OtherDecision',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'OtherDecision', // Duplicate use statement
                          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                        },
                        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                      },
                    ],
                    location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
                  },
                  location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
                },
              ],
              location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Duplicate use statement: OtherDecision');
    });

    it('should allow same use statements in different blocks', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'TestDecision',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'FirstConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'OtherDecision',
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
                  type: 'WhenBlock',
                  conceptName: 'SecondConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'OtherDecision', // Same decision in different block
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
            },
            location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
