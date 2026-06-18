import { createParser } from "../../parser/createParser";
import { createBuilder } from "../createBuilder";
import { CRL } from "../types";

export const parseInput = (input: string): CRL => {
  const { parser } = createParser(input);
  const tree = parser.crl();
  const { ast, errors } = createBuilder(tree);
  if (errors.length > 0) {
    throw new Error("AST builder errors: " + JSON.stringify(errors, null, 2));
  }
  return ast;
};
