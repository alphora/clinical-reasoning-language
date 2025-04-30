import { ParseTree } from "antlr4ts/tree/ParseTree";

import { CRLAstBuilder } from "./ast/builder";
import { CRL } from "./ast/types";
import { CRLLexer } from "./grammar/generated/antlr/CRLLexer";
import { createLexer } from "./lexer/createLexer";
import { createParser } from "./parser/createParser";
import { CRLError } from "./types/errors";
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
  errors?: CRLError[];
}

/**
 * Tokenizes CRL input into a sequence of tokens
 * @param input The CRL code to tokenize
 * @returns ParseResult containing tokens or errors
 */
export function tokenizeCRL(input: string): ParseResult<Token[]> {
  try {
    const { lexer, errorListener } = createLexer(input);
    const tokens: Token[] = [];
    let token = lexer.nextToken();

    while (token.type !== CRLLexer.EOF) {
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
    const errorObj: CRLError = {
      type: "Exception",
      message: error instanceof Error ? error.message : String(error),
    };
    return { success: false, errors: [errorObj] };
  }
}

/**
 * Parses CRL input into a parse tree
 * @param input The CRL code to parse
 * @returns ParseResult containing parse tree or errors
 */
export function parseCRL(input: string): ParseResult<ParseTree> {
  let lexerErrorListener, parserErrorListener;
  try {
    const parserSetup = createParser(input);
    lexerErrorListener = parserSetup.lexerErrorListener;
    parserErrorListener = parserSetup.parserErrorListener;
    const tree = parserSetup.parser.crl();
    const errors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, result: tree };
  } catch (error) {
    // Collect all errors if available, plus the exception
    const errors = [
      ...(lexerErrorListener?.getErrors() ?? []),
      ...(parserErrorListener?.getErrors() ?? []),
      {
        type: "Exception" as const,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    return {
      success: false,
      errors,
    };
  }
}

/**
 * Builds an AST from CRL input
 * @param input The CRL code to build AST from
 * @returns ParseResult containing AST or errors
 */
export function buildCRL(input: string): ParseResult<CRL> {
  let lexerErrorListener, parserErrorListener, builder;
  try {
    const parserSetup = createParser(input);
    lexerErrorListener = parserSetup.lexerErrorListener;
    parserErrorListener = parserSetup.parserErrorListener;
    const tree = parserSetup.parser.crl();
    builder = new CRLAstBuilder();
    const ast = builder.visit(tree) as CRL;
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
      ...(lexerErrorListener?.getErrors() ?? []),
      ...(parserErrorListener?.getErrors() ?? []),
      ...(builder?.getErrors() ?? []),
      {
        type: "Exception" as const,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    return {
      success: false,
      errors,
    };
  }
}

/**
 * Validates CRL input
 * @param input The CRL code to validate
 * @returns ParseResult containing validation result or errors
 */
export function validateCRL(input: string): ParseResult<CRL> {
  try {
    const { parser, lexerErrorListener, parserErrorListener } = createParser(input);
    const tree = parser.crl();
    const builder = new CRLAstBuilder();
    const ast = builder.visit(tree) as CRL;
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
          ...validationResult.errors.map((e) => ({
            type: "Exception" as const,
            message: e.message,
          })),
          ...validationResult.warnings.map((w) => ({
            type: "Exception" as const,
            message: w.message,
          })),
        ],
      };
    }
    return { success: true, result: ast };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          type: "Exception",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
