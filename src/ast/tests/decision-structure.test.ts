import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { 
  CPGL, 
  Decision, 
  WhenBlock, 
  BlockBody, 
  ActionStatement, 
  ActionStatementType,
  WhenBlockType,
  BlockBodyType
} from '../types';

/**
 * This test suite verifies the correct structure of nested decisions in the AST.
 * It ensures that the AST builder correctly parses and structures nested decision blocks.
 * 
 * Note: For actual duplication checks, see the validator tests in:
 * - whenBlockUniqueness.test.ts
 * - actionUniqueness.test.ts
 * - nameUniqueness.test.ts
 */
describe('Decision Structure', () => {
  let builder: ASTBuilder;

  beforeEach(() => {
    builder = new ASTBuilder();
  });

  const parseInput = (input: string): CPGL => {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokens = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokens);
    const tree = parser.cpgl();
    return builder.visit(tree) as CPGL;
  };

  it('should maintain correct structure for nested decisions', () => {
    const input = `
decision "IMMZ.D2.D5.Measles":
    when "Measles Routine Immunization Schedule Incomplete" then:
        any:
        when "No Primary Series Doses Administered" then:
            when "Client Age Less Than 12 Months" then do "Indicate".
            when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
        done
        when "Client Is Due For MCV12" then do "Vaccinate".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure
    expect(decision.body.statements).toHaveLength(1);

    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2); // Should have 2 when blocks

    const nestedWhenBlock = firstBlockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2); // Should have 2 statements
  });

  it('should correctly structure nested decisions', () => {
    const input = `
decision "IMMZ.D2.D5.Measles":
    when "Measles Routine Immunization Schedule Incomplete" then:
        any:
        when "No Primary Series Doses Administered" then:
            when "Client Age Less Than 12 Months" then do "Indicate".
            when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
        done
        when "Client Is Due For MCV12" then do "Vaccinate".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure
    expect(decision.body.statements).toHaveLength(1);

    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2); // Should have 2 when blocks

    const nestedWhenBlock = firstBlockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2); // Should have 2 statements
  });

  it('should not duplicate when blocks in nested decisions', () => {
    const input = `
decision "IMMZ.D2.D5.Measles":
    when "Measles Routine Immunization Schedule Incomplete" then:
        any:
        when "No Primary Series Doses Administered" then:
            when "Client Age Less Than 12 Months" then do "Indicate".
            when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
        done
        when "Client Is Due For MCV12" then do "Vaccinate".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure without duplicates
    expect(decision.body.statements).toHaveLength(1);

    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2); // Should only have 2 when blocks

    const nestedWhenBlock = firstBlockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2); // Should only have 2 when blocks
  });

  it('should not duplicate action statements in block bodies', () => {
    const input = `
decision "Elderly Based":
    when "Client Age Less Than 60" then:
        do "Vaccinate".
        do "another thing".
        do "something else".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(3); // Should only have 3 unique actions
  });

  it('should not duplicate nested when blocks with the same concept name', () => {
    const input = `
decision "Elderly Based":
    when "Client Age Greater Than 60" then:
        when "Most Recent BMI" then:
            use "Some Other Decision".
            use "Some Other Other Decision".
        done
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(1); // Should only have 1 when block

    const nestedWhenBlock = blockBody.statements[0] as WhenBlock;
    const nestedBlockBody = nestedWhenBlock.body as BlockBody;
    expect(nestedBlockBody.statements).toHaveLength(2); // Should only have 2 unique actions
  });

  it('should handle complex nested decisions without duplication', () => {
    const input = `
decision "IMMZ.D2.D5.Measles":
    when "Measles Routine Immunization Schedule Incomplete" then:
        any:
        when "No Primary Series Doses Administered" then:
            when "Client Age Less Than 12 Months" then do "Indicate".
            when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
        done
        when "Client Is Due For MCV12" then do "Vaccinate".
    done
    when "One Primary Series Dose Administered" then:
        all:
        when "Client Age Less Than 15 Months" then do "Indicate".
        when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
        when "Client Is Due For MCV12" then do "Vaccinate".
    done
    when "Two Primary Series Doses Administered" then do "Indicate".
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;

    // Verify the structure without duplicates
    expect(decision.body.statements).toHaveLength(3);

    // First when block
    const firstWhenBlock = decision.body.statements[0] as WhenBlock;
    const firstBlockBody = firstWhenBlock.body as BlockBody;
    expect(firstBlockBody.statements).toHaveLength(2);

    // Second when block
    const secondWhenBlock = decision.body.statements[1] as WhenBlock;
    const secondBlockBody = secondWhenBlock.body as BlockBody;
    expect(secondBlockBody.statements).toHaveLength(3);

    // Third when block
    const thirdWhenBlock = decision.body.statements[2] as WhenBlock;
    const thirdBlockBody = thirdWhenBlock.body as BlockBody;
    expect(thirdBlockBody.statements).toHaveLength(1);
    const action = thirdBlockBody.statements[0] as ActionStatement;
    expect(action.action.type).toBe('DoActivity');
  });
});

