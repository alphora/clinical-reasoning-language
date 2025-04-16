import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { CPGL, Concept, InferredByDefinition, CodedByDefinition } from '../types';

describe('Concept Structure', () => {
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

  it('should correctly structure concept with inferred-by concept reference', () => {
    const input = `
concept "Client Age Less Than 12 Months" is Condition of boolean:
    inferred-by "Age" "Less Than" "12 Months".
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe('Concept');
    expect(concept.name).toBe('Client Age Less Than 12 Months');
    expect(concept.conceptType).toBe('Condition');
    expect(concept.valueType).toBe('boolean');

    // Verify inferred-by structure
    const definition = concept.definition as InferredByDefinition;
    expect(definition.type).toBe('InferredByDefinition');
    expect(definition.concept).toBe('Age');
    expect(definition.pattern).toBe('Less Than');
    expect(definition.descriptiveLogic).toBe('12 Months');
  });

  it('should correctly structure concept with inferred-by descriptive logic', () => {
    const input = `
concept "Client Is Due For MCV12" is Condition of boolean:
    inferred-by ("Last MCV Dose Administered More Than 4 Weeks Ago").
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe('Concept');
    expect(concept.name).toBe('Client Is Due For MCV12');
    expect(concept.conceptType).toBe('Condition');
    expect(concept.valueType).toBe('boolean');

    // Verify inferred-by structure
    const definition = concept.definition as InferredByDefinition;
    expect(definition.type).toBe('InferredByDefinition');
    expect(definition.descriptiveLogic).toBe('Last MCV Dose Administered More Than 4 Weeks Ago');
    expect(definition.concept).toBeUndefined();
    expect(definition.pattern).toBeUndefined();
  });

  it('should correctly structure concept with coded-by definition', () => {
    const input = `
concept "Measles Vaccine" is Immunization of CodeableConcept:
    coded-by "MeaslesVaccineCodes".
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;

    // Verify basic concept structure
    expect(concept.type).toBe('Concept');
    expect(concept.name).toBe('Measles Vaccine');
    expect(concept.conceptType).toBe('Immunization');
    expect(concept.valueType).toBe('CodeableConcept');

    // Verify coded-by structure
    const definition = concept.definition as CodedByDefinition;
    expect(definition.type).toBe('CodedByDefinition');
    expect(definition.terminologyName).toBe('MeaslesVaccineCodes');
  });
}); 