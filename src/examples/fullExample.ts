/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';
import { CPGLLexer, CPGLTokenType } from '../lexer';

// A more complex example that tests indentation, comments, and string literals
const input = `
// Clinical practice guideline for hypertension
decision HypertensionManagement
    /* This decision tree helps manage 
       patients with hypertension */
    when
        patient.condition == "hypertension"
        patient.age > 18
    then
        // First-line recommendations
        recommend "Lifestyle modifications"
            with EVIDENCE_LEVEL "high"
        
        // Medication recommendations
        recommend "Consider antihypertensive medication"
            with EVIDENCE_LEVEL "moderate"
`;

console.log('Starting lexer on complex input...');
const chars = CharStreams.fromString(input);
const lexer = new CPGLLexer(chars);

// Process and print tokens
console.log('Tokens:');
console.log('--------------------------------------');
console.log('| Type               | Text          |');
console.log('--------------------------------------');

let token = lexer.nextToken();
let count = 0;

while (token.type !== CPGLTokenType.EOF && count < 50) {
    const typeName = String(CPGLTokenType[token.type] || token.type);
    const text = token.text ? 
        (token.text.length > 15 ? token.text.substring(0, 12) + '...' : token.text) : 
        '';
    
    console.log(`| ${typeName.padEnd(18)} | ${text.padEnd(13)} |`);
    token = lexer.nextToken();
    count++;
}

console.log('--------------------------------------');
console.log('Processing complete.'); 