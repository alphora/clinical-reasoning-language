#!/usr/bin/env node
// mine-names.mjs
//
// Layer 1 of the three-layer signal mining. Statement names in measure
// libraries are the informaticist's own articulation of intent. We extract
// intent-bearing PHRASES (leading + trailing n-grams) from non-boilerplate
// measure-library statement names, normalize, and cluster on those phrases.
//
// Intent phrases are sequences like:
//   "Most Recent ..."     -> MostRecent
//   "First ... During ..." -> First, FirstDuring
//   "... Performed"        -> Performed
//   "... During Hospitalization" -> DuringHospitalization
//   "Has History of ..."   -> HasHistoryOf
//
// Output:
//   data/patterns/name-intent-prefixes.jsonl    leading n-grams (with example names)
//   data/patterns/name-intent-suffixes.jsonl    trailing n-grams (with example names)
//   results/mine-names.report.md                top intent phrases + counts + examples
//
// Re-running overwrites. `data/` is gitignored.

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const FEATURE    = path.resolve(__dirname, '..');
const STRATIFIED = path.join(FEATURE, 'data', 'stratified.jsonl');
const OUT_DIR    = path.join(FEATURE, 'data', 'patterns');
const REPORT     = path.join(FEATURE, 'results', 'mine-names.report.md');

// Words that carry CLINICAL INTENT (temporal, relational, comparison, state predicates).
// Names rich in these — at the leading or trailing edge — are the strongest
// signals of a `apply pattern <Intent>(args)` candidate.
const INTENT_HEAD = new Set([
  'Most', 'Latest', 'Recent', 'First', 'Last', 'Earliest', 'Initial', 'Final',
  'Prior', 'Current', 'Active', 'History', 'Recent', 'Past', 'Previous',
  'Has', 'Is', 'Was', 'Had',
  'Documented', 'Verified', 'Confirmed', 'Asserted',
  'No', 'Not', 'Without', 'Exists',
  'Greater', 'Less', 'At', 'Above', 'Below', 'Within', 'Between', 'Outside',
  'Patient', 'Subject', 'Encounter', 'Episode',  // common subject leads
  'During', 'Before', 'After', 'Since', 'Until', 'When',
  'Number', 'Count', 'Sum', 'Total',
  'Days', 'Months', 'Years',
  'Following', 'Followup', 'Follow',
]);

// Trailing words that signal completed intent shapes.
const INTENT_TAIL = new Set([
  'Period', 'Interval', 'Window', 'Range',
  'Performed', 'Ordered', 'Done', 'Completed', 'Started', 'Discontinued', 'Resolved',
  'Verified', 'Confirmed', 'Asserted', 'Active', 'Inactive',
  'Documented', 'Recorded', 'Reported',
  'Found', 'Detected',
  'Hospitalization', 'Admission', 'Discharge', 'Visit', 'Encounter',
  'Onset', 'Resolution',
  'Lookback', 'FollowUp', 'Followup',
  'Year', 'Years', 'Month', 'Months', 'Day', 'Days',
  'High', 'Low', 'Normal', 'Abnormal',
  'Present', 'Absent', 'Excluded', 'Included',
  'Exception', 'Exclusion', 'Indication', 'Contraindication',
]);

