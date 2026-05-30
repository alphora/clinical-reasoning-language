#!/usr/bin/env node
// mine-sample-bodies.mjs
//
// Layers 2 + 3 on the 12-measure sample (see results/sample-selection.md).
//
//   Layer 2 (body features) — per statement, extract clinical-assertion tags
//     from the body: root type, retrieved FHIR resources, function calls,
//     selection/aggregation/comparison/temporal flags. The tags abstract HOW
//     up to a recognizable WHAT signal; clusters of statements sharing tag
//     combos surface candidate intents.
//
//   Layer 3 (dependency graph) — per statement, list outgoing ExpressionRefs
//     (defines it depends on) so we can see compositional shapes across
//     defines within each library.
//
// Output:
//   data/sample-body-features.jsonl   one record per statement (all fields)
//   data/sample-dep-graph.jsonl       one record per library (graph nodes/edges)
//   results/mine-sample-bodies.report.md   Layer 2 clusters + Layer 3 compositions

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const FEATURE    = path.resolve(__dirname, '..');
const STATEMENTS = path.join(FEATURE, 'data', 'statements.jsonl');
const FEATURES_OUT = path.join(FEATURE, 'data', 'sample-body-features.jsonl');
const GRAPH_OUT  = path.join(FEATURE, 'data', 'sample-dep-graph.jsonl');
const REPORT     = path.join(FEATURE, 'results', 'mine-sample-bodies.report.md');

// The 12 sample measures (rationale in results/sample-selection.md).
const SAMPLE = new Set([
  'CMS69FHIRPCSBMIScreenAndFollowUp',
  'CMS22FHIRPCSBPScreeningFollowUp',
  'CMS122FHIRDiabetesAssessGT9Pct',
  'CMS165FHIRControllingHighBP',
  'CMS125FHIRBreastCancerScreen',
  'CMS108FHIRVTEProphylaxis',
  'CMS135FHIRACEIorARBorARNIforHF',
  'CMS128FHIRAntidepressantMgmt',
  'CMS0334FHIRPCCesareanBirth',
  'CMS117FHIRChildImmunStatus',
  'CMS139FHIRFallRiskScreening',
  'CMS1017FHIRHHFI',
]);

// Boilerplate-name patterns (same as stratifier; this script reads
// statements.jsonl directly so we re-apply).
const BOILERPLATE = [
  /^Initial Population$/i, /^Numerator$/i, /^Numerator (Exclusions?|Exceptions?)$/i,
  /^Denominator$/i, /^Denominator (Exclusions?|Exceptions?)$/i,
  /^Measure Population$/i, /^Measure Population Exclusions?$/i, /^Measure Observation/i,
  /^Stratifier/i, /^Stratification/i, /^SDE /i, /^Supplemental Data Element/i,
];
function isBoilerplate(name) { return BOILERPLATE.some(re => re.test(name || '')); }

const TYPE_SPECIFIER_TYPES = new Set([
  'NamedTypeSpecifier', 'IntervalTypeSpecifier', 'ListTypeSpecifier',
  'ChoiceTypeSpecifier', 'TupleTypeSpecifier',
]);
const WALK_SKIP_FIELDS = new Set([
  'signature', 'resultTypeSpecifier', 'parameterTypeSpecifier',
  'asTypeSpecifier', 'returnTypeSpecifier', 'elementTypeSpecifier',
]);

