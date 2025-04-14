import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { Decision, WhenBlock, BlockBody, SingleAction, File } from '../types';

describe('Decision Structure', () => {
  let builder: ASTBuilder;

  beforeEach(() => {
    builder = new ASTBuilder();
  });

  const parseInput = (input: string): File => {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokens = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokens);
    const tree = parser.cpgl();
    return builder.visit(tree) as File;
  };

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
    const thirdBlockBody = thirdWhenBlock.body as SingleAction;
    expect(thirdBlockBody.action.type).toBe('DoActivity');
  });
});
