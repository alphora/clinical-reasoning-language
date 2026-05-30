#!/usr/bin/env node
// mine-frequent-subtrees.mjs
//
// Frequent-subtree mining over data/statements.jsonl. Distinguished from the
// rooted-signature inventory in mine-patterns.mjs by three things:
//
//   1) DOCUMENT FREQUENCY counting.
//      We bump a counter at most once per statement per signature, so a single
//      busy statement that uses the same shape in 50 places doesn't dwarf 50
//      different statements that each use it once. DF is the right metric for
//      "how widely is this pattern used."
//
//   2) AGGRESSIVE structural abstraction.
//      The old miner kept Property paths concrete (`.performed`, `.effective`),
//      ValueSet names concrete, ExpressionRef names concrete — so structurally
//      identical shapes were counted as different patterns. Here we collapse
//      those (and aliases/scopes/parameter names) so the patterns are about
//      SHAPE not LABEL. Kept concrete: operator type, FunctionRef name+library
//      (those are the "explicit pattern library"), Literal valueType, Retrieve
//      dataType (Encounter vs Condition matters), As asType.
//
//   3) MINIMUM-COMPLEXITY filter.
//      A pattern needs at least one level of composition. We drop:
//        - signatures with no parentheses (single nodes)
//        - signatures whose only structural child collapses to a wildcard
//        - signatures dominated by single-call FunctionRef shapes with leaf operands
//      What's left has actual structural shape.
//
// Plus a min-support threshold (DF >= MIN_SUPPORT) prunes the long tail.
//
// Outputs:
//   data/patterns/frequent-subtrees-d{2,3,4,5}.jsonl
//   results/mine-frequent-subtrees.report.md
//
// Re-running overwrites.

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const FEATURE      = path.resolve(__dirname, '..');
const STATEMENTS   = path.join(FEATURE, 'data', 'statements.jsonl');
const PATTERNS_OUT = path.join(FEATURE, 'data', 'patterns');
const RESULTS      = path.join(FEATURE, 'results');

const DEPTHS       = [2, 3, 4, 5];
const MIN_SUPPORT  = 10;            // pattern must appear in ≥ N distinct statements
const PER_DEPTH_TOP = 60;           // top-N per depth in the report

// --- ELM noise filtering (same set as mine-patterns.mjs) -------------------

const TYPE_SPECIFIER_TYPES = new Set([
  'NamedTypeSpecifier', 'IntervalTypeSpecifier', 'ListTypeSpecifier',
  'ChoiceTypeSpecifier', 'TupleTypeSpecifier',
]);
const WALK_SKIP_FIELDS = new Set([
  'signature', 'resultTypeSpecifier', 'parameterTypeSpecifier',
  'asTypeSpecifier', 'returnTypeSpecifier', 'elementTypeSpecifier',
]);
const DROP_FIELDS = new Set([
  'localId', 'id', 'version', 'locator',
  'startLine', 'startColumn', 'endLine', 'endColumn',
  'resultTypeName', 'resultTypeSpecifier', 'signature',
]);

function walk(node, visit, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, depth);
    return;
  }
  if (node.type && TYPE_SPECIFIER_TYPES.has(node.type)) return;
  visit(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type') continue;
    if (WALK_SKIP_FIELDS.has(k)) continue;
    walk(v, visit, depth + 1);
  }
}

// --- Canonical signature with aggressive abstraction -----------------------

function abstractScalar(v) {
  switch (typeof v) {
    case 'string':  return '#s';
    case 'number':  return '#n';
    case 'boolean': return '#b';
    default:        return '#?';
  }
}

// Coarsen a Retrieve dataType to just the resource name.
function coarseRetrieveType(dt) {
  if (typeof dt !== 'string') return '?';
  const m = dt.match(/}([A-Za-z]+)$/);
  return m ? m[1] : dt;
}

