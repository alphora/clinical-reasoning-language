import { File } from '../../ast/types';
import { Validator } from '../validator';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Basic Validation', () => {
    it('should validate an empty AST', () => {
      const ast: File = {
        type: 'File',
        statements: [],
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate a simple valid AST', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'MyDecision',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'MyConcept',
                  body: {
                    type: 'SingleAction',
                    action: {
                      type: 'DoActivity',
                      activityName: 'MyActivity',
                      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                    },
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
            type: 'Concept',
            name: 'MyConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'MyTerminology',
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Activity',
            name: 'MyActivity',
            activityType: 'CPGImmunization',
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
          {
            type: 'Terminology',
            name: 'MyTerminology',
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'some-valueset',
              location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
            },
            location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 4, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // TODO: Add more test categories as we implement validation rules
  // - Name Uniqueness
  // - Type Checking
  // - Cross-References
  // - Semantic Rules
});
