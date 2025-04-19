import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { createParser } from '../../parser/createParser';
import { createLexer } from '../../lexer/createLexer';
import { CPGLAstBuilder } from '../builder';
import { CPGL, Activity } from '../types';

describe('Activity Structure', () => {
  let builder: CPGLAstBuilder;

  beforeEach(() => {
    builder = new CPGLAstBuilder();
  });

  const parseInput = (input: string): CPGL => {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokens = new CommonTokenStream(lexer);
    const parser = createParser(tokens);
    const tree = parser.cpgl();
    return builder.visit(tree) as CPGL;
  };

  it('should correctly structure activity with type', () => {
    const input = 'activity "Vaccinate" perform CPGImmunizationRequest.';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe('Activity');
    expect(activity.name).toBe('Vaccinate');
    expect(activity.perform).toBe('CPGImmunizationRequest');
  });

  it('should correctly structure activity with type and terminology', () => {
    const input = 'activity "Indicate" perform CPGProposeDiagnosisTask of "Colonoscopy".';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify basic activity structure
    expect(activity.type).toBe('Activity');
    expect(activity.name).toBe('Indicate');
    expect(activity.perform).toBe('CPGProposeDiagnosisTask');
    expect(activity.terminologyReference).toBe('Colonoscopy');
  });

  it('should correctly structure activity with type and stringLiteral', () => {
    const input = 'activity "another thing" perform CPGCommunicationRequest of "The message".';

    const result = parseInput(input);
    const activity = result.statements[0] as Activity;

    // Verify structure for stringLiteral
    expect(activity.type).toBe('Activity');
    expect(activity.name).toBe('another thing');
    expect(activity.perform).toBe('CPGCommunicationRequest');
    expect(activity.activityTypeValue).toBe('The message');
    expect(activity.terminologyReference).toBeUndefined();
  });

  it('should correctly structure activity with type and terminology or stringLiteral', () => {
    const input1 = 'activity "Indicate" perform CPGProposeDiagnosisTask of "Colonoscopy".';
    const input2 = 'activity "Notify" perform CPGCommunicationRequest of "A notification message".';

    const result1 = parseInput(input1);
    const result2 = parseInput(input2);
    const activity1 = result1.statements[0] as Activity;
    const activity2 = result2.statements[0] as Activity;

    // Terminology reference
    expect(activity1.terminologyReference).toBe('Colonoscopy');
    expect(activity1.activityTypeValue).toBeUndefined();
    // String literal
    expect(activity2.activityTypeValue).toBe('A notification message');
    expect(activity2.terminologyReference).toBeUndefined();
  });
}); 