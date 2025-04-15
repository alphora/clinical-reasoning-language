// Node.js built-in imports
import { readFileSync } from 'fs';
import { join } from 'path';

// External imports
import { CharStreams, CommonTokenStream } from 'antlr4ts';

// Internal imports
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

// Check if pretty output is requested
const prettyOutput = process.argv.includes('--pretty');

if (prettyOutput) {
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
  console.log(JSON.stringify(serializableTree, null, 2));
} else {
  // Raw parser output
  console.log('Parse Tree:');
  console.log('===========');
  console.log(tree.toStringTree(parser.ruleNames));
}
