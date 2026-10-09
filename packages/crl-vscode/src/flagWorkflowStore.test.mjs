import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { flagDisplayNameOf, flagCategoryOf, loadFlags, saveFlag } from '@smile-digital-health/crl';
import { applyKeFlagAction, createFlagExclusive, keFlagRevision, performKeFlagAction } from './flagWorkflowStore.ts';

const question = () => ({ schemaVersion: 1, id: 'ke', category: 'extraction', tag: 'customer-confirmable',
  gist: 'Original; `question`\n', description: 'Full original description\nSecond line', status: 'open',
  fields: { assumption: 'Keep', ref: '#42' }, anchor: { scope: 'concept', library: 'L', name: 'Q', label: 'Question' }, createdAt: '2026-10-08' });
function store() {
  const captured = question(), flags = new Map([[captured.id, structuredClone(captured)]]);
  let saveError = false, createError = false;
  const adapter = { load: () => ({ flags: [...flags.values()].map(f => structuredClone(f)) }),
    create: f => { if (createError) throw Error('create failed'); if (flags.has(f.id)) throw Error('exists'); flags.set(f.id, structuredClone(f)); },
    save: f => { if (saveError) throw Error('resolve failed'); flags.set(f.id, structuredClone(f)); } };
  return { captured, flags, adapter, failSave: v => saveError = v, failCreate: v => createError = v };
}

