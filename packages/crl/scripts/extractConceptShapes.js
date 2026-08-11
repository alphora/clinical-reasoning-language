const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/grammar/generated/types');
fs.mkdirSync(dir, { recursive: true });

const grammarPath = path.join(__dirname, '../src/grammar/CRLLexer.g4');
const outputPath = path.join(__dirname, '../src/grammar/generated/types/conceptShapes.json');

const grammar = fs.readFileSync(grammarPath, 'utf8');
const match = grammar.match(/SHAPE_VALUE[\s\S]*?const validShapes = \[((?:.|\n)*?)\];/);

if (match) {
  const arrayText = match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith("'"))
    .map(line => line.replace(/['",]/g, '').trim())
    .filter(Boolean);
  fs.writeFileSync(outputPath, JSON.stringify(arrayText, null, 2));
  console.log('Extracted concept shapes:', arrayText);
} else {
  console.error('Could not find validShapes array for SHAPE_VALUE in grammar.');
  process.exit(1);
}
