#!/usr/bin/env node
// Offline complete guide entries from the pinned full export; fetch is explicit.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveKitEntry, verifyKitCache } from './kit-cache-content.mjs';
import { loadPins } from './active-pins.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheRoot = path.join(here, 'kit-cache');
const usage = 'usage: kit-cache.mjs fetch | index|common|verify [hash] | search <text> [hash] | entry <id> [hash]';
const decode = p => {
  const envelope = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (envelope.isError) {
    const cause = envelope.transportError || envelope.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') || 'unspecified tool error';
    const error = new Error('guide tool failed: ' + cause + ' (' + p + ')');
    error.exitCode = envelope.transportError ? 1 : 2;
    throw error;
  }
  const body = envelope.content?.find(block => block.type === 'text')?.text;
  if (!body) throw new Error('guide tool returned no text: ' + p);
  return JSON.parse(body);
};

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const needsValue = ['entry', 'search'].includes(cmd);
  if (!['fetch', 'index', 'common', 'verify', 'entry', 'search'].includes(cmd) ||
      (cmd === 'fetch' && args.length !== 0) ||
      (needsValue && (!args[0]?.trim() || args.length > 2)) ||
      (!needsValue && cmd !== 'fetch' && args.length > 1)) throw new Error(usage);
  const pins = loadPins();

  if (cmd === 'fetch') {
    if (typeof pins.node !== 'string' || !pins.node.trim()) throw new Error('invalid node executable in pins.json');
    const tmp = path.join(cacheRoot, '_fetch');
    fs.mkdirSync(tmp, { recursive: true });
    const requestPath = path.join(tmp, 'request.json');
    const req = { cwd: here, calls: [
      { name: 'authoring_kit', arguments: { view: 'overview' }, out: path.join(tmp, 'overview.raw.json') },
      { name: 'authoring_kit', arguments: { view: 'full', format: 'json' }, out: path.join(tmp, 'full.raw.json') },
    ] };
    fs.writeFileSync(requestPath, JSON.stringify(req, null, 2));
    // A failed transport must not reuse an earlier successful response.
    for (const call of req.calls) fs.rmSync(call.out, { force: true });
    const result = spawnSync(pins.node, [path.join(here, 'crl-mcp.mjs'), requestPath], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error(result.error?.message || result.stderr || 'guide transport exited ' + result.status);
      return 1;
    }
    const overview = decode(req.calls[0].out), full = decode(req.calls[1].out);
    const hash = overview.fullContentHash;
    const verified = verifyKitCache(overview, full, hash);
    const dir = path.join(cacheRoot, hash);
    // Validate both responses before touching a previously usable cache.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'overview.json'), JSON.stringify(overview, null, 2));
    fs.writeFileSync(path.join(dir, 'full.json'), JSON.stringify(full, null, 2));
    fs.writeFileSync(path.join(dir, 'fetched.json'), JSON.stringify({ at: new Date().toISOString(),
      schemaVersion: overview.schemaVersion, fullContentHash: hash,
      contentMatchesAudit: overview.audit?.contentMatchesAudit,
      auditedRevision: overview.audit?.auditedRevision, pinnedKitHash: pins.kitHash,
      matchesPin: hash === pins.kitHash }, null, 2));
    // Known tool-owned directory under this script's cache root.
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(JSON.stringify({ ...verified, matchesPin: hash === pins.kitHash, dir }));
    return hash === pins.kitHash ? 0 : 3;
  }

  const hash = args[needsValue ? 1 : 0] ?? pins.kitHash;
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('invalid kit hash');
  const dir = path.join(cacheRoot, hash);
  if (!fs.existsSync(dir)) throw new Error('no cache for ' + hash + '; run: node kit-cache.mjs fetch');
  const overview = JSON.parse(fs.readFileSync(path.join(dir, 'overview.json'), 'utf8'));
  const full = JSON.parse(fs.readFileSync(path.join(dir, 'full.json'), 'utf8'));
  const verified = verifyKitCache(overview, full, hash);
  if (cmd === 'verify') console.log(JSON.stringify(verified));
  else if (cmd === 'index') {
    for (const entry of overview.index) console.log([entry.id, entry.title, entry.status || '', (entry.applicability || '').slice(0, 100)].join(' | '));
    console.log('# ' + verified.entries + ' verified index entries; hash ' + hash);
  } else if (cmd === 'common') {
    console.log(JSON.stringify({ schemaVersion: overview.schemaVersion, fullContentHash: hash,
      audit: overview.audit, introduction: overview.introduction }, null, 2));
  } else if (cmd === 'search') {
    const query = args[0].toLowerCase();
    for (const entry of overview.index) {
      if ([entry.id, entry.title, ...(entry.topics || []), ...(entry.aliases || [])].join(' ').toLowerCase().includes(query))
        console.log(entry.id + ' | ' + entry.title);
    }
  } else console.log(JSON.stringify(resolveKitEntry(overview, full, args[0]), null, 2));
  return 0;
}

try { process.exitCode = main(); }
catch (error) { console.error(error.message); process.exitCode = error.exitCode || 2; }
