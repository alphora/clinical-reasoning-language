import { CRL, FileType } from '../../ast/types';
import { UnusedDeclarationsValidator } from '../unusedDeclarationsValidator';
import { ValidationError } from '../validator';

describe('UnusedDeclarationsValidator - Terminology', () => {
  let validator: UnusedDeclarationsValidator;

  beforeEach(() => {
    validator = new UnusedDeclarationsValidator();
  });

  it('should detect unused terminology', () => {
    const ast: CRL = {
      type: FileType.type,
      statements: [
        {
          type: 'Terminology',
          name: 'unusedTerminology',
          definition: {
            type: 'TerminologyValueset',
            valuesetName: 'some-valueset',
            location: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
          },
        },
      ],
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
    };

    const result: ValidationError[] = validator.validate(ast);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].message).toContain('Unused terminology: unusedTerminology');
  });

  // TODO: Uncomment this when implementing validation again 
  // it('should mark terminology as used when referenced in CodedByDefinition', () => {
  //   const ast: CRL = {
  //     type: FileType.type,
  //     statements: [
  //       {
  //         type: 'Terminology',
  //         name: 'usedTerminology',
  //         definition: {
  //           type: 'TerminologyValueset',
  //           valuesetName: 'some-valueset',
  //           location: {
  //             start: { line: 1, column: 1 },
  //             end: { line: 1, column: 1 },
  //           },
  //         },
  //         location: {
  //           start: { line: 1, column: 1 },
  //           end: { line: 1, column: 1 },
  //         },
  //       },
  //       {
  //         type: 'Concept',
  //         name: 'someConcept',
  //         conceptType: 'Observation',
  //         valueType: 'boolean',
  //         definition: {
  //           type: 'CodedFromDefinition',
  //           terminologyName: 'usedTerminology',
  //           location: {
  //             start: { line: 2, column: 1 },
  //             end: { line: 2, column: 1 },
  //           },
  //         },
  //         location: {
  //           start: { line: 2, column: 1 },
  //           end: { line: 2, column: 1 },
  //         },
  //       },
  //     ],
  //     location: {
  //       start: { line: 1, column: 1 },
  //       end: { line: 2, column: 1 },
  //     },
  //   };

  //   const result: ValidationError[] = validator.validate(ast);
  //   expect(result.length).toBe(1);
  //   expect(result[0].message).toBe('Unused concept: someConcept');
  // });
});
