import { createParser } from "../../parser/createParser";
import { CPGLAstBuilder } from "../builder";
import { CPGL } from "../types";

export const parseInput = (input: string): CPGL => {
  const { parser } = createParser(input);
  const tree = parser.cpgl();
  const builder = new CPGLAstBuilder();
  return builder.visitCpgl(tree);
};
