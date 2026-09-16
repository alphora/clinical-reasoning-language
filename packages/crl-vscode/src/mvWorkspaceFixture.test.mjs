import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolveCelSuite, findPolicySrc, emitCrlTwoLane, coerceFlag, isValidFlagId, runCel } from '@smile-digital-health/crl';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const example = join(root, 'examples/bleph-medical-validation');

test('the Bleph MV example is discoverable and its native forms match its MV cases', () => {
  const mv = resolveCelSuite(example, 'mv');
  assert.equal(mv.ok, true, JSON.stringify(mv.diagnostics));
  assert.ok(mv.suite.files.length > 0);
  const names = [];
  for (const file of mv.suite.files) {
    assert.match(file.sourceFile, /^src\/cel\/mv\/.+\.cel$/);
    assert.equal(findPolicySrc(file.path), mv.suite.policySrc);
    names.push(...file.graph.cel.statements.filter(s => s.type === 'CELCase').map(s => s.name));
  }
  assert.equal(names.length, 16, 'L34194 clinical route examples');
  const manifest = JSON.parse(readFileSync(join(example, 'tests/results/questionnaire-manifest-mv.json'), 'utf8'));
  assert.ok(Number.isFinite(Date.parse(manifest.generatedAt)));
  assert.deepEqual(manifest.provenance,{"crlVersion":"5.4.2","producerJarSha256":"9870fc867547f65518c5cd6e698ace77b60a9e98797ed38330c25d06cbf5cb2e"});
  assert.deepEqual(manifest.cases.map(c => c.caseName).sort(), names.sort());
  for (const c of manifest.cases) {
    assert.equal(c.state, 'generated');
    assert.ok(c.artifacts.some(a => a.resourceType === 'Questionnaire'));
    assert.ok(c.artifacts.some(a => a.resourceType === 'QuestionnaireResponse'));
    for (const artifact of c.artifacts) {
      const file = join(example, artifact.path);
      assert.ok(existsSync(file), artifact.path);
      assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), artifact.sha256, artifact.path);
    }
  }
  const regression = resolveCelSuite(example, 'regression');
  assert.equal(regression.ok, true, JSON.stringify(regression.diagnostics));
  assert.ok(regression.suite.files.some(f => f.role === 'regression'));
  assert.equal(regression.suite.files.reduce((n, f) => n + f.graph.cel.statements.filter(s => s.type === 'CELCase').length, 0), 46, 'clinical examples plus engineering controls');
  assert.deepEqual(regression.suite.files.filter(f => f.role === 'mv').map(f => f.sourceFile), mv.suite.files.map(f => f.sourceFile));
});

test('the Bleph debugger opens the maintained MV workspace', () => {
  const launches = JSON.parse(readFileSync(join(root, '.vscode/launch.json'), 'utf8'));
  const launch = launches.configurations.find(c => c.name === 'Run Bleph Medical Validation (isolated)');
  assert.ok(launch);
  for(const config of launches.configurations){
    assert.equal(config.args.filter(a=>a.startsWith('--user-data-dir=')).length,1);
    assert.equal(config.args.filter(a=>a.startsWith('--extensions-dir=')).length,1);
  }
  const entries = launch.args.filter(a => a.endsWith('.code-workspace'));
  assert.equal(entries.length, 1, 'Bleph debugger must open exactly one shared workspace entry');
  const entry = entries[0].replace('${workspaceFolder}', root);
  const workspace = JSON.parse(readFileSync(entry, 'utf8'));
  assert.ok(workspace.folders.some(f => resolve(dirname(entry), f.path) === example));
  const tasks = JSON.parse(readFileSync(join(root, '.vscode/tasks.json'), 'utf8'));
  assert.ok(tasks.tasks.some(t => t.label === launch.preLaunchTask), 'debug pre-launch build task exists');
  const extensions = launch.args.filter(a => a.startsWith('--extensionDevelopmentPath='));
  assert.equal(extensions.length, 1);
  assert.equal(resolve(extensions[0].slice('--extensionDevelopmentPath='.length).replace('${workspaceFolder}', root)), join(root, 'packages/crl-vscode'));
});

