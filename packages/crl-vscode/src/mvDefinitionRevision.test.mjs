import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { demotePassedReviews, composeSidecar, loadSidecar, saveSidecar } from './medicalValidationStore.ts';

const revision={id:'12345678-1234-1234-1234-123456789012',definitionClosureSha256:'a'.repeat(64),editedAt:'2026-10-08T00:00:00.000Z',receiptPath:'src/medical-validation/direct-edits/12345678-1234-1234-1234-123456789012.json'};
test('changed definitions demote approvals but retain failures, notes, criterion hashes and immutable before-state',()=>{
 const before={schemaVersion:2,byCaseId:{yes:'pass',wrong:'fail',waiting:'pending'},notesByCaseId:{yes:[{id:'n',text:'Keep me',created:1}]},
  criterionVerdictsByKey:{a:{state:'pass',bodyHash:'body'},b:{state:'fail',bodyHash:'wrong'}}};
 const original=JSON.stringify(before),after=demotePassedReviews(before,revision);
 assert.equal(JSON.stringify(before),original);assert.deepEqual(after.byCaseId,{yes:'pending',wrong:'fail',waiting:'pending'});
 assert.equal(after.criterionVerdictsByKey.a.bodyHash,'body');assert.equal(after.criterionVerdictsByKey.b.state,'fail');
 assert.deepEqual(after.notesByCaseId,before.notesByCaseId);assert.deepEqual(after.definitionRevision.demotedCaseIds,['yes']);
});
test('load and an ordinary verdict/note save retain revision while manual reapproval clears only its item marker',()=>{
 const root=mkdtempSync(join(tmpdir(),'mv-definition-revision-'));try{
  const file=join(root,'policy.json'),after=demotePassedReviews({schemaVersion:2,byCaseId:{a:'pass',b:'pass'}},revision);
  saveSidecar(file,after);const loaded=loadSidecar(file);assert.equal(loaded.warning,undefined);
  const composed=composeSidecar({...loaded.sidecar.byCaseId,a:'pass'},{b:[{id:'note',text:'New note',created:2}]},{},loaded.sidecar.definitionRevision);
  saveSidecar(file,composed);const final=loadSidecar(file).sidecar;
  assert.equal(final.definitionRevision.id,revision.id);assert.deepEqual(final.definitionRevision.demotedCaseIds,['b']);
  assert.equal(final.byCaseId.a,'pass');assert.equal(final.byCaseId.b,'pending');assert.equal(final.notesByCaseId.b[0].text,'New note');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('old v1 review migration and corrupt advisory revision do not discard review states',()=>{
 const root=mkdtempSync(join(tmpdir(),'mv-old-revision-'));try{
  const file=join(root,'policy.json');writeFileSync(file,JSON.stringify({schemaVersion:1,byCaseId:{a:'reviewed'},definitionRevision:{bad:true}}));
  const loaded=loadSidecar(file);assert.equal(loaded.sidecar.byCaseId.a,'pass');assert.match(loaded.warning,/attribution unavailable/);
  assert.equal(loaded.sidecar.definitionRevision,undefined);assert.equal(JSON.parse(readFileSync(file,'utf8')).schemaVersion,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
