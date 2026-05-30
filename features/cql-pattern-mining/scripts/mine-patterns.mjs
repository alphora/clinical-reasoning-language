#!/usr/bin/env node
// mine-patterns.mjs
//
// Two complementary analyses over data/statements.jsonl:
//
//   A) Function-call inventory (API-usage-mining style).
//      Every FunctionRef node is a named explicit reusable shape someone already
//      extracted into a function. Ranking call sites by (libraryName.name) reveals
//      the de facto "pattern library" the corpus uses.
//
//   B) Frequent-subtree signatures at depths 2, 3, 4.
//      For every node in every tree, emit a canonical signature of its rooted
//      subtree up to depth D. Scalar values + statement-local names are
//      abstracted to wildcards; operator type, FunctionRef name+library, and
//      Literal valueType are kept concrete. Frequency-count signatures across
//      the corpus -> implicit recurring shapes nobody extracted into a function.
//
// Outputs (all under features/cql-pattern-mining/):
//   data/patterns/function-refs.jsonl    one line per unique function ref
//   data/patterns/subtree-d{2,3,4}.jsonl one line per unique signature (top 500 each)
//   results/mine-patterns.report.md      human-readable top-N report with examples
//
// Re-running overwrites. `data/` is gitignored.

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const FEATURE       = path.resolve(__dirname, '..');
const STATEMENTS    = path.join(FEATURE, 'data', 'statements.jsonl');
const PATTERNS_OUT  = path.join(FEATURE, 'data', 'patterns');
const RESULTS       = path.join(FEATURE, 'results');

// Fields whose VALUE is part of the structural pattern (kept concrete):
//   - FunctionRef.name + libraryName  (the function being called identifies the pattern)
//   - Literal.valueType               (Boolean vs Integer vs Decimal matters)
//   - OperandRef.name                 (positional operand reference, useful for in-FunctionDef bodies)
//   - InstanceOf / As types           (`Quantity`, `Interval<Date>` etc.)
//   - relationship type (Such/With)
const KEEP_CONCRETE = new Set([
  // Already abstracted: scalar values become `#s`, `#n`, `#b`. These
  // exceptions promote specific FIELDS back to concrete-in-signature.
]);
// Fields to drop entirely from signatures (instance-specific, no structural value):
const DROP_FIELDS = new Set([
  'localId', 'id', 'version', 'locator',
  'startLine', 'startColumn', 'endLine', 'endColumn',
  'resultTypeName', 'resultTypeSpecifier',  // type-resolution; lots of noise, not the shape
  'signature',  // generic type signatures attached by translator
]);

function abstractScalar(v) {
  switch (typeof v) {
    case 'string': return '#s';
    case 'number': return '#n';
    case 'boolean': return '#b';
    default: return '#?';
  }
}

// Build the signature for a node up to maxDepth. Depth 0 is the node itself.
function signature(node, depth, maxDepth) {
  if (depth >= maxDepth) return '_';
  if (node === null || node === undefined) return '∅';
  if (typeof node !== 'object') return abstractScalar(node);
  if (Array.isArray(node)) {
    if (node.length === 0) return '[]';
    return '[' + node.map(n => signature(n, depth + 1, maxDepth)).join(',') + ']';
  }
  // Collapse all *TypeSpecifier subtrees to a compact marker — they're type
  // metadata, not behavioral pattern shape. We've already promoted asType /
  // dataType / etc. into header strings on parent nodes.
  if (node.type && TYPE_SPECIFIER_TYPES.has(node.type)) return '<T>';
  const t = node.type || '?';
  let header = t;
  if (t === 'FunctionRef' && node.name) {
    header = `FunctionRef:${node.libraryName || ''}.${node.name}`;
  } else if (t === 'Literal' && node.valueType) {
    header = `Literal:${node.valueType}`;
  } else if (t === 'OperandRef' && node.name) {
    header = `OperandRef:${node.name}`;
  } else if (t === 'AliasRef' && node.name) {
    header = `AliasRef:${node.name}`;
  } else if (t === 'NamedTypeSpecifier' && node.name) {
    header = `NamedTypeSpecifier:${node.name}`;
  } else if (t === 'As' && node.asType) {
    header = `As:${node.asType}`;
  } else if (t === 'Property' && node.path) {
    header = `Property:${node.path}`;
  } else if (t === 'Retrieve' && node.dataType) {
    // dataType is like {http://hl7.org/fhir}Encounter — keep it
    header = `Retrieve:${node.dataType.replace(/\{[^}]*\}/g, '')}`;
  }

  const keys = Object.keys(node)
    .filter(k => k !== 'type' && !DROP_FIELDS.has(k))
    .filter(k => !WALK_SKIP_FIELDS.has(k))
    .filter(k => !(t === 'FunctionRef' && (k === 'name' || k === 'libraryName')))
    .filter(k => !(t === 'Literal' && k === 'valueType'))
    .filter(k => !(t === 'OperandRef' && k === 'name'))
    .filter(k => !(t === 'AliasRef' && k === 'name'))
    .filter(k => !(t === 'NamedTypeSpecifier' && k === 'name'))
    .filter(k => !(t === 'As' && k === 'asType'))
    .filter(k => !(t === 'Property' && k === 'path'))
    .filter(k => !(t === 'Retrieve' && k === 'dataType'))
    // For Retrieves, drop codes (vs reference) — too specific. Keep templateId structure if present.
    .filter(k => !(t === 'Retrieve' && (k === 'codes' || k === 'codeProperty' || k === 'codeComparator')))
    .sort();

  if (keys.length === 0) return header;
  const parts = keys.map(k => {
    const v = node[k];
    if (v === null || v === undefined) return `${k}=∅`;
    if (typeof v !== 'object') return `${k}=${abstractScalar(v)}`;
    return `${k}=${signature(v, depth + 1, maxDepth)}`;
  });
  return `${header}(${parts.join(',')})`;
}

