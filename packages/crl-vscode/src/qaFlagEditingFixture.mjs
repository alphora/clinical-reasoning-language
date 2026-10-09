// REFACTOR:grounded: synthetic Q/A artifact shared by request store and real host caller checks.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveWordingTarget} from './presentationProposal.ts';
import {resolveAnswerTarget} from './answerEditing.ts';
export function qaFixture(){
 const root=mkdtempSync(join(tmpdir(),'mv-request-')),dir=join(root,'src/crl'),flags=join(root,'src/medical-validation/flags');mkdirSync(dir,{recursive:true});
 const system='http://example.org/qa/CodeSystem/options',terms=join(dir,'terms.crl'),policy=join(dir,'policy.crl');
 const term='library "Terms".\nterminology "Options":\n- system is `'+system+'`.\n- code is `yes` display is `Yes`.\n- code is `no` display is `No`.\n';
 const source='library "L".\nconcept "Q":\n- shape is Record.\n- type is Observation.\n- value type is CodeableConcept.\n- code is `q`.\n- value domain is answer options.\n- shape reduction is most recent.\n- value from is "Terms"."Options":\n  - not qualifying is `no`.\npresentation for "Q":\n- question text is "Authored question?".\n- question description is "Authored detail".\n';
 writeFileSync(join(root,'package.json'),JSON.stringify({name:'qa-fixture',version:'1.0.0',crl:{canonicalBase:'http://example.org/qa'}}));writeFileSync(policy,source);writeFileSync(terms,term);
 for(const path of ['src/fhir','src/cql','src/cel','src/provenance','tests','src/medical-validation']){mkdirSync(join(root,path),{recursive:true});writeFileSync(join(root,path,'sentinel.txt'),'unchanged');}
 const wording=()=>resolveWordingTarget(policy,readFileSync(policy,'utf8'),'Q');
 const answer=()=>resolveAnswerTarget(policy,'L','Q');
 const card=()=>({id:'q',concept:'Q',library:'L',text:wording().questionText,description:wording().questionDescription,value:'Yes',answerChoices:answer().members.map(m=>({...m,selected:m.code==='yes'}))});
 return {root,policy,terms,flags,system,source,term,wording,answer,card,close:()=>rmSync(root,{recursive:true,force:true})};
}
