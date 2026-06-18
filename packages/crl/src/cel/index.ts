import { ParseTree } from "antlr4ts/tree/ParseTree";

import { CELLexer } from "../grammar/generated/antlr/CELLexer";
import type { CRLError } from "../types/errors";

import { CELAstBuilder } from "./ast/builder";
import type { CEL } from "./ast/types";
import { createCELLexer } from "./lexer/createLexer";
import { createCELParser } from "./parser/createParser";

export * from "./ast/types";

export interface CELToken {
  line: number;
  column: number;
  type: string;
  text: string;
}

export interface CELParseResult<T> {
  success: boolean;
  result?: T;
  errors?: CRLError[];
}

/** Tokenize CEL source — counterpart to `tokenizeCRL`. */
export function tokenizeCEL(input: string): CELParseResult<CELToken[]> {
  try {
    const { lexer, errorListener } = createCELLexer(input);
    const tokens: CELToken[] = [];
    let token = lexer.nextToken();
    while (token.type !== CELLexer.EOF) {
      if (token.channel === 0) {
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
    if (errors.length > 0) return { success: false, errors };
    return { success: true, result: tokens };
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

/** Parse CEL source to a parse tree — counterpart to `parseCRL`. */
export function parseCEL(input: string): CELParseResult<ParseTree> {
  let lexerErrorListener, parserErrorListener;
  try {
    const setup = createCELParser(input);
    lexerErrorListener = setup.lexerErrorListener;
    parserErrorListener = setup.parserErrorListener;
    const tree = setup.parser.cel();
    const parserErrors = parserErrorListener.getErrors();
    if (parserErrors.length > 0) return { success: false, errors: parserErrors };
    const lexerErrors = lexerErrorListener.getErrors();
    if (lexerErrors.length > 0) return { success: false, errors: lexerErrors };
    return { success: true, result: tree };
  } catch (error) {
    const errors = [
      ...(lexerErrorListener?.getErrors() ?? []),
      ...(parserErrorListener?.getErrors() ?? []),
      {
        type: "Exception" as const,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    return { success: false, errors };
  }
}

/** Build the CEL AST — counterpart to `buildCRL`. */
export function buildCEL(input: string): CELParseResult<CEL> {
  let lexerErrorListener, parserErrorListener, builder;
  try {
    const setup = createCELParser(input);
    lexerErrorListener = setup.lexerErrorListener;
    parserErrorListener = setup.parserErrorListener;
    const tree = setup.parser.cel();
    builder = new CELAstBuilder();
    const ast = builder.visit(tree) as CEL;
    const parserErrors = parserErrorListener.getErrors();
    if (parserErrors.length > 0) return { success: false, errors: parserErrors };
    const lexerErrors = lexerErrorListener.getErrors();
    if (lexerErrors.length > 0) return { success: false, errors: lexerErrors };
    const builderErrors = builder.getErrors();
    if (builderErrors.length > 0) return { success: false, errors: builderErrors };
    return { success: true, result: ast };
  } catch (error) {
    const errors = [
      ...(lexerErrorListener?.getErrors() ?? []),
      ...(parserErrorListener?.getErrors() ?? []),
      ...(builder?.getErrors() ?? []),
      {
        type: "Exception" as const,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    return { success: false, errors };
  }
}
