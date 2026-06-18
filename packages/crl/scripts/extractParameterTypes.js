const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/grammar/generated/types');
fs.mkdirSync(dir, { recursive: true });

const grammarPath = path.join(__dirname, '../src/grammar/CRLLexer.g4');
const grammar = fs.readFileSync(grammarPath, 'utf8');

const conceptTypesPath = path.join(__dirname, '../src/grammar/generated/types/conceptTypes.json');
const conceptValueTypesPath = path.join(__dirname, '../src/grammar/generated/types/conceptValueTypes.json');
const outputPath = path.join(__dirname, '../src/grammar/generated/types/parameterTypes.json');

function parseValidTypes(rule) {
  // Anchor on the rule definition (NAME on its own line, then `:` on
  // the next) — not just any substring match. PARAMETER_TYPE appears
  // earlier in the file as part of PARAMETER_TYPE_MODE references, and
  // the existing extract pattern would slip past the rule definition
  // and capture the wrong array.
  const re = new RegExp(`(?:^|\\n)${rule}\\s*\\n\\s*:[\\s\\S]*?const validTypes = \\[((?:.|\\n)*?)\\];`);
  const match = grammar.match(re);
  if (!match) {
    console.error(`Could not find validTypes array for ${rule} in grammar.`);
    process.exit(1);
  }
  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith("'"))
    .map(line => line.replace(/['",]/g, '').trim())
    .filter(Boolean);
}

const parameterTypes = parseValidTypes('PARAMETER_TYPE');

// Build-time invariant: parameterTypes must be the superset of
// (conceptTypes ∪ conceptValueTypes). If the operator/maintainer adds a
// new entry to either source list without mirroring it here, fail the
// build loudly — drift between the three lists silently breaks the
// editor experience that contextDetect relies on.
if (!fs.existsSync(conceptTypesPath) || !fs.existsSync(conceptValueTypesPath)) {
  // In a normal `npm run generate`, the prior extract scripts produce
  // both files before this one runs (see package.json `extract-types`
  // ordering). If they're missing, fall back to re-parsing the .g4 so
  // the completeness check is always enforced — never silently skipped.
  const conceptTypes = parseValidTypes('CONCEPT_TYPE');
  const conceptValueTypes = parseValidTypes('CONCEPT_VALUE_TYPE');
  console.warn(
    '[extractParameterTypes] source JSON not on disk yet — re-parsing CONCEPT_TYPE + CONCEPT_VALUE_TYPE from CRLLexer.g4 for the completeness check.'
  );
  const want = new Set([...conceptTypes, ...conceptValueTypes]);
  const have = new Set(parameterTypes);
  const missing = [...want].filter(t => !have.has(t));
  if (missing.length > 0) {
    console.error(
      'PARAMETER_TYPE allowlist is not a superset of (CONCEPT_TYPE ∪ CONCEPT_VALUE_TYPE). ' +
      `Add these entries to PARAMETER_TYPE in src/grammar/CRLLexer.g4: ${missing.join(', ')}`
    );
    process.exit(1);
  }
} else {
  const conceptTypes = JSON.parse(fs.readFileSync(conceptTypesPath, 'utf8'));
  const conceptValueTypes = JSON.parse(fs.readFileSync(conceptValueTypesPath, 'utf8'));
  const want = new Set([...conceptTypes, ...conceptValueTypes]);
  const have = new Set(parameterTypes);
  const missing = [...want].filter(t => !have.has(t));
  if (missing.length > 0) {
    console.error(
      'PARAMETER_TYPE allowlist is not a superset of (CONCEPT_TYPE ∪ CONCEPT_VALUE_TYPE). ' +
      `Add these entries to PARAMETER_TYPE in src/grammar/CRLLexer.g4: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}

// Dedup check (case-sensitive).
const seen = new Set();
const dupes = [];
for (const t of parameterTypes) {
  if (seen.has(t)) dupes.push(t);
  seen.add(t);
}
if (dupes.length > 0) {
  console.error(`Duplicate entries in PARAMETER_TYPE allowlist: ${dupes.join(', ')}`);
  process.exit(1);
}

fs.writeFileSync(outputPath, JSON.stringify(parameterTypes, null, 2));
console.log('Extracted parameter types:', parameterTypes);
