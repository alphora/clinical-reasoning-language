import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveCelSuite, findPolicySrc } from '@smile-digital-health/crl';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const example = join(root, 'examples/bleph-medical-validation');

test('the Bleph MV example is discoverable and its native forms match its MV cases', () => {
  const mv = resolveCelSuite(example, 'mv');
  assert.equal(mv.ok, true, JSON.stringify(mv.diagnostics));
  assert.ok(mv.suite.files.length > 0);
  const names = [];
  for (const file of mv.suite.files) {
    assert.match(file.sourceFile, /^src\/cel\/mv\/.+\.cel$/);
    assert.equal(findPolicySrc(file.path), mv.suite.policySrc);
    names.push(...file.graph.cel.statements.filter(s => s.type === 'CELCase').map(s => s.name));
  }
  assert.equal(names.length, 37, 'preserve the maintained MV example coverage');
  const manifest = JSON.parse(readFileSync(join(example, 'tests/results/questionnaire-manifest-mv.json'), 'utf8'));
  assert.equal(manifest.generatedAt,"2026-09-13T21:55:28.264Z");
  assert.deepEqual(manifest.provenance,{"crlVersion":"5.4.0","producerJarSha256":"9870fc867547f65518c5cd6e698ace77b60a9e98797ed38330c25d06cbf5cb2e"});
  assert.deepEqual(manifest.cases.map(c => c.caseName).sort(), names.sort());
  for (const c of manifest.cases) {
    assert.equal(c.state, 'generated');
    assert.ok(c.artifacts.some(a => a.resourceType === 'Questionnaire'));
    assert.ok(c.artifacts.some(a => a.resourceType === 'QuestionnaireResponse'));
    for (const artifact of c.artifacts) {
      const file = join(example, artifact.path);
      assert.ok(existsSync(file), artifact.path);
      assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), artifact.sha256, artifact.path);
    }
  }
  const regression = resolveCelSuite(example, 'regression');
  assert.equal(regression.ok, true, JSON.stringify(regression.diagnostics));
  assert.ok(regression.suite.files.some(f => f.role === 'regression'));
  assert.equal(regression.suite.files.reduce((n, f) => n + f.graph.cel.statements.filter(s => s.type === 'CELCase').length, 0), 69, 'preserve engineering controls as well as MV cases');
  assert.deepEqual(regression.suite.files.filter(f => f.role === 'mv').map(f => f.sourceFile), mv.suite.files.map(f => f.sourceFile));
});

test('the Bleph debugger opens the maintained MV workspace', () => {
  const launches = JSON.parse(readFileSync(join(root, '.vscode/launch.json'), 'utf8'));
  const launch = launches.configurations.find(c => c.name === 'Run Bleph Medical Validation (isolated)');
  assert.ok(launch);
  for(const config of launches.configurations){
    assert.equal(config.args.filter(a=>a.startsWith('--user-data-dir=')).length,1);
    assert.equal(config.args.filter(a=>a.startsWith('--extensions-dir=')).length,1);
  }
  const entries = launch.args.filter(a => a.endsWith('.code-workspace'));
  assert.equal(entries.length, 1, 'Bleph debugger must open exactly one shared workspace entry');
  const entry = entries[0].replace('${workspaceFolder}', root);
  const workspace = JSON.parse(readFileSync(entry, 'utf8'));
  assert.ok(workspace.folders.some(f => resolve(dirname(entry), f.path) === example));
  const tasks = JSON.parse(readFileSync(join(root, '.vscode/tasks.json'), 'utf8'));
  assert.ok(tasks.tasks.some(t => t.label === launch.preLaunchTask), 'debug pre-launch build task exists');
  const extensions = launch.args.filter(a => a.startsWith('--extensionDevelopmentPath='));
  assert.equal(extensions.length, 1);
  assert.equal(resolve(extensions[0].slice('--extensionDevelopmentPath='.length).replace('${workspaceFolder}', root)), join(root, 'packages/crl-vscode'));
});

test('the retained native delivery stays bound to its source snapshot and emitted patient data',()=>{
 const base=join(example,'src');
 const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
 const sources=files(base).map(p=>[relative(base,p).replaceAll('\\','/'),readFileSync(p,'utf8').replaceAll('\r\n','\n')]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 const config=JSON.parse(readFileSync(join(example,'package.json'),'utf8')).crl;
 // This pins the retained 5.4.0 delivery, not runtime freshness. Update only with reviewed source/result regeneration.
 assert.equal(createHash('sha256').update(JSON.stringify({sources,config})).digest('hex'),'525b671caa0ec511605834fd711d7a389a868a92f8f476c513c5ded9108e56b3');
 const data=JSON.parse(readFileSync(join(example,'tests/data/fhir/cel-data-manifest.json'),'utf8'));
 const results=JSON.parse(readFileSync(join(example,'tests/results/questionnaire-manifest-mv.json'),'utf8'));
 assert.deepEqual(data.cases.map(c=>c.caseId).sort(),results.cases.map(c=>c.caseId).sort());
 for(const c of data.cases)for(const a of c.artifacts)assert.equal(createHash('sha256').update(readFileSync(join(example,'tests/data/fhir',a.path))).digest('hex'),a.sha256,a.path);
 const workspace=JSON.parse(readFileSync(join(example,'medical-validation.code-workspace'),'utf8'));
 assert.deepEqual(workspace.settings['crl.medical-validation.paneOrder'],['source','questionnaire','fhirQuestionnaire','tree']);
});
