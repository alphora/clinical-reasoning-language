import {buildCRL} from '../index';
import {listStructureSites,planStructureEdit} from './structureEdit';
import {runCel} from '../cre/run';
import {resolveCelImports} from '../cel/imports';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const source='\uFEFFlibrary "L".\r\n// keep me\r\ncriterion "C":\r\n- when ("A" and "B" and "C1").\r\ndecision "D":\r\nfirst:\r\n- when "C" then recommend activity "Met".\r\n- otherwise then recommend activity "Unmet".\r\ndecision "Other":\r\n- when "C" then recommend activity "Met".\r\npresentation for "A":\r\n- in criterion "C".\r\n- question text is "Scoped A?".\r\n';
const target={decision:'D',nodeId:'when[0]',operands:[0]};
test('selected criterion occurrence is detached, scoped wording copied, other use and bytes retained',()=>{
  const p=planStructureEdit(source,{target,operation:'down'});
  expect(p.candidateSource).toContain('criterion "C":\r\n- when ("A" and "B" and "C1").');
  expect(p.candidateSource).toContain('criterion "C edited":\r\n- when (("B" and "A" and "C1")).');
  expect(p.candidateSource).toContain('- in criterion "C edited".');
  expect(p.candidateSource.match(/Scoped A\?/g)).toHaveLength(2);
  expect(p.candidateSource).toContain('decision "Other":\r\n- when "C"');
  expect(p.candidateSource.startsWith('\uFEFF')).toBe(true);expect(p.candidateSource).toContain('// keep me\r\n');
  expect(p.candidateSource).not.toMatch(/(?<!\r)\n/);expect(buildCRL(p.candidateSource.replace(/^\uFEFF/,'')).success).toBe(true);
});
test('delete removes only selected operand, combine and split require explicit resulting logic',()=>{
  const deleted=planStructureEdit(source,{target,operation:'delete'}).candidateSource;
  expect(deleted).toContain('- when (("B" and "C1")).');
  const combined=planStructureEdit(source,{target,operation:'combine',conditions:['"Combined"'],declarations:'concept "Combined":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `combined`.\n- shape reduction is most recent.\npresentation for "Combined":\n- question text is "Combined question?".'}).candidateSource;
  expect(combined).toContain('"Combined" and "C1"');expect(combined).toContain('Combined question?');
  const split=planStructureEdit(source,{target,operation:'split',conditions:['"Part 1"','"Part 2"'],operator:'or'}).candidateSource;
  expect(split).toContain('(("Part 1" or "Part 2") and "B" and "C1")');
  expect(()=>planStructureEdit(source,{target,operation:'combine'})).toThrow(/Supply/);
  expect(()=>planStructureEdit(source,{target,operation:'split',conditions:['"A"','"B"']})).toThrow(/Choose ALL/);
});
test('split emits a genuine compound, not ordered gates; catalog addresses selected occurrence',()=>{
  const p=planStructureEdit(source,{target:{decision:'D',nodeId:'when[0]'},operation:'split',conditions:['"A"','"B"'],operator:'and'});
  expect(p.candidateSource).toContain('- when ("A" and "B") then');
  const sites=listStructureSites(source);expect(sites.filter(s=>s.kind==='test')).toHaveLength(2);
  expect(sites.filter(s=>s.decision==='D'&&s.kind==='operand')).toHaveLength(3);
  expect(()=>planStructureEdit(source,{target:{...target,operands:[50]},operation:'delete'})).toThrow(/no longer/);
});
const nested='library "L".\ndecision "D":\nfirst:\n- when "A" then:\n    first:\n    - when "B" then recommend activity "Met".\n    - otherwise then recommend activity "Unmet".\n    end.\n- otherwise then recommend activity "Unmet".\n';
test('moving nested tests preserves exits and explicitly describes changed pause order',()=>{
  const p=planStructureEdit(nested,{target:{decision:'D',nodeId:'when[0]'},operation:'down'});
  expect(p.candidateSource).toContain('- when "B" then:\n    first:\n    - when "A"');expect(p.message).toMatch(/pauses/);
  const p2=planStructureEdit(nested,{target:{decision:'D',nodeId:'when[0]'},operation:'combine',conditions:['("A" and "B")']});
  expect(p2.candidateSource).toContain('- when ("A" and "B") then recommend activity "Met".');expect(p2.message).toMatch(/pause differently/);
});
test('unsafe automatic movement and malformed input fail without mutating source',()=>{
  expect(()=>planStructureEdit(nested.replace('activity "Unmet".\n    end.','activity "Different".\n    end.'),{target:{decision:'D',nodeId:'when[0]'},operation:'down'})).toThrow(/preserving/);
  expect(()=>planStructureEdit(source,{target,operation:'split',operator:'and',conditions:['garbage','"B"']})).toThrow();
  expect(()=>planStructureEdit(source,{target,operation:'delete',declarations:'decision "Oops": - when "A" then recommend activity "M".'})).toThrow(/Combine or Split/);
});
test('detaching a criterion copies only remapped scopes, preserving original presentation identity',()=>{
 const scoped=source.replace('- in criterion "C".','- in criterion "C".\r\n- in criterion "Other".');
 const edited=planStructureEdit(scoped,{target,operation:'down'}).candidateSource;
 const ast=buildCRL(edited.replace(/^\uFEFF/,'')).result!;
 expect(ast.presentations).toHaveLength(2);expect(ast.presentations![0].contexts.map(c=>c.ref)).toEqual(['C','Other']);expect(ast.presentations![1].contexts.map(c=>c.ref)).toEqual(['C edited']);
});
test('deleting nested test bypasses either explicitly selected continuation without deleting a shared declaration',()=>{
 const yes=planStructureEdit(nested,{target:{decision:'D',nodeId:'when[0]/when[0]'},operation:'delete',continuation:'yes'}).candidateSource;
 expect(yes).toContain('- when "A" then recommend activity "Met".');
 const no=planStructureEdit(nested,{target:{decision:'D',nodeId:'when[0]/when[0]'},operation:'delete',continuation:'no'}).candidateSource;
 expect(no).toContain('- when "A" then recommend activity "Unmet".');
 const root=planStructureEdit(nested,{target:{decision:'D',nodeId:'when[0]'},operation:'delete',continuation:'yes'}).candidateSource;
 expect(root).toContain('- when "B" then recommend activity "Met".');expect(root).not.toContain('when "A"');
});
test.each(['and','or'] as const)('split %s evaluates all nine true/false/unknown pairs as a compound',operator=>{
 const declaration=(name:string)=>'concept "'+name+'":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `'+name.toLowerCase()+'`.\n- shape reduction is most recent.\n';
 const original='library "L".\n'+declaration('A')+declaration('B')+'activity "Met":\n- request CPGTaskRequest.\nactivity "Unmet":\n- request CPGTaskRequest.\ndecision "D":\nfirst:\n- when "A" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\n';
 const candidate=planStructureEdit(original,{target:{decision:'D',nodeId:'when[0]'},operation:'split',operator,conditions:['"A"','"B"']}).candidateSource;
 let cel='library "Cases". covers "L".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\n';
 for(const name of ['A','B'])for(const v of [true,false])cel+='fact "'+name+v+'": - value is '+v+'. - date is "2026-10-09". - defined by "L"."'+name+'".\n';
 for(const a of [true,false,null])for(const b of [true,false,null]){
  const value=operator==='and'?(a===false||b===false?false:a===null||b===null?null:true):(a===true||b===true?true:a===null||b===null?null:false);
  cel+='case "'+a+'-'+b+'": - subject is "Patient". '+(a===null?'':'- fact is "A'+a+'". ')+(b===null?'':'- fact is "B'+b+'". ')+'- result is "D" is '+(value===null?'pause':'"'+(value?'Met':'Unmet')+'"')+'.\n';
 }
 const root=mkdtempSync(join(tmpdir(),'structure-kleene-'));
 try{
  mkdirSync(join(root,'src/crl'),{recursive:true});mkdirSync(join(root,'src/cel/mv'),{recursive:true});
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'structure-kleene',version:'1.0.0',crl:{canonicalBase:'http://example.org/structure'}}));
  writeFileSync(join(root,'src/crl/policy.crl'),candidate);const file=join(root,'src/cel/mv/cases.cel');writeFileSync(file,cel);
  const result=runCel(resolveCelImports(file),{now:new Date('2026-10-09T00:00:00Z')});
  expect(result.runs).toHaveLength(9);expect(result.runs[0].diagnostics).toEqual([]);expect(result.runs.map(r=>({case:r.case,status:r.status}))).toEqual(result.runs.map(r=>({case:r.case,status:'pass'})));
 }finally{rmSync(root,{recursive:true,force:true});}
});