test('disk reload adopts a resolved answer after original resolution failed without rewriting its content',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mv-answer-retry-'));
 try{
  saveFlag(dir,question());const captured=loadFlags(dir).flags.find(f=>f.id==='ke');
  const disk={load:()=>loadFlags(dir),create:flag=>createFlagExclusive(dir,flag),save:()=>{throw Error('resolve disk fault');}};
  assert.throws(()=>performKeFlagAction(disk,captured,'answer'),/Answer flag saved/);
  let loaded=loadFlags(dir);const answer=loaded.flags.find(f=>f.category==='validation');
  saveFlag(dir,{...answer,status:'resolved',gist:'Reviewed answer',description:'Edited response'});
  const retry=applyKeFlagAction(dir,loaded.flags.find(f=>f.id==='ke'),'answer');
  loaded=loadFlags(dir);assert.equal(loaded.flags.length,2);assert.equal(loaded.flags.find(f=>f.id==='ke').status,'resolved');
  assert.equal(retry.status,'resolved');assert.equal(retry.description,'Edited response');assert.equal(retry.gist,'Reviewed answer');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Answer preserves KE and creates an independently editable open MV flag', () => {
  const s = store(); const answer = performKeFlagAction(s.adapter, s.captured, 'answer', 'now');
  const resolved = s.flags.get('ke');
  assert.equal(resolved.category, 'extraction'); assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.description, s.captured.description); assert.equal(resolved.fields.ref, '#42');
  assert.equal(resolved.fields['mv-answer'], answer.id);
  assert.equal(answer.category, 'validation'); assert.equal(answer.tag, 'other');
  assert.ok(flagDisplayNameOf(answer.tag)); assert.equal(flagCategoryOf(answer.tag), 'validation'); assert.equal(answer.status, 'open');
  assert.equal(answer.description, `Question:\n${s.captured.description}\n\nAnswer:\n`);
  assert.equal(answer.fields.ref, undefined); assert.doesNotMatch(answer.gist, /[`;\r\n]/);
  assert.deepEqual(answer.anchor, s.captured.anchor);
});
test('Ignore resolves only the original, without changing its metadata', () => {
  const s = store(); assert.equal(performKeFlagAction(s.adapter, s.captured, 'ignore', 'now'), undefined);
  assert.equal(s.flags.size, 1); assert.deepEqual(s.flags.get('ke'), { ...s.captured, status: 'resolved', editedAt: 'now' });
});
test('title-only KE questions remain self-describing in their MV answer',()=>{
 const s=store();delete s.captured.description;s.flags.set('ke',structuredClone(s.captured));
 assert.equal(performKeFlagAction(s.adapter,s.captured,'answer','now').description,`Question:\n${s.captured.gist}\n\nAnswer:\n`);
});

test('Ignore after Reopen clears the current forward answer but keeps reverse history',()=>{
 const s=store(),answer=performKeFlagAction(s.adapter,s.captured,'answer');
 const reopened={...s.flags.get('ke'),status:'open',editedAt:'reopened'};s.flags.set('ke',reopened);
 performKeFlagAction(s.adapter,reopened,'ignore');
 assert.equal(s.flags.get('ke').fields['mv-answer'],undefined);assert.equal(s.flags.get(answer.id).fields['ke-flag'],'ke');
});
test('failed answer creation leaves KE open; failed resolution retains answer and retry preserves user edits', () => {
  const s = store(); s.failCreate(true);
  assert.throws(() => performKeFlagAction(s.adapter, s.captured, 'answer'), /create failed/);
  assert.deepEqual(s.flags.get('ke'), s.captured); assert.equal(s.flags.size, 1);
  s.failCreate(false); s.failSave(true);
  assert.throws(() => performKeFlagAction(s.adapter, s.captured, 'answer'), /Answer flag saved, but KE could not resolve/);
  const answer = [...s.flags.values()].find(f => f.category === 'validation'); answer.description += 'My answer';
  s.failSave(false); const reused = performKeFlagAction(s.adapter, s.captured, 'answer');
  assert.equal(s.flags.size, 2); assert.match(reused.description, /My answer$/); assert.equal(s.flags.get('ke').status, 'resolved');
});
test('stale full question revisions and unknown store state refuse all writes', () => {
  for (const action of ['answer', 'ignore']) {
    const s = store(); s.flags.get('ke').description = 'New question';
    assert.throws(() => performKeFlagAction(s.adapter, s.captured, action), /changed on disk/); assert.equal(s.flags.size, 1);
    s.adapter.load = () => ({ flags: [s.captured], warning: 'corrupt' });
    assert.throws(() => performKeFlagAction(s.adapter, s.captured, action), /unreadable/); assert.equal(s.flags.size, 1);
  }
});
test('reopened KE revision produces a separate answer and repeated successful action is refused', () => {
  const s = store(); const first = performKeFlagAction(s.adapter, s.captured, 'answer', 'first');
  assert.throws(() => performKeFlagAction(s.adapter, s.captured, 'answer'), /changed on disk/);
  const reopened = { ...s.flags.get('ke'), status: 'open', editedAt: 'reopened' }; s.flags.set('ke', reopened);
  const second = performKeFlagAction(s.adapter, reopened, 'answer', 'second');
  assert.notEqual(first.id, second.id); assert.equal(s.flags.size, 3);
});
test('unrelated answer collisions are never adopted', () => {
  for (const change of [f => f.category = 'extraction', f => f.fields['ke-flag'] = 'elsewhere', f => f.anchor.name = 'Other']) {
    const s = store(); s.failSave(true); assert.throws(() => performKeFlagAction(s.adapter, s.captured, 'answer'));
    const answer = [...s.flags.values()].find(f => f.category === 'validation'); change(answer); s.failSave(false);
    assert.throws(() => performKeFlagAction(s.adapter, s.captured, 'answer'), /identity conflicts/); assert.equal(s.flags.get('ke').status, 'open');
  }
});

test('a resolved answer from a partial operation remains reusable without overwriting its edits',()=>{
 const s=store();s.failSave(true);assert.throws(()=>performKeFlagAction(s.adapter,s.captured,'answer'));
 const answer=[...s.flags.values()].find(f=>f.category==='validation');answer.status='resolved';answer.description+='Completed answer';
 s.failSave(false);const adopted=performKeFlagAction(s.adapter,s.captured,'answer');
 assert.equal(adopted.status,'resolved');assert.match(adopted.description,/Completed answer$/);assert.equal(s.flags.size,2);assert.equal(s.flags.get('ke').status,'resolved');
});
test('source changes during answer publication keep KE open and preserve the saved answer', () => {
  const s = store(), create = s.adapter.create;
  s.adapter.create = f => { create(f); s.flags.get('ke').gist = 'Changed elsewhere'; };
  assert.throws(() => performKeFlagAction(s.adapter, s.captured, 'answer'), /KE could not resolve/);
  assert.equal(s.flags.size, 2); assert.equal(s.flags.get('ke').status, 'open'); assert.equal(s.flags.get('ke').gist, 'Changed elsewhere');
});
test('exclusive disk publication refuses overwrite and actual disk action resolves KE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mr-flag-'));
  try {
    const q = question(); saveFlag(dir, q); const answer = applyKeFlagAction(dir, q, 'answer');
    assert.equal(loadFlags(dir).flags.find(f => f.id === q.id).status, 'resolved');
    const file = join(dir, `${answer.id}.json`), bytes = readFileSync(file, 'utf8');
    assert.throws(() => createFlagExclusive(dir, { ...answer, description: 'Overwrite' }), /exist/i);
    assert.equal(readFileSync(file, 'utf8'), bytes);
    writeFileSync(file, '{invalid'); assert.throws(() => applyKeFlagAction(dir, q, 'ignore'), /unreadable/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('revision identity is stable for property order and includes every original field', () => {
  const q = question(); assert.equal(keFlagRevision(q), keFlagRevision({ ...q, fields: { ref: '#42', assumption: 'Keep' } }));
  assert.notEqual(keFlagRevision(q), keFlagRevision({ ...q, editedAt: 'changed' }));
});