function tokenize(name) {
  return name.trim().split(/\s+/).filter(Boolean);
}

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function bumpEx(map, key, example, limit = 5) {
  let v = map.get(key);
  if (!v) { v = { count: 0, examples: [] }; map.set(key, v); }
  v.count++;
  if (v.examples.length < limit) v.examples.push(example);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(REPORT), { recursive: true });

  const rl = readline.createInterface({
    input: (await fs.open(STRATIFIED, 'r')).createReadStream(),
    crlfDelay: Infinity,
  });

  // n-gram counters keyed by the n-gram string.
  const prefix1 = new Map(), prefix2 = new Map(), prefix3 = new Map();
  const suffix1 = new Map(), suffix2 = new Map(), suffix3 = new Map();
  // Bigram pairs that span the name (head + tail signals).
  const headTail = new Map();
  // Counts.
  let totalScanned = 0;
  let measureClinical = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalScanned++;
    const rec = JSON.parse(line);
    if (rec.role !== 'measure' || rec.tag !== 'clinical') continue;
    measureClinical++;
    const toks = tokenize(rec.name);
    if (toks.length === 0) continue;
    const ex = { name: rec.name, lib: rec.library && rec.library.id };

    // Prefixes — every name contributes its leading 1, 2, 3 tokens.
    bumpEx(prefix1, toks.slice(0, 1).join(' '), ex);
    if (toks.length >= 2) bumpEx(prefix2, toks.slice(0, 2).join(' '), ex);
    if (toks.length >= 3) bumpEx(prefix3, toks.slice(0, 3).join(' '), ex);
    // Suffixes — every name contributes its trailing 1, 2, 3 tokens.
    bumpEx(suffix1, toks.slice(-1).join(' '), ex);
    if (toks.length >= 2) bumpEx(suffix2, toks.slice(-2).join(' '), ex);
    if (toks.length >= 3) bumpEx(suffix3, toks.slice(-3).join(' '), ex);

    // Head-tail bigram: combine the first significant intent word + last significant intent word.
    const head = toks[0];
    const tail = toks[toks.length - 1];
    if (INTENT_HEAD.has(head) || INTENT_TAIL.has(tail)) {
      bumpEx(headTail, `${head} … ${tail}`, ex);
    }
  }

  // Filter and rank.
  function topByIntent(map, intentSet, minCount = 3) {
    return [...map.entries()]
      .filter(([k, v]) => v.count >= minCount && k.split(' ').some(w => intentSet.has(w)))
      .sort((a, b) => b[1].count - a[1].count);
  }
  function top(map, minCount = 3) {
    return [...map.entries()]
      .filter(([, v]) => v.count >= minCount)
      .sort((a, b) => b[1].count - a[1].count);
  }

  const intentPrefixes1 = topByIntent(prefix1, INTENT_HEAD);
  const intentPrefixes2 = topByIntent(prefix2, INTENT_HEAD);
  const intentPrefixes3 = topByIntent(prefix3, INTENT_HEAD);
  const intentSuffixes1 = topByIntent(suffix1, INTENT_TAIL);
  const intentSuffixes2 = topByIntent(suffix2, INTENT_TAIL);
  const intentSuffixes3 = topByIntent(suffix3, INTENT_TAIL);
  const allPrefixes2 = top(prefix2, 5);
  const allSuffixes2 = top(suffix2, 5);
  const headTailTop = top(headTail, 3);

  // Write JSONL outputs.
  async function writeJsonl(filename, rows) {
    const fh = await fs.open(path.join(OUT_DIR, filename), 'w');
    try {
      for (const [key, val] of rows) {
        await fh.write(JSON.stringify({ key, count: val.count, examples: val.examples }) + '\n');
      }
    } finally { await fh.close(); }
  }
  await writeJsonl('name-intent-prefixes.jsonl', [...prefix1, ...prefix2, ...prefix3]
    .filter(([k, v]) => v.count >= 3 && k.split(' ').some(w => INTENT_HEAD.has(w)))
    .sort((a, b) => b[1].count - a[1].count));
  await writeJsonl('name-intent-suffixes.jsonl', [...suffix1, ...suffix2, ...suffix3]
    .filter(([k, v]) => v.count >= 3 && k.split(' ').some(w => INTENT_TAIL.has(w)))
    .sort((a, b) => b[1].count - a[1].count));

  // Render markdown report.
  const md = [];
  md.push('# mine-names — Layer 1 report');
  md.push('');
  md.push(`Ran over **${measureClinical}** measure-library *clinical* statement names (boilerplate + non-measure libs excluded).`);
  md.push('');
  md.push('Method: for each statement name, extract leading n-grams (1/2/3) and trailing n-grams (1/2/3). Count across the corpus. Filter to phrases containing at least one *intent word* from a curated intent vocabulary (temporal/relational/state/comparison words like `Most`, `First`, `During`, `Without`, `Performed`, `Hospitalization`, etc.). Rank by count.');
  md.push('');
  md.push('Each phrase below is a CANDIDATE intent label — the leading or trailing edge of the informaticist\'s own articulation. The pattern name comes from naming the *underlying clinical intent*, not from the phrase itself.');
  md.push('');

  function renderTable(title, rows, limit = 25) {
    md.push(`## ${title}`);
    md.push('');
    md.push(`Top ${Math.min(limit, rows.length)} of ${rows.length} phrases meeting the threshold.`);
    md.push('');
    md.push('| # | count | phrase | example statements |');
    md.push('|---:|---:|---|---|');
    rows.slice(0, limit).forEach(([phrase, v], i) => {
      const ex = v.examples.slice(0, 3).map(e => `\`${e.name}\` (${e.lib})`).join(' / ');
      md.push(`| ${i + 1} | ${v.count} | \`${phrase}\` | ${ex} |`);
    });
    md.push('');
  }

  renderTable('Leading 2-grams (intent prefixes — what comes first carries intent)', intentPrefixes2, 30);
  renderTable('Leading 3-grams (intent prefixes)', intentPrefixes3, 25);
  renderTable('Trailing 2-grams (intent suffixes — what comes last carries intent)', intentSuffixes2, 30);
  renderTable('Trailing 3-grams (intent suffixes)', intentSuffixes3, 25);
  renderTable('Single intent words (head)', intentPrefixes1, 20);
  renderTable('Single intent words (tail)', intentSuffixes1, 20);
  renderTable('Head … tail combinations (intent at both ends)', headTailTop, 25);
  renderTable('All 2-token prefixes (intent + non-intent; broader signal)', allPrefixes2, 30);
  renderTable('All 2-token suffixes', allSuffixes2, 25);

  await fs.writeFile(REPORT, md.join('\n'));
  console.log(`Done. ${measureClinical} clinical measure-statement names mined.`);
  console.log(`Report: features/cql-pattern-mining/results/mine-names.report.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
