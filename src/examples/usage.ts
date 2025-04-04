/* eslint-disable no-console */
import { CharStream, CharStreams } from 'antlr4ts';
import { CPGLLexer, CPGLTokenType } from '../lexer';

// Example input string
const input = `
decision HypertensionTreatment
    when
        patient.condition == "hypertension"
        patient.age > 18
    then
        recommend "Consider lifestyle modifications"
        recommend "Start antihypertensive medication"
            with EVIDENCE_LEVEL "high"
`;

// Create a character stream from the input
const chars: CharStream = CharStreams.fromString(input);

// Create a lexer that feeds off of the character stream
const lexer: CPGLLexer = new CPGLLexer(chars);

// Print out all tokens
let token = lexer.nextToken();
while (token.type !== CPGLTokenType.EOF) {
    console.log(`Token: ${token.type} (${CPGLTokenType[token.type]}) - '${token.text}'`);
    token = lexer.nextToken();
} 