const fs = require('fs');
const path = require('path');

const grammarPath = path.join(__dirname, '../src/grammar/CPGLLexer.g4');
const outputPath = path.join(__dirname, '../src/grammar/activityTypes.json');

const grammar = fs.readFileSync(grammarPath, 'utf8');
const match = grammar.match(/const validTypes = \[((?:.|\n)*?)\];/);

if (match) {
  const arrayText = match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith("'"))
    .map(line => line.replace(/['",]/g, '').trim())
    .filter(Boolean);
  fs.writeFileSync(outputPath, JSON.stringify(arrayText, null, 2));
  console.log('Extracted activity types:', arrayText);
} else {
  console.error('Could not find validTypes array in grammar.');
  process.exit(1);
} 