// Node-type categorisation — these signal clinical-assertion shape.
const SELECTION_TYPES   = new Set(['First', 'Last', 'SingletonFrom', 'Slice', 'IndexOf', 'Take']);
const AGGREGATION_TYPES = new Set(['Count', 'Sum', 'Min', 'Max', 'Avg', 'Median', 'StdDev', 'Variance']);
const COMPARISON_TYPES  = new Set(['Equal', 'NotEqual', 'Greater', 'GreaterOrEqual', 'Less', 'LessOrEqual', 'Equivalent']);
const TEMPORAL_REL_TYPES = new Set([
  'During', 'IncludedIn', 'Includes',
  'Before', 'After', 'On', 'OnOrBefore', 'OnOrAfter',
  'Overlaps', 'OverlapsBefore', 'OverlapsAfter',
  'Starts', 'Ends', 'Meets', 'MeetsBefore', 'MeetsAfter',
  'SameAs', 'SameOrBefore', 'SameOrAfter',
  'ProperContains', 'ProperIncludedIn',
  'Width', 'DurationBetween', 'DifferenceBetween',
]);
const SET_TYPES = new Set(['Union', 'Intersect', 'Except', 'In', 'Contains', 'AnyTrue', 'AllTrue']);

function coarseRetrieveType(dt) {
  if (typeof dt !== 'string') return '?';
  const m = dt.match(/}([A-Za-z]+)$/);
  return m ? m[1] : dt;
}

function summariseLiteral(node) {
  if (!node) return null;
  if (node.type === 'Literal') {
    return { valueType: (node.valueType || '').replace(/^\{[^}]*\}/, ''), value: node.value };
  }
  if (node.type === 'Quantity') {
    return { quantity: { value: node.value, unit: node.unit } };
  }
  if (node.type === 'Interval') return { intervalLiteral: true };
  return null;
}

function extractFeatures(expr) {
  const f = {
    rootType: (expr && expr.type) || null,
    retrieves: new Set(),
    functionRefs: new Set(),
    referencedExpressions: new Set(),
    nodeTypes: new Map(),
    selection: false,    // First/Last/SingletonFrom
    aggregation: false,  // Count/Sum/...
    comparison: false,   // Equal/Greater/...
    temporalRel: false,  // During/Before/...
    setOp: false,
    sortPresent: false,
    queryWithWhere: false,
    queryWithRelationship: false,  // with / without
    queryWithReturn: false,
    queryWithSort: false,
    hasNot: false,
    hasExists: false,
    hasAndOr: false,
    hasIf: false,
    hasCase: false,
    thresholdLiterals: [],
  };
  function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }
  (function walk(n) {
    if (n === null || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if (n.type && TYPE_SPECIFIER_TYPES.has(n.type)) return;

    const t = n.type;
    if (t) bump(f.nodeTypes, t);

    if (t === 'Retrieve' && n.dataType) f.retrieves.add(coarseRetrieveType(n.dataType));
    if (t === 'FunctionRef' && n.name)  f.functionRefs.add(`${n.libraryName || '<>'}.${n.name}`);
    if (t === 'ExpressionRef' && n.name) f.referencedExpressions.add(`${n.libraryName || ''}.${n.name}`);

    if (SELECTION_TYPES.has(t))   f.selection = true;
    if (AGGREGATION_TYPES.has(t)) f.aggregation = true;
    if (COMPARISON_TYPES.has(t))  f.comparison = true;
    if (TEMPORAL_REL_TYPES.has(t)) f.temporalRel = true;
    if (SET_TYPES.has(t))         f.setOp = true;
    if (t === 'Sort')             f.sortPresent = true;
    if (t === 'Not')              f.hasNot = true;
    if (t === 'Exists')           f.hasExists = true;
    if (t === 'And' || t === 'Or') f.hasAndOr = true;
    if (t === 'If')               f.hasIf = true;
    if (t === 'Case')             f.hasCase = true;

    if (t === 'Query') {
      if (n.where) f.queryWithWhere = true;
      if (Array.isArray(n.relationship) && n.relationship.length) f.queryWithRelationship = true;
      if (n.return) f.queryWithReturn = true;
      if (n.sort) f.queryWithSort = true;
    }

    // Capture threshold candidates: numeric literals or Quantity that operate
    // alongside a comparison operator at the parent. (Approximation: just
    // collect them; cluster step will look for comparison-with-literal.)
    if (t === 'Literal' || t === 'Quantity') {
      const s = summariseLiteral(n);
      if (s) f.thresholdLiterals.push(s);
    }

    for (const [k, v] of Object.entries(n)) {
      if (k === 'type') continue;
      if (WALK_SKIP_FIELDS.has(k)) continue;
      walk(v);
    }
  })(expr);

  return {
    rootType: f.rootType,
    retrieves: [...f.retrieves].sort(),
    functionRefs: [...f.functionRefs].sort(),
    referencedExpressions: [...f.referencedExpressions].sort(),
    distinctNodeTypes: f.nodeTypes.size,
    selection: f.selection,
    aggregation: f.aggregation,
    comparison: f.comparison,
    temporalRel: f.temporalRel,
    setOp: f.setOp,
    sortPresent: f.sortPresent,
    queryWithWhere: f.queryWithWhere,
    queryWithRelationship: f.queryWithRelationship,
    queryWithReturn: f.queryWithReturn,
    queryWithSort: f.queryWithSort,
    hasNot: f.hasNot,
    hasExists: f.hasExists,
    hasAndOr: f.hasAndOr,
    hasIf: f.hasIf,
    hasCase: f.hasCase,
    thresholdLiterals: f.thresholdLiterals.slice(0, 6),
  };
}

