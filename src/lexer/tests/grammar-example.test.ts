// Node.js built-in imports
import * as fs from "fs";
import * as path from "path";

// External imports
import { CharStreams } from "antlr4ts";

// Internal imports
import { CPGLLexer } from "../../grammar/generated/antlr/CPGLLexer";

import { getTokensFromString } from "./helpers";

describe("Grammar Example Analysis", () => {
  it("should successfully tokenize the grammar example file", () => {
    const examplePath = path.join(__dirname, "../../../docs/grammar-example.cpg");
    const input = fs.readFileSync(examplePath, "utf8");
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    try {
      const tokens = getTokensFromString(input);

      // Create output string
      let output = "Token sequence from grammar example:\n\n";
      let lastLine = 0;

      tokens.forEach((token) => {
        if (token.channel === 0) {
          if (token.line !== lastLine) {
            output += `\nLine ${token.line}:\n`;
            lastLine = token.line;
          }
          const typeName = lexer.vocabulary.getSymbolicName(token.type) ?? `Unknown(${token.type})`;
          output += `  ${typeName.padEnd(20)} "${token.text}"\n`;
        }
      });

      // Ensure tmp directory exists
      const tmpDir = path.join(__dirname, "../../../tmp");
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // Write output to file in tmp directory
      const outputPath = path.join(tmpDir, "grammar-example-tokens.txt");
      fs.writeFileSync(outputPath, output);

      expect(tokens.length).toBeGreaterThan(0);
    } catch (error) {
      console.error("\nError tokenizing cpgl:");
      console.error(error);
      if (error instanceof Error) {
        const match = RegExp(/Line (\d+):(\d+)/).exec(error.message);
        if (match) {
          const [, line, column] = match;
          const lines = input.split("\n");
          const errorLine = lines[parseInt(line) - 1];
          console.error("\nError context:");
          console.error(`Line ${line}: ${errorLine}`);
          console.error(" ".repeat(7 + parseInt(column)) + "^");
        }
      }
      throw error;
    }
  });
});
