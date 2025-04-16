import {
  ActivityType,
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

describe('UnusedDeclarationsValidator - Activities', () => {
  let validator: UnusedDeclarationsValidator;

  beforeEach(() => {
    validator = new UnusedDeclarationsValidator();
  });

  it('should detect unused activities', () => {
    const ast: CPGL = {
      type: FileType.type,
      statements: [
        {
          type: ActivityType.type,
          name: 'unusedActivity',
          perform: 'CPGImmunization',
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
    expect(result[0].message).toContain('Unused activity: unusedActivity');
  });

  it('should mark activities as used when referenced in DoActivity', () => {
    const ast: CPGL = {
      type: FileType.type,
      statements: [
        {
          type: ActivityType.type,
          name: 'usedActivity',
          perform: 'CPGImmunization',
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
                conceptName: 'someConcept',
                body: {
                  type: BlockBodyType.type,
                  statements: [
                    {
                      type: ActionStatementType.type,
                      action: {
                        type: 'DoActivity',
                        activityName: 'usedActivity',
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
