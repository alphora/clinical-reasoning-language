import { CharStreams } from 'antlr4ts';
import { CommonTokenStream } from 'antlr4ts/CommonTokenStream';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';

import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import type { Decision, DoClause, File, WhenClause } from '../ast/types';

describe('CPGLParser', () => {
  const INDENT = '    ';
  const NEWLINE = '\n';
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
      const input = `decision "test"${NEWLINE}${INDENT}any${NEWLINE}${INDENT}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}${INDENT}do "action"${NEWLINE}`;
      console.log('Input for any qualifier:', input.replace(/\n/g, '\\n'));
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
      console.log('Block qualifier:', block?.qualifier()?.text);
      expect(block?.qualifier()?.ANY()?.text).toBe('any');
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

    it('should parse a complete decision with all qualifier', () => {
      const input = `decision "test"${NEWLINE}${INDENT}all${NEWLINE}${INDENT}${INDENT}when "condition" then${NEWLINE}${INDENT}${INDENT}${INDENT}do "action"${NEWLINE}`;
      console.log('Input for all qualifier:', input.replace(/\n/g, '\\n'));
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
      console.log('Block qualifier:', block?.qualifier()?.text);
      expect(block?.qualifier()?.ALL()?.text).toBe('all');
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
  });
});
