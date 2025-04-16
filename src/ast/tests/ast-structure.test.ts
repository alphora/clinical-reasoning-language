import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { Decision, WhenBlock, BlockBody, File } from '../types';

describe('AST Structure', () => {
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
});
