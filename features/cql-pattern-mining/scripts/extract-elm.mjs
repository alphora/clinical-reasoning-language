#!/usr/bin/env node
// extract-elm.mjs
//
// Walks every corpus under features/cql-pattern-mining/sources/, finds FHIR
// `Library` resources (standard IG layout: <corpus>/input/resources/library/*.json),
// and writes two derived artifacts per Library:
//
//   data/cql/<corpus>/<libId>.cql        decoded `text/cql` attachment
//   data/elm/<corpus>/<libId>.elm.json   decoded `application/elm+json`, SLIMMED for mining
//
// "Slimmed" means: keep only the parts of `library.*` needed to interpret
// `statements/def[]` bodies (identifier/schema/usings/includes/parameters/
// codeSystems/valueSets/codes/concepts/contexts/statements) and strip every
// `annotation` field recursively (per-node source-location + narrative — large
// and not used by structural mining; the original CQL source is preserved in
// data/cql/ for any inspection that needs line/col context).
//
// Side effects:
//   results/extract-elm.report.md    human-readable coverage report
//   results/extract-elm.report.json  machine-readable summary
//
// Re-running overwrites. `data/` and `sources/` are gitignored.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEATURE  = path.resolve(__dirname, '..');
const SOURCES  = path.join(FEATURE, 'sources');
const DATA_CQL = path.join(FEATURE, 'data', 'cql');
const DATA_ELM = path.join(FEATURE, 'data', 'elm');
const RESULTS  = path.join(FEATURE, 'results');

// library.* keys kept in the slim ELM. Everything needed to make `statements.def`
// bodies interpretable (references resolvable to a using/include/valueset/etc.),
// and nothing else. `annotation` at the library level is dropped via this list;
// `annotation` deeper in the tree is dropped by stripAnnotations().
const LIBRARY_KEEP = [
  'identifier', 'schemaIdentifier',
  'usings', 'includes', 'parameters',
  'codeSystems', 'valueSets', 'codes', 'concepts',
  'contexts', 'statements',
];

async function listCorpora() {
  const entries = await fs.readdir(SOURCES, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

async function findLibraryFiles(corpusDir) {
  // Standard FHIR IG layout: <corpus>/input/resources/library/*.json
  const libDir = path.join(corpusDir, 'input', 'resources', 'library');
  try {
    const entries = await fs.readdir(libDir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => path.join(libDir, e.name));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function attachmentsByType(libObj) {
  const map = {};
  for (const c of (libObj.content || [])) {
    if (c && c.contentType) map[c.contentType] = c;
  }
  return map;
}

function decodeText(attachment) {
  if (!attachment || !attachment.data) return null;
  return Buffer.from(attachment.data, 'base64').toString('utf8');
}

function decodeJson(attachment) {
  const text = decodeText(attachment);
  return text == null ? null : JSON.parse(text);
}

function stripAnnotations(obj) {
  if (Array.isArray(obj)) return obj.map(stripAnnotations);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'annotation') continue;
      out[k] = stripAnnotations(v);
    }
    return out;
  }
  return obj;
}

function slimElm(elm) {
  const lib = (elm && elm.library) || {};
  const kept = {};
  for (const k of LIBRARY_KEEP) {
    if (lib[k] !== undefined) kept[k] = lib[k];
  }
  return { library: stripAnnotations(kept) };
}

function summarizeSlim(slim) {
  const lib = slim.library || {};
  const usings = (lib.usings && lib.usings.def) || [];
  return {
    id:         lib.identifier && lib.identifier.id,
    version:    lib.identifier && lib.identifier.version,
    schema:     lib.schemaIdentifier && lib.schemaIdentifier.version,
    usings:     usings.map(u => `${u.localIdentifier || '?'}@${u.version || '?'}`),
    statements: ((lib.statements && lib.statements.def) || []).length,
  };
}

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }

