import {
  BlockBodyType,
  DecisionType,
  DecisionBodyType,
  CPGL,
  FileType,
  ActionStatementType,
  WhenBlockType,
} from '../../ast/types';
import { UnusedDeclarationsValidator } from '../unusedDeclarationsValidator';
import { ValidationError } from '../validator';

describe('UnusedDeclarationsValidator - Decisions', () => {
  let validator: UnusedDeclarationsValidator;

  beforeEach(() => {
    const ast: CPGL = {
      type: FileType.type,
      statements: [],
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
    };
    validator = new UnusedDeclarationsValidator(ast);
  });

  it('should detect unused decisions', () => {
    const ast: CPGL = {
      type: FileType.type,
      statements: [
        {
          type: DecisionType.type,
          name: 'unusedDecision',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
          body: {
            type: DecisionBodyType.type,
            statements: [],
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
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
    expect(result[0].message).toContain('Unused decision: unusedDecision');
  });

  it('should mark decisions as used when referenced in UseDecision', () => {
    const ast: CPGL = {
      type: FileType.type,
      statements: [
        {
          type: DecisionType.type,
          name: 'usedDecision',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
          body: {
            type: DecisionBodyType.type,
            statements: [],
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
        },
        {
          type: DecisionType.type,
          name: 'mainDecision',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 1 },
          },
          body: {
            type: DecisionBodyType.type,
            statements: [
              {
                type: WhenBlockType.type,
                conceptName: 'someConcept',
                body: {
                  type: BlockBodyType.type,
                  statements: [
                    {
                      type: ActionStatementType.type,
                      action: {
                        type: 'UseDecision',
                        decisionName: 'usedDecision',
                        location: {
                          start: { line: 3, column: 1 },
                          end: { line: 3, column: 1 },
                        },
                      },
                      location: {
                        start: { line: 3, column: 1 },
                        end: { line: 3, column: 1 },
                      },
                    },
                  ],
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

  it('should mark decisions as used when referenced in nested UseDecision', () => {
    const ast: CPGL = {
      type: FileType.type,
      statements: [
        {
          type: DecisionType.type,
          name: 'nestedDecision',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
          body: {
            type: DecisionBodyType.type,
            statements: [],
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
        },
        {
          type: DecisionType.type,
          name: 'middleDecision',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 1 },
          },
          body: {
            type: DecisionBodyType.type,
            statements: [
              {
                type: WhenBlockType.type,
                conceptName: 'someConcept',
                body: {
                  type: BlockBodyType.type,
                  statements: [
                    {
                      type: ActionStatementType.type,
                      action: {
                        type: 'UseDecision',
                        decisionName: 'nestedDecision',
                        location: {
                          start: { line: 3, column: 1 },
                          end: { line: 3, column: 1 },
                        },
                      },
                      location: {
                        start: { line: 3, column: 1 },
                        end: { line: 3, column: 1 },
                      },
                    },
                  ],
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
}); 