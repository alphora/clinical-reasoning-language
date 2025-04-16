import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { File, Terminology, TerminologyValueset, TerminologySystemCode, TerminologyUnknown } from '../types';

describe('Terminology Structure', () => {
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

  it('should correctly structure terminology with valueset', () => {
    const input = `
terminology "MeaslesVaccineCodes" valueset "bmi valueset".
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe('Terminology');
    expect(terminology.name).toBe('MeaslesVaccineCodes');
    expect(terminology.definition).toBeDefined();
    expect(terminology.definition?.type).toBe('TerminologyValueset');
    const valuesetDef = terminology.definition as TerminologyValueset;
    expect(valuesetDef.valuesetName).toBe('bmi valueset');
  });

  it('should correctly structure terminology with system and code', () => {
    const input = `
terminology "MeaslesVaccineCodes" system "http://snomed.info/sct" code "871807003".
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe('Terminology');
    expect(terminology.name).toBe('MeaslesVaccineCodes');
    expect(terminology.definition).toBeDefined();
    expect(terminology.definition?.type).toBe('TerminologySystemCode');
    const systemCodeDef = terminology.definition as TerminologySystemCode;
    expect(systemCodeDef.system).toBe('http://snomed.info/sct');
    expect(systemCodeDef.code).toBe('871807003');
  });

  it('should correctly structure terminology with unknown', () => {
    const input = `
terminology "MeaslesVaccineCodes" unknown.
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe('Terminology');
    expect(terminology.name).toBe('MeaslesVaccineCodes');
    expect(terminology.definition).toBeDefined();
    expect(terminology.definition?.type).toBe('TerminologyUnknown');
    const unknownDef = terminology.definition as TerminologyUnknown;
    expect(unknownDef.type).toBe('TerminologyUnknown');
  });
}); 