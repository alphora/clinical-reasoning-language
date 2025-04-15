import {
  ActivityType,
  BlockBodyType,
  DecisionType,
  DecisionBodyType,
  File,
  FileType,
  ActionStatementType,
  WhenBlockType,
} from '../../ast/types';
import { UnusedDeclarationsValidator } from '../unusedDeclarationsValidator';
describe('UnusedDeclarationsValidator', () => {
  let validator: UnusedDeclarationsValidator;

  beforeEach(() => {
    validator = new UnusedDeclarationsValidator();
  });

  describe('unused decisions', () => {
    it('should detect unused decisions', () => {
      const ast: File = {
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

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('Unused decision: unusedDecision');
    });

    it('should mark decisions as used when referenced in UseDecision', () => {
      const ast: File = {
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
                        type: WhenBlockType.type,
                        conceptName: 'someConcept',
                        body: {
                          type: BlockBodyType.type,
                          statements: [],
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

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused decision: usedDecision');
    });

    it('should mark decisions as used when referenced in nested UseDecision', () => {
      const ast: File = {
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
          {
            type: DecisionType.type,
            name: 'mainDecision',
            location: {
              start: { line: 4, column: 1 },
              end: { line: 4, column: 1 },
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
                          decisionName: 'middleDecision',
                          location: {
                            start: { line: 5, column: 1 },
                            end: { line: 5, column: 1 },
                          },
                        },
                        location: {
                          start: { line: 5, column: 1 },
                          end: { line: 5, column: 1 },
                        },
                      },
                    ],
                    location: {
                      start: { line: 5, column: 1 },
                      end: { line: 5, column: 1 },
                    },
                  },
                  location: {
                    start: { line: 4, column: 1 },
                    end: { line: 4, column: 1 },
                  },
                },
              ],
              location: {
                start: { line: 4, column: 1 },
                end: { line: 5, column: 1 },
              },
            },
          },
        ],
        location: {
          start: { line: 1, column: 1 },
          end: { line: 5, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused decision: nestedDecision');
    });
  });

  describe('unused concepts', () => {
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

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('Unused concept: unusedConcept');
    });

    it('should mark concepts as used when referenced in WhenBlock', () => {
      const ast: File = {
        type: FileType.type,
        statements: [
          {
            type: DecisionType.type,
            name: 'decision',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
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
            },
          },
          {
            type: 'Concept',
            name: 'usedConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
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
          start: { line: 1, column: 1 },
          end: { line: 3, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused concept: usedConcept');
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
              type: 'InferredByDefinition',
              concept: 'usedConcept',
              location: {
                start: { line: 2, column: 1 },
                end: { line: 2, column: 1 },
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
          end: { line: 2, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused concept: usedConcept');
    });

    it('should mark concepts as used in nested WhenBlocks', () => {
      const ast: File = {
        type: FileType.type,
        statements: [
          {
            type: DecisionType.type,
            name: 'decision',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
            body: {
              type: DecisionBodyType.type,
              statements: [
                {
                  type: WhenBlockType.type,
                  conceptName: 'outerConcept',
                  body: {
                    type: BlockBodyType.type,
                    statements: [
                      {
                        type: WhenBlockType.type,
                        conceptName: 'innerConcept',
                        body: {
                          type: BlockBodyType.type,
                          statements: [],
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
                      start: { line: 2, column: 1 },
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
                start: { line: 1, column: 1 },
                end: { line: 3, column: 1 },
              },
            },
          },
          {
            type: 'Concept',
            name: 'outerConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
              location: {
                start: { line: 4, column: 1 },
                end: { line: 4, column: 1 },
              },
            },
            location: {
              start: { line: 4, column: 1 },
              end: { line: 4, column: 1 },
            },
          },
          {
            type: 'Concept',
            name: 'innerConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
              location: {
                start: { line: 5, column: 1 },
                end: { line: 5, column: 1 },
              },
            },
            location: {
              start: { line: 5, column: 1 },
              end: { line: 5, column: 1 },
            },
          },
        ],
        location: {
          start: { line: 1, column: 1 },
          end: { line: 5, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused concept: outerConcept');
      expect(result.warnings).not.toContain('Unused concept: innerConcept');
    });
  });

  describe('unused activities', () => {
    it('should detect unused activities', () => {
      const ast: File = {
        type: FileType.type,
        statements: [
          {
            type: ActivityType.type,
            name: 'unusedActivity',
            activityType: 'CPGImmunization',
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

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('Unused activity: unusedActivity');
    });

    it('should mark activities as used when referenced in DoActivity', () => {
      const ast: File = {
        type: FileType.type,
        statements: [
          {
            type: DecisionType.type,
            name: 'decision',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
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
                      start: { line: 2, column: 1 },
                      end: { line: 2, column: 1 },
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
                end: { line: 2, column: 1 },
              },
            },
          },
          {
            type: ActivityType.type,
            name: 'usedActivity',
            activityType: 'CPGImmunization',
            location: {
              start: { line: 3, column: 1 },
              end: { line: 3, column: 1 },
            },
          },
        ],
        location: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused activity: usedActivity');
    });
  });

  describe('unused terminology', () => {
    it('should detect unused terminology', () => {
      const ast: File = {
        type: FileType.type,
        statements: [
          {
            type: 'Terminology',
            name: 'unusedTerminology',
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'some-valueset',
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

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('Unused terminology: unusedTerminology');
    });

    it('should mark terminology as used when referenced in activity', () => {
      const ast: File = {
        type: FileType.type,
        statements: [
          {
            type: ActivityType.type,
            name: 'activity',
            activityType: 'CPGImmunization',
            terminologyReference: 'usedTerminology',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
          {
            type: 'Terminology',
            name: 'usedTerminology',
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'some-valueset',
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

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.warnings).not.toContain('Unused terminology: usedTerminology');
    });
  });

  describe('multiple unused declarations', () => {
    it('should detect multiple unused declarations of different types', () => {
      const ast: File = {
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
          {
            type: 'Concept',
            name: 'unusedConcept',
            conceptType: 'Observation',
            valueType: 'boolean',
            definition: {
              type: 'CodedByDefinition',
              terminologyName: 'SomeTerminology',
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
          {
            type: ActivityType.type,
            name: 'unusedActivity',
            activityType: 'CPGImmunization',
            location: {
              start: { line: 3, column: 1 },
              end: { line: 3, column: 1 },
            },
          },
          {
            type: 'Terminology',
            name: 'unusedTerminology',
            definition: {
              type: 'TerminologyValueset',
              valuesetName: 'some-valueset',
              location: {
                start: { line: 4, column: 1 },
                end: { line: 4, column: 1 },
              },
            },
            location: {
              start: { line: 4, column: 1 },
              end: { line: 4, column: 1 },
            },
          },
        ],
        location: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('Unused decision: unusedDecision');
      expect(result.warnings).toContain('Unused concept: unusedConcept');
      expect(result.warnings).toContain('Unused activity: unusedActivity');
      expect(result.warnings).toContain('Unused terminology: unusedTerminology');
    });
  });
});
