// REFACTOR:grounded: standalone session tools must load outside the source checkout and its dependencies.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { stageStableServer } = require(join(dist, 'stableServer.js'));
test('staged session API and CLI load with no parser dependency left outside the bundle', async () => {
  const staged = mkdtempSync(join(tmpdir(), 'crl-session-staged-'));
  try {
    stageStableServer(dist, staged);
    const { buildSessionResponse, applySession } = require(join(staged, 'apply-session.js'));
    const q = JSON.stringify({resourceType:'Questionnaire',url:'urn:test',item:[{linkId:'a',type:'decimal'}]});
    const qr = JSON.stringify({resourceType:'QuestionnaireResponse',questionnaire:'urn:test',item:[{linkId:'a'}]});
    const answer = buildSessionResponse(q, qr, {expectedResponseSha256:createHash('sha256').update(qr).digest('hex'),authored:'2030-01-01',mode:'full',edits:[{pointer:'/item/0',operation:'set',answersJson:'[{"valueDecimal":1.23456789012345678900}]'}]});
    assert.ok(answer.includes('1.23456789012345678900'));
    assert.equal(typeof applySession,'function');
    const run=spawnSync(process.execPath,[join(staged,'crl-apply-session.js'),'--help'],{encoding:'utf8',timeout:15000,windowsHide:true});
    assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/crl-apply-session/);
  } finally { rmSync(staged,{recursive:true,force:true}); }
});
