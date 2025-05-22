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

let missing = [];

for (const dir of locations) {
  for (const file of requiredFiles) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
}

if (missing.length > 0) {
  console.error('[ERROR] The following required grammar JSON files are missing:');
  for (const file of missing) {
    console.error('  - ' + file);
  }
  console.error('\nTo fix this:');
  console.error('  1. Run: npm run generate');
  console.error('  2. Ensure the files are present in both src/grammar/ and dist/grammar/.');
  console.error('  3. If building manually, copy the files from src/grammar/ to dist/grammar/.');
  process.exit(1);
} else {
  console.log('[checkGrammarJsonFiles] All required grammar JSON files are present.');
} 