import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../CPGLLexer';
import { TokenTypes } from '../CPGLLexerConstants';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Basic Tokens', () => {
  describe('Keywords', () => {
    it('should recognize all CPGL keywords in correct order', () => {
      const input = `decision "Test Decision"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        use "Another Decision"
    when "Third Condition" then
        all
        when "Subcondition" then
            do "Subaction"
        when "Another Subcondition" then
            any
            when "Nested Condition" then
                do "Nested Action"
`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      // Verify all keywords are present in the correct order
      // Filter out the tokens that are not keywords
      const keywordTokens = tokens.filter(token =>
        [
          TokenTypes.DECISION,
          TokenTypes.WHEN,
          TokenTypes.THEN,
          TokenTypes.DO,
          TokenTypes.USE,
          TokenTypes.ANY,
          TokenTypes.ALL,
        ].includes(token.type),
      );

      // Verify sequence of just keywords
      verifyTokenSequence(keywordTokens, [
        TokenTypes.DECISION,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.DO,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.USE,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.ALL,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.DO,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.ANY,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.DO,
      ]);
    });

    it('should recognize keywords in context with proper token sequence', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        use "Another Decision"
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });
  });

  describe('String Literals', () => {
    it('should tokenize strings in proper context', () => {
      const input = `decision "Test Decision"
    when "Condition" then
        do "Action"
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          TokenTypes.DECISION,
          TokenTypes.STRING,
          TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN,
          TokenTypes.STRING,
          TokenTypes.THEN,
          TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO,
          TokenTypes.STRING,
          TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT,
          TokenTypes.EOF,
        ],
        [
          'decision',
          '"Test Decision"',
          '\n',
          '    ',
          'when',
          '"Condition"',
          'then',
          '\n',
          '    ',
          'do',
          '"Action"',
          '\n',
          '',
          '',
          '',
        ],
      );
    });
  });
});
