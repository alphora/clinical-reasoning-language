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
  let output = `${spaces}${node.type}\n`;

  // Print node-specific properties
  const properties = [
    { key: 'name', format: (value: string) => value },
    { key: 'decisionName', format: (value: string) => `"${value}"` },
    { key: 'activityName', format: (value: string) => `"${value}"` },
    { key: 'conceptName', format: (value: string) => `"${value}"` },
    { key: 'qualifier', format: (value: unknown) => `"${String(value)}"` },
  ];

  for (const { key, format } of properties) {
    if (key in node) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (value) {
        output += `${spaces}  ${key}: ${format(value as string)}\n`;
      }
    }
  }

  // Handle statements
  if ('statements' in node && Array.isArray(node.statements)) {
    node.statements.forEach((statement: ASTNode) => {
      output += printAST(statement, indent + 1);
    });
  }

  // Handle body
  if ('body' in node && node.body) {
    output += printAST(node.body as ASTNode, indent + 1);
  }

  // Handle action
  if ('action' in node && node.action) {
    output += printAST(node.action as DoActivity | UseDecision, indent + 1);
  }

  return output;
}

// Print the AST
const generatedAST = printAST(ast);
console.log('Generated AST:');
console.log(generatedAST);

// Read the expected AST
const expectedPath = join(__dirname, '../../docs/Expected AST.ast');
console.log('\nReading expected AST from:', expectedPath);
const expectedAST = readFileSync(expectedPath, 'utf-8');

// Normalize line endings to LF
const normalizedGenerated = generatedAST.replace(/\r\n/g, '\n').trim();
const normalizedExpected = expectedAST.replace(/\r\n/g, '\n').trim();

// Split into lines
const generatedLines = normalizedGenerated.split('\n');
const expectedLines = normalizedExpected.split('\n');

// Compare line counts
const generatedLineCount = generatedLines.length;
const expectedLineCount = expectedLines.length;
const maxLines = Math.max(generatedLineCount, expectedLineCount);

if (generatedLineCount !== expectedLineCount) {
  console.log('\nWarning: Files have different line counts:');
  console.log(`  Generated: ${generatedLineCount} lines`);
  console.log(`  Expected:  ${expectedLineCount} lines`);
  console.log(`  Difference: ${Math.abs(generatedLineCount - expectedLineCount)} lines`);
  if (generatedLineCount > expectedLineCount) {
    console.log('  Generated file is longer - will compare first', expectedLineCount, 'lines');
  } else {
    console.log('  Expected file is longer - will compare first', generatedLineCount, 'lines');
  }
  console.log('');
}

// Compare the ASTs
console.log('\nComparing ASTs:');

// Create a version with all whitespace removed for strict comparison
const noWhitespaceGenerated = normalizedGenerated.replace(/\s+/g, '');
const noWhitespaceExpected = normalizedExpected.replace(/\s+/g, '');

const lineCountsMatch = generatedLineCount === expectedLineCount;
const whitespaceNormalizedMatch = normalizedGenerated === normalizedExpected;
const structureMatch = noWhitespaceGenerated === noWhitespaceExpected;

if (lineCountsMatch) {
  if (whitespaceNormalizedMatch) {
    console.log('✅ ASTs match exactly!');
  } else if (structureMatch) {
    console.log('✅ ASTs match in structure!');
    console.log('Note: There are formatting differences (whitespace/indentation)');
    console.log('\nDetailed whitespace comparison:');
    let differences = 0;
    for (let i = 0; i < maxLines; i++) {
      const generatedLine = generatedLines[i] || '';
      const expectedLine = expectedLines[i] || '';
      if (generatedLine !== expectedLine) {
        differences++;
        console.log(`\nLine ${i + 1}:`);
        console.log(`  Generated: "${generatedLine}"`);
        console.log(`  Expected:  "${expectedLine}"`);
        console.log('  Character codes:');
        console.log(
          '    Generated:',
          Array.from(generatedLine).map((c: string) => c.charCodeAt(0)),
        );
        console.log(
          '    Expected: ',
          Array.from(expectedLine).map((c: string) => c.charCodeAt(0)),
        );
      }
    }
    console.log(`\nTotal differences: ${differences} lines`);
  } else {
    console.log('❌ ASTs do not match!');
    console.log('\nDifferences:');
    for (let i = 0; i < maxLines; i++) {
      const generatedLine = generatedLines[i] || '';
      const expectedLine = expectedLines[i] || '';
      if (generatedLine.trim() !== expectedLine.trim()) {
        console.log(`Line ${i + 1}:`);
        console.log(`  Generated: "${generatedLine}"`);
        console.log(`  Expected:  "${expectedLine}"`);
      }
    }
  }
} else {
  // Different line counts
  const minLines = Math.min(generatedLineCount, expectedLineCount);
  const commonLinesMatch =
    normalizedGenerated.split('\n').slice(0, minLines).join('\n') ===
    normalizedExpected.split('\n').slice(0, minLines).join('\n');

  if (commonLinesMatch) {
    console.log('✅ Common lines match exactly!');
  } else if (structureMatch) {
    console.log('✅ Common lines match in structure!');
  } else {
    console.log('❌ Common lines do not match!');
  }

  console.log('\nRemaining lines:');
  for (let i = minLines; i < maxLines; i++) {
    const generatedLine = generatedLines[i] || '';
    const expectedLine = expectedLines[i] || '';
    console.log(`Line ${i + 1}:`);
    console.log(`  Generated: "${generatedLine}"`);
    console.log(`  Expected:  "${expectedLine}"`);
  }
}
