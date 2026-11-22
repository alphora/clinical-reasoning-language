import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, unlinkSync, truncateSync } from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveMvReprocessLog, MV_REPROCESS_LOG_MAX_BYTES } from './mvReprocessLog.ts';

function fixture(folder = 'tests') {
  const temp = realpathSync(tmpdir()), root = mkdtempSync(join(temp, 'crl-mv-fix-log-'));
  const artifact = join(root, 'artifacts', 'neutral-policy'), src = join(artifact, 'src');
  mkdirSync(join(src, 'crl'), { recursive: true }); mkdirSync(join(src, 'cel'));
  writeFileSync(join(artifact, 'package.json'), '{}');
  const config = rows => writeFileSync(join(root, 'kelp.project.json'), JSON.stringify({ project: { schemaVersion: 1, structure: { entities: rows } } }));
  config([{ key: 'qa', folder, producer: 'script', needs: ['cel', 'cql', 'fhir'] }]);
  const report = (text = '# MV fix log\n\nSynthetic agent report.\n') => {
    const file = join(artifact, folder, 'reprocess-log.md'); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); return file;
  };
  return { root, artifact, src, config, report, close() {
    const rel = relative(temp, realpathSync(root)); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'));
    rmSync(root, { recursive: true, force: true });
  } };
}

test('reads the configured qa folder, not a hard-coded src/qa or nearest nested package', () => {
  for (const folder of ['tests', 'src/qa']) {
    const f = fixture(folder); try {
      const report = f.report(); writeFileSync(join(f.src, 'package.json'), '{}');
      assert.deepEqual(resolveMvReprocessLog(f.src), { kind: 'available', artifactRoot: realpathSync(f.artifact), filePath: realpathSync(report) });
      assert.equal(readFileSync(report, 'utf8'), '# MV fix log\n\nSynthetic agent report.\n');
    } finally { f.close(); }
  }
});

test('first report creation, deletion and mapping repair are visible on the next lookup', () => {
  const f = fixture(); try {
    assert.equal(resolveMvReprocessLog(f.src).reason, 'no-report-folder');
    const file = f.report(); assert.equal(resolveMvReprocessLog(f.src).kind, 'available');
    unlinkSync(file); assert.equal(resolveMvReprocessLog(f.src).reason, 'no-report');
    f.config([]); assert.equal(resolveMvReprocessLog(f.src).reason, 'unmapped-qa');
    f.config([{ key: 'qa', folder: 'tests' }]); f.report('New entry\n');
    assert.equal(resolveMvReprocessLog(f.src).kind, 'available');
  } finally { f.close(); }
});

test('missing, duplicate, differently named and malformed mappings explain without guessing or throwing', () => {
  const f = fixture(); try {
    f.report();
    for (const rows of [[], [{ key: 'tests', folder: 'tests' }]]) {
      f.config(rows); assert.equal(resolveMvReprocessLog(f.src).reason, 'unmapped-qa');
    }
    f.config([{ key: 'qa', folder: 'tests' }, { key: 'qa', folder: 'src/qa' }]);
    assert.equal(resolveMvReprocessLog(f.src).reason, 'ambiguous-qa');
    writeFileSync(join(f.root, 'kelp.project.json'), 'invalid');
    const invalid = resolveMvReprocessLog(f.src); assert.equal(invalid.reason, 'invalid-project'); assert.equal(invalid.kind, 'unavailable'); assert.ok(!invalid.message.includes(f.root));
    unlinkSync(join(f.root, 'kelp.project.json')); assert.equal(resolveMvReprocessLog(f.src).reason, 'no-project');
    assert.equal(resolveMvReprocessLog(join(f.src, 'gone')).kind, 'unavailable');
  } finally { f.close(); }
});

test('large histories have an explicit preview limitation rather than an unbounded renderer handoff',()=>{
  const f=fixture();try{
    const report=f.report();truncateSync(report,MV_REPROCESS_LOG_MAX_BYTES+1);
    assert.equal(resolveMvReprocessLog(f.src).reason,'too-large');
    truncateSync(report,MV_REPROCESS_LOG_MAX_BYTES);
    assert.equal(resolveMvReprocessLog(f.src).kind,'available');
  }finally{f.close();}
});
test('debug policies have no mapping while a managed artifact missing its package reports a delivery problem',()=>{
  const f=fixture();try{
    const debug=join(f.root,'examples/policy/src');mkdirSync(debug,{recursive:true});
    assert.equal(resolveMvReprocessLog(debug).reason,'no-artifact');
    assert.equal(resolveMvReprocessLog(join(f.root,'artifacts')).reason,'no-artifact');
    for(const rows of [[],[{key:'qa',folder:'../unsafe'}]]){f.config(rows);assert.equal(resolveMvReprocessLog(debug).reason,'no-artifact');}
    f.config([{key:'qa',folder:'tests'}]);unlinkSync(join(f.artifact,'package.json'));const broken=resolveMvReprocessLog(f.src);assert.equal(broken.reason,'artifact-layout');assert.match(broken.message,/incomplete; check artifact delivery/);
  }finally{f.close();}
});

test('unsafe configured paths and nonregular report entries are refused', () => {
  const f = fixture(); try {
    for (const folder of ['../outside', '/outside', 'C:/outside', 'C:outside', 'a\\b', '.', 'tests/../other', 'tests//child', '']) {
      f.config([{ key: 'qa', folder }]); assert.equal(resolveMvReprocessLog(f.src).reason, 'unsafe-folder', folder);
    }
    f.config([{ key: 'qa', folder: 'tests' }]); mkdirSync(join(f.artifact, 'tests/reprocess-log.md'), { recursive: true });
    assert.equal(resolveMvReprocessLog(f.src).reason, 'unsafe-file');
  } finally { f.close(); }
});

test('directory junctions inside the artifact cannot substitute another report folder', () => {
  const f = fixture(); const link = join(f.artifact, 'tests');
  try {
    const outside = join(f.root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'reprocess-log.md'), 'Outside');
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(resolveMvReprocessLog(f.src).reason, 'unsafe-file');
  } finally { try { unlinkSync(link); } catch {} f.close(); }
});

test('a regular file in place of the qa directory explains the folder delivery error',()=>{
  const f=fixture();try{
    writeFileSync(join(f.artifact,'tests'),'Synthetic archive bytes');
    const report=resolveMvReprocessLog(f.src);assert.equal(report.reason,'not-a-folder');assert.match(report.message,/not a directory/);
  }finally{f.close();}
});

test.skipIf(process.platform === 'win32')('file symlinks cannot substitute the report (requires no Windows file-symlink privilege)', () => {
  const f = fixture(); try {
    const target = join(f.root, 'outside.md'); writeFileSync(target, 'Outside'); mkdirSync(join(f.artifact, 'tests'));
    symlinkSync(target, join(f.artifact, 'tests/reprocess-log.md'));
    assert.equal(resolveMvReprocessLog(f.src).reason, 'unsafe-file');
  } finally { f.close(); }
});
