// Local debug harness using the released default engine, ordinary session adapter and isolated profile.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const work = path.join(root, 'tmp/presentation-choice-debug');
const extension = path.join(work, 'extension');
const {ENGINE_JAR_SOURCE, defaultEngineJarPath} = require('../../packages/crl/dist/results/spawn');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  // The debug target uses the ordinary released runtime and its own cache home.
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error('A home directory is required for the standard engine cache.');
  const jar = defaultEngineJarPath() ?? path.join(home, ENGINE_JAR_SOURCE.cacheRelativePath);
  if (!fs.existsSync(jar)) {
    const response = await fetch(ENGINE_JAR_SOURCE.url, {signal: AbortSignal.timeout(180000)});
    if (!response.ok) throw new Error('Default engine download failed: HTTP ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== ENGINE_JAR_SOURCE.sha256) throw new Error('Default engine download SHA256 mismatch.');
    fs.mkdirSync(path.dirname(jar), {recursive: true});
    fs.writeFileSync(jar, bytes, {flag: 'wx'});
  }
  if (digest(jar) !== ENGINE_JAR_SOURCE.sha256) throw new Error('Default engine cache SHA256 mismatch.');
  const engine = {path: jar, sha256: ENGINE_JAR_SOURCE.sha256};
  fs.mkdirSync(work, {recursive: true});
  const scratch = path.join(work, 'temp');
  fs.mkdirSync(scratch, {recursive: true});
  process.env.TEMP = process.env.TMP = scratch;
  const user = path.join(work, 'profile/User');
  fs.mkdirSync(user, {recursive: true});
  const settingsPath = path.join(user, 'settings.json');
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  fs.writeFileSync(settingsPath, JSON.stringify({...settings, 'crl.autoProvision': 'never'}, null, 2) + '\n');

  if (process.argv.includes('--results')) {
    const crl = require('../../packages/crl/dist');
    const policy = path.join(__dirname, 'src/crl/activities.crl');
    const cel = path.join(__dirname, 'src/cel/mv/activities.cel');
    const emitted = crl.emitCrlTwoLane(policy);
    if (!emitted.success) throw new Error(JSON.stringify(emitted.diagnostics));
    crl.writeTwoLane(emitted, path.join(__dirname, 'src'));
    const published = crl.publishMvCel(cel, __dirname);
    if (!published.ok) throw new Error(JSON.stringify(published));
    const result = await crl.produceResults({celPath: cel, crlPath: policy, useCase: 'prior-auth',
      outRoot: __dirname, jarPath: jar, jarSha256: engine.sha256,
      bounds: {maxHeapMb: 512, batchTimeoutMs: 180000, maxCapturedBytes: 1048576},
      crlVersion: require('../../packages/crl/package.json').version});
    if (!result.ok || result.failed) throw new Error(JSON.stringify(result));
    console.log('Produced native static questionnaires:', result.manifestPath);
  }

  const source = path.join(root, 'packages/crl-vscode');
  for (const folder of ['dist', 'media', 'syntaxes']) {
    fs.cpSync(path.join(source, folder), path.join(extension, folder), {recursive: true});
  }
  fs.copyFileSync(path.join(source, 'package.json'), path.join(extension, 'package.json'));
  // Open the existing MV command on the demo, without adding product commands or settings.
  const host = path.join(extension, 'dist/extension-runtime.js');
  fs.copyFileSync(path.join(extension, 'dist/extension.js'), host);
  const cel = path.join(__dirname, 'src/cel/mv/activities.cel');
  fs.writeFileSync(path.join(extension, 'dist/extension.js'),
    `const host = require(${JSON.stringify(host)});\n` +
    `exports.activate = async context => { await host.activate(context); const vscode = require('vscode'); await vscode.commands.executeCommand('crl.medicalValidation.show', vscode.Uri.file(${JSON.stringify(cel)})); };\n` +
    `exports.deactivate = host.deactivate;\n`);
  fs.writeFileSync(path.join(work, 'runtime.json'), JSON.stringify({engine, extension}, null, 2) + '\n');
  console.log('Multi-select debug extension ready:', extension);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