function signature(node, depth, maxDepth) {
  if (depth >= maxDepth) return '_';
  if (node === null || node === undefined) return '∅';
  if (typeof node !== 'object') return abstractScalar(node);
  if (Array.isArray(node)) {
    if (node.length === 0) return '[]';
    return '[' + node.map(n => signature(n, depth + 1, maxDepth)).join(',') + ']';
  }
  if (node.type && TYPE_SPECIFIER_TYPES.has(node.type)) return '<T>';
  const t = node.type || '?';

  // Header: keep concrete only the things that DEFINE a pattern. Abstract
  // everything else.
  let header;
  if (t === 'FunctionRef' && node.name) {
    header = `FunctionRef:${node.libraryName || '<>'}.${node.name}`;
  } else if (t === 'Literal' && node.valueType) {
    header = `Literal:${node.valueType.replace(/^\{[^}]*\}/, '')}`;
  } else if (t === 'As' && node.asType) {
    header = `As:${node.asType.replace(/^\{[^}]*\}/, '')}`;
  } else if (t === 'Retrieve' && node.dataType) {
    header = `Retrieve:${coarseRetrieveType(node.dataType)}`;
  } else {
    header = t;
  }

  // Field selection — these are STRUCTURAL children worth recursing into.
  // Most "name" / "path" / "alias" / "scope" fields are ABSTRACTED out of the
  // signature entirely: we don't want `Property:performed` and `Property:effective`
  // to be different patterns — at this layer, both are "Property access on a
  // FHIR resource".
  const STRUCTURAL = new Set([
    'operand', 'source', 'where', 'return', 'sort', 'let', 'relationship',
    'when', 'then', 'else', 'caseItem', 'comparand',
    'low', 'high', 'lowClosedExpression', 'highClosedExpression',
    'element', 'choice',
    'expression', 'suchThat',
    'codes', 'codeProperty', 'codeComparator',
    'dateProperty', 'dateRange', 'dateLowProperty', 'dateHighProperty',
    'isType', 'isTypeSpecifier',
    'starting', 'condition', 'next', 'mutual', 'unit',
    'operandRef', 'parameter',
    'argument',
  ]);
  // Some fields are kept literal (small enums that matter):
  const KEEP_LITERAL = new Set([
    'precision',     // hour/minute/day/year — temporal granularity matters
    'lowClosed', 'highClosed',  // open/closed intervals matter
    'unit',          // quantity unit at the structural level (60 'a' vs 60 'mo')
  ]);

  const keys = Object.keys(node)
    .filter(k => k !== 'type' && !DROP_FIELDS.has(k) && !WALK_SKIP_FIELDS.has(k))
    .filter(k => !(t === 'FunctionRef' && (k === 'name' || k === 'libraryName')))
    .filter(k => !(t === 'Literal' && k === 'valueType'))
    .filter(k => !(t === 'As' && k === 'asType'))
    .filter(k => !(t === 'Retrieve' && k === 'dataType'))
    .filter(k => STRUCTURAL.has(k) || KEEP_LITERAL.has(k))
    .sort();

  if (keys.length === 0) return header;
  const parts = keys.map(k => {
    const v = node[k];
    if (v === null || v === undefined) return null;
    if (KEEP_LITERAL.has(k) && typeof v !== 'object') return `${k}=${JSON.stringify(v)}`;
    if (typeof v !== 'object') return null;  // skip — non-structural scalar
    const childSig = signature(v, depth + 1, maxDepth);
    if (childSig === '_' || childSig === '∅') return null;  // skip pure wildcards
    return `${k}=${childSig}`;
  }).filter(Boolean);

  if (parts.length === 0) return header;
  return `${header}(${parts.join(',')})`;
}