// Compute a small set of high-signal "tags" per statement — coarser than
// the feature record above. These are what we cluster on.
function inferTags(name, f) {
  const tags = new Set();

  // Selection patterns
  if (f.selection && f.sortPresent) tags.add('most-recent-or-earliest');
  else if (f.selection) tags.add('selection');

  // Negated existence
  if (f.hasNot && f.hasExists) tags.add('absence-of');
  // Plain existence over a Query
  else if (f.hasExists && f.queryWithWhere) tags.add('exists-with-criterion');
  else if (f.hasExists) tags.add('exists');

  // Comparison with literal — threshold
  if (f.comparison && f.thresholdLiterals.length > 0) tags.add('threshold-comparison');

  // Aggregation — counting / total / extremum
  if (f.aggregation) {
    if (f.nodeTypes && (f.nodeTypes.Count || true)) tags.add('aggregation');
  }

  // Temporal relation in body
  if (f.temporalRel) tags.add('temporal-rel');

  // Query with with/without — relationship between two case features
  if (f.queryWithRelationship) tags.add('case-feature-relationship');

  // Reason for not done — heuristic: name says "Reason for Not …" and references typically include a ValueSet of reasons
  if (/Reason for Not/i.test(name)) tags.add('not-done-with-reason');

  // Active at anchor
  if (/Active at|Active during|On Admission|At Discharge|Present on Admission/i.test(name)) tags.add('state-at-anchor');

  // History of
  if (/^History of|^Has History of|Prior MI|History Of/i.test(name)) tags.add('history-of');

  // Currently taking
  if (/Currently Taking/i.test(name)) tags.add('currently-taking');

  // Has-pattern — covered by the broader Layer-1 signal
  if (/^Has /i.test(name)) tags.add('has-predicate');

  // Encounter With / Qualifying Encounter
  if (/^(Encounter With|Qualifying Encounter|ED Encounter|Delivery Encounter)/i.test(name)) {
    tags.add('encounter-qualification');
  }

  // Most Recent in name
  if (/Most Recent/i.test(name)) tags.add('most-recent');
  // First / Earliest in name
  if (/^First |^Earliest |^Initial /i.test(name)) tags.add('first');

  // During / Within in name
  if (/During Measurement Period|during Measurement Period|in Measurement Period/i.test(name)) {
    tags.add('during-measurement-period');
  }
  if (/Within \d+ /i.test(name)) tags.add('within-window');
  if (/Day After|Day Of Or Day After|Prior to Encounter|Before Encounter|After Encounter/i.test(name)) {
    tags.add('temporal-offset-from-anchor');
  }

  // Pair: initial + follow-up
  if (/Initial and Follow Up|Initial and Followup/i.test(name)) tags.add('initial-followup-pair');

  // Threshold-named in name
  if (/Greater Than|Less Than|At Least|At Most|Equal to or Greater|or More|or Higher|Above|Below/i.test(name)) {
    tags.add('threshold-named');
  }
  return [...tags];
}