test('the L34194 native delivery stays bound to its source snapshot and emitted patient data',()=>{
 const base=join(example,'src');
 const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
 // Bind the verified clinical source and CQL, separately from mutable review state.
 const sources=['crl','cel','cql','anchor-source','provenance','source','refined-source'].flatMap(name=>files(join(base,name))).map(p=>[relative(base,p).replaceAll('\\','/'),p.endsWith('.docx')?readFileSync(p).toString('base64'):readFileSync(p,'utf8').replaceAll('\r\n','\n')]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 const config=JSON.parse(readFileSync(join(example,'package.json'),'utf8')).crl;
 // Update this evidence binding only after source/result regeneration and native verification.
 assert.equal(createHash('sha256').update(JSON.stringify({sources,config})).digest('hex'),'d02959fc8007a06d37f22e514e93ea462a9556a89ed2e51d237fb36fdb99ed38');
 const data=JSON.parse(readFileSync(join(example,'tests/data/fhir/cel-data-manifest.json'),'utf8'));
 const results=JSON.parse(readFileSync(join(example,'tests/results/questionnaire-manifest-mv.json'),'utf8'));
 assert.deepEqual(data.cases.map(c=>c.caseId).sort(),results.cases.map(c=>c.caseId).sort());
 for(const c of data.cases)for(const a of c.artifacts)assert.equal(createHash('sha256').update(readFileSync(join(example,'tests/data/fhir',a.path))).digest('hex'),a.sha256,a.path);
 const workspace=JSON.parse(readFileSync(join(example,'medical-validation.code-workspace'),'utf8'));
 assert.deepEqual(workspace.settings['crl.medical-validation.paneOrder'],['source','questionnaire','fhirQuestionnaire','tree']);
});

test('the Bleph example includes the complete matching FHIR definition set',()=>{
 const emitted=emitCrlTwoLane(join(example,'src/crl/blepharoplasty-blepharoptosis-repair.crl'),{date:'2025-10-16'});
 assert.equal(emitted.success,true,JSON.stringify(emitted.hardErrors));
 const list=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(join(dir,e.name)):[join(dir,e.name)]);
 const base=join(example,'src/fhir');
 assert.deepEqual(list(base).map(p=>relative(base,p).replaceAll('\\','/')).sort(),emitted.fhir.resources.map(r=>r.relativePath.replaceAll('\\','/')).sort());
 assert.equal(emitted.fhir.resources.length,26);
 for(const r of emitted.fhir.resources){
  const file=join(base,r.relativePath);
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),r.resource);
  if(r.resource.resourceType==='Library')for(const content of r.resource.content??[]){
   if(content.contentType==='text/cql'){
    assert.match(content.url,/^\.\.\/\.\.\/cql\/[^/]+\.cql$/);
    assert.ok(existsSync(resolve(dirname(file),content.url)),content.url);
   }
  }
 }
 assert.deepEqual(readdirSync(join(example,'src/cql')).sort(),emitted.cqlLibraries.map(r=>r.outputFilename).sort());
 for(const r of emitted.cqlLibraries)assert.equal(readFileSync(join(example,'src/cql',r.outputFilename),'utf8').replaceAll('\r\n','\n'),r.cql.replaceAll('\r\n','\n'));
});