describe('Repeated Statements in Decision Blocks', () => {
  let builder: ASTBuilder;

  beforeEach(() => {
    builder = new ASTBuilder();
  });

  const parseInput = (input: string): CPGL => {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokens = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokens);
    const tree = parser.cpgl();
    return builder.visit(tree) as CPGL;
  };

  it('should preserve repeated when statements', () => {
    const input = `
decision "Test Decision":
    when "Age" "Greater Than" "18".
    when "Age" "Less Than" "65".
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    expect(decision.body.statements).toHaveLength(2);
    const whenBlock1 = decision.body.statements[0] as WhenBlock;
    const whenBlock2 = decision.body.statements[1] as WhenBlock;
    expect(whenBlock1.conceptName).toBe('Age');
    expect(whenBlock2.conceptName).toBe('Age');
  });

  it('should preserve repeated use statements', () => {
    const input = `
decision "Test Decision":
    when "Age" "Greater Than" "18":
        use "Adult Protocol".
        use "Standard Care".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(2);
    const action1 = blockBody.statements[0] as ActionStatement;
    const action2 = blockBody.statements[1] as ActionStatement;
    expect(action1.action.type).toBe('UseDecision');
    expect((action1.action as any).decisionName).toBe('Adult Protocol');
    expect(action2.action.type).toBe('UseDecision');
    expect((action2.action as any).decisionName).toBe('Standard Care');
  });

  it('should preserve repeated do statements', () => {
    const input = `
decision "Test Decision":
    when "Age" "Greater Than" "18":
        do "Administer Medication".
        do "Monitor Vital Signs".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    expect(blockBody.statements).toHaveLength(2);
    const action1 = blockBody.statements[0] as ActionStatement;
    const action2 = blockBody.statements[1] as ActionStatement;
    expect(action1.action.type).toBe('DoActivity');
    expect((action1.action as any).activityName).toBe('Administer Medication');
    expect(action2.action.type).toBe('DoActivity');
    expect((action2.action as any).activityName).toBe('Monitor Vital Signs');
  });

  it('should preserve mixed repeated statements', () => {
    const input = `
decision "Test Decision":
    when "Age Greater Than 18":
        use "Adult Protocol".
        do "Administer Medication".
        use "Adult Protocol".
        do "Administer Medication".
    done
done`;

    const result = parseInput(input);
    const decision = result.statements[0] as Decision;
    const whenBlock = decision.body.statements[0] as WhenBlock;
    const blockBody = whenBlock.body as BlockBody;
    
    // Verify statements
    expect(blockBody.statements).toHaveLength(4);
    
    // First use statement
    const action1 = blockBody.statements[0] as ActionStatement;
    expect(action1.action.type).toBe('UseDecision');
    expect((action1.action as any).decisionName).toBe('Adult Protocol');
    
    // First do statement
    const action2 = blockBody.statements[1] as ActionStatement;
    expect(action2.action.type).toBe('DoActivity');
    expect((action2.action as any).activityName).toBe('Administer Medication');
    
    // Second use statement
    const action3 = blockBody.statements[2] as ActionStatement;
    expect(action3.action.type).toBe('UseDecision');
    expect((action3.action as any).decisionName).toBe('Adult Protocol');
    
    // Second do statement
    const action4 = blockBody.statements[3] as ActionStatement;
    expect(action4.action.type).toBe('DoActivity');
    expect((action4.action as any).activityName).toBe('Administer Medication');
  });
});
