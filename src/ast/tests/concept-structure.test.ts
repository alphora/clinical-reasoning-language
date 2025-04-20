import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { createLexer } from '../../lexer/createLexer';
import { CPGLAstBuilder } from '../builder';
import { 
  CPGL, 
  Concept, 
  InferredByDefinition,
  InferredByConcept,
  InferredByExpression,
  CodedByDefinition 
} from '../types';
import { createParser } from '../../parser/createParser';
import { parseInput } from './parseInput';

describe('Concept Structure', () => {
  let builder: CPGLAstBuilder;

  beforeEach(() => {
    builder = new CPGLAstBuilder();
  });

  it('should correctly structure concept with inferred by concept reference', () => {
    const input = `
concept "Client Age Less Than 12 Months":
    has type Condition.
    has valuetype boolean.
    inferred by "Less Than" "Age 12 Months".
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
    
    const body = definition.body as InferredByConcept;
    expect(body.type).toBe('InferredByDefinitionConcept');
    expect(body.concept).toBe('Age 12 Months');
    expect(body.pattern).toBe('Less Than');
  });

  it('should correctly structure concept with inferred by descriptive logic', () => {
    const input = `
concept "Client Is Due For MCV12":
    has type Condition.
    has valuetype boolean.
    inferred by ("Last MCV Dose Administered" and "More Than 4 Weeks Ago").
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
    
    const body = definition.body as InferredByExpression;
    expect(body.type).toBe('AndExpression');
  });

  it('should correctly structure concept with coded by definition', () => {
    const input = `
concept "Measles Vaccine":
    has type Immunization.
    has valuetype CodeableConcept.
    coded by "MeaslesVaccineCodes".
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

  it('should handle complex inferred by expressions', () => {
    const input = `
concept "Complex Condition":
    has type Condition.
    has valuetype boolean.
    inferred by (not ("Age Greater Than 18" and "Age Less Than 65")).
done`;

    const result = parseInput(input);
    const concept = result.statements[0] as Concept;
    const definition = concept.definition as InferredByDefinition;
    
    expect(definition.type).toBe('InferredByDefinition');
    const body = definition.body as InferredByExpression;
    expect(body.type).toBe('NotExpression');
    
    const groupExpr = (body as any).expression as InferredByExpression;
    expect(groupExpr.type).toBe('GroupExpression');
    
    const andExpr = (groupExpr as any).expression as InferredByExpression;
    expect(andExpr.type).toBe('AndExpression');
  });
}); 