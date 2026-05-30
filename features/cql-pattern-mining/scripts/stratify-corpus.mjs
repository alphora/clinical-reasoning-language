#!/usr/bin/env node
// stratify-corpus.mjs
//
// Partitions data/statements.jsonl by library role and identifies framework
// boilerplate within measure libraries. Foundation for sample selection +
// downstream Layer-1/2/3 mining.
//
// Roles:
//   measure        — primary clinical-logic libraries (CMS<num>FHIR<measure> etc.)
//   common         — domain commons (close to named clinical shapes; secondary signal)
//   helper         — pure implementation aids (out of scope; negative control set)
//   uncategorized  — flag for manual review
//
// Within measure libs, statement names are tagged as one of:
//   boilerplate    — quality-measure API skeleton (IP/Num/Den/SDE_*/Stratification_* etc.)
//   clinical       — the actual clinical reasoning defines we want to mine
//
// Output:
//   data/stratified.jsonl                — one record per statement w/ role + tag
//   results/stratification.report.md     — coverage summary, library partition tables

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const FEATURE    = path.resolve(__dirname, '..');
const STATEMENTS = path.join(FEATURE, 'data', 'statements.jsonl');
const OUT_FILE   = path.join(FEATURE, 'data', 'stratified.jsonl');
const REPORT     = path.join(FEATURE, 'results', 'stratification.report.md');

// --- library-role classification --------------------------------------------
//
// Built from the actual library inventory in this corpus. New corpora may
// require adding rows; uncategorized libraries are flagged in the report.

const HELPERS = new Set([
  'FHIRHelpers',
  'NHSNHelpers',
  'CumulativeMedicationDuration',
  'AlaraCommonFunctions',
]);

const COMMONS = new Set([
  // FHIR/QICore-shared clinical commons
  'QICoreCommon',
  'CQMCommon',
  'MATGlobalCommonFunctionsQICore4',
  'Status',
  // condition / context commons
  'Hospice',
  'PalliativeCare',
  'AdvancedIllnessandFrailty',
  'AHAOverall',
  'TJC',
  'TJCOverall',
  'TJCOverallFHIR4',
  'AdultOutpatientEncounters',
  'CMD',
  'CMDFHIR',
  'CMSConceptDictionary',
  'CMSConceptDictionaryFHIR',
  'SupplementalDataElements',
  'SupplementalDataElementsFHIR4',
  // disease-domain commons that show up
  'AHAheartFailureOutpatient',
  'VTEICU',
  'PCMaternal',
  'Antibiotic',
]);

function classifyLibrary(libId) {
  if (!libId) return 'uncategorized';
  if (HELPERS.has(libId)) return 'helper';
  if (COMMONS.has(libId)) return 'common';
  // measure-library naming heuristics: CMS123FHIR…, EXM…, plus a couple of measure-specific patterns
  if (/^CMS\d+/.test(libId)) return 'measure';
  if (/^EXM\d+/.test(libId)) return 'measure';
  // Some published measure libs have a leading PCS/HHRF/HHFI etc. — keep them measure if they look measure-shaped
  if (/^(PC|HHF|HHRF|CT)[A-Z][a-zA-Z]+$/.test(libId)) return 'measure';
  return 'uncategorized';
}

// --- framework-boilerplate name patterns within measure libs ----------------
//
// These are the quality-measure API skeleton — NOT clinical reasoning patterns.
// Excluded from mining; they're the framework, not the content.

const BOILERPLATE_PATTERNS = [
  /^Initial Population$/i,
  /^Numerator$/i,
  /^Numerator (Exclusions?|Exceptions?)$/i,
  /^Denominator$/i,
  /^Denominator (Exclusions?|Exceptions?)$/i,
  /^Measure Population$/i,
  /^Measure Population Exclusions?$/i,
  /^Measure Observation/i,
  /^Stratifier/i,
  /^Stratification/i,
  /^SDE /i,
  /^Supplemental Data Element/i,
];

function isBoilerplate(name) {
  if (!name) return false;
  return BOILERPLATE_PATTERNS.some(re => re.test(name));
}

// --- main -------------------------------------------------------------------

