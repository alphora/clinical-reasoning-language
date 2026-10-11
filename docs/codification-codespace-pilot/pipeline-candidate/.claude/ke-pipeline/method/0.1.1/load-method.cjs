#!/usr/bin/env node
'use strict';

// Draft, read-only SessionStart adapter. Installation/trust and real host-event
// delivery require separate review and integration evidence.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024;
const MAX_BOOTSTRAP_BYTES = 32 * 1024;
const INPUT_TIMEOUT_MS = 2000;
const SOURCES = new Set(['startup', 'resume', 'clear', 'compact']);
const HASH = /^[a-f0-9]{64}$/;
const METHOD_ID = 'medical-policy-ke-method';

function contextOutput(additionalContext) {
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } };
}

function warning(reason) {
  return contextOutput(
    'KE METHOD AVAILABILITY WARNING: ' + reason + '\n' +
    'This notice applies only to medical-policy knowledge engineering authoring or review. ' +
    'Do not claim the shared KE method was loaded or accepted for that work. Resolve the method ' +
    'package and explicit project/task version binding, then read the full method, applicable ' +
    'project/customer profile and current language kit before proceeding with KE work. ' +
    'Do not infer a customer or accepted version from the working directory or previous chat. ' +
    'Unrelated tasks are not blocked by this notice.'
  );
}

function parseArguments(args) {
  if (args.length !== 4 || args[0] !== '--package' || args[2] !== '--digest') {
    throw new Error('Expected --package PATH --digest SHA256.');
  }
  if (!path.isAbsolute(args[1]) || /^[\\/]{2}/.test(args[1]) || !HASH.test(args[3])) {
    throw new Error('The package path must be absolute and its manifest digest must be lowercase SHA-256.');
  }
  return { packagePath: args[1], digest: args[3] };
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function safeRelativeFile(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 240 &&
    !/[\\:\x00-\x1f\x7f]/.test(name) && !path.posix.isAbsolute(name) &&
    name.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

async function readPackageFile(root, relative) {
  if (!safeRelativeFile(relative)) throw new Error('The manifest contains an unsafe file path.');
  const filePath = await fs.realpath(path.join(root, ...relative.split('/')));
  if (!inside(root, filePath)) throw new Error('A package file resolves outside the package directory.');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
    throw new Error('A package file is not a regular file or exceeds the size limit.');
  }
  const bytes = await fs.readFile(filePath);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('A package file exceeds the size limit.');
  return bytes;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function decode(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function loadPackage(packagePath, digest) {
  const root = await fs.realpath(packagePath);
  if (/^[\\/]{2}/.test(root)) throw new Error('The package must resolve to a local directory.');
  const manifestBytes = await readPackageFile(root, 'manifest.json');
  if (sha256(manifestBytes) !== digest) throw new Error('The manifest digest does not match the reviewed package.');
  const manifest = JSON.parse(decode(manifestBytes));
  if (!manifest || manifest.schemaVersion !== 1 || manifest.id !== METHOD_ID ||
      typeof manifest.version !== 'string' || manifest.version.length > 80 ||
      !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version) ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('The method manifest schema, identity or version is invalid.');
  }
  const names = Object.keys(manifest.files);
  if (names.length < 2 || names.length > 32 ||
      !Object.hasOwn(manifest.files, 'SKILL.md') || !Object.hasOwn(manifest.files, 'references/method.md')) {
    throw new Error('The manifest must include SKILL.md and references/method.md within the file-count limit.');
  }
  let totalBytes = manifestBytes.length;
  let skill;
  for (const name of names) {
    if (!safeRelativeFile(name) || !HASH.test(manifest.files[name])) {
      throw new Error('The manifest contains an unsafe file path or invalid file digest.');
    }
    const bytes = await readPackageFile(root, name);
    totalBytes += bytes.length;
    if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('The package exceeds the total size limit.');
    if (sha256(bytes) !== manifest.files[name]) throw new Error('A listed package file does not match its manifest digest.');
    if (name === 'SKILL.md') {
      if (bytes.length > MAX_BOOTSTRAP_BYTES) throw new Error('The bootstrap exceeds the context size limit.');
      skill = decode(bytes);
    }
  }
  return { root, manifest, skill };
}

async function readInput(stream) {
  const chunks = [];
  let total = 0;
  const timeout = setTimeout(() => stream.destroy(new Error('The hook input timed out.')), INPUT_TIMEOUT_MS);
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > MAX_INPUT_BYTES) throw new Error('The hook input exceeds the size limit.');
      chunks.push(bytes);
    }
  } finally {
    clearTimeout(timeout);
  }
  return JSON.parse(decode(Buffer.concat(chunks)));
}

async function handleEvent(event, args) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return warning('The hook input is not a JSON object.');
  }
  const camelEvent = event.hookEventName;
  const snakeEvent = event.hook_event_name;
  if (camelEvent !== undefined && snakeEvent !== undefined && camelEvent !== snakeEvent) {
    return warning('The hook input contains conflicting event names.');
  }
  const eventName = snakeEvent ?? camelEvent;
  if (typeof eventName !== 'string') return warning('The hook input has no event name.');
  if (eventName !== 'SessionStart') return null;
  if (!SOURCES.has(event.source) || typeof event.cwd !== 'string') {
    return warning('The SessionStart source or working-directory field is unsupported or invalid.');
  }
  try {
    const { packagePath, digest } = parseArguments(args);
    const { root, manifest, skill } = await loadPackage(packagePath, digest);
    return contextOutput(
      'SHARED KE METHOD AVAILABLE — conditional medical-policy KE scope only.\n' +
      'Available package: ' + manifest.id + ' version ' + manifest.version + '\n' +
      'Verified manifest SHA-256: ' + digest + '\n' +
      'Bootstrap entrypoint: ' + path.join(root, 'SKILL.md') + '\n' +
      'Full method: ' + path.join(root, 'references', 'method.md') + '\n' +
      'This is an available installed/default package, not proof of the project/task accepted version, ' +
      'method activation, comprehension or execution. On medical-policy KE work or resumption, ' +
      'resolve the explicit task/project accepted version first; read that full method and its ' +
      'applicable project/customer profile and current language kit. Do not infer customer, profile ' +
      'or accepted version from cwd or previous chat. If the binding is missing or ambiguous, ' +
      'keep that gap explicit; do not claim KE method adoption. Unrelated work remains unaffected.\n\n' +
      'Available bootstrap content follows:\n' + skill
    );
  } catch (error) {
    // Avoid echoing arbitrary file contents, hook fields or operating-system paths.
    const known = error && error.code;
    return warning(known ? 'The reviewed method package could not be read (' + known + ').' :
      'The reviewed method package is missing, invalid, or fails its integrity checks.');
  }
}

async function main() {
  let result;
  try {
    result = await handleEvent(await readInput(process.stdin), process.argv.slice(2));
  } catch {
    result = warning('The hook input is malformed or exceeds the size limit.');
  }
  if (result) process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    process.stdout.write(JSON.stringify(warning('The read-only loader could not complete.')) + '\n');
  });
}

module.exports = { handleEvent, readInput, safeRelativeFile, MAX_INPUT_BYTES };
