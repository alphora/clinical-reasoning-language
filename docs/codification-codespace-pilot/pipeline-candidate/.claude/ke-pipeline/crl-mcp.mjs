#!/usr/bin/env node
// crl-mcp.mjs — pinned direct MCP caller for the accepted CRL bundle.
// Generalized from docs/adaptive-648-20260922/crl-call.mjs (same transport, same pins).
//
// Usage: node crl-mcp.mjs <request.json>
//   request = { cwd, calls: [{ name, arguments, out }], observe?: "<dir>" , label?: "..." }
// Every call's COMPLETE result is written to `out`; stdout gets one compact JSON line per call.
// Nothing large is printed. `observe` enables the qualified native-Parameters observer
// (capture.cjs via NODE_OPTIONS --require) writing raw engine exchanges under that dir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadPins } from './active-pins.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pins = loadPins();
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const k of ['server', 'driver', 'engine']) {
  if (!fs.existsSync(pins[k].path)) throw new Error(`pin missing: ${k} ${pins[k].path}`);
  const h = sha(pins[k].path);
  if (h !== pins[k].sha256) throw new Error(`pin mismatch: ${k} expected ${pins[k].sha256} got ${h}`);
}
const { Client } = await import(pins.mcpSdk + 'index.js');
const { StdioClientTransport } = await import(pins.mcpSdk + 'stdio.js');

const reqPath = process.argv[2];
if (!reqPath) throw new Error('usage: crl-mcp.mjs <request.json>');
const req = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
const env = { ...process.env, CRL_ENABLE_RESULTS: '1', JAVA_HOME: pins.javaHome };
if (req.observe) {
  fs.mkdirSync(req.observe, { recursive: true });
  env.NODE_OPTIONS = `--require=${path.join(here, 'capture.cjs')}`;
  env.CRL_OBSERVE_DIR = req.observe;
  env.TEMP = path.join(req.observe, 'engine-temp'); env.TMP = env.TEMP;
  fs.mkdirSync(env.TEMP, { recursive: true });
}
const transport = new StdioClientTransport({ command: pins.node, args: [pins.server.path], cwd: req.cwd || process.cwd(), env, stderr: 'pipe' });
const stderrPath = req.stderr || path.join(path.dirname(reqPath), path.basename(reqPath, '.json') + '.stderr.txt');
transport.stderr?.on('data', b => fs.appendFileSync(stderrPath, b));
const client = new Client({ name: 'ke-initial-implementation', version: '1.0.0' }, { capabilities: {} });
const receipts = [];
try {
  await client.connect(transport);
  for (const c of req.calls) {
    const started = new Date().toISOString();
    let result, error = null;
    try {
      result = c.name === 'listTools' ? await client.listTools() : await client.callTool({ name: c.name, arguments: c.arguments }, undefined, { timeout: c.timeoutMs || 7200000 });
    } catch (e) { error = String(e?.message || e); result = { isError: true, transportError: error }; }
    fs.mkdirSync(path.dirname(c.out), { recursive: true });
    fs.writeFileSync(c.out, JSON.stringify(result, null, 2));
    const r = { name: c.name, started, finished: new Date().toISOString(), isError: !!result.isError, out: c.out, bytes: fs.statSync(c.out).size, sha256: sha(c.out), transportError: error };
    receipts.push(r);
    console.log(JSON.stringify(r));
    if (error && req.stopOnError !== false) break;
  }
} finally { await client.close(); }
if (req.receipt) fs.writeFileSync(req.receipt, JSON.stringify({ request: reqPath, pins: { server: pins.server.sha256, driver: pins.driver.sha256, engine: pins.engine.sha256 }, calls: receipts }, null, 2));