async function main() {
  await fs.mkdir(path.dirname(OUT_FILE),  { recursive: true });
  await fs.mkdir(path.dirname(REPORT),    { recursive: true });

  const rl = readline.createInterface({
    input: (await fs.open(STATEMENTS, 'r')).createReadStream(),
    crlfDelay: Infinity,
  });

  // Aggregations.
  const libRole       = new Map(); // libId -> role
  const libCounts     = new Map(); // libId -> { total, boilerplate, clinical }
  const totalsByRole  = new Map(); // role -> { stmts, libs:Set }
  const tagCounts     = new Map(); // 'clinical'|'boilerplate' -> count (within measure libs)
  const boilerplateByPattern = new Map(); // boilerplate name regex source -> count (within measure libs)

  let totalScanned = 0;
  const outFh = await fs.open(OUT_FILE, 'w');

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      totalScanned++;
      const rec = JSON.parse(line);
      const libId = rec.library && rec.library.id;
      const role  = classifyLibrary(libId);
      libRole.set(libId, role);

      const boilerplate = role === 'measure' && isBoilerplate(rec.name);
      const tag = role === 'measure' ? (boilerplate ? 'boilerplate' : 'clinical') : 'n/a';

      let lc = libCounts.get(libId);
      if (!lc) { lc = { total: 0, boilerplate: 0, clinical: 0 }; libCounts.set(libId, lc); }
      lc.total++;
      if (boilerplate) lc.boilerplate++;
      else if (role === 'measure') lc.clinical++;

      let rc = totalsByRole.get(role);
      if (!rc) { rc = { stmts: 0, libs: new Set() }; totalsByRole.set(role, rc); }
      rc.stmts++;
      rc.libs.add(libId);

      if (role === 'measure') {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        if (boilerplate) {
          // Track which boilerplate pattern matched (for report)
          const matched = BOILERPLATE_PATTERNS.find(re => re.test(rec.name));
          const key = matched ? matched.source : '<unknown>';
          boilerplateByPattern.set(key, (boilerplateByPattern.get(key) || 0) + 1);
        }
      }

      const out = {
        corpus:  rec.corpus,
        library: rec.library,
        role,
        name:    rec.name,
        tag,
        context: rec.context,
        defType: rec.def && rec.def.type,
        exprRoot: rec.def && rec.def.expression && rec.def.expression.type,
      };
      await outFh.write(JSON.stringify(out) + '\n');
    }
  } finally {
    await outFh.close();
  }

  // --- render report ---
  const md = [];
  md.push('# stratification — corpus partitioning report');
  md.push('');
  md.push(`Total statements scanned: **${totalScanned}**.`);
  md.push('');
  md.push('Roles: `measure` (primary mining target — clinical logic), `common` (close-to-named clinical shapes; secondary signal), `helper` (pure implementation aids; out of scope, used as negative control), `uncategorized` (flag for manual review).');
  md.push('');

  md.push('## Totals by role');
  md.push('');
  md.push('| Role | Libraries | Statements |');
  md.push('|---|---:|---:|');
  for (const [role, v] of [...totalsByRole.entries()].sort((a,b) => b[1].stmts - a[1].stmts)) {
    md.push(`| \`${role}\` | ${v.libs.size} | ${v.stmts} |`);
  }
  md.push('');

  md.push('## Measure-library content split (clinical vs boilerplate)');
  md.push('');
  md.push('Within measure libraries, statements are tagged `boilerplate` if their name matches the quality-measure API skeleton (Initial Population / Numerator / Denominator / Exclusions / Exceptions / Measure Population / Stratification / SDE_*). Everything else is `clinical` and goes into mining.');
  md.push('');
  md.push('| Tag | Count |');
  md.push('|---|---:|');
  for (const [t, c] of [...tagCounts.entries()].sort((a,b) => b[1] - a[1])) {
    md.push(`| \`${t}\` | ${c} |`);
  }
  md.push('');
  md.push('### Boilerplate patterns matched');
  md.push('');
  md.push('| Pattern (regex) | Count |');
  md.push('|---|---:|');
  for (const [p, c] of [...boilerplateByPattern.entries()].sort((a,b) => b[1] - a[1])) {
    md.push(`| \`${p}\` | ${c} |`);
  }
  md.push('');

  md.push('## Measure libraries (primary mining target)');
  md.push('');
  md.push('| Library | Total | Clinical | Boilerplate |');
  md.push('|---|---:|---:|---:|');
  const measureRows = [...libCounts.entries()]
    .filter(([lib]) => libRole.get(lib) === 'measure')
    .sort((a, b) => b[1].clinical - a[1].clinical);
  for (const [lib, v] of measureRows) {
    md.push(`| \`${lib}\` | ${v.total} | ${v.clinical} | ${v.boilerplate} |`);
  }
  md.push('');

  md.push('## Domain commons (secondary signal)');
  md.push('');
  md.push('| Library | Statements |');
  md.push('|---|---:|');
  for (const [lib, v] of [...libCounts.entries()].filter(([l]) => libRole.get(l) === 'common').sort((a,b) => b[1].total - a[1].total)) {
    md.push(`| \`${lib}\` | ${v.total} |`);
  }
  md.push('');

  md.push('## Implementation helpers (negative control)');
  md.push('');
  md.push('| Library | Statements |');
  md.push('|---|---:|');
  for (const [lib, v] of [...libCounts.entries()].filter(([l]) => libRole.get(l) === 'helper').sort((a,b) => b[1].total - a[1].total)) {
    md.push(`| \`${lib}\` | ${v.total} |`);
  }
  md.push('');

  const uncats = [...libCounts.entries()].filter(([l]) => libRole.get(l) === 'uncategorized');
  if (uncats.length) {
    md.push('## Uncategorized — review and add to the right bucket');
    md.push('');
    md.push('| Library | Statements |');
    md.push('|---|---:|');
    for (const [lib, v] of uncats.sort((a, b) => b[1].total - a[1].total)) {
      md.push(`| \`${lib}\` | ${v.total} |`);
    }
    md.push('');
  }

  await fs.writeFile(REPORT, md.join('\n'));

  console.log(`Done. ${totalScanned} statements partitioned to data/stratified.jsonl.`);
  console.log('Report: features/cql-pattern-mining/results/stratification.report.md');
  for (const [role, v] of [...totalsByRole.entries()].sort((a, b) => b[1].stmts - a[1].stmts)) {
    console.log(`  ${role.padEnd(15)} ${String(v.libs.size).padStart(4)} libs, ${String(v.stmts).padStart(5)} stmts`);
  }
  const clin = tagCounts.get('clinical') || 0;
  const bp   = tagCounts.get('boilerplate') || 0;
  console.log(`  measure-clinical    ${String(clin).padStart(5)} stmts (mining target)`);
  console.log(`  measure-boilerplate ${String(bp).padStart(5)} stmts (excluded)`);
}

main().catch(e => { console.error(e); process.exit(1); });
