import { File } from '../../ast/types';
import { ActionUniquenessValidator } from '../actionUniquenessValidator';
import { ValidationError } from '../validator';

describe('ActionUniquenessValidator', () => {
  let validator: ActionUniquenessValidator;

  beforeEach(() => {
    validator = new ActionUniquenessValidator();
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

      const result: ValidationError[] = validator.validate(ast);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].message).toContain('Duplicate do statement');
    });

    it('should not detect duplicate do statements in different blocks', () => {
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
                    ],
                    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                  },
                  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                },
                {
                  type: 'WhenBlock',
                  conceptName: 'AnotherConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'DoActivity',
                          activityName: 'Vaccinate',
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

      const result: ValidationError[] = validator.validate(ast);
      expect(result).toHaveLength(0);
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
                          decisionName: 'SomeOtherDecision',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'SomeOtherDecision', // Duplicate use statement
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

      const result: ValidationError[] = validator.validate(ast);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].message).toContain('Duplicate use statement');
    });

    it('should not detect duplicate use statements in different blocks', () => {
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
                          decisionName: 'SomeOtherDecision',
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
                  conceptName: 'AnotherConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'SomeOtherDecision',
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

      const result: ValidationError[] = validator.validate(ast);
      expect(result).toHaveLength(0);
    });
  });
});
