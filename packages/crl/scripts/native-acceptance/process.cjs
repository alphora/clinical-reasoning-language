'use strict';
// REFACTOR:grounded — bounded isolated acceptance children; no worker reuse before confirmed termination.
const { spawn, execFile } = require('node:child_process');
const { killTreeCommand } = require('../../dist/results/spawn');

function childEnvironment(dir, inherited = process.env) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (/^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS|CLASSPATH|LOADER_.*|SPRING_.*)$/i.test(key)) delete env[key];
  }
  env.TEMP = env.TMP = env.TMPDIR = dir;
  return env;
}

function runBounded(command, args, { cwd, env, timeoutMs = 120000, maxBytes = 32 * 1024 * 1024, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled before spawn'));
    const child = spawn(command, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 }, retained = { stdout: 0, stderr: 0 };
    let failure, closed = false, exitCode = null, exitSignal = null, killing = false, killDone = false, killError, killDeadline;
    const finish = () => {
      if (!closed || (killing && !killDone)) return;
      clearTimeout(timer); clearTimeout(killDeadline); signal?.removeEventListener('abort', cancel);
      if (killError) return reject(killError);
      resolve({ exitCode, signal: exitSignal, failure, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') });
    };
    const stop = reason => {
      failure ||= reason;
      if (closed || killing || !child.pid) return;
      killing = true;
      const kill = killTreeCommand(child.pid, process.platform === 'win32');
      killDeadline = setTimeout(() => {
        signal?.removeEventListener('abort', cancel);
        clearTimeout(timer);
        reject(new Error(`Cannot confirm process-tree termination for owned PID ${child.pid}; aborting queue`));
      }, 15000);
      execFile(kill.cmd, kill.args, { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 }, err => {
        killDone = true;
        // A missing leader is NOT proof that its tree is gone. Preserve uncertainty and stop the queue,
        // including a race with natural exit, rather than freeing a slot while descendants may survive.
        if (err) killError = new Error(`Process-tree termination failed for owned PID ${child.pid}: ${err.message}`);
        finish();
      });
    };
    const cancel = () => stop('cancelled');
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', bytes => {
      chunks[stream].push(bytes); retained[stream] += bytes.length;
      while (retained[stream] > maxBytes) {
        const excess = retained[stream] - maxBytes, first = chunks[stream][0];
        if (first.length <= excess) { chunks[stream].shift(); retained[stream] -= first.length; }
        else { chunks[stream][0] = first.subarray(excess); retained[stream] -= excess; }
      }
      sizes[stream] += bytes.length;
      if (sizes[stream] > maxBytes) stop(`${stream} limit exceeded`);
    });
    child.on('error', err => { failure ||= err.message; });
    child.on('close', (code, sig) => { closed = true; exitCode = code; exitSignal = sig; finish(); });
  });
}
module.exports = { childEnvironment, runBounded };
