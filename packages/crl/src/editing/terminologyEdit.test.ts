import {buildCRL} from '../index';
import {planTerminologyEdit,planAnswerClassificationEdit} from './terminologyEdit';
const system='http://example.org/CodeSystem/answers',base='http://example.org';
const source='\uFEFFlibrary "Vocabulary".\r\n// 😀 keep\r\nterminology "Choices":\r\n - system is `'+system+'`.\r\n - code is `yes` display is `Yes`. // retain\r\n - code is `no` display is `No`.\r\nconcept "Answer":\r\n- shape is Record.\r\n- type is Observation.\r\n- value type is CodeableConcept.\r\n- code is `answer`.\r\n- value domain is answer options.\r\n- shape reduction is most recent.\r\n- value from is "Choices":\r\n  - not qualifying is `no`.\r\n';
const request={library:'Vocabulary',terminology:'Choices',canonicalBase:base,system,code:'yes',operation:'update' as const,display:'Affirmative',description:'Supporting evidence 😀'};
test('authored description grammar distinguishes absent display and carries both fields',()=>{
 const parsed=buildCRL('library "V".\nterminology "T":\n- system is `urn:x`.\n- code is `a` description is `Meaning`.\n- code is `b` display is `B` description is `Meaning B`.');
 expect(parsed.success).toBe(true);const term=parsed.result!.statements[0];expect(term.type).toBe('Terminology');if(term.type!=='Terminology')throw Error();
 expect(term.body[1]).toMatchObject({code:'a',description:'Meaning'});expect(term.body[1]).not.toHaveProperty('display');expect(term.body[2]).toMatchObject({code:'b',display:'B',description:'Meaning B'});
});
test('update preserves BOM, Unicode, comments, EOL and coding identity',()=>{
 const p=planTerminologyEdit(source,request);expect(p.candidateSource.startsWith('\uFEFF')).toBe(true);expect(p.candidateSource).toContain('// 😀 keep\r\n');expect(p.candidateSource).toContain('// retain\r\n');expect(p.candidateSource).toContain('code is `yes` display is `Affirmative` description is `Supporting evidence 😀`.');expect(p.candidateSource).not.toMatch(/(?<!\r)\n/);
});
test('create and delete preserve other members and reconcile only selected consumer exceptions',()=>{
 const added=planTerminologyEdit(source,{...request,operation:'create',code:'other',display:'Other',description:''});
 expect(added.candidateSource).toContain('code is `other` display is `Other`.');
 const classified=planAnswerClassificationEdit(added.candidateSource,['Answer'],'other',true);expect(classified.candidateSource).toContain('not qualifying is `other`.');
 const removed=planTerminologyEdit(classified.candidateSource,{...request,operation:'delete',code:'no'});
 const clean=planAnswerClassificationEdit(removed.candidateSource,['Answer'],'no',false);expect(clean.candidateSource).not.toContain('not qualifying is `no`');expect(clean.candidateSource).toContain('not qualifying is `other`');
});
test('removing the last exception restores a dotted value-from binding',()=>{
 const p=planAnswerClassificationEdit(source,['Answer'],'no',false);expect(p.candidateSource).toContain('- value from is "Choices".');expect(buildCRL(p.candidateSource.replace(/^\uFEFF/,'')).success).toBe(true);
});
test('CRUD finds exact members and insertion point across repeated sections of the same system',()=>{
 const repeated='library "Vocabulary".\nterminology "Choices":\n- system is `'+system+'`.\n- code is `first` display is `First`.\n// keep section\n- system is `'+system+'`.\n- code is `yes` display is `Yes`.\n';
 expect(planTerminologyEdit(repeated,request).candidateSource).toContain('display is `Affirmative`');
 const deleted=planTerminologyEdit(repeated,{...request,operation:'delete'});expect(deleted.candidateSource).toContain('code is `first`');expect(deleted.candidateSource).toContain('// keep section');expect(deleted.candidateSource.match(/system is/g)).toHaveLength(1);
 const created=planTerminologyEdit(repeated,{...request,operation:'create',code:'last'});expect(created.candidateSource.indexOf('code is `last`')).toBeGreaterThan(created.candidateSource.indexOf('code is `yes`'));
});
test('external, opaque, duplicate, empty and unrepresentable changes are refused',()=>{
 expect(()=>planTerminologyEdit(source,{...request,system:'urn:external'})).toThrow(/externally owned/);
 expect(()=>planTerminologyEdit(source,{...request,operation:'create'})).toThrow(/already exists/);
 expect(()=>planTerminologyEdit(source,{...request,display:''})).toThrow(/text is required/);
 expect(()=>planTerminologyEdit(source,{...request,description:'bad`text'})).toThrow(/losslessly/);
 expect(()=>planTerminologyEdit(source,{...request,code:'bad code'})).toThrow(/without whitespace/);
 expect(()=>planTerminologyEdit(source.replace(' - code is `no` display is `No`.\r\n',''),{...request,operation:'delete'})).toThrow(/final answer/);
 expect(()=>planTerminologyEdit('library "Vocabulary". terminology "Choices": - valueset is `http://example.org/ValueSet/ref`.',request)).toThrow();
});