async function main() {
  await fs.mkdir(path.dirname(FEATURES_OUT), { recursive: true });
  await fs.mkdir(path.dirname(REPORT), { recursive: true });

  const rl = readline.createInterface({
    input: (await fs.open(STATEMENTS, 'r')).createReadStream(),
    crlfDelay: Infinity,
  });

  const featuresFh = await fs.open(FEATURES_OUT, 'w');
  const byTag = new Map();         // tag -> [{lib, name}, ...]
  const tagCount = new Map();      // tag -> count
  const byLib = new Map();         // lib -> {nodes:[], edges:[]}
  let inSampleCount = 0;
  let clinicalCount = 0;

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      const libId = rec.library && rec.library.id;
      if (!SAMPLE.has(libId)) continue;
      inSampleCount++;
      if (isBoilerplate(rec.name)) continue;
      clinicalCount++;

      const expr = rec.def && rec.def.expression;
      const f = expr ? extractFeatures(expr) : null;
      const tags = expr ? inferTags(rec.name, f) : [];

      const out = {
        lib: libId,
        name: rec.name,
        context: rec.context,
        defType: rec.def && rec.def.type,
        features: f,
        tags,
      };
      await featuresFh.write(JSON.stringify(out) + '\n');

      for (const t of tags) {
        if (!byTag.has(t)) byTag.set(t, []);
        byTag.get(t).push({ lib: libId, name: rec.name });
        tagCount.set(t, (tagCount.get(t) || 0) + 1);
      }

      let lib = byLib.get(libId);
      if (!lib) { lib = { nodes: [], edges: [] }; byLib.set(libId, lib); }
      lib.nodes.push(rec.name);
      for (const ref of (f && f.referencedExpressions) || []) {
        // Edges are intra-library only (cross-lib references are typically helper calls)
        const [refLib, refName] = ref.split(/\.(.+)/);
        if (!refLib || refLib === '' || refLib === libId.split('FHIR')[0]) {
          // Heuristic: empty libName = same library
          lib.edges.push({ from: rec.name, to: refName || refLib });
        }
      }
    }
  } finally {
    await featuresFh.close();
  }

  // Dump dep-graph
  const graphFh = await fs.open(GRAPH_OUT, 'w');
  try {
    for (const [libId, g] of byLib) {
      await graphFh.write(JSON.stringify({ lib: libId, nodes: g.nodes, edges: g.edges }) + '\n');
    }
  } finally { await graphFh.close(); }

  // --- render report ---
  const md = [];
  md.push('# Layer 2 / 3 mining on the 12-measure sample');
  md.push('');
  md.push(`Sample libraries: **${SAMPLE.size}**. Statements seen in sample: **${inSampleCount}**. Clinical (boilerplate excluded): **${clinicalCount}**.`);
  md.push('');
  md.push('Method:');
  md.push('- **Layer 2** — walk each statement\'s ELM body, extract feature flags (root expression type, retrieved FHIR resources, function refs called, presence of selection/aggregation/comparison/temporal-relation operators, sort, exists, not, and threshold literals). From features + name, derive coarse *clinical-intent tags*. Cluster on tags.');
  md.push('- **Layer 3** — record outgoing intra-library `ExpressionRef`s per statement → per-library dependency graph. Inspect for recurring compositional shapes.');
  md.push('');

  // ====================================
  // Layer 2: tag cluster summary
  // ====================================
  md.push('## Layer 2 — clinical-intent tag clusters');
  md.push('');
  md.push('Each statement may carry multiple tags (e.g. `most-recent` + `threshold-comparison` + `has-predicate`). Counts are per-statement occurrences of each tag in the clinical-sample population.');
  md.push('');
  md.push('| Tag | # stmts | example statements |');
  md.push('|---|---:|---|');
  const tagsSorted = [...tagCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, c] of tagsSorted) {
    const examples = byTag.get(tag).slice(0, 3).map(e => `\`${e.name}\` (${e.lib})`).join(' / ');
    md.push(`| \`${tag}\` | ${c} | ${examples} |`);
  }
  md.push('');

  // ====================================
  // Layer 2: cross-tag pivots that imply specific candidate intents
  // ====================================
  md.push('## Layer 2 — combined-tag pivots (suggested candidate intents)');
  md.push('');
  md.push('Cross-tag combinations are the bridge from feature flags to a candidate pattern name. Each row below: a combined-tag signature → the underlying intent it points to + a few example statements.');
  md.push('');

  // Read features file back to make this section.
  const records = [];
  const f2 = await fs.open(FEATURES_OUT, 'r');
  try {
    const rl2 = readline.createInterface({ input: f2.createReadStream(), crlfDelay: Infinity });
    for await (const line of rl2) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line));
    }
  } finally { await f2.close(); }

  function withTags(...required) {
    return records.filter(r => required.every(t => r.tags.includes(t)));
  }

  function reportCluster(title, intent, picks) {
    md.push(`### ${title}`);
    md.push('');
    md.push(`**${picks.length}** statements. Candidate intent: **${intent}**.`);
    md.push('');
    for (const r of picks.slice(0, 6)) {
      md.push(`- \`${r.name}\` (${r.lib}) — root: \`${r.features.rootType}\`, retrieves: [${r.features.retrieves.join(', ')}], tags: \`${r.tags.join(' + ')}\``);
    }
    if (picks.length > 6) md.push(`- … and ${picks.length - 6} more`);
    md.push('');
  }

  reportCluster('`most-recent` + selection sort', '`MostRecent(X)` — sort-and-take-most-recent of qualifying X',
    withTags('most-recent-or-earliest').filter(r => /Most Recent|Last/i.test(r.name)));
  reportCluster('`most-recent` + `threshold-comparison`', '`ThresholdOn(MostRecent(X))` — most-recent value crosses a threshold',
    withTags('most-recent', 'threshold-comparison'));
  reportCluster('`first` + temporal anchor', '`First(X[, period])` — earliest qualifying X in window',
    withTags('first'));
  reportCluster('`has-predicate` + `exists-with-criterion`', '`Has(X)` — exists qualifying evidence of X',
    withTags('has-predicate', 'exists-with-criterion'));
  reportCluster('`has-predicate` + `during-measurement-period`', '`HasDuring(X, period)` — Has(X) qualified to a period',
    withTags('has-predicate', 'during-measurement-period'));
  reportCluster('`absence-of`', '`Without(X)` — absence of qualifying evidence of X',
    withTags('absence-of'));
  reportCluster('`not-done-with-reason`', '`NotDoneWithReason(action, reason)` — expected action not done, with accepted reason',
    withTags('not-done-with-reason'));
  reportCluster('`state-at-anchor`', '`StateAtAnchor(X, anchor)` — clinical state as of an anchor point (admission/discharge/etc.)',
    withTags('state-at-anchor'));
  reportCluster('`encounter-qualification`', '`EncounterWith(criterion)` / `QualifyingEncounter(criterion)` — encounter qualified by clinical criterion',
    withTags('encounter-qualification'));
  reportCluster('`history-of`', '`HasHistoryOf(X)` — patient had X in the past',
    withTags('history-of'));
  reportCluster('`currently-taking`', '`CurrentlyTaking(med)` — patient currently on medication',
    withTags('currently-taking'));
  reportCluster('`initial-followup-pair`', '`AssessmentPair(initial, followup)` — initial + follow-up assessment paired',
    withTags('initial-followup-pair'));
  reportCluster('`threshold-comparison` (broader)', '`Threshold(value, op, target)` — generic threshold predicate',
    withTags('threshold-comparison'));
  reportCluster('`temporal-offset-from-anchor`', '`OffsetFromAnchor(X, anchor, offset)` — "Day After Procedure", "From Day Of Start Of Hospitalization To Day After Admission"',
    withTags('temporal-offset-from-anchor'));
  reportCluster('`aggregation` + counting', '`Count(events)` / `CountAtLeast(events, n)` — counting predicate',
    withTags('aggregation'));
  reportCluster('`within-window`', '`Within(X, window)` — bounded lookback / look-forward window',
    withTags('within-window'));
  reportCluster('`during-measurement-period` (without `has-predicate`)', '`During(event, period)` — event lives in a period (not embedded inside a Has)',
    withTags('during-measurement-period').filter(r => !r.tags.includes('has-predicate')));

  // ====================================
  // Layer 2: root-expression-type distribution in the sample
  // ====================================
  md.push('## Layer 2 — root expression types in the sample');
  md.push('');
  const rootCount = new Map();
  for (const r of records) {
    const t = r.features.rootType || '(none)';
    rootCount.set(t, (rootCount.get(t) || 0) + 1);
  }
  md.push('| Root | # |');
  md.push('|---|---:|');
  for (const [t, c] of [...rootCount.entries()].sort((a, b) => b[1] - a[1])) md.push(`| \`${t}\` | ${c} |`);
  md.push('');

  // ====================================
  // Layer 2: helper-call signatures in the sample (still useful as clinical-intent evidence,
  // even if helpers themselves are out-of-catalog)
  // ====================================
  md.push('## Layer 2 — helper functions called by sample statements (intent evidence)');
  md.push('');
  md.push('Function calls in the sample statements indicate which clinical intents already have named helpers in the corpus. We keep these as *evidence* for what intents to catalog — not as catalog entries.');
  md.push('');
  const fnCount = new Map();
  for (const r of records) for (const fn of r.features.functionRefs) fnCount.set(fn, (fnCount.get(fn) || 0) + 1);
  md.push('| Function | # callers in sample |');
  md.push('|---|---:|');
  for (const [fn, c] of [...fnCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) md.push(`| \`${fn}\` | ${c} |`);
  md.push('');

  // ====================================
  // Layer 3: dep-graph snapshot per library
  // ====================================
  md.push('## Layer 3 — per-library dependency-graph snapshot');
  md.push('');
  md.push('For each sample library, summary of the intra-library dependency graph (which clinical defines reference which others). Roots = top-level statements no one references; leaves = defines that reference no others. Mid-tier nodes are compositional patterns — that\'s where Layer-3 patterns live.');
  md.push('');
  md.push('| Library | Defines | Edges | Roots (no in-edges) | Leaves (no out-edges) |');
  md.push('|---|---:|---:|---:|---:|');
  for (const [libId, g] of byLib) {
    const inDeg = new Map();
    const outDeg = new Map();
    for (const n of g.nodes) { inDeg.set(n, 0); outDeg.set(n, 0); }
    for (const e of g.edges) {
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
      outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
    }
    const roots  = g.nodes.filter(n => inDeg.get(n) === 0).length;
    const leaves = g.nodes.filter(n => outDeg.get(n) === 0).length;
    md.push(`| \`${libId}\` | ${g.nodes.length} | ${g.edges.length} | ${roots} | ${leaves} |`);
  }
  md.push('');
  md.push('Note: framework-boilerplate names (IP/Num/Den) are still counted in this graph view because the dependency relation is itself the QM API skeleton. The clinical-reasoning compositions are the mid-tier subgraphs that *flow into* IP/Num/Den — those are the legitimate Layer-3 patterns (see north star).');
  md.push('');

  await fs.writeFile(REPORT, md.join('\n'));
  console.log(`Done. ${clinicalCount} clinical statements analysed across ${SAMPLE.size} sample libraries.`);
  console.log(`Report: features/cql-pattern-mining/results/mine-sample-bodies.report.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
