import { File } from '../../ast/types';
import { Validator } from '../validator';

describe('UnusedDeclarationsValidator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Unused Decisions', () => {
    it('should detect unused decisions', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'UsedDecision',
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'UnusedDecision', // Never referenced
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'ReferringDecision',
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
                          decisionName: 'UsedDecision',
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
      expect(result.isValid).toBe(true); // Unused declarations are warnings, not errors
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Unused decision: UnusedDecision');
    });
  });

  describe('Unused Concepts', () => {
    it('should detect unused concepts', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Concept',
            name: 'UsedConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'UnusedConcept', // Never referenced
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'SomeDecision',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'UsedConcept', // References the first concept
                  body: {
                    type: 'BlockBody',
                    statements: [],
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
      expect(result.isValid).toBe(true); // Unused declarations are warnings, not errors
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Unused concept: UnusedConcept');
    });
  });

  describe('Unused Activities', () => {
    it('should detect unused activities', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Activity',
            name: 'UsedActivity',
            activityType: 'CPGImmunization',
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Activity',
            name: 'UnusedActivity', // Never referenced
            activityType: 'CPGImmunization',
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'SomeDecision',
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
                          activityName: 'UsedActivity', // References the first activity
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
      expect(result.isValid).toBe(true); // Unused declarations are warnings, not errors
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Unused activity: UnusedActivity');
    });
  });

  describe('Unused Terminologies', () => {
    it('should detect unused terminologies', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Terminology',
            name: 'UsedTerminology',
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'some-valueset',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Terminology',
            name: 'UnusedTerminology', // Never referenced
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'another-valueset',
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'SomeConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'UsedTerminology', // References the first terminology
              location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
            },
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true); // Unused declarations are warnings, not errors
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Unused terminology: UnusedTerminology');
    });
  });

  describe('Multiple Unused Declarations', () => {
    it('should detect all unused declarations', () => {
      const ast: File = {
        type: 'File',
        statements: [
          {
            type: 'Decision',
            name: 'UnusedDecision',
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'UnusedConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'UsedTerminology',
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Activity',
            name: 'UnusedActivity',
            activityType: 'CPGImmunization',
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
          {
            type: 'Terminology',
            name: 'UnusedTerminology',
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
      expect(result.isValid).toBe(true); // Unused declarations are warnings, not errors
      expect(result.warnings).toHaveLength(4);
      expect(result.warnings.map(w => w.message)).toEqual([
        'Unused decision: UnusedDecision',
        'Unused concept: UnusedConcept',
        'Unused activity: UnusedActivity',
        'Unused terminology: UnusedTerminology',
      ]);
    });
  });
});
