import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { ASTBuilder } from '../ast/builder';
import { ASTNode, DoActivity, UseDecision, File } from '../ast/types';
import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { CPGLLexerErrorListener } from '../lexer/CPGLLexerErrorListener';

// Read the example file
const examplePath = join(__dirname, '../../docs/grammar-example.cpg');
const input = readFileSync(examplePath, 'utf-8');

// Create the lexer and add error listener
const lexer = new CPGLLexer(CharStreams.fromString(input));
lexer.removeErrorListeners();
lexer.addErrorListener(new CPGLLexerErrorListener());
const tokenStream = new CommonTokenStream(lexer);

// Create the parser
const parser = new CPGLParser(tokenStream);

// Parse the input
const tree = parser.cpgl();

// Create the AST builder and visit the parse tree
const builder = new ASTBuilder();
const ast = builder.visit(tree) as File;

// Helper function to print AST nodes with indentation
function printAST(node: ASTNode, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let output = '';

  // Skip the File node
  if (node.type !== 'File') {
    output = `${spaces}${node.type}\n`;

    // Print node-specific properties
    if ('name' in node) {
      output += `${spaces}  name: ${node.name}\n`;
    }
    if ('decisionName' in node) {
      output += `${spaces}  decisionName: "${node.decisionName}"\n`;
    }
    if ('activityName' in node) {
      output += `${spaces}  activityName: "${node.activityName}"\n`;
    }
    if ('conceptName' in node) {
      output += `${spaces}  conceptName: "${node.conceptName}"\n`;
    }
    if ('qualifier' in node && node.qualifier) {
      output += `${spaces}  qualifier: "${node.qualifier}"\n`;
    }
  }

  // Handle statements
  if ('statements' in node && Array.isArray(node.statements)) {
    node.statements.forEach((statement: ASTNode) => {
      output += printAST(statement, indent + (node.type === 'File' ? 0 : 1));
    });
  }

  // Handle body
  if ('body' in node && node.body) {
    const body = node.body as ASTNode;
    if ('statements' in body && Array.isArray(body.statements)) {
      output += printAST(body, indent + 1);
    } else {
      output += printAST(body, indent + 1);
    }
  }

  // Handle action
  if ('action' in node && node.action) {
    const action = node.action as DoActivity | UseDecision;
    output += printAST(action, indent + 1);
  }

  return output;
}

// Get only the first decision
const firstDecision = ast.statements.find(statement => statement.type === 'Decision');
if (!firstDecision) {
  throw new Error('No decision found in AST');
}

// Print the AST
const generatedAST = printAST(firstDecision);
console.log('Generated AST:');
console.log(generatedAST);

// Read the expected AST
const expectedPath = join(__dirname, '../../docs/Expected AST.ast');
const expectedAST = readFileSync(expectedPath, 'utf-8');

// Compare the ASTs
console.log('\nComparing ASTs:');
if (generatedAST.trim() === expectedAST.trim()) {
  console.log('✅ ASTs match!');
} else {
  console.log('❌ ASTs do not match!');
  console.log('\nDifferences:');
  const generatedLines = generatedAST.split('\n');
  const expectedLines = expectedAST.split('\n');
  const maxLines = Math.max(generatedLines.length, expectedLines.length);
  for (let i = 0; i < maxLines; i++) {
    const generatedLine = generatedLines[i] || '';
    const expectedLine = expectedLines[i] || '';
    if (generatedLine.trim() !== expectedLine.trim()) {
      console.log(`Line ${i + 1}:`);
      console.log(`  Generated: ${generatedLine}`);
      console.log(`  Expected:  ${expectedLine}`);
    }
  }
} 