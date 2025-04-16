/**
 * FHIR type definitions for the Clinical Practice Guideline Language
 *
 * This module extracts FHIR type definitions directly from the generated lexer,
 * ensuring that the types stay in sync with the grammar definition.
 */

import fs from 'fs';
import path from 'path';

function extractTypesFromLexerAction(lexerSource: string, actionName: string): Set<string> {
  // Match the array of valid types in the action block
  const actionRegex = new RegExp(
    `${actionName}[^{]*?{[^{]*?validTypes\\s*=\\s*\\[\\s*([^\\]]+?)\\s*\\]`,
    's',
  );
  const match = actionRegex.exec(lexerSource);
  if (!match?.[1]) {
    console.warn(`Could not find ${actionName} types in lexer source - returning empty set`);
    return new Set<string>();
  }

  // Extract and clean up the types
  const types = match[1]
    .split('\n') // Split by newlines first
    .map(line => line.trim())
    .filter(line => line.length > 0 && line !== ',') // Filter out empty lines and lone commas
    .map(line => line.replace(/[',]/g, '').trim()); // Remove quotes and commas

  return new Set(types);
}

// Read the lexer grammar file directly
const grammarPath = path.join(__dirname, 'CPGLLexer.g4');
const lexerSource = fs.readFileSync(grammarPath, 'utf8');

// Action FHIR types from ACTIVITY_TYPE action
export const ACTION_FHIR_TYPES = extractTypesFromLexerAction(lexerSource, 'ACTIVITY_TYPE');

// Case feature types from CONCEPT_TYPE action
export const CASEFEATURE_FHIR_TYPES = extractTypesFromLexerAction(lexerSource, 'CONCEPT_TYPE');

// Value types from CONCEPT_VALUE_TYPE action
export const FHIR_VALUE_TYPES = extractTypesFromLexerAction(lexerSource, 'CONCEPT_VALUE_TYPE');
