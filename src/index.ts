import { ParseTree } from "antlr4ts/tree/ParseTree";

import { CPGLAstBuilder } from "./ast/builder";
import { CPGL } from "./ast/types";
import { CPGLLexer } from "./grammar/generated/antlr/CPGLLexer";
import { createLexer } from "./lexer/createLexer";
import { createParser } from "./parser/createParser";
import { Validator } from "./validator/validator";

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
    const { lexer, errorListener } = createLexer(input);
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
          text: token.text ?? "",
        });
      }
      token = lexer.nextToken();
    }

    const errors = errorListener.getErrors();
    if (errors.length > 0) {
      return { success: false, errors };
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
  let lexerErrorListener, parserErrorListener;
  try {
    const parserSetup = createParser(input);
    lexerErrorListener = parserSetup.lexerErrorListener;
    parserErrorListener = parserSetup.parserErrorListener;
    const tree = parserSetup.parser.cpgl();
    const errors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, result: tree };
  } catch (error) {
    // Collect all errors if available, plus the exception
    const errors = [
      ...(lexerErrorListener?.getErrors?.() ?? []),
      ...(parserErrorListener?.getErrors?.() ?? []),
      JSON.stringify({
        type: "Exception",
        message: error instanceof Error ? error.message : String(error),
      }),
    ];
    return {
      success: false,
      errors,
    };
  }
}

/**
 * Builds an AST from CPGL input
 * @param input The CPGL code to build AST from
 * @returns ParseResult containing AST or errors
 */
export function buildCPGL(input: string): ParseResult<CPGL> {
  let lexerErrorListener, parserErrorListener, builder;
  try {
    const parserSetup = createParser(input);
    lexerErrorListener = parserSetup.lexerErrorListener;
    parserErrorListener = parserSetup.parserErrorListener;
    const tree = parserSetup.parser.cpgl();
    builder = new CPGLAstBuilder();
    const ast = builder.visit(tree) as CPGL;
    const errors = [
      ...lexerErrorListener.getErrors(),
      ...parserErrorListener.getErrors(),
      ...builder.getErrors(),
    ];
    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, result: ast };
  } catch (error) {
    // Collect all errors if available, plus the exception
    const errors = [
      ...(lexerErrorListener?.getErrors?.() ?? []),
      ...(parserErrorListener?.getErrors?.() ?? []),
      ...(builder?.getErrors?.() ?? []),
      JSON.stringify({
        type: "Exception",
        message: error instanceof Error ? error.message : String(error),
      }),
    ];
    return {
      success: false,
      errors,
    };
  }
}

/**
 * Validates CPGL input
 * @param input The CPGL code to validate
 * @returns ParseResult containing validation result or errors
 */
export function validateCPGL(input: string): ParseResult<CPGL> {
  try {
    const { parser, lexerErrorListener, parserErrorListener } = createParser(input);
    const tree = parser.cpgl();
    const builder = new CPGLAstBuilder();
    const ast = builder.visit(tree) as CPGL;
    const errors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
    if (errors.length > 0) {
      return { success: false, errors };
    }
    const validator = new Validator();
    const validationResult = validator.validate(ast);
    if (!validationResult.isValid) {
      return {
        success: false,
        errors: [
          ...validationResult.errors.map((e) => e.message),
          ...validationResult.warnings.map((w) => w.message),
        ],
      };
    }
    return { success: true, result: ast };
  } catch (error) {
    return {
      success: false,
      errors: [
        JSON.stringify({
          type: "Exception",
          message: error instanceof Error ? error.message : String(error),
        }),
      ],
    };
  }
}
