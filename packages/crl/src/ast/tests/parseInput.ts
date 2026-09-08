import { createParser } from "../../parser/createParser";
import { createBuilder } from "../createBuilder";
import { CRL } from "../types";

export const parseInput = (input: string): CRL => {
  const { parser, parserErrorListener, lexerErrorListener } = createParser(input);
  const tree = parser.crl();
  const syntaxErrors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
  if (syntaxErrors.length > 0) {
    throw new Error("CRL syntax errors: " + JSON.stringify(syntaxErrors, null, 2));
  }
  const { ast, errors } = createBuilder(tree);
  if (errors.length > 0) {
    throw new Error("AST builder errors: " + JSON.stringify(errors, null, 2));
  }
  return ast;
};
