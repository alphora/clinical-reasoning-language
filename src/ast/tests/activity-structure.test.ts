import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { CPGL, Activity } from '../types';

describe('Activity Structure', () => {
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

  it('should correctly structure activity with type', () => {
    const input = `
activity "Vaccinate" perform CPGImmunization.
`;

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe('Activity');
    expect(activity.name).toBe('Vaccinate');
    expect(activity.perform).toBe('CPGImmunization');
  });

  it('should correctly structure activity with type and terminology', () => {
    const input = `
activity "Indicate" perform CPGProposeDiagnosis of "Colonoscopy".
`;

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe('Activity');
    expect(activity.name).toBe('Indicate');
    expect(activity.perform).toBe('CPGProposeDiagnosis');
    expect(activity.terminologyReference).toBe('Colonoscopy');
  });
}); 