// --- Complexity filter -----------------------------------------------------
//
// A "trivial" pattern is one with no internal structure: a single header,
// or a header wrapping just wildcards/leaves. We require AT LEAST 2 distinct
// node-types showing in the signature for it to count as a real pattern.
function isComplex(sig) {
  if (!sig.includes('(')) return false;                 // no children at all
  // Count occurrences of structural elements: alpha-prefixed names.
  const tokens = sig.match(/[A-Za-z][A-Za-z:.0-9]+/g) || [];
  // Filter out wildcards and abstract markers.
  const concrete = tokens.filter(t => t !== '_' && t !== 'T');
  // Need at least 2 concrete node types AND the signature has nested parens
  // (meaning composition, not just a single Function-with-leaf).
  const parenDepth = (sig.match(/\(/g) || []).length;
  return concrete.length >= 2 && parenDepth >= 2;
}

// --- Counter with per-signature example bookkeeping ------------------------

class DocFreqCounter {
  constructor(exampleLimit = 4) {
    this.df = new Map();           // signature -> { dfCount, totalOccurrences, examples }
    this.limit = exampleLimit;
  }
  // Called per statement-signature pair (with the actual occurrence count
  // within that statement, used for totalOccurrences only).
  observe(sig, occurrences, example) {
    let e = this.df.get(sig);
    if (!e) { e = { dfCount: 0, totalOccurrences: 0, examples: [] }; this.df.set(sig, e); }
    e.dfCount += 1;
    e.totalOccurrences += occurrences;
    if (e.examples.length < this.limit) e.examples.push(example);
  }
  filterAndSort(minSupport, complexOnly) {
    return [...this.df.entries()]
      .filter(([, v]) => v.dfCount >= minSupport)
      .filter(([k])  => !complexOnly || isComplex(k))
      .sort((a, b) => b[1].dfCount - a[1].dfCount);
  }
}

function shortJson(obj, maxLen = 500) {
  let s; try { s = JSON.stringify(obj); } catch { return '<unstringifiable>'; }
  return s.length <= maxLen ? s : s.slice(0, maxLen) + ` … (+${s.length - maxLen} chars)`;
}

async function main() {
  await fs.mkdir(PATTERNS_OUT, { recursive: true });
  await fs.mkdir(RESULTS,      { recursive: true });

  const counters = Object.fromEntries(DEPTHS.map(d => [d, new DocFreqCounter(4)]));
  let statementsProcessed = 0;
  let nodesWalked = 0;

  const rl = readline.createInterface({
    input: (await fs.open(STATEMENTS, 'r')).createReadStream(),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    statementsProcessed++;
    const expr = rec.def && rec.def.expression;
    if (!expr) continue;
    const meta = { lib: rec.library && rec.library.id, stmt: rec.name };

    // For each depth: per-statement (signature -> { occurrences, oneExample })
    const perStmt = Object.fromEntries(DEPTHS.map(d => [d, new Map()]));
    walk(expr, (node) => {
      nodesWalked++;
      for (const d of DEPTHS) {
        const sig = signature(node, 0, d);
        const m = perStmt[d];
        let e = m.get(sig);
        if (!e) { e = { occ: 0, sample: node }; m.set(sig, e); }
        e.occ++;
      }
    });
    // Now observe per-statement DF: one bump per (signature, statement).
    for (const d of DEPTHS) {
      for (const [sig, { occ, sample }] of perStmt[d]) {
        counters[d].observe(sig, occ, { ...meta, subtree: shortJson(sample, 400) });
      }
    }
  }

  // Filter, sort, write per-depth JSONL.
  const ranked = {};
  for (const d of DEPTHS) {
    const rows = counters[d].filterAndSort(MIN_SUPPORT, /*complexOnly*/ true);
    ranked[d] = rows;
    const fh = await fs.open(path.join(PATTERNS_OUT, `frequent-subtrees-d${d}.jsonl`), 'w');
    try {
      for (const [sig, v] of rows) {
        await fh.write(JSON.stringify({
          sig, df: v.dfCount, occurrences: v.totalOccurrences,
          examples: v.examples,
        }) + '\n');
      }
    } finally { await fh.close(); }
  }

  // Render report.
  const md = [];
  md.push('# mine-frequent-subtrees — discovery report (true FSM)');
  md.push('');
  md.push(`Ran over **${statementsProcessed}** statements, walked **${nodesWalked.toLocaleString()}** ELM nodes (TypeSpecifier subtrees skipped).`);
  md.push('');
  md.push(`Counting metric: **document frequency** (DF) — # of distinct statements whose expression tree contains a given subtree shape at least once. Min support = **${MIN_SUPPORT}**, complexity filter = at least 2 concrete node types AND ≥ 2 levels of paren-nesting.`);
  md.push('');
  md.push('Abstraction profile: Property paths, ValueSet/Expression/Parameter/Code names, aliases, and scopes are abstracted to `_`. Kept concrete: operator types, FunctionRef `<library>.<name>`, Literal `valueType`, As `asType`, Retrieve resource type (e.g. `Retrieve:Encounter`).');
  md.push('');

  for (const d of DEPTHS) {
    const rows = ranked[d];
    md.push(`## Depth ${d}`);
    md.push('');
    md.push(`**${rows.length}** complex patterns above DF=${MIN_SUPPORT}.`);
    md.push('');
    md.push('| # | DF | occ | pattern |');
    md.push('|---:|---:|---:|---|');
    rows.slice(0, PER_DEPTH_TOP).forEach(([sig, v], i) =>
      md.push(`| ${i + 1} | ${v.dfCount} | ${v.totalOccurrences} | \`${sig.replace(/\|/g, '\\|')}\` |`));
    md.push('');

    // Examples for the top 8 of each depth.
    md.push('<details><summary>Example call sites (first 8 patterns)</summary>');
    md.push('');
    for (const [sig, v] of rows.slice(0, 8)) {
      md.push(`**\`${sig.replace(/`/g, "'")}\`** — DF ${v.dfCount}, ${v.totalOccurrences} total occurrences`);
      for (const ex of v.examples) {
        md.push(`- \`${ex.lib}\` :: \`${ex.stmt}\``);
        if (ex.subtree) md.push(`  - subtree: \`${ex.subtree.replace(/`/g, "'")}\``);
      }
      md.push('');
    }
    md.push('</details>');
    md.push('');
  }

  await fs.writeFile(path.join(RESULTS, 'mine-frequent-subtrees.report.md'), md.join('\n'));

  console.log(`Done. ${statementsProcessed} statements, ${nodesWalked.toLocaleString()} nodes.`);
  for (const d of DEPTHS) {
    console.log(`  depth ${d}: ${ranked[d].length} complex patterns @ DF >= ${MIN_SUPPORT}`);
  }
  console.log(`Report: features/cql-pattern-mining/results/mine-frequent-subtrees.report.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
