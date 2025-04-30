#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'activityTypes.json',
  'conceptTypes.json',
  'conceptValueTypes.json',
];

const locations = [
  path.join(__dirname, '../src/grammar/generated/types'),
  path.join(__dirname, '../dist/grammar/generated/types'),
];

const requiredAntlrFiles = [
  'CRLLexer.ts',
  'CRLLexer.tokens',
  'CRLLexer.interp',
  'CRLParser.ts',
  'CRLParser.tokens',
  'CRLParser.interp',
  'CRLParserListener.ts',
  'CRLParserVisitor.ts',
];

const antlrLocations = [
  path.join(__dirname, '../src/grammar/generated/antlr'),
  path.join(__dirname, '../dist/grammar/generated/antlr'),
];

let missing = [];

for (const dir of locations) {
  for (const file of requiredFiles) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
}

for (const dir of antlrLocations) {
  for (const file of requiredAntlrFiles) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
}

if (missing.length > 0) {
  console.error('[ERROR] The following required grammar JSON or ANTLR files are missing:');
  for (const file of missing) {
    console.error('  - ' + file);
  }
  console.error('\nTo fix this:');
  console.error('  1. Run: npm run generate');
  console.error('  2. Ensure the files are present in both src/grammar/generated/antlr and dist/grammar/generated/antlr.');
  console.error('  3. If building manually, copy the files from src/grammar/generated/antlr to dist/grammar/generated/antlr.');
  process.exit(1);
} else {
  console.log('[checkGrammarJsonFiles] All required grammar JSON and ANTLR files are present.');
} 