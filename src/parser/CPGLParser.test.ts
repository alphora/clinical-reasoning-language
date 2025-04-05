import { CharStreams } from 'antlr4ts';
import { CommonTokenStream } from 'antlr4ts/CommonTokenStream';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';

import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import type { Decision, DoClause, File, WhenClause } from '../ast/types';

describe('CPGLParser', () => {
  const INDENT = '    ';
  const NEWLINE = '\n';
  const DEDENT = '    ';
  const createParser = (input: string) => {
    const charStream = CharStreams.fromString(input);
    const lexer = new CPGLLexer(charStream);
    const tokenStream = new CommonTokenStream(lexer);
    return new CPGLParser(tokenStream);
  };

  test('should parse a simple decision', () => {
    const input = `decision "Test"${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}do "action"${NEWLINE}`;
    const parser = createParser(input);

    expect(() => {
      const tree = parser.file();
      expect(tree).toBeTruthy();
    }).not.toThrow();
  });

  test('should parse a decision with multiple actions', () => {
    const input = `decision "Complex Test"${NEWLINE}${INDENT}when "first condition" then${NEWLINE}${INDENT}${INDENT}do "action1"${NEWLINE}${INDENT}${INDENT}do "action2"${NEWLINE}${INDENT}when "second condition" then${NEWLINE}${INDENT}${INDENT}do "action3"${NEWLINE}`;
    const parser = createParser(input);

    expect(() => {
      const tree = parser.file();
      expect(tree).toBeTruthy();
    }).not.toThrow();
  });

  test('should parse a decision with use statements', () => {
    const input = `decision "Test with Use"${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}use "other_decision"${NEWLINE}${INDENT}when "another_condition" then${NEWLINE}${INDENT}${INDENT}do "another_action"${NEWLINE}`;
    const parser = createParser(input);

    expect(() => {
      const tree = parser.file();
      expect(tree).toBeTruthy();
    }).not.toThrow();
  });

  describe('parse', () => {
    it('should parse a complete decision with any qualifier', () => {
      const input = `decision "test"${NEWLINE}${INDENT}any${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}do "action"${NEWLINE}`;
      const parser = createParser(input);
      const file = parser.file();
      expect(file.statement().length).toBe(1);
      const decision = file.statement(0).decision();
      expect(decision).toBeDefined();
      expect(decision?.STRING().text).toBe('"test"');
      const block = decision?.block();
      expect(block).toBeDefined();
      expect(block?.qualifier()?.ANY()?.text).toBe('any');
      const whenClause = block?.whenClause();
      expect(whenClause).toBeDefined();
      expect(whenClause?.STRING().text).toBe('"condition"');
      const nestedBlock = whenClause?.block();
      expect(nestedBlock).toBeDefined();
      expect(nestedBlock?.statementLine().length).toBe(1);
      const nestedStatementLine = nestedBlock?.statementLine(0);
      expect(nestedStatementLine).toBeDefined();
      const doClause = nestedStatementLine?.doClause();
      expect(doClause).toBeDefined();
      expect(doClause?.STRING().text).toBe('"action"');
    });

    it('should parse a complete decision with all qualifier', () => {
      const input = `decision "test"${NEWLINE}${INDENT}all${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}do "action"${NEWLINE}`;
      const parser = createParser(input);
      const file = parser.file();
      expect(file.statement().length).toBe(1);
      const decision = file.statement(0).decision();
      expect(decision).toBeDefined();
      expect(decision?.STRING().text).toBe('"test"');
      const block = decision?.block();
      expect(block).toBeDefined();
      expect(block?.qualifier()?.ALL()?.text).toBe('all');
      const whenClause = block?.whenClause();
      expect(whenClause).toBeDefined();
      expect(whenClause?.STRING().text).toBe('"condition"');
      const nestedBlock = whenClause?.block();
      expect(nestedBlock).toBeDefined();
      expect(nestedBlock?.statementLine().length).toBe(1);
      const nestedStatementLine = nestedBlock?.statementLine(0);
      expect(nestedStatementLine).toBeDefined();
      const doClause = nestedStatementLine?.doClause();
      expect(doClause).toBeDefined();
      expect(doClause?.STRING().text).toBe('"action"');
    });

    it('should parse a complete decision without qualifier', () => {
      const input = `decision "test"${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}do "action"${NEWLINE}`;
      const parser = createParser(input);
      const tree = parser.file();

      expect(tree.statement().length).toBe(1);
      const statement = tree.statement(0);
      expect(statement).toBeDefined();
      const decision = statement.decision();
      expect(decision).toBeDefined();
      expect(decision?.DECISION().text).toBe('decision');
      expect(decision?.STRING().text).toBe('"test"');
      const block = decision?.block();
      expect(block).toBeDefined();
      expect(block?.qualifier()).toBeUndefined();
      expect(block?.statementLine().length).toBe(1);
      const statementLine = block?.statementLine(0);
      expect(statementLine).toBeDefined();
      const whenClause = statementLine?.whenClause();
      expect(whenClause).toBeDefined();
      expect(whenClause?.WHEN().text).toBe('when');
      expect(whenClause?.STRING().text).toBe('"condition"');
      expect(whenClause?.THEN().text).toBe('then');
      const whenBlock = whenClause?.block();
      expect(whenBlock).toBeDefined();
      expect(whenBlock?.statementLine().length).toBe(1);
      const doClause = whenBlock?.statementLine(0)?.doClause();
      expect(doClause).toBeDefined();
      expect(doClause?.DO().text).toBe('do');
      expect(doClause?.STRING().text).toBe('"action"');
    });

    it('should parse a decision with a direct cycle', () => {
      const input = `decision "cycle1"${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}use "cycle1"${NEWLINE}`;
      const parser = createParser(input);
      const file = parser.file();
      expect(file.statement().length).toBe(1);
      const decision = file.statement(0).decision();
      expect(decision).toBeDefined();
      expect(decision?.STRING().text).toBe('"cycle1"');
      const block = decision?.block();
      expect(block).toBeDefined();
      const statementLine = block?.statementLine(0);
      expect(statementLine).toBeDefined();
      const whenClause = statementLine?.whenClause();
      expect(whenClause).toBeDefined();
      expect(whenClause?.STRING().text).toBe('"condition"');
      const nestedBlock = whenClause?.block();
      expect(nestedBlock).toBeDefined();
      expect(nestedBlock?.statementLine().length).toBe(1);
      const nestedStatementLine = nestedBlock?.statementLine(0);
      expect(nestedStatementLine).toBeDefined();
      const useClause = nestedStatementLine?.useClause();
      expect(useClause).toBeDefined();
      expect(useClause?.STRING().text).toBe('"cycle1"');
    });

    it('should parse a decision with an indirect cycle', () => {
      const input = `decision "cycle1"${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}use "cycle2"${NEWLINE}${NEWLINE}decision "cycle2"${NEWLINE}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}use "cycle1"${NEWLINE}`;
      console.log('Input for indirect cycle:', input);
      const parser = createParser(input);
      const file = parser.file();
      expect(file.statement().length).toBe(2);
      
      // Check first decision
      const decision1 = file.statement(0).decision();
      expect(decision1).toBeDefined();
      expect(decision1?.STRING().text).toBe('"cycle1"');
      const block1 = decision1?.block();
      expect(block1).toBeDefined();
      const statementLine1 = block1?.statementLine(0);
      expect(statementLine1).toBeDefined();
      const whenClause1 = statementLine1?.whenClause();
      expect(whenClause1).toBeDefined();
      expect(whenClause1?.STRING().text).toBe('"condition"');
      const nestedBlock1 = whenClause1?.block();
      expect(nestedBlock1).toBeDefined();
      expect(nestedBlock1?.statementLine().length).toBe(1);
      const nestedStatementLine1 = nestedBlock1?.statementLine(0);
      expect(nestedStatementLine1).toBeDefined();
      const useClause1 = nestedStatementLine1?.useClause();
      expect(useClause1).toBeDefined();
      expect(useClause1?.STRING().text).toBe('"cycle2"');
      
      // Check second decision
      const decision2 = file.statement(1).decision();
      expect(decision2).toBeDefined();
      expect(decision2?.STRING().text).toBe('"cycle2"');
      const block2 = decision2?.block();
      expect(block2).toBeDefined();
      const statementLine2 = block2?.statementLine(0);
      expect(statementLine2).toBeDefined();
      const whenClause2 = statementLine2?.whenClause();
      expect(whenClause2).toBeDefined();
      expect(whenClause2?.STRING().text).toBe('"condition"');
      const nestedBlock2 = whenClause2?.block();
      expect(nestedBlock2).toBeDefined();
      expect(nestedBlock2?.statementLine().length).toBe(1);
      const nestedStatementLine2 = nestedBlock2?.statementLine(0);
      expect(nestedStatementLine2).toBeDefined();
      const useClause2 = nestedStatementLine2?.useClause();
      expect(useClause2).toBeDefined();
      expect(useClause2?.STRING().text).toBe('"cycle1"');
    });
  });
});
