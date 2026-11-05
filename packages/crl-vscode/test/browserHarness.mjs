import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const browserExecutable = [process.env.CRL_BROWSER_EXECUTABLE,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'].find(path => path && existsSync(path));

/** Own an isolated browser and temporary profile; never connect to the operator's browser. */
export async function browserFixture(html) {
  if (!browserExecutable) throw Error('No test browser executable');
  const root = mkdtempSync(join(tmpdir(), 'crl-browser-'));
  const file = join(root, 'fixture.html'); writeFileSync(file, html);
  const child = spawn(browserExecutable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + join(root, 'profile'), pathToFileURL(file).href], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', spawnError;
  child.stderr.on('data', value => { stderr += value; }); child.on('error', error => { spawnError = error; });
  const sockets = new Set();
  const until = async (fn, label) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (spawnError) throw spawnError;
      const value = await fn(); if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw Error('Browser timeout: ' + label + '\n' + stderr.slice(-1000));
  };
  try {
    const port = await until(() => /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(stderr)?.[1], 'owned debug port');
    const target = await until(async () => (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page'), 'page');
    const socket = new WebSocket(target.webSocketDebuggerUrl); sockets.add(socket);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let next = 0; const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data), task = pending.get(message.id);
      if (!task) return; pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(Error(JSON.stringify(message.error))); else task.resolve(message.result);
    };
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 10000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    await until(() => evaluate('document.readyState === "complete"'), 'loaded fixture');
    return { evaluate, rpc, until, async close() {
      try { await rpc('Browser.close'); } catch {} finally {
        for (const socket of sockets) socket.close();
        if (child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
        if (child.exitCode === null) child.kill();
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    } };
  } catch (error) { for (const socket of sockets) socket.close(); child.kill(); throw error; }
}
