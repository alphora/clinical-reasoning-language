import { Decision, WhenBlock, ActionStatement } from '../types';

import { parseInput } from './index.test';

describe('Duplication Detection', () => {
  it('should detect duplicate when blocks in nested decisions', () => {
    const input = `
decision "IMMZ.D2.D5.Measles"
  when"Measles Routine Immunization Schedule Incomplete"then:
    any:
      when"No Primary Series Doses Administered"then:
        when"Client Age Less Than 12 Months"thendo"Indicate".
        when"Last Live Vaccine Administered has had in 4 Weeks"thenuse"Elderly Based".
        when"Client Age Less Than 12 Months"thendo"Indicate".
        when"Last Live Vaccine Administered has had in 4 Weeks"thenuse"Elderly Based".
      done
      when"Client Is Due For MCV12"thendo"Vaccinate".
      when"No Primary Series Doses Administered"then:
        when"Client Age Less Than 12 Months"thendo"Indicate".
        when"Last Live Vaccine Administered has had in 4 Weeks"thenuse"Elderly Based".
        when"Client Age Less Than 12 Months"thendo"Indicate".
        when"Last Live Vaccine Administered has had in 4 Weeks"thenuse"Elderly Based".
      done
      when"Client Is Due For MCV12"thendo"Vaccinate".
    done
  done
done
`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Check for duplicate when blocks at the top level
    const topLevelWhenBlocks = decision.body.statements;
    const topLevelConcepts = new Set<string>();
    topLevelWhenBlocks.forEach(block => {
      expect(topLevelConcepts.has(block.conceptName)).toBe(false);
      topLevelConcepts.add(block.conceptName);
    });

    // Check for duplicate when blocks in nested blocks
    const checkNestedWhenBlocks = (blocks: typeof topLevelWhenBlocks): void => {
      blocks.forEach(block => {
        if (block.body.type === 'BlockBody') {
          const nestedConcepts = new Set<string>();
          block.body.statements.forEach(nestedBlock => {
            if (nestedBlock.type === 'WhenBlock') {
              expect(nestedConcepts.has(nestedBlock.conceptName)).toBe(false);
              nestedConcepts.add(nestedBlock.conceptName);
            }
          });
        }
      });
    };

    checkNestedWhenBlocks(topLevelWhenBlocks);
  });

  it('should detect duplicate action statements in block bodies', () => {
    const input = `
decision "Elderly Based"
  when"Client Age Less Than 60"then:
    do"Vaccinate".
    do"another thing".
    do"something else".
    do"Vaccinate".
    do"another thing".
    do"something else".
  done
done
`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0];

    if (whenBlock.body.type === 'BlockBody') {
      const actions = new Set<string>();
      whenBlock.body.statements.forEach(statement => {
        if (statement.type === 'ActionStatement') {
          const actionKey =
            statement.action.type === 'DoActivity'
              ? `do:${statement.action.activityName}`
              : `use:${statement.action.decisionName}`;
          expect(actions.has(actionKey)).toBe(false);
          actions.add(actionKey);
        }
      });
    }
  });

  it('should detect duplicate when blocks with the same concept name in different contexts', () => {
    const input = `
decision "IMMZ.D2.D5.Measles"
  when"One Primary Series Dose Administered"then:
    all:
      when"Client Age Less Than 15 Months"thendo"Indicate".
      when"Last Live Vaccine Administered has had in 4 Weeks"thenuse"Elderly Based".
      when"Client Is Due For MCV12"thendo"Vaccinate".
      when"Client Age Less Than 15 Months"thendo"Indicate".
      when"Last Live Vaccine Administered has had in 4 Weeks"thenuse"Elderly Based".
      when"Client Is Due For MCV12"thendo"Vaccinate".
    done
  done
done
`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0];

    if (whenBlock.body.type === 'BlockBody') {
      const concepts = new Set<string>();
      whenBlock.body.statements.forEach(statement => {
        if (statement.type === 'WhenBlock') {
          expect(concepts.has(statement.conceptName)).toBe(false);
          concepts.add(statement.conceptName);
        }
      });
    }
  });

  it('should detect duplicate when blocks and actions in complex nested decisions', () => {
    const input = `
decision "Elderly Based"
  when"Client Age Greater Than 60"thendo"Indicate".
  when"Client Age Less Than 60"then:
    do"Vaccinate".
    do"another thing".
    do"something else".
    do"Vaccinate".
    do"another thing".
    do"something else".
  done
  when"Client Age Greater Than 60"then:
    when"Most Recent BMI"then:
      use"Some Other Decision".
      use"Some Other Other Decision".
      use"Some Other Decision".
      use"Some Other Other Decision".
    done
    when"Most Recent BMI"then:
      use"Some Other Decision".
      use"Some Other Other Decision".
      use"Some Other Decision".
      use"Some Other Other Decision".
    done
  done
done
`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Check for duplicate top-level when blocks
    const topLevelConcepts = new Set<string>();
    decision.body.statements.forEach(block => {
      expect(topLevelConcepts.has(block.conceptName)).toBe(false);
      topLevelConcepts.add(block.conceptName);
    });

    // Check for duplicate nested when blocks and actions
    const checkNestedBlocks = (blocks: (WhenBlock | ActionStatement)[]): void => {
      blocks.forEach(block => {
        if (block.type === 'WhenBlock' && block.body.type === 'BlockBody') {
          const nestedConcepts = new Set<string>();
          const actions = new Set<string>();

          block.body.statements.forEach(statement => {
            if (statement.type === 'WhenBlock') {
              expect(nestedConcepts.has(statement.conceptName)).toBe(false);
              nestedConcepts.add(statement.conceptName);

              // Recursively check nested blocks
              if (statement.body.type === 'BlockBody') {
                checkNestedBlocks(statement.body.statements);
              }
            } else if (statement.type === 'ActionStatement') {
              const actionKey =
                statement.action.type === 'DoActivity'
                  ? `do:${statement.action.activityName}`
                  : `use:${statement.action.decisionName}`;
              expect(actions.has(actionKey)).toBe(false);
              actions.add(actionKey);
            }
          });
        }
      });
    };

    checkNestedBlocks(decision.body.statements);
  });
});
