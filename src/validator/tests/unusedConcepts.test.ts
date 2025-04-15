import {
  BlockBodyType,
  DecisionType,
  DecisionBodyType,
  File,
  FileType,
  WhenBlockType,
} from '../../ast/types';
import { UnusedDeclarationsValidator } from '../unusedDeclarationsValidator';
import { ValidationError } from '../validator';

describe('UnusedDeclarationsValidator - Concepts', () => {
  let validator: UnusedDeclarationsValidator;

  beforeEach(() => {
    validator = new UnusedDeclarationsValidator();
  });

  it('should detect unused concepts', () => {
    const ast: File = {
      type: FileType.type,
      statements: [
        {
          type: 'Concept',
          name: 'unusedConcept',
          conceptType: 'Observation',
          valueType: 'boolean',
          definition: {
            type: 'CodedByDefinition',
            terminologyName: 'SomeTerminology',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
        },
      ],
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
    };

    const result: ValidationError[] = validator.validate(ast);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].message).toContain('Unused concept: unusedConcept');
  });

  it('should mark concepts as used when referenced in WhenBlock', () => {
    const ast: File = {
      type: FileType.type,
      statements: [
        {
          type: 'Concept',
          name: 'usedConcept',
          conceptType: 'Observation',
          valueType: 'boolean',
          definition: {
            type: 'CodedByDefinition',
            terminologyName: 'SomeTerminology',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
        },
        {
          type: DecisionType.type,
          name: 'someDecision',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 1 },
          },
          body: {
            type: DecisionBodyType.type,
            statements: [
              {
                type: WhenBlockType.type,
                conceptName: 'usedConcept',
                body: {
                  type: BlockBodyType.type,
                  statements: [],
                  location: {
                    start: { line: 3, column: 1 },
                    end: { line: 3, column: 1 },
                  },
                },
                location: {
                  start: { line: 2, column: 1 },
                  end: { line: 2, column: 1 },
                },
              },
            ],
            location: {
              start: { line: 2, column: 1 },
              end: { line: 3, column: 1 },
            },
          },
        },
      ],
      location: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 1 },
      },
    };

    const result: ValidationError[] = validator.validate(ast);
    expect(result.length).toBe(0);
  });

  it('should mark concepts as used when referenced in inferredBy', () => {
    const ast: File = {
      type: FileType.type,
      statements: [
        {
          type: 'Concept',
          name: 'usedConcept',
          conceptType: 'Observation',
          valueType: 'boolean',
          definition: {
            type: 'CodedByDefinition',
            terminologyName: 'SomeTerminology',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
        },
        {
          type: 'Concept',
          name: 'inferredConcept',
          conceptType: 'Observation',
          valueType: 'boolean',
          definition: {
            type: 'InferredByDefinition',
            concept: 'usedConcept',
            location: {
              start: { line: 2, column: 1 },
              end: { line: 2, column: 1 },
            },
          },
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 1 },
          },
        },
      ],
      location: {
        start: { line: 1, column: 1 },
        end: { line: 2, column: 1 },
      },
    };

    const result: ValidationError[] = validator.validate(ast);
    expect(result.length).toBe(0);
  });
}); 