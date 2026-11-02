import {planPathMove} from './pathMove';
import {buildCRL} from '../index';
import {decisionSpine} from '../ast/decisionSpine';
import {runCel} from '../cre/run';
import {resolveCelImports} from '../cel/imports';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const definitions='library "L".\n'+['A','B','C'].map(n=>'concept "'+n+'":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `'+n.toLowerCase()+'`.\n- shape reduction is most recent.\n').join('')+['One','Two','Three','Four'].map(n=>'activity "'+n+'": - request CPGTaskRequest.\n').join('');
const no=definitions+'decision "D":\nfirst:\n- when "A" then recommend activity "One".\n// keep this note\n- when "B" then recommend activity "Two".\n- when "C" then recommend activity "Three".\n- otherwise then recommend activity "Four".\n';
const yes=definitions+'decision "D":\nfirst:\n- when "A" then:\n    first:\n    - when "B" then recommend activity "One".\n    - otherwise then recommend activity "Two".\n    end.\n- otherwise then recommend activity "Three".\n';
function outcomes(source:string){
 const root=mkdtempSync(join(tmpdir(),'path-move-'));try{
  mkdirSync(join(root,'src/crl'),{recursive:true});mkdirSync(join(root,'src/cel/mv'),{recursive:true});writeFileSync(join(root,'package.json'),JSON.stringify({name:'path-move',version:'1.0.0',crl:{canonicalBase:'http://example.org/path-move'}}));writeFileSync(join(root,'src/crl/policy.crl'),source);
  let cel='library "Cases". covers "L".\nfact "P": - defined by "Patient". - name is "Synthetic". - birth date is "1970-01-01".\n';
  for(const n of ['A','B','C'])for(const b of [true,false])cel+='fact "'+n+b+'": - defined by "L"."'+n+'". - value is '+b+'. - date is "2026-10-09".\n';
  for(const a of [true,false])for(const b of [true,false])for(const c of [true,false])cel+='case "'+a+b+c+'": - subject is "P". - fact is "A'+a+'". - fact is "B'+b+'". - fact is "C'+c+'". - result is "D" is "One".\n';
  const file=join(root,'src/cel/mv/cases.cel');writeFileSync(file,cel);return runCel(resolveCelImports(file),{now:new Date('2026-10-09T00:00:00Z')}).runs.map(r=>({case:r.case,activities:r.produced.map(p=>p.recommendation)}));
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('No-path rotation preserves all exits and the remaining first chain, with exact duplicated occurrence mapping',()=>{
 const p=planPathMove(no,{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[1]',focusedNodeId:'when[0]',outcomes:{'when[0]':false,'when[1]':true},anchorNodeId:'when[1]/action[0]'});
 expect(outcomes(p.candidateSource)).toEqual(outcomes(no));expect(p.candidateSource).toContain('// keep this note');
 const d=buildCRL(p.candidateSource).result!.statements.find(s=>s.type==='Decision')!;if(d.type!=='Decision')throw Error();
 const spine=decisionSpine(d);expect((spine.find(n=>n.nodeId===p.focusNodeId)!.node as any).condition.ref).toBe('A');expect((spine.find(n=>n.nodeId===p.anchorNodeId)!.node as any).action.activityName).toBe('Two');
 expect(p.focusNodeId).not.toBe('when[0]');
});
test('Yes-path rotation preserves unequal off-path activities',()=>{
 const p=planPathMove(yes,{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[0]/when[0]',focusedNodeId:'when[0]/when[0]',outcomes:{'when[0]':true,'when[0]/when[0]':false},anchorNodeId:'when[0]/otherwise/action[0]'});
 expect(outcomes(p.candidateSource)).toEqual(outcomes(yes));expect(p.focusNodeId).toBe('when[0]');
});
test('move back uses the mapped occurrence and retains outcomes across repeated clicks',()=>{
 const first=planPathMove(no,{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[1]',focusedNodeId:'when[0]',outcomes:{'when[0]':false,'when[1]':true},anchorNodeId:'when[1]/action[0]'});
 const next=planPathMove(first.candidateSource,{decision:'D',firstNodeId:'when[0]',secondNodeId:first.focusNodeId,focusedNodeId:first.focusNodeId,outcomes:{'when[0]':true,[first.focusNodeId]:false},anchorNodeId:first.anchorNodeId});
 expect(outcomes(next.candidateSource)).toEqual(outcomes(no));expect(next.focusNodeId).toBe('when[0]');
});

test('source edits retain BOM, CRLF, compound conditions and unrelated definitions',()=>{
 const source='\uFEFF'+yes.replace('- when "A" then:','- when (("A" or "B") and /* guard note */ "C") then:').replace(/\n/g,'\r\n');
 const plan=planPathMove(source,{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[0]/when[0]',focusedNodeId:'when[0]',outcomes:{'when[0]':true,'when[0]/when[0]':false},anchorNodeId:'when[0]/otherwise/action[0]'});
 expect(plan.candidateSource.startsWith('\uFEFF')).toBe(true);expect(plan.candidateSource).toContain('(("A" or "B") and /* guard note */ "C")');expect(plan.candidateSource).not.toMatch(/(?<!\r)\n/);
 expect(plan.candidateSource.slice(0,plan.candidateSource.indexOf('decision'))).toBe(source.slice(0,source.indexOf('decision')));
 expect(outcomes(plan.candidateSource)).toEqual(outcomes(source));
});

test('thirty alternating moves stay bounded and preserve every completed outcome',()=>{
 let source=no,focus='when[0]',anchor='when[1]/action[0]';const expected=outcomes(no);
 for(let i=0;i<30;i++){
  const down=i%2===0;
  const plan=planPathMove(source,{decision:'D',firstNodeId:down?focus:'when[0]',secondNodeId:down?'when[1]':focus,focusedNodeId:focus,outcomes:down?{[focus]:false,'when[1]':true}:{'when[0]':true,[focus]:false},anchorNodeId:anchor});
  source=plan.candidateSource;focus=plan.focusNodeId;anchor=plan.anchorNodeId;
  const d=buildCRL(source).result!.statements.find(s=>s.type==='Decision')!;if(d.type!=='Decision')throw Error();
  expect(decisionSpine(d).filter(n=>n.kind==='when').length).toBeLessThanOrEqual(4);expect(outcomes(source)).toEqual(expected);
 }
});
test('No path is selected from pinned outcomes, not a default Yes child; unknown/all/menu regions are refused',()=>{
 expect(()=>planPathMove(yes,{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[0]/when[0]',focusedNodeId:'when[0]',outcomes:{'when[0]':false},anchorNodeId:'otherwise/action[0]'})).toThrow(/adjacent/);
 expect(()=>planPathMove(no,{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[1]',focusedNodeId:'when[0]',outcomes:{'when[0]':false},anchorNodeId:'when[1]/action[0]'})).toThrow(/known exit/);
 expect(()=>planPathMove(no.replace('first:','all:'),{decision:'D',firstNodeId:'when[0]',secondNodeId:'when[1]',focusedNodeId:'when[0]',outcomes:{'when[0]':false,'when[1]':true},anchorNodeId:'when[1]/action[0]'})).toThrow(/ordered/);
});
