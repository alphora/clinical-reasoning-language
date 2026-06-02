import { CRL } from '../../ast/types';
import { makeTestCRL } from './testUtils';
import { Validator } from '../validator';

describe('WhenBlockUniquenessValidator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('When Block Uniqueness', () => {
    it('should detect duplicate when blocks in nested decisions', () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: 'Decision',
            name: 'TestDecision',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ParentConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'WhenBlock',
                        conceptName: 'ChildConcept',
                        body: {
                          type: 'BlockBody',
                          statements: [],
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                      {
                        type: 'WhenBlock',
                        conceptName: 'ChildConcept', // Duplicate when block
                        body: {
                          type: 'BlockBody',
                          statements: [],
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
      expect(result.errors[0].message).toContain('Duplicate when block');
    });

    it('should not detect duplicate when blocks in different contexts', () => {
      const ast: CRL = {
        ...makeTestCRL([]),
        statements: [
          {
            type: 'Decision',
            name: 'TestDecision',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ParentConcept1',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'WhenBlock',
                        conceptName: 'ChildConcept',
                        body: {
                          type: 'BlockBody',
                          statements: [],
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
                  conceptName: 'ParentConcept2',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'WhenBlock',
                        conceptName: 'ChildConcept',
                        body: {
                          type: 'BlockBody',
                          statements: [],
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