test('the Bleph demo flag is valid and historical verdicts stay outside active MV state',()=>{
 const file='ke-ui-demo.json';
 const raw=JSON.parse(readFileSync(join(example,'src/medical-validation/flags',file),'utf8'));
 const flag=coerceFlag(raw);
 assert.ok(flag);
 assert.ok(isValidFlagId(flag.id));
 assert.equal(file,flag.id+'.json');
 assert.equal(flag.category,'extraction');
 assert.equal(flag.anchor.name,'Cosmetic Surgical Purpose');
 const sample=JSON.parse(readFileSync(join(example,'review-samples/legacy-acceptance-verdicts.json'),'utf8'));
 assert.equal(sample.schemaVersion,2);
 assert.equal(Object.keys(sample.byCaseId).length,2);
 assert.equal(execFileSync('git', ['ls-files', '--', 'examples/bleph-medical-validation/src/medical-validation/bleph-medical-validation.json'], {cwd: root, encoding: 'utf8'}).trim(), '', 'human MV state is not shipped in the tracked example');
});


// @kit mv-case-authoring:l34194-example
test('L34194 cases select the correct procedure evidence and preserve unanswered states',()=>{
 const selected=resolveCelSuite(example,'regression');
 assert.equal(selected.ok,true);
 const runs=selected.suite.files.flatMap(file=>{
  const checked=runCel(file.graph);
  assert.equal(checked.success,true,JSON.stringify(checked.errors));
  assert.ok(checked.runs.every(r=>r.status==='pass'),JSON.stringify(checked.runs.filter(r=>r.status!=='pass')));
  return checked.runs;
 });
 assert.equal(runs.length,46);
 assert.equal(runs.filter(r=>r.expected?.pause).length,14);
 for(const [name,upper] of [
  ['Upper blepharoplasty — pseudo-MRD 2.0 mm or less',true],
  ['Ptosis repair — actual-margin MRD 2.0 mm or less',false],
 ]){
  const run=runs.find(r=>r.case===name);
  assert.equal(run.produced[0].recommendation,'certify.Met');
  assert.match(run.produced[0].viaWhen,upper?/Upper Blepharoplasty Evidence/:/Blepharoptosis Repair Evidence/);
  assert.equal(run.trace[0].concept,'Cosmetic Surgical Purpose');
  assert.equal(run.trace[0].satisfied,false);
  assert.equal(run.trace[1].conditionTrace.criterion.name,'Functional Necessity Documented');
  assert.equal(run.trace[1].satisfied,true);
 }
 const options=JSON.parse(readFileSync(join(example,'src/fhir/ValueSet/l34194-bleph-example-procedure-options.json'),'utf8'));
 // The otherwise procedure arm is valid only for this closed two-procedure domain.
 assert.deepEqual(options.compose.include.flatMap(g=>g.concept.map(c=>c.code)).sort(),['blepharoptosis-repair','upper-blepharoplasty']);
});