// ELM `*TypeSpecifier` nodes are type metadata (the translator inserts them
// everywhere — DateTime, Quantity, Interval<DateTime>, etc.). They are NOT
// behavioral patterns. We skip whole subtrees rooted at them.
const TYPE_SPECIFIER_TYPES = new Set([
  'NamedTypeSpecifier', 'IntervalTypeSpecifier', 'ListTypeSpecifier',
  'ChoiceTypeSpecifier', 'TupleTypeSpecifier',
]);

// Fields whose VALUE is type metadata (or generic noise) — don't recurse into.
// `signature` on FunctionRef is the resolved explicit type signature; the
// *TypeSpecifier fields are type annotations.
const WALK_SKIP_FIELDS = new Set([
  'signature',
  'resultTypeSpecifier',
  'parameterTypeSpecifier',
  'asTypeSpecifier',
  'returnTypeSpecifier',
  'elementTypeSpecifier',
]);

// Walks an ELM expression tree; calls visit(node, path) at every object node
// that isn't a TypeSpecifier. Skips known-noisy fields.
function walk(node, visit, path = []) {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walk(node[i], visit, [...path, i]);
    return;
  }
  if (node.type && TYPE_SPECIFIER_TYPES.has(node.type)) return; // skip type-spec subtree
  visit(node, path);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type') continue;
    if (WALK_SKIP_FIELDS.has(k)) continue;
    walk(v, visit, [...path, k]);
  }
}

// Tracks {count, examples[]} per key (signature or function ref).
class Counter {
  constructor(exampleLimit = 3) {
    this.map = new Map();
    this.limit = exampleLimit;
  }
  bump(key, example) {
    let e = this.map.get(key);
    if (!e) { e = { count: 0, examples: [] }; this.map.set(key, e); }
    e.count++;
    if (e.examples.length < this.limit) e.examples.push(example);
  }
  topN(n) {
    return [...this.map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, n);
  }
}

function shortJson(obj, maxLen = 600) {
  let s;
  try { s = JSON.stringify(obj); } catch { return '<unstringifiable>'; }
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + ` … (+${s.length - maxLen} chars)`;
}

