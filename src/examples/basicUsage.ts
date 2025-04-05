import { CPGLParser } from '../parser/CPGLParser';
import { ValidationError } from '../validation/validator';

// Example 1: Valid input
const validInput = `
decision "Test_Decision"
  when "condition" then
    do "action1"
    do "action2"
  use "Other_Decision"

decision "Other_Decision"
  when "other_condition" then
    do "other_action"
`;

// Example 2: Invalid input (missing when clause)
const invalidInput = `
decision "Test_Decision"
  do "action1"
`;

console.log('=== Testing Valid Input ===');
try {
    const parser = new CPGLParser(validInput);
    const ast = parser.parse();
    console.log('AST:', JSON.stringify(ast, null, 2));
    console.log('Validation successful!');
} catch (e) {
    if (e instanceof ValidationError) {
        console.error(`Validation error at line ${e.location.line}, column ${e.location.column}: ${e.message}`);
    } else {
        console.error('Error:', e instanceof Error ? e.message : String(e));
    }
}

console.log('\n=== Testing Invalid Input ===');
try {
    const parser = new CPGLParser(invalidInput);
    const ast = parser.parse();
    console.log('AST:', JSON.stringify(ast, null, 2));
} catch (e) {
    if (e instanceof ValidationError) {
        console.error(`Validation error at line ${e.location.line}, column ${e.location.column}: ${e.message}`);
    } else {
        console.error('Error:', e instanceof Error ? e.message : String(e));
    }
} 