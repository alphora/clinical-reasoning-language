import type { ParseTree } from "antlr4ts/tree/ParseTree";

import type { CRLError } from "../types/errors";

import { CRLAstBuilder } from "./builder";
import type { CRL } from "./types";

export function createBuilder(tree: ParseTree): {
  builder: CRLAstBuilder;
  ast: CRL;
  errors: CRLError[];
} {
  const builder = new CRLAstBuilder();
  const ast = builder.visit(tree) as CRL;
  const errors = builder.getErrors();
  return { builder, ast, errors };
}