// @kit branch-guards:l34194-shared-checks
test('the policy shares common checks before selecting procedure-specific evidence',()=>{
 const emitted=emitCrlTwoLane(join(example,'src/crl/blepharoplasty-blepharoptosis-repair.crl'),{date:'2025-10-16'});
 assert.equal(emitted.success,true);
 const plan=emitted.fhir.resources.find(r=>r.sourceKind==='Decision').resource;
 const flatten=actions=>(actions??[]).flatMap(a=>[a,...flatten(a.action)]);
 const actions=flatten(plan.action);
 for(const name of ['Cosmetic Surgical Purpose','Functional Necessity Documented','Upper Blepharoplasty Under Review','Upper Blepharoplasty Evidence','Blepharoptosis Repair Evidence']){
  assert.equal(actions.filter(a=>a.title===name).length,1,name+' must occur once in the executable tree');
 }
 const common=actions.find(a=>a.title==='Functional Necessity Documented');
 const descendants=flatten(common.action).map(a=>a.title);
 assert.ok(descendants.includes('Upper Blepharoplasty Evidence'));
 assert.ok(descendants.includes('Blepharoptosis Repair Evidence'));
 const expressions=a=>(a.condition??[]).map(c=>c.expression.expression);
 assert.equal(common.condition.length,2);
 assert.match(expressions(common)[0],/^not .*"Cosmetic Surgical Purpose"/);
 assert.match(expressions(common)[1],/^"[^"]+"\."Functional Necessity Documented"$/);
 const rejection=plan.action[0].action.find(a=>a.title==='otherwise');
 assert.equal(rejection.condition.length,2);
 assert.match(expressions(rejection)[0],/^not .*"Cosmetic Surgical Purpose"/);
 assert.match(expressions(rejection)[1],/^not .*"Functional Necessity Documented"/);
 for(const expression of actions.flatMap(expressions))assert.doesNotMatch(expression,/Coalesce\s*\(/i);
 const provenance=JSON.parse(readFileSync(join(example,'src/provenance/L34194-v27-2025-10-16.provenance.json'),'utf8'));
 const shared=provenance.clusters.find(c=>c.crl.some(r=>r.nodeId==='otherwise/action[0]'));
 assert.deepEqual(shared.items.slice().sort(),['lcd-complaint','lcd-cosmetic','lcd-individual','lcd-minimum']);
 assert.deepEqual(shared.cel.filter(r=>r.file.includes('/mv/')).map(r=>r.caseId).sort(),['ptosis-complaint-unmet','ptosis-necessity-unmet','upper-complaint-unmet','upper-necessity-unmet']);
 const suite=resolveCelSuite(example,'regression');
 assert.equal(suite.ok,true,JSON.stringify(suite.diagnostics));
 const runs=suite.suite.files.flatMap(f=>runCel(f.graph).runs);
 const cosmetic=runs.find(r=>r.case==='Cosmetic exclusion wins with otherwise qualifying evidence');
 assert.equal(cosmetic.status,'pass');
 assert.deepEqual(cosmetic.produced.map(p=>p.recommendation),['not-certify.Unmet']);
 for(const name of ['Cosmetic purpose resolves before procedure selection','Negative functional complaint with necessity and procedure unanswered']){
  const run=runs.find(r=>r.case===name);assert.equal(run.status,'pass');assert.equal(run.produced[0].recommendation,'not-certify.Unmet');
 }
 for(const name of ['Unanswered functional necessity pauses before negative skin evidence','Unanswered cosmetic purpose pauses before negative clinical evidence']){
  const run=runs.find(r=>r.case===name);assert.equal(run.status,'pass');assert.deepEqual(run.produced,[]);assert.equal(run.expected.pause,true);
 }
});

test('procedure selection uses recency and rejects ambiguous or unrecognized answers',()=>{
 // These selector mutations exercise CRE diagnostics; native coverage is the authored CEL suite.
 for(const mode of ['tie','newer','foreign']){
  const graph=resolveCelSuite(example,'mv').suite.files[0].graph;
  const first=graph.cel.statements.find(s=>s.type==='CELCase');
  const ptosis=graph.cel.statements.find(s=>s.name==='procedure blepharoptosis-repair 2026-01-01');
  if(mode==='foreign'){
   graph.cel.statements.find(s=>s.name==='procedure upper-blepharoplasty 2026-01-01')
    .body.find(f=>f.type==='CELValueField').value.value='out-of-domain';
  }else{
   first.body.push({type:'CELFactRefField',factName:ptosis.name});
   if(mode==='newer'){
    ptosis.body.find(f=>f.type==='CELDateField').value='2026-02-01';
    first.body.push({type:'CELFactRefField',factName:'mrd true 2026-01-01'},
     {type:'CELFactRefField',factName:'ptosisPhotos true 2026-01-01'});
   }
  }
  const result=runCel(graph).runs[0];
  if(mode==='newer'){
   assert.equal(result.status,'pass');
   assert.match(result.produced[0].viaWhen,/Blepharoptosis Repair Evidence/);
  }else{
   assert.equal(result.status,'error');
   assert.deepEqual(result.produced,[]);
   assert.match(result.diagnostics.join(' '),mode==='tie'?/publication-ambiguous-selection/:/local-coded-value-invalid/);
  }
 }
});
