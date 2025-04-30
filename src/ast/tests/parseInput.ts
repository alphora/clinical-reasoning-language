import { createParser } from "../../parser/createParser";
import { CRLAstBuilder } from "../builder";
import { CRL } from "../types";

export const parseInput = (input: string): CRL => {
  const { parser } = createParser(input);
  const tree = parser.crl();
  const builder = new CRLAstBuilder();
  return builder.visitCrl(tree);
};
