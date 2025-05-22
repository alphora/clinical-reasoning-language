const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/grammar/generated/types');
fs.mkdirSync(dir, { recursive: true });

const grammarPath = path.join(__dirname, '../src/grammar/CRLLexer.g4');
const outputPath = path.join(__dirname, '../src/grammar/generated/types/conceptValueTypes.json');

const grammar = fs.readFileSync(grammarPath, 'utf8');
const match = grammar.match(/CONCEPT_VALUE_TYPE[\s\S]*?const validTypes = \[((?:.|\n)*?)\];/);

if (match) {
  const arrayText = match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith("'"))
    .map(line => line.replace(/['",]/g, '').trim())
    .filter(Boolean);
  fs.writeFileSync(outputPath, JSON.stringify(arrayText, null, 2));
  console.log('Extracted concept value types:', arrayText);
} else {
  console.error('Could not find validTypes array for CONCEPT_VALUE_TYPE in grammar.');
  process.exit(1);
} 