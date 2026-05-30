#!/usr/bin/env node
// build-statement-corpus.mjs
//
// Reads slim ELM trees from data/elm/<corpus>/*.elm.json (written by
// extract-elm.mjs) and flattens every `library.statements.def[]` entry into
// one mining transaction. Output:
//
//   data/statements.jsonl  — streaming, one JSON object per line
//
// Each line:
//   { corpus, library: { id, version }, name, context, accessLevel, def: {...} }
//
// where `def` is the slim def (annotation already stripped upstream). One line
// = one statement = one mining transaction. Frequent-subtree miners ingest this
// kind of forest directly (each `def.expression` is a tree to mine).
//
// Re-running overwrites. `data/` is gitignored.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEATURE  = path.resolve(__dirname, '..');
const DATA_ELM = path.join(FEATURE, 'data', 'elm');
const OUT_FILE = path.join(FEATURE, 'data', 'statements.jsonl');
const RESULTS  = path.join(FEATURE, 'results');

async function listCorpora() {
  try {
    const entries = await fs.readdir(DATA_ELM, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function listElmFiles(corpus) {
  const dir = path.join(DATA_ELM, corpus);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.elm.json'))
    .map(e => path.join(dir, e.name));
}

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function main() {
  const handle = await fs.open(OUT_FILE, 'w');
  const summary = {
    corporaProcessed: 0,
    librariesProcessed: 0,
    statementsWritten: 0,
    bytesWritten: 0,
    byCorpus: {},
    byContext: new Map(),
    byDefType: new Map(),             // def.type — ExpressionDef vs FunctionDef etc.
    byExpressionType: new Map(),      // def.expression.type — the root expression kind
  };

  try {
    const corpora = await listCorpora();
    for (const corpus of corpora) {
      summary.corporaProcessed++;
      const cs = { libraries: 0, statements: 0 };
      summary.byCorpus[corpus] = cs;

      process.stdout.write(`processing ${corpus}… `);
      const elmFiles = await listElmFiles(corpus);
      for (const elmPath of elmFiles) {
        const elm = JSON.parse(await fs.readFile(elmPath, 'utf8'));
        const lib = (elm && elm.library) || {};
        const defs = (lib.statements && lib.statements.def) || [];
        const libRef = {
          id: (lib.identifier && lib.identifier.id) || path.basename(elmPath, '.elm.json'),
          version: lib.identifier && lib.identifier.version,
        };

        for (const def of defs) {
          const record = {
            corpus,
            library: libRef,
            name: def.name,
            context: def.context,
            accessLevel: def.accessLevel,
            def,
          };
          const line = JSON.stringify(record) + '\n';
          await handle.write(line);
          summary.statementsWritten++;
          summary.bytesWritten += Buffer.byteLength(line);
          cs.statements++;
          bump(summary.byContext, def.context || '(none)');
          bump(summary.byDefType, def.type || '(none)');
          if (def.expression && def.expression.type) bump(summary.byExpressionType, def.expression.type);
        }
        cs.libraries++;
        summary.librariesProcessed++;
      }
      process.stdout.write(`${cs.libraries} libraries, ${cs.statements} statements\n`);
    }
  } finally {
    await handle.close();
  }

  // Append a section to the existing extract-elm.report.md.
  const reportPath = path.join(RESULTS, 'extract-elm.report.md');
  let md = '';
  try { md = await fs.readFile(reportPath, 'utf8'); } catch {}
  // Drop any prior per-statement section so re-runs don't pile up.
  const marker = '\n## Per-statement mining corpus\n';
  const cut = md.indexOf(marker);
  if (cut !== -1) md = md.slice(0, cut);
  md += marker + '\n';
  md += 'Aggregated from `data/elm/<corpus>/*.elm.json` into a single streaming file:\n\n';
  md += `- \`data/statements.jsonl\` — one mining transaction (\`statements/def\` entry) per line, with corpus + library envelope. Each \`def.expression\` is a tree the subtree miner will ingest.\n`;
  md += `- Total records: **${summary.statementsWritten}** from ${summary.librariesProcessed} libraries across ${summary.corporaProcessed} corpora.\n`;
  md += `- File size: ${fmtBytes(summary.bytesWritten)}.\n\n`;
  md += '### `def.type` distribution\n\n';
  for (const [t, c] of [...summary.byDefType.entries()].sort((a,b) => b[1]-a[1])) md += `- \`${t}\`: ${c}\n`;
  md += '\n### `def.context` distribution\n\n';
  for (const [t, c] of [...summary.byContext.entries()].sort((a,b) => b[1]-a[1])) md += `- \`${t}\`: ${c}\n`;
  md += '\n### Top 20 root `def.expression.type` (mining-target root kinds)\n\n';
  const sortedTypes = [...summary.byExpressionType.entries()].sort((a,b) => b[1]-a[1]);
  for (const [t, c] of sortedTypes.slice(0, 20)) md += `- \`${t}\`: ${c}\n`;
  md += '\n';
  await fs.writeFile(reportPath, md);

  await fs.writeFile(path.join(RESULTS, 'build-statement-corpus.report.json'), JSON.stringify({
    ...summary,
    byCorpus: summary.byCorpus,
    byContext: Object.fromEntries(summary.byContext),
    byDefType: Object.fromEntries(summary.byDefType),
    byExpressionType: Object.fromEntries(summary.byExpressionType),
  }, null, 2));

  console.log(`\nDone. ${summary.statementsWritten} statements -> data/statements.jsonl (${fmtBytes(summary.bytesWritten)}).`);
  console.log('Report appended: features/cql-pattern-mining/results/extract-elm.report.md');
}

main().catch(e => { console.error(e); process.exit(1); });
