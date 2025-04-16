import { CPGL } from '../../ast/types';
import { Validator } from '../validator';

describe('CycleDetector Extended Tests', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  // 1. Multiple independent cycles in one cpgl:
  describe('Multiple Independent Decision Cycles', () => {
    it('should detect two separate decision cycles', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          // Cycle 1: DecisionX <-> DecisionY
          {
            type: 'Decision',
            name: 'DecisionX',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'Concept1',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionY',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                    ],
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
            type: 'Decision',
            name: 'DecisionY',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'Concept1',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionX',
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
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          // Cycle 2: DecisionM <-> DecisionN
          {
            type: 'Decision',
            name: 'DecisionM',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'Concept2',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionN',
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
          {
            type: 'Decision',
            name: 'DecisionN',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'Concept2',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionM',
                          location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                        },
                        location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                      },
                    ],
                    location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                  },
                  location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                },
              ],
              location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
            },
            location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } },
      };

      const result = validator.validate(ast);
      // Expecting two cycle errors (one for each independent cycle)
      expect(result.isValid).toBe(false);
      const cycleErrors = result.errors.filter(e => e.message.includes('Cycle detected'));
      expect(cycleErrors.length).toBe(2);
    });
  });

  // 2. Self-loop cycle: A decision referencing itself
  describe('Self-loop Decision Cycle', () => {
    it('should detect a self-loop decision cycle', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Decision',
            name: 'DecisionSelf',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'SelfConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionSelf',
                          location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
                        },
                        location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
                      },
                    ],
                    location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
                  },
                  location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
                },
              ],
              location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
            },
            location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
          },
        ],
        location: { start: { line: 5, column: 1 }, end: { line: 5, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Cycle detected in decision references');
    });
  });

  // 3. Complex indirect cycle: A -> B -> C -> D -> A
  describe('Complex Indirect Decision Cycle', () => {
    it('should detect a decision cycle with four nodes (A -> B -> C -> D -> A)', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Decision',
            name: 'DecisionA',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptX',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionB',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                    ],
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
            type: 'Decision',
            name: 'DecisionB',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptX',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionC',
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
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          {
            type: 'Decision',
            name: 'DecisionC',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptX',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionD',
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
          {
            type: 'Decision',
            name: 'DecisionD',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptX',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionA', // Completes the cycle
                          location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                        },
                        location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                      },
                    ],
                    location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                  },
                  location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                },
              ],
              location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
            },
            location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 4, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Cycle detected in decision references');
    });
  });

  // 4. Overlapping cycles (shared nodes)
  describe('Overlapping Decision Cycles', () => {
    it('should detect overlapping cycles sharing nodes', () => {
      // Two cycles:
      // Cycle 1: DecisionA -> DecisionB -> DecisionA
      // Cycle 2: DecisionB -> DecisionC -> DecisionD -> DecisionB
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          // Cycle 1
          {
            type: 'Decision',
            name: 'DecisionA',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptAlpha',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionB',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                    ],
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
            type: 'Decision',
            name: 'DecisionB',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptAlpha',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionA',
                          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                        },
                        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
                      },
                      // Additional action to initiate second cycle:
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionC',
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
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
            },
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
          },
          // Cycle 2: DecisionB -> DecisionC -> DecisionD -> DecisionB
          {
            type: 'Decision',
            name: 'DecisionC',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptBeta',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionD',
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
          {
            type: 'Decision',
            name: 'DecisionD',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'ConceptBeta',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionB', // Closes cycle B -> C -> D -> B
                          location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                        },
                        location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                      },
                    ],
                    location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                  },
                  location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
                },
              ],
              location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
            },
            location: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 4, column: 1 } },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      // Expecting cycle errors for at least the two cycles
      const cycleErrors = result.errors.filter(e => e.message.includes('Cycle detected'));
      expect(cycleErrors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 5. Mixed usage: cycle + repeated action in the same block.
  describe('Mixed Errors: Cycle and Repeated Action', () => {
    it('should detect both a cycle in decision references and a repeated do action', () => {
      const ast: CPGL = {
        type: 'CPGL',
        statements: [
          {
            type: 'Decision',
            name: 'DecisionMixed',
            body: {
              type: 'DecisionBody',
              statements: [
                {
                  type: 'WhenBlock',
                  conceptName: 'MixedConcept',
                  body: {
                    type: 'BlockBody',
                    statements: [
                      // This creates a self-cycle:
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'UseDecision',
                          decisionName: 'DecisionMixed',
                          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                        },
                        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
                      },
                      // First "do" action
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'DoActivity',
                          activityName: 'Vaccinate',
                          location: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } },
                        },
                        location: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } },
                      },
                      // Duplicate "do" action (repeated)
                      {
                        type: 'ActionStatement',
                        action: {
                          type: 'DoActivity',
                          activityName: 'Vaccinate',
                          location: { start: { line: 1, column: 3 }, end: { line: 1, column: 3 } },
                        },
                        location: { start: { line: 1, column: 3 }, end: { line: 1, column: 3 } },
                      },
                    ],
                    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
                  },
                  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
                },
              ],
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
            },
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
          },
        ],
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
      };

      const result = validator.validate(ast);
      // Expecting both cycle error and repeated action error
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Cycle detected'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('Repeated action'))).toBe(true);
    });
  });
});
