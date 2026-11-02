// REFACTOR:grounded: resolve real source scopes before trusting a diagram's library/name identity.
import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCelSuite, buildExecutionModel } from '../../index';
import { buildCrlConceptLayer } from '../crlConceptLayer';
import { prepareCelPublicationOutcome } from '../../cel/emitter/emitFhir';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0)){if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Unexpected test scratch path');rmSync(dir,{recursive:true,force:true});}});
const source=readFileSync(join(__dirname,'conditionAnswers.test.ts'),'utf8').match(/const source = `([\s\S]*?)`;\nfunction fixture/)![1].replace(/\\`/g,'`');
const activities='\nactivity "Met": - request CPGTaskRequest. - with `Met`.\n';
function setup(crl:string,extra:Record<string,string>={}) {
  const dir=mkdtempSync(join(tmpdir(),'crl-connector-'));dirs.push(dir);
  const files:Record<string,string>={
    'package.json':JSON.stringify({name:'connector-scope',version:'1.0.0',crl:{canonicalBase:'https://example.org/connector-scope',date:'2026-11-02'}}),
    'src/crl/main.crl':crl,
    'src/cel/mv/cases.cel':`library "Cases". covers "${crl.match(/library "([^"]+)"/)![1]}". fact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient". case "Missing": - subject is "Patient". - result is "D" is pause.`,
    ...extra};
  for(const [file,text] of Object.entries(files)){mkdirSync(join(dir,file,'..'),{recursive:true});writeFileSync(join(dir,file),text);}
  const result=resolveCelSuite(dir);expect(result.ok,JSON.stringify(result)).toBe(true);if(!result.ok)throw Error('Fixture resolution failed');
  return {graph:result.suite.files[0].graph,get model(){return buildExecutionModel(result.suite.files[0].graph);}};
}
it('retains rejection at a named composite boundary while preserving a compound decision guard',()=>{
  const composite=`concept "Named composite":
- shape is Record.
- type is Observation.
- value type is boolean.
- defined as ("First check" and "Second check").
- shape reduction is most recent.
`;
  const named=setup(source+composite+activities+'decision "D": first: - when "Named composite" then recommend activity "Met".');
  expect(named.model.conceptLayer.find(n=>n.name==='Named composite')?.conditionAnswers).toMatchObject({status:'unsupported',subjects:[]});
  expect(named.model.conceptLayer.find(n=>n.name==='Named composite')?.conditionAnswers?.expression).toContain('First check');
  const guard=setup(source+activities+'decision "D": first: - when ("First check" and "Second check") then recommend activity "Met".');
  expect([...guard.model.guardOutlines.values()][0].expr.kind).toBe('and');
  expect(guard.model.conceptLayer.filter(n=>n.name.endsWith('check')).map(n=>n.conditionAnswers?.status)).toEqual(['simple','simple']);
});
it('does not borrow a local shadow when an explicit include selects the package',()=>{
  const root='library "Root". include "Answers".'+activities+'decision "D": first: - when "Answers"."First check" then recommend activity "Met".';
  const packaged=source.replace('- code is `a`.\n- code is `c`.\nterminology "Second subset"','- code is `b`.\nterminology "Second subset"');
  const {graph,model}=setup(root,{'src/crl/local-answers.crl':source,'node_modules/answer-lib/package.json':JSON.stringify({name:'answer-lib',version:'1.0.0',crl:{libraries:['answers.crl']}}),'node_modules/answer-lib/answers.crl':packaged});
  expect(graph.crlRegistry?.byNameLocal.has('Answers')).toBe(true);
  expect(graph.crlRegistry?.byNamePackage.has('Answers')).toBe(true);
  const prepared=prepareCelPublicationOutcome(graph);expect(prepared.kind).toBe('prepared');
  if(prepared.kind!=='prepared'||!prepared.program)throw Error('Expected prepared publication');
  const selected=prepared.program.descriptors.find(d=>d.title==='First check');
  expect(selected?.identity.sourceIdentity).toContain('node_modules');
  expect(selected?.producer?.kind).toBe('membership');
  const retained=model.conceptLayer.find(n=>n.lib==='Answers'&&n.name==='First check')!;
  expect(retained.location.filePath).toContain('local-answers');
  expect(retained.conditionAnswers).toMatchObject({status:'unsupported',subjects:[]});
});

it('handles a shared Boolean-only dependency graph without unfolding every path',()=>{
  let text='library "Boolean graph".\n';
  for(let i=0;i<44;i++)text+=`concept "C${i}":
- type is Observation.
- value type is boolean.
${i<2?'':`- defined as ("C${i-1}" and "C${i-2}").`}
`;
  text+='concept \"Unrelated publication\": - shape is Record. - type is Observation. - value type is boolean. - code is `unrelated`. - shape reduction is most recent.\n';
  const {graph}=setup(text+activities+'decision "D": first: - when "C43" then recommend activity "Met".');
  const prepared=prepareCelPublicationOutcome(graph);
  expect(prepared.kind==='prepared' && !!prepared.program).toBe(true);
  const nodes=buildCrlConceptLayer(graph);
  expect(nodes).toHaveLength(45);
  expect(nodes.every(n=>!n.conditionAnswers)).toBe(true);
},1500);
