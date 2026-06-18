/**
 * Example demonstrating basic CRL lexer usage
 */
import { CharStreams } from "antlr4ts";

import { CRLLexer } from "../grammar/generated/antlr/CRLLexer";
import { createLexer } from "../lexer/createLexer";

const input = `
decision "test"
  when "condition"
    then "action"
`;

const lexer = createLexer(CharStreams.fromString(input));

console.log("Tokenizing input:");
console.log(input);

let token = lexer.nextToken();
while (token.type !== CRLLexer.EOF) {
  console.log(`Token: ${lexer.vocabulary.getSymbolicName(token.type)} = "${token.text}"`);
  token = lexer.nextToken();
}

console.log("Reached end of input");