async function main() {
  await fs.mkdir(PATTERNS_OUT, { recursive: true });
  await fs.mkdir(RESULTS,      { recursive: true });

  const funcRefs   = new Counter(5);
  const sigD2      = new Counter(3);
  const sigD3      = new Counter(3);
  const sigD4      = new Counter(3);

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

    walk(expr, (node, path) => {
      nodesWalked++;
      // (A) function-call inventory
      if (node.type === 'FunctionRef' && node.name) {
        const key = `${node.libraryName || ''}.${node.name}`;
        funcRefs.bump(key, { ...meta, path: path.join('.'), call: shortJson({
          type: 'FunctionRef',
          libraryName: node.libraryName,
          name: node.name,
          operandCount: (node.operand || []).length,
        }, 200) });
      }
      // (B) subtree signatures at depths 2/3/4
      // (Only count signatures from object nodes with structure — skip
      // bare scalars / arrays so we don't drown in noise.)
      const example = () => ({ ...meta, path: path.join('.'), subtree: shortJson(node, 700) });
      sigD2.bump(signature(node, 0, 2), example());
      sigD3.bump(signature(node, 0, 3), example());
      sigD4.bump(signature(node, 0, 4), example());
    });
  }

  // Write per-pattern JSONL files (top 500 per analysis).
  async function writeJsonl(name, topEntries) {
    const fh = await fs.open(path.join(PATTERNS_OUT, name), 'w');
    try {
      for (const [key, val] of topEntries) {
        await fh.write(JSON.stringify({ key, count: val.count, examples: val.examples }) + '\n');
      }
    } finally { await fh.close(); }
  }
  await writeJsonl('function-refs.jsonl', funcRefs.topN(500));
  await writeJsonl('subtree-d2.jsonl',    sigD2.topN(500));
  await writeJsonl('subtree-d3.jsonl',    sigD3.topN(500));
  await writeJsonl('subtree-d4.jsonl',    sigD4.topN(500));

  // Render markdown report.
  const md = [];
  md.push('# mine-patterns — discovery report');
  md.push('');
  md.push(`Ran over **${statementsProcessed}** statement records (\`data/statements.jsonl\`), walking **${nodesWalked.toLocaleString()}** ELM nodes. Two analyses:`);
  md.push('');
  md.push('- **A. Function-call inventory** — every `FunctionRef` node ranked by `<libraryName>.<name>`. Each top hit is a named, explicit reusable shape; this is the de facto "pattern library" the corpus is already using.');
  md.push('- **B. Frequent-subtree signatures** at depths 2/3/4. Implicit recurring shapes that aren\'t wrapped in a function — the buried patterns we have to *discover*.');
  md.push('');
  md.push('Full ranked lists are in `data/patterns/*.jsonl` (top 500 each, with up to 3 example call sites and a JSON-truncated subtree dump per example).');
  md.push('');

  function renderTopSection(title, topEntries, opts = {}) {
    const { showExample = true, limit = 30 } = opts;
    md.push(`## ${title}`);
    md.push('');
    md.push(`Top ${Math.min(limit, topEntries.length)} of ${topEntries.length} unique entries.`);
    md.push('');
    md.push('| # | count | key |');
    md.push('|---:|---:|---|');
    const slice = topEntries.slice(0, limit);
    slice.forEach(([k, v], i) => md.push(`| ${i+1} | ${v.count} | \`${k.replace(/\|/g, '\\|')}\` |`));
    md.push('');
    if (showExample) {
      md.push('<details><summary>Example call sites (first 5 entries)</summary>');
      md.push('');
      for (const [k, v] of slice.slice(0, 5)) {
        md.push(`**\`${k.replace(/`/g, "'")}\`** (count: ${v.count})`);
        for (const ex of v.examples) {
          md.push(`- \`${ex.lib}\` :: \`${ex.stmt}\` @ \`${ex.path || '<root>'}\``);
          if (ex.subtree)  md.push(`  - subtree: \`${ex.subtree.replace(/`/g, "'")}\``);
          if (ex.call)     md.push(`  - call: \`${ex.call.replace(/`/g, "'")}\``);
        }
        md.push('');
      }
      md.push('</details>');
      md.push('');
    }
  }

  renderTopSection('A. Function-call inventory (top 30 by call count)', funcRefs.topN(500), { limit: 30 });
  renderTopSection('B. Subtree signatures — depth 2 (broad shapes)',    sigD2.topN(500), { limit: 25 });
  renderTopSection('B. Subtree signatures — depth 3 (specific shapes)', sigD3.topN(500), { limit: 30 });
  renderTopSection('B. Subtree signatures — depth 4 (deep shapes)',     sigD4.topN(500), { limit: 30 });

  await fs.writeFile(path.join(RESULTS, 'mine-patterns.report.md'), md.join('\n'));
  console.log(`\nDone. ${statementsProcessed} statements, ${nodesWalked.toLocaleString()} nodes walked.`);
  console.log(`- ${funcRefs.map.size} unique function refs`);
  console.log(`- ${sigD2.map.size} unique depth-2 signatures`);
  console.log(`- ${sigD3.map.size} unique depth-3 signatures`);
  console.log(`- ${sigD4.map.size} unique depth-4 signatures`);
  console.log(`Report: features/cql-pattern-mining/results/mine-patterns.report.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
