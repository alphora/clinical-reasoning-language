import { CPGL } from '../../ast/types';
import { Validator } from '../validator';

describe('NameUniquenessValidator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Decision Name Uniqueness', () => {
    it('should detect duplicate decision names', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Decision',
            name: 'MyDecision',
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'MyDecision', // Duplicate name
            body: {
              type: 'DecisionBody',
              statements: [],
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
      expect(result.errors[0].message).toContain('Duplicate decision name: MyDecision');
    });

    it('should allow different decision names', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Decision',
            name: 'FirstDecision',
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'SecondDecision',
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Concept Name Uniqueness', () => {
    it('should detect duplicate concept names', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Concept',
            name: 'MyConcept',
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
            name: 'MyConcept', // Duplicate name
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
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
      expect(result.errors[0].message).toContain('Duplicate concept name: MyConcept');
    });
  });

  describe('Terminology Name Uniqueness', () => {
    it('should detect duplicate terminology names', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Terminology',
            name: 'MyTerminology',
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'some-valueset',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Terminology',
            name: 'MyTerminology', // Duplicate name
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'another-valueset',
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
      expect(result.errors[0].message).toContain('Duplicate terminology name: MyTerminology');
    });
  });

  describe('Activity Name Uniqueness', () => {
    it('should detect duplicate activity names', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Activity',
            name: 'MyActivity',
            activityType: 'CPGImmunization',
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Activity',
            name: 'MyActivity', // Duplicate name
            activityType: 'CPGImmunization',
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Duplicate activity name: MyActivity');
    });
  });

  describe('Cross-Category Name Uniqueness', () => {
    it('should allow same name across different categories', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Decision',
            name: 'CommonName',
            body: {
              type: 'DecisionBody',
              statements: [],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            type: 'Concept',
            name: 'CommonName',
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
            type: 'Activity',
            name: 'CommonName',
            activityType: 'CPGImmunization',
            location: { start: { line: 3, column: 1 }, end: { line: 3, column: 1 } },
          },
          {
            type: 'Terminology',
            name: 'CommonName',
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
    });
  });
});
