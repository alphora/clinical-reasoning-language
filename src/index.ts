import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';

import { CPGLAstBuilder } from './ast/builder';
import { CPGL } from './ast/types';
import { CPGLLexer } from './grammar/generated/CPGLLexer';
import { CPGLParser } from './grammar/generated/CPGLParser';
import { createLexer } from './lexer/createLexer';
import { Validator } from './validator/validator';

export interface Token {
  line: number;
  column: number;
  type: string;
  text: string;
}

export interface ParseResult<T> {
  success: boolean;
  result?: T;
  errors?: string[];
}

/**
 * Tokenizes CPGL input into a sequence of tokens
 * @param input The CPGL code to tokenize
 * @returns ParseResult containing tokens or errors
 */
export function tokenizeCPGL(input: string): ParseResult<Token[]> {
  try {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokens: Token[] = [];
    let token = lexer.nextToken();

    while (token.type !== CPGLLexer.EOF) {
      if (token.channel === 0) {
        // Only show tokens on the default channel
        const typeName = lexer.vocabulary.getSymbolicName(token.type) ?? `Unknown (${token.type})`;
        tokens.push({
          line: token.line,
          column: token.charPositionInLine,
          type: typeName,
          text: token.text ?? '',
        });
      }
      token = lexer.nextToken();
    }

    return { success: true, result: tokens };
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * Parses CPGL input into a parse tree
 * @param input The CPGL code to parse
 * @returns ParseResult containing parse tree or errors
 */
export function parseCPGL(input: string): ParseResult<ParseTree> {
  try {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokenStream);
    const tree = parser.cpgl();

    return { success: true, result: tree };
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * Builds an AST from CPGL input
 * @param input The CPGL code to build AST from
 * @returns ParseResult containing AST or errors
 */
export function buildCPGL(input: string): ParseResult<CPGL> {
  try {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokenStream);
    const tree = parser.cpgl();
    const builder = new CPGLAstBuilder();
    const ast = builder.visit(tree) as CPGL;

    return { success: true, result: ast };
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * Validates CPGL input
 * @param input The CPGL code to validate
 * @returns ParseResult containing validation result or errors
 */
export function validateCPGL(input: string): ParseResult<CPGL> {
  try {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokenStream);
    const tree = parser.cpgl();
    const builder = new CPGLAstBuilder();
    const ast = builder.visit(tree) as CPGL;

    const validator = new Validator();
    const validationResult = validator.validate(ast);

    if (!validationResult.isValid) {
      return {
        success: false,
        errors: [
          ...validationResult.errors.map(e => e.message),
          ...validationResult.warnings.map(w => w.message),
        ],
      };
    }

    return { success: true, result: ast };
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
