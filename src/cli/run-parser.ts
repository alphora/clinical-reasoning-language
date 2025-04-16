import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../grammar/generated/CPGLParser';
import { createLexer } from '../lexer/createLexer';

// Read the example file
const examplePath = join(__dirname, '../../docs/grammar-example.cpg');
const input = readFileSync(examplePath, 'utf-8');

// Create the lexer and token stream
const lexer = createLexer(CharStreams.fromString(input));
const tokenStream = new CommonTokenStream(lexer);

// Create the parser
const parser = new CPGLParser(tokenStream);

// Parse the input
const tree = parser.cpgl();

// Check if raw output is requested
const rawOutput = process.argv.includes('--raw');

if (rawOutput) {
  // Raw parser output
  console.log(tree.toStringTree(parser.ruleNames));
} else {
  // Pretty parser output
  const serializableTree = {
    type: parser.ruleNames[tree.ruleIndex],
    text: tree.text,
    children: tree.children?.map(child => {
      const childWithRuleIndex = child as { ruleIndex?: number };
      return {
        type: child.constructor.name,
        text: child.text,
        ruleIndex:
          childWithRuleIndex.ruleIndex !== undefined
            ? parser.ruleNames[childWithRuleIndex.ruleIndex]
            : undefined,
      };
    }),
  };

  console.log('Parse Tree:');
  console.log('===========');
  console.log(JSON.stringify(serializableTree, null, 2));
}
