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

// Example 3: Cyclic reference
const cyclicInput = `
decision "Decision_A"
  when "condition_a" then
    do "action_a"
  use "Decision_B"

decision "Decision_B"
  when "condition_b" then
    do "action_b"
  use "Decision_A"
`;

// Example 4: Duplicate conditions and actions
const duplicateInput = `
decision "Test_Decision"
  when "condition" then
    do "action1"
  when "CONDITION" then
    do "action1"
`;

// Example 5: Mutually exclusive conditions
const mutuallyExclusiveInput = `
decision "Test_Decision"
  when "is_active" then
    do "handle_active"
  when "not is_active" then
    do "handle_inactive"
`;

// Example 6: Circular action dependencies
const circularActionInput = `
decision "Test_Decision"
  when "condition" then
    do "action1"
    do "action2"
    do "action1"
`;

// Example 7: Invalid FHIR resource type
const invalidFHIRInput = `
decision "Test_Decision"
  when "condition" then
    do "action1" fhir "InvalidResourceType"
`;

// Example 8: Valid FHIR resource type
const validFHIRInput = `
decision "Test_Decision"
  when "condition" then
    do "action1" fhir "MedicationRequest"
    do "action2" fhir "ServiceRequest"
`;

function testInput(name: string, input: string): void {
  console.log(`\n=== Testing ${name} ===`);
  try {
    const parser = new CPGLParser(input);
    const ast = parser.parse();
    console.log('AST:', JSON.stringify(ast, null, 2));
    console.log('Validation successful!');
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(
        `Validation error at line ${e.location.line}, column ${e.location.column}: ${e.message}`,
      );
    } else {
      console.error('Error:', e instanceof Error ? e.message : String(e));
    }
  }
}

// Run all tests
testInput('Valid Input', validInput);
testInput('Invalid Input (Missing When Clause)', invalidInput);
testInput('Cyclic Reference', cyclicInput);
testInput('Duplicate Conditions/Actions', duplicateInput);
testInput('Mutually Exclusive Conditions', mutuallyExclusiveInput);
testInput('Circular Action Dependencies', circularActionInput);
testInput('Invalid FHIR Resource Type', invalidFHIRInput);
testInput('Valid FHIR Resource Type', validFHIRInput);

async function main(): Promise<void> {
  const parser = new CPGLParser(validInput);
  try {
    const ast = parser.parse();
    console.log('AST:', JSON.stringify(ast, null, 2));
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Validation Error:', error.message);
      console.error('Location:', error.location);
    } else {
      console.error('Error:', error);
    }
  }
}

// Run the main function
main().catch(console.error);
