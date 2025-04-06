import { CPGLParser } from '../parser/CPGLParser';
import { ValidationError } from '../validation/validator';

// Example 1: Valid input
const validInput = `
decision "IMMZ.D2.D5.Measles"
    when "Measles Routine Immunization Schedule Incomplete" then
        when "No Primary Series Doses Administered" then
            any
            when "Client Age Less Than 12 Months" then 
                do "Indicate"
            when "Last Live Vaccine Administered Within 4 Weeks" then 
                use "Elderly Based"
            when "Client Is Due For MCV12" then 
                do "Vaccinate"
    when "One Primary Series Dose Administered" then
        all
        when "Client Age Less Than 15 Months" then 
            do "Indicate"
        when "Last Live Vaccine Administered Within 4 Weeks" then 
            use "Elderly Based"
        when "Client Is Due For MCV12" then 
            do "Vaccinate"
    when "Two Primary Series Doses Administered" then 
        do "Indicate"

decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
    when "Client Age Less Than 60" then
        do "Indicate"

action "Indicate"
    fhirtype ServiceRequest

action "Vaccinate"
    fhirtype MedicationRequest

casefeature "Measles Routine Immunization Schedule Incomplete"
    casefeaturecode "measles-routine-immunization-schedule-incomplete"
    fhirtype Condition 
    profileurl "http://someothercfprofile-uri"
    valuetype boolean

casefeature "Last Live Vaccine Administered Within 4 Weeks"
    casefeaturecode "last-live-vaccine-administered"
    fhirtype Observation 
    profileurl "http://somecfprofile-uri"
    valuetype dateTime
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
