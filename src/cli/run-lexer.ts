import { readFileSync } from "fs";
import { join } from "path";

import { CRLLexer } from "../grammar/generated/antlr/CRLLexer";
import { createLexer } from "../lexer/createLexer";

// Parse --path argument
const pathArgIndex = process.argv.indexOf("--path");
const filePath =
  (pathArgIndex !== -1 && process.argv[pathArgIndex + 1]) ||
  join(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");

// Read the file content
const input = readFileSync(filePath, "utf8");

// Create lexer instance (new API)
const { lexer, errorListener } = createLexer(input);

// Get all tokens
const tokens: Array<{
  line: number;
  column: number;
  type: string;
  text: string;
}> = [];

let token = lexer.nextToken();
while (token.type !== CRLLexer.EOF) {
  // Only show tokens on the default channel (skip comments and whitespace)
  if (token.channel === 0) {
    // Get token type name
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

// Print errors after tokenization
const errors = errorListener.getErrors();
if (errors.length > 0) {
  console.error("Lexer errors:");
  errors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
  process.exit(1);
}

// Check if pretty output is requested
const prettyOutput = process.argv.includes("--pretty");

if (!prettyOutput) {
  // Raw lexer output
  console.log(JSON.stringify(tokens, null, 2));
} else {
  // Pretty lexer output
  console.log(`\nTokenizing: ${filePath}\n`);
  console.log("Line | Column | Type | Text");
  console.log("-----|--------|------|------");

  let lastLine = 0;
  tokens.forEach((token) => {
    // Add a blank line when we move to a new line
    if (token.line !== lastLine) {
      console.log();
      lastLine = token.line;
    }

    // Print token info
    console.log(
      `${token.line.toString().padStart(4)} | ${token.column.toString().padStart(6)} | ${token.type.padEnd(20)} | "${token.text}"`,
    );
  });
}