async function processCorpus(corpus) {
  const corpusSrc    = path.join(SOURCES, corpus);
  const corpusCqlOut = path.join(DATA_CQL, corpus);
  const corpusElmOut = path.join(DATA_ELM, corpus);
  await fs.mkdir(corpusCqlOut, { recursive: true });
  await fs.mkdir(corpusElmOut, { recursive: true });

  const libs = await findLibraryFiles(corpusSrc);
  const s = {
    corpus,
    libraryFilesScanned: libs.length,
    hasCql: 0, hasElmXml: 0, hasElmJson: 0,
    cqlWritten: 0,
    elmSlimWritten: 0,
    totalStatements: 0,
    elmSlimBytes: 0,
    cqlBytes: 0,
    missingElmJson: [],
    nonLibraryResources: [],
    errors: [],
    schemaVersions: new Map(),
    usings: new Map(),
  };

  for (const libFile of libs) {
    const baseName = path.basename(libFile, '.json');
    let libObj;
    try {
      libObj = JSON.parse(await fs.readFile(libFile, 'utf8'));
    } catch (e) {
      s.errors.push({ file: baseName, stage: 'parseLibrary', message: e.message });
      continue;
    }
    if (libObj.resourceType !== 'Library') {
      s.nonLibraryResources.push({ file: baseName, resourceType: libObj.resourceType });
      continue;
    }
    const libId = libObj.id || baseName;
    const atts = attachmentsByType(libObj);

    // text/cql
    if (atts['text/cql']) {
      s.hasCql++;
      try {
        const cql = decodeText(atts['text/cql']);
        if (cql != null) {
          const cqlPath = path.join(corpusCqlOut, `${libId}.cql`);
          await fs.writeFile(cqlPath, cql);
          s.cqlWritten++;
          s.cqlBytes += Buffer.byteLength(cql);
        }
      } catch (e) {
        s.errors.push({ file: libId, stage: 'decodeCql', message: e.message });
      }
    }

    // application/elm+xml — counted only, not written (we mine on JSON)
    if (atts['application/elm+xml']) s.hasElmXml++;

    // application/elm+json — decode, slim, write
    if (atts['application/elm+json']) {
      s.hasElmJson++;
      try {
        const elm = decodeJson(atts['application/elm+json']);
        const slim = slimElm(elm);
        const text = JSON.stringify(slim, null, 2);
        const outPath = path.join(corpusElmOut, `${libId}.elm.json`);
        await fs.writeFile(outPath, text);
        s.elmSlimWritten++;
        s.elmSlimBytes += Buffer.byteLength(text);
        const sum = summarizeSlim(slim);
        if (sum.schema) bump(s.schemaVersions, sum.schema);
        for (const u of sum.usings) bump(s.usings, u);
        s.totalStatements += sum.statements;
      } catch (e) {
        s.errors.push({ file: libId, stage: 'decodeElmJson', message: e.message });
      }
    } else {
      s.missingElmJson.push(libId);
    }
  }
  return s;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function renderMarkdown(summaries) {
  const out = [];
  out.push('# extract-elm — coverage report');
  out.push('');
  out.push('Decoded CQL source + slimmed ELM JSON trees for each source corpus. Re-run with `node features/cql-pattern-mining/scripts/extract-elm.mjs`.');
  out.push('');
  out.push('Outputs:');
  out.push('- `data/cql/<corpus>/<libId>.cql` — decoded `text/cql` attachment (verbatim).');
  out.push('- `data/elm/<corpus>/<libId>.elm.json` — decoded `application/elm+json`, **slimmed**: only the `library.*` subset needed to interpret `statements/def` bodies, `annotation` stripped recursively. The original CQL source is in `data/cql/` if line/col context is needed.');
  out.push('');
  for (const s of summaries) {
    out.push(`## \`${s.corpus}\``);
    out.push('');
    out.push(`- Library JSONs scanned: **${s.libraryFilesScanned}**`);
    out.push(`- has \`text/cql\` attachment: ${s.hasCql} / ${s.libraryFilesScanned}`);
    out.push(`- has \`application/elm+xml\` attachment: ${s.hasElmXml} / ${s.libraryFilesScanned}`);
    out.push(`- has \`application/elm+json\` attachment: ${s.hasElmJson} / ${s.libraryFilesScanned}`);
    out.push(`- CQL files written to \`data/cql/${s.corpus}/\`: **${s.cqlWritten}** (${fmtBytes(s.cqlBytes)} total)`);
    out.push(`- slim ELM files written to \`data/elm/${s.corpus}/\`: **${s.elmSlimWritten}** (${fmtBytes(s.elmSlimBytes)} total)`);
    out.push(`- total ELM \`statements/def\` entries (the mining target): **${s.totalStatements}**`);
    if (s.missingElmJson.length) {
      out.push(`- libraries WITHOUT \`application/elm+json\` (would need local cql-to-elm to mine): **${s.missingElmJson.length}**`);
      for (const m of s.missingElmJson.slice(0, 10)) out.push(`  - \`${m}\``);
      if (s.missingElmJson.length > 10) out.push(`  - … and ${s.missingElmJson.length - 10} more`);
    }
    if (s.nonLibraryResources.length) {
      out.push(`- non-Library JSONs in the library/ folder (skipped): ${s.nonLibraryResources.length}`);
      for (const m of s.nonLibraryResources.slice(0, 5)) out.push(`  - \`${m.file}\` (resourceType: \`${m.resourceType || 'unknown'}\`)`);
    }
    if (s.errors.length) {
      out.push(`- errors: ${s.errors.length}`);
      for (const e of s.errors.slice(0, 10)) out.push(`  - \`${e.file}\` (${e.stage}): ${e.message}`);
    }
    out.push('');
    out.push('### ELM schema versions seen');
    out.push('');
    for (const [v, c] of [...s.schemaVersions.entries()].sort((a,b) => b[1]-a[1])) out.push(`- \`${v}\`: ${c}`);
    out.push('');
    out.push('### `using` model versions seen (model@version : count)');
    out.push('');
    for (const [u, c] of [...s.usings.entries()].sort((a,b) => b[1]-a[1])) out.push(`- \`${u}\`: ${c}`);
    out.push('');
  }
  return out.join('\n');
}

async function main() {
  await fs.mkdir(DATA_CQL, { recursive: true });
  await fs.mkdir(DATA_ELM, { recursive: true });
  await fs.mkdir(RESULTS,  { recursive: true });

  const corpora = await listCorpora();
  const summaries = [];
  for (const c of corpora) {
    process.stdout.write(`processing ${c}… `);
    const s = await processCorpus(c);
    process.stdout.write(`scanned ${s.libraryFilesScanned}, cql ${s.cqlWritten}, slim-elm ${s.elmSlimWritten}\n`);
    summaries.push(s);
  }

  await fs.writeFile(path.join(RESULTS, 'extract-elm.report.md'), renderMarkdown(summaries));
  const reportJson = summaries.map(s => ({
    ...s,
    schemaVersions: Object.fromEntries(s.schemaVersions),
    usings:         Object.fromEntries(s.usings),
  }));
  await fs.writeFile(path.join(RESULTS, 'extract-elm.report.json'), JSON.stringify(reportJson, null, 2));

  const dec = summaries.reduce((a, s) => a + s.elmSlimWritten, 0);
  const cql = summaries.reduce((a, s) => a + s.cqlWritten, 0);
  console.log(`\nDone. ${dec} slim ELM + ${cql} CQL files written across ${summaries.length} corpora.`);
  console.log(`Report: features/cql-pattern-mining/results/extract-elm.report.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
