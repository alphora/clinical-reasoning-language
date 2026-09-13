import assert from 'node:assert/strict';
import {isAuthoringFlag} from './flagWorkflow.ts';

test('workflow step governs content ownership independently of author or tag',()=>{
 for(const createdBy of ['ai','human',undefined]){
  assert.equal(isAuthoringFlag({category:'extraction',createdBy,tag:'internal-inconsistency'}),true);
  assert.equal(isAuthoringFlag({category:'validation',createdBy,tag:'validation-concern'}),false);
 }
});
