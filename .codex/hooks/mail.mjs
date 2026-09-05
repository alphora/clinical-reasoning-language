// One bounded mail connection per tick. No sends, claims, or idle listener.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(root, '.codex/lifecycle.local.json'), 'utf8'));
let input = '';
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input);
if (typeof payload.session_id !== 'string' || !payload.session_id.trim()) throw Error('Missing runtime session_id');
const require = createRequire(path.join(root, 'packages/crl/package.json'));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StdioClientTransport, getDefaultEnvironment } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')));
const env = { ...getDefaultEnvironment(), ...config.mail.env };
for (const name of config.mail.env_vars ?? []) if (process.env[name] !== undefined) env[name] = process.env[name];
let transport;
const budget = Math.max(1000, Math.min(9000, Number(process.env.CRL_MAIL_DEADLINE_MS) || 9000));
const deadline = setTimeout(() => { try { if (transport?.pid) process.kill(transport.pid); } finally { process.exit(1); } }, budget);
if (payload.hook_event_name === 'PostToolUse') {
  const renewal = spawnSync(config.node, [config.renew, 'renew', '--format', 'hook'], { input, env, cwd: root, timeout: 1500, windowsHide: true });
  if (renewal.error || renewal.status !== 0) process.stdout.write('Mail renewal failed; renew manually.\n');
}
const key = createHash('sha256').update(payload.session_id).digest('hex');
const cache = path.join(config.historyRoot, `mail-${key}.json`);
let previous = {};
try { previous = JSON.parse(await fs.readFile(cache)); } catch {}
if (payload.hook_event_name === 'PostToolUse') {
  if (Date.now() - previous.time < 60000) process.exit(0);
}
transport = new StdioClientTransport({ command: config.mail.command, args: config.mail.args, env, cwd: root, stderr: 'ignore' });
const client = new Client({ name: 'crl-codex-lifecycle', version: '1.0.0' });
// The total deadline includes renewal, initialization, requests and cleanup.
try {
  await client.connect(transport);
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 1500 });
    if (r.isError) throw Error(`${name} failed`);
    return JSON.parse(r.content.find(x => x.type === 'text').text);
  };
  const registered = await call('register', { endpoint_id: payload.session_id });
  if (registered.endpointId !== payload.session_id) throw Error('Registration identity mismatch');
  const inbox = await call('inbox', {});
  const sent = await call('sent', { endpoint_id: payload.session_id, limit: 100 });
  const received = await call('received', { endpoint_id: payload.session_id, limit: 100 });
  // Hash complete responses so answer changes are detected regardless of schema.
  // Peer bodies never enter hook context; the lead fetches complete mail via MCP.
  const digest = createHash('sha256').update(JSON.stringify({ inbox, sent, received })).digest('hex');
  if (payload.hook_event_name !== 'PostToolUse' || inbox.inbox?.length || previous.digest !== digest) {
    const overview = { inboxCount: inbox.inbox?.length ?? 0, sentCount: sent.sent?.length ?? 0, receivedCount: received.received?.length ?? 0 };
    process.stdout.write(`Vibe-mail runtime endpoint: ${registered.endpointId}. Use this exact ID for this session. Mail state: ${JSON.stringify(overview)}. Retrieval is capped at 100 per direction; these counts are not a complete reporting summary. Query full inbox, sent and received through MCP before reporting; inspect older outstanding and expired exchanges.\n`);
  }
  const tmp = cache + '.' + process.pid;
  await fs.writeFile(tmp, JSON.stringify({ time: Date.now(), digest }));
  await fs.rename(tmp, cache);
} finally {
  await client.close();
  clearTimeout(deadline);
}
