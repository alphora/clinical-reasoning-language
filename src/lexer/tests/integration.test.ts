import { CharStreams } from 'antlr4ts';
import { TokenTypes } from '../CPGLLexerConstants';
import { CPGLLexer } from '../CPGLLexer';
import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Integration', () => {
  describe('Indentation and Block Structure', () => {
    it('should emit NEWLINE followed by INDENT at block boundaries', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Verify NEWLINE followed by INDENT pattern
      const newlineIndex = tokens.findIndex(t => t.type === TokenTypes.NEWLINE);
      const indentIndex = tokens.findIndex(t => t.type === TokenTypes.INDENT);
      expect(indentIndex).toBe(newlineIndex + 1);
    });

    it('should emit DEDENT followed by next token', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        do "Another Action"
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Find first DEDENT and verify next token is WHEN
      const firstDedentIndex = tokens.findIndex(t => t.type === TokenTypes.DEDENT);
      expect(tokens[firstDedentIndex + 1].type).toBe(TokenTypes.WHEN);
    });

    it('should emit multiple DEDENT tokens in sequence for nested blocks', () => {
      const input = `decision "Test"
    when "Level 1" then
        when "Level 2" then
            do "Action"
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Get all DEDENT tokens
      const dedentTokens = tokens.filter(t => t.type === TokenTypes.DEDENT);
      expect(dedentTokens.length).toBe(3); // One for each level
      
      // Verify they appear in sequence
      const dedentIndices = tokens
        .map((t, i) => t.type === TokenTypes.DEDENT ? i : -1)
        .filter(i => i !== -1);
      const sortedIndices = [...dedentIndices].sort((a: number, b: number) => a - b);
      expect(dedentIndices).toEqual(sortedIndices);
    });
  });

  describe('Token Order and Sequence', () => {
    it('should handle token order in basic blocks', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
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
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle token order in complex nested blocks', () => {
      const input = `decision "Test"
    when "Level 1" then
        all
        when "Level 2" then
            any
            when "Level 3" then
                do "Action 1"
                do "Action 2"
            when "Level 3b" then
                use "Action 3"
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      console.log('Actual tokens:');
      tokens.forEach((token, index) => {
        console.log(`${index}: ${token.type} (${token.text})`);
      });
      
      console.log('\nExpected sequence:');
      const expected = [
        TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ALL, TokenTypes.NEWLINE,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY, TokenTypes.NEWLINE,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ];
      expected.forEach((type, index) => {
        console.log(`${index}: ${type}`);
      });
      
      verifyTokenSequence(tokens, expected);
    });
  });

  describe('Decision Structure', () => {
    describe('Multiple When Clauses', () => {
      it('should handle decision with multiple when clauses at same level', () => {
        const input = `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"
`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.ANY, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      });

      it('should handle decision with multiple when clauses and different terminal actions', () => {
        const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        use "Another Decision"
    when "Condition 3" then
        do "Action 2"
        do "Action 3"
`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      });

      it('should handle decision with multiple when clauses and empty lines', () => {
        const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"

    when "Condition 2" then
        use "Another Decision"

    when "Condition 3" then
        do "Action 2"
`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      });
    });
  });
}); 