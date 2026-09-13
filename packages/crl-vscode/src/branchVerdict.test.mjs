import assert from 'node:assert/strict';
import { summarizeBranchVerdict } from './branchVerdict.ts';
import { setAllReviewState } from './medicalValidationStore.ts';
test('result verdict represents uniform states and the worst judgment in a group',()=>{
 for(const state of ['unreviewed','pending','pass','fail']) {
  const map=state==='unreviewed'?{}:{a:state,b:state};
  assert.deepEqual(summarizeBranchVerdict(['a','b'],map),{state,count:2});
 }
 assert.deepEqual(summarizeBranchVerdict(['a','b','c'],{a:'pass',b:'fail'}),{state:'fail',count:3});
 assert.equal(summarizeBranchVerdict(['a','b','c'],{a:'pass',b:'pending'}).state,'unreviewed');
 assert.equal(summarizeBranchVerdict(['a','b'],{a:'pass',b:'pending'}).state,'pending');
 assert.deepEqual(summarizeBranchVerdict([],{}),{state:'unreviewed',count:0});
});
test('explicit branch verdict replaces each group judgment and preserves unrelated cases',()=>{
 const before={a:'fail',b:'pending',other:'fail'};
 for(const state of ['unreviewed','pending','pass','fail']) {
  const result=setAllReviewState(before,['a','b','c'],state);
  assert.equal(result.map.other,'fail');
  assert.deepEqual(summarizeBranchVerdict(['a','b','c'],result.map),{state,count:3});
 }
 assert.deepEqual(before,{a:'fail',b:'pending',other:'fail'});
});
