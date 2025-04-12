import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { ASTBuilder } from '../ast/builder';
import {
  ASTNode,
  File,
  Decision,
  DecisionBody,
  WhenBlock,
  SingleAction,
  Terminology,
  Concept,
} from '../ast/types';
import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import { CPGLParser } from '../grammar/generated/CPGLParser';

// Read the example file
const examplePath = join(__dirname, '../../docs/grammar-example.cpg');
const input = readFileSync(examplePath, 'utf-8');

// Create the lexer
const lexer = new CPGLLexer(CharStreams.fromString(input));
const tokenStream = new CommonTokenStream(lexer);

// Create the parser
const parser = new CPGLParser(tokenStream);

// Parse the input
const tree = parser.cpgl();

// Create the AST builder and visit the parse tree
const builder = new ASTBuilder();
const ast = builder.visit(tree);

// Helper function to print AST nodes with indentation
function printAST(node: ASTNode, indent = 0): void {
  const spaces = '  '.repeat(indent);
  console.log(`${spaces}${node.type}`);

  // Print node-specific properties
  if ('name' in node) {
    console.log(`${spaces}  name: ${node.name}`);
  }
  if ('decisionName' in node) {
    console.log(`${spaces}  decisionName: ${node.decisionName}`);
  }
  if ('statements' in node && Array.isArray((node as unknown as File).statements)) {
    (node as unknown as File).statements.forEach(statement => printAST(statement, indent + 1));
  }
  if ('body' in node && (node as unknown as Decision).body) {
    const decisionBody = (node as unknown as Decision).body;
    if ('statements' in decisionBody && Array.isArray(decisionBody.statements)) {
      decisionBody.statements.forEach((block: WhenBlock) => printAST(block, indent + 1));
    }
  }
  if ('body' in node && (node as unknown as WhenBlock).body) {
    printAST((node as unknown as WhenBlock).body, indent + 1);
  }
  if ('action' in node && (node as unknown as SingleAction).action) {
    printAST((node as unknown as SingleAction).action, indent + 1);
  }
  if ('definition' in node && (node as unknown as Terminology | Concept).definition) {
    printAST((node as unknown as Terminology | Concept).definition, indent + 1);
  }
}

// Print the AST
console.log('AST Representation:');
console.log('==================');
printAST(ast);
