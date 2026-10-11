#!/usr/bin/env node
// inventory.mjs — sha256 inventory of a tree, and a diff between two inventories.
//   node inventory.mjs snap <dir> <out.json> [--exclude node_modules,.git]
//   node inventory.mjs diff <a.json> <b.json>    -> added / removed / changed (bounded print, exit 1 if any)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const [cmd, a, b, ...rest] = process.argv.slice(2);
const ex = new Set(((rest.find(x => x.startsWith('--exclude')) || '--exclude=node_modules,.git').split('=')[1] || '').split(','));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (cmd === 'snap') {
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { if (ex.has(f)) continue; const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else files.push({ path: path.relative(a, p).replace(/\\/g, '/'), sha256: sha(p), bytes: st.size }); } })(a);
  files.sort((x, y) => x.path.localeCompare(y.path));
  const treeHash = crypto.createHash('sha256').update(files.map(f => f.path + ':' + f.sha256).join('\n')).digest('hex');
  fs.mkdirSync(path.dirname(b), { recursive: true }); fs.writeFileSync(b, JSON.stringify({ root: a, at: new Date().toISOString(), count: files.length, treeHash, files }, null, 2));
  console.log(JSON.stringify({ root: a, count: files.length, treeHash, out: b }));
} else if (cmd === 'diff') {
  const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'));
  const ma = new Map(A.files.map(f => [f.path, f.sha256])), mb = new Map(B.files.map(f => [f.path, f.sha256]));
  const added = [...mb.keys()].filter(k => !ma.has(k)), removed = [...ma.keys()].filter(k => !mb.has(k)), changed = [...ma.keys()].filter(k => mb.has(k) && mb.get(k) !== ma.get(k));
  console.log(JSON.stringify({ added: added.length, removed: removed.length, changed: changed.length, unchanged: ma.size - removed.length - changed.length }));
  for (const [t, l] of [['+', added], ['-', removed], ['~', changed]]) for (const p of l.slice(0, 40)) console.log(`${t} ${p}`);
  process.exit(added.length + removed.length + changed.length ? 1 : 0);
} else { console.error('usage: inventory.mjs snap <dir> <out.json> | diff <a.json> <b.json>'); process.exit(2); }
