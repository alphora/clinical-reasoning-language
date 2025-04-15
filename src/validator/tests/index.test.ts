import { File } from '../../ast/types';
import { Validator } from '../validator';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Basic Validation', () => {
    it('should validate an empty AST', () => {
      const ast: File = {
        statements: [],
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
      };

      const result = validator.validate(ast);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // TODO: Add more test categories as we implement validation rules
  // - Name Uniqueness
  // - Type Checking
  // - Cross-References
  // - Semantic Rules
});
