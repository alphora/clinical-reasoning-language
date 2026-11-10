import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { batchEvidenceJsonSchema, BatchEvidenceWriter, validateEvidenceRoot } from '../batchEvidence';
import { runOneCase } from '../runProducer';
import { DEFAULT_BOUNDS } from '../spawn';
import type { ProducerCaseInput } from '../caseInput';
import type { OwnedProcessResult } from '../ownedProcess';

const control=vi.hoisted(()=>({failFile:'',partialFile:'',failRename:false}));
vi.mock('node:fs',async original=>{
  const fs=await original<typeof import('node:fs')>();
  return {...fs,writeFileSync:(...args:Parameters<typeof fs.writeFileSync>)=>{
    if(control.failFile&&String(args[0]).endsWith(control.failFile))throw new Error('capture disk failure');
    if(control.partialFile&&String(args[0]).endsWith(control.partialFile)){fs.writeFileSync(args[0],Buffer.from(args[1] as string).subarray(0,40),args[2]);throw new Error('partial write');}
    return fs.writeFileSync(...args);
  },renameSync:(...args:Parameters<typeof fs.renameSync>)=>{if(control.failRename)throw new Error('rename failure');return fs.renameSync(...args);}};
});
let parent:string,source:string,out:string;
const input=(id:string):ProducerCaseInput=>({caseName:'Same name',caseId:id,sourceFile:id+'.cel',compartmentDir:'patient/'+id,compartmentId:id,subjectReference:'Patient/'+id,resources:[]});
const validate=new AjvJsonSchemaValidator().getValidator(batchEvidenceJsonSchema as never);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const params=(form=true)=>({resourceType:'Parameters',parameter:[{name:'return',resource:{resourceType:'Bundle',entry:[
  {resource:{resourceType:'Task',id:'actual-task',status:'requested',code:{text:'ACTUAL, NOT EXPECTATION'}}},
  ...(form?[{resource:{resourceType:'Questionnaire',id:'q',item:[]}},{resource:{resourceType:'QuestionnaireResponse',id:'qr'}}]:[]),
]}}]});
const result=(value=params()):OwnedProcessResult=>{
  const bytes=Buffer.from(JSON.stringify(value));
  return {stdout:bytes.toString(),stderr:'',status:0,cleanupConfirmed:true,outputCapture:{origin:'worker-job-files',workerPid:123,status:{kind:'worker-request',code:0},
    stdout:{bytes,observedBytes:bytes.length,retained:'all',complete:true},stderr:{bytes:Buffer.alloc(0),observedBytes:0,retained:'all',complete:true}}};
};
beforeEach(()=>{parent=mkdtempSync(path.join(tmpdir(),'batch-evidence-'));source=path.join(parent,'source');out=path.join(parent,'out');mkdirSync(source);mkdirSync(out);control.failFile='';control.partialFile='';control.failRename=false;});
afterEach(()=>{control.failFile='';control.partialFile='';control.failRename=false;rmSync(parent,{recursive:true,force:true});});
function writer(inputs=[input('a')],limits?:{artifactBytes:number;batchBytes:number}){
  const root=validateEvidenceRoot(path.join(parent,'evidence'),[source,out]);
  const w=new BatchEvidenceWriter(root,{producerVersion:'test',suite:'mv',useCase:'prior-auth',inputClock:'2026-11-09T00:00:00Z'},inputs,limits);
  w.definitions([{resourceType:'PlanDefinition',id:'policy'}],{'L.cql':'library L'},'a'.repeat(64),'policy',[]);
  w.runtime({engineJarSha256:'engine',nativeMode:'worker'},'b'.repeat(64));
  return w;
}
function repo(){const file=path.join(parent,'repository.json');writeFileSync(file,Buffer.from('{"resourceType":"Bundle","entry":[]}\n'));return file;}
const evaluation=(id='a')=>({caseName:'Same name',sourceFile:id+'.cel',caseId:id,compartmentDir:'patient/'+id,state:'generated' as const});

// @kit produce-results:raw-same-call-evidence
it('indexes exact same-call repository/native Task bytes with duplicate case-name disambiguation',()=>{
  const w=writer([input('a'),input('b')]),repository=repo();
  for(let i=0;i<2;i++){
    const capture=w.begin(i,input(i?'b':'a'),'policy',repository);capture.request({dataBundle:null,dataLocation:'repository'});
    capture.result(result(),params(),{startedAt:'s',finishedAt:'f',elapsedMs:1},'worker');expect(validate(JSON.parse(readFileSync(w.indexPath,'utf8'))).valid).toBe(true);w.finishCase(i,evaluation(i?'b':'a'));
  }
  const receipt=w.finish();expect(receipt.complete).toBe(true);
  const bytes=readFileSync(receipt.indexPath),index=JSON.parse(bytes.toString());expect(hash(bytes)).toBe(receipt.sha256);expect(validate(index).valid).toBe(true);
  expect(new Set(index.cases.map((c:any)=>c.captureId)).size).toBe(2);
  for(const row of index.cases){
    for(const file of Object.values(row.files) as any[]){const b=readFileSync(path.join(w.root,file.path));expect(hash(b)).toBe(file.sha256);expect(b.length).toBe(file.bytes);}
    expect(readFileSync(path.join(w.root,row.files.repository.path))).toEqual(readFileSync(repository));
    expect(JSON.parse(readFileSync(path.join(w.root,row.files.parameters.path),'utf8')).parameter[0].resource.entry[0].resource.id).toBe('actual-task');
    expect(row.native.statusKind).toBe('worker-request');
  }
});

// @kit produce-results:evidence-failure-separation
it('a capture-write failure preserves successful clinical outputs and makes exactly one native call',async()=>{
  const w=writer(),repository=repo(),capture=w.begin(0,input('a'),'policy',repository),run=vi.fn(async()=>result());
  control.failFile='stdout.bin';
  const entry=await runOneCase({javaExe:'unused',engineJarPath:'unused.jar',bounds:DEFAULT_BOUNDS,planDefinitionId:'policy',artifactRoot:out,evidence:capture,runtime:{mode:'worker',pid:123,run}},
    {caseName:'Same name',compartmentId:'a',subjectReference:'Patient/a',repoPath:repository});
  expect(run).toHaveBeenCalledTimes(1);expect(run.mock.calls[0]?.[1]).toMatchObject({captureOutput:true});
  expect(entry.state).toBe('generated');expect(entry.artifacts).toHaveLength(2);
  expect(entry.artifacts!.every(a=>existsSync(path.join(out,a.path)))).toBe(true);
  w.finishCase(0,entry);const receipt=w.finish();expect(receipt.complete).toBe(false);expect(receipt.errors.join()).toContain('capture disk failure');
  expect(w.index.cases[0].evaluation?.state).toBe('generated');
});

it('capture-off retains the old invocation options and clinical shape',async()=>{
  const run=vi.fn(async()=>result()),repository=repo();
  const entry=await runOneCase({javaExe:'unused',engineJarPath:'unused.jar',bounds:DEFAULT_BOUNDS,planDefinitionId:'policy',artifactRoot:out,runtime:{mode:'worker',run}},
    {caseName:'Same name',compartmentId:'a',subjectReference:'Patient/a',repoPath:repository});
  expect(run).toHaveBeenCalledTimes(1);expect(run.mock.calls[0]?.[1]).not.toHaveProperty('captureOutput');expect(entry.state).toBe('generated');
});

it('captures a no-form native Task without inventing a Questionnaire',async()=>{
  const w=writer(),repository=repo(),value=params(false);
  const entry=await runOneCase({javaExe:'unused',engineJarPath:'unused.jar',bounds:DEFAULT_BOUNDS,planDefinitionId:'policy',artifactRoot:out,evidence:w.begin(0,input('a'),'policy',repository),runtime:{mode:'worker',run:async()=>result(value)}},
    {caseName:'Same name',compartmentId:'a',subjectReference:'Patient/a',repoPath:repository});
  expect(entry.state).toBe('no-questionnaire');w.finishCase(0,entry);expect(w.finish().complete).toBe(true);
});

it.each(['timeout','cancelled','output-limit','cleanup-unconfirmed'] as const)('retains incomplete %s evidence separately from evaluation',failure=>{
  const w=writer(),capture=w.begin(0,input('a'),'policy',repo()),proc=result();proc.failure=failure;proc.cleanupConfirmed=failure!=='cleanup-unconfirmed';proc.outputCapture!.stdout.complete=false;
  capture.result(proc,undefined,{startedAt:'s',finishedAt:'f',elapsedMs:1},'worker');w.finishCase(0,{...evaluation(),state:'failed'});
  expect(w.finish().complete).toBe(false);expect(w.index.cases[0].native?.failure).toBe(failure);expect(w.index.cases[0].files.stdout).toBeDefined();
});

it('retains original non-UTF8 bytes and explicitly identifies derived parsed JSON',()=>{
  const w=writer(),capture=w.begin(0,input('a'),'policy',repo()),proc=result();const raw=Buffer.from([0xff,0xfe,0,0x61]);proc.outputCapture!.stderr={bytes:raw,observedBytes:raw.length,retained:'all',complete:true};
  capture.result(proc,params(),{startedAt:'s',finishedAt:'f',elapsedMs:1},'worker');w.finishCase(0,evaluation());expect(w.finish().complete).toBe(true);
  expect(readFileSync(path.join(w.root,w.index.cases[0].files.stderr.path))).toEqual(raw);
});

// @kit produce-results:evidence-no-replay
it('retained successes and unexecuted cases remain unavailable, without new native calls',()=>{
  const w=writer([input('a'),input('b')]);w.finishCase(0,{...evaluation(),reused:true});w.finishCase(1,{...evaluation('b'),state:'not-run'});
  expect(w.finish().complete).toBe(false);expect(w.index.cases.map(c=>c.captureState)).toEqual(['unavailable','unavailable']);expect(w.index.cases[0].reason).toContain('not evaluated again');
});

it('artifact and batch-budget exhaustion leave an incomplete receipt',()=>{
  const w=writer(undefined,{artifactBytes:10000,batchBytes:16000});const capture=w.begin(0,input('a'),'policy',repo());
  capture.request({large:'x'.repeat(10001)});capture.result(result(),params(),{startedAt:'s',finishedAt:'f',elapsedMs:1},'worker');w.finishCase(0,evaluation());
  expect(w.finish().complete).toBe(false);expect(w.index.errors.join()).toContain('limit exceeded');
});

it('initial and interrupted indexes cannot masquerade as complete',()=>{
  const w=writer();expect(JSON.parse(readFileSync(w.indexPath,'utf8'))).toMatchObject({state:'running',complete:false});w.begin(0,input('a'),'policy',repo());
  expect(JSON.parse(readFileSync(w.indexPath,'utf8'))).toMatchObject({state:'running',complete:false});
});

it('refuses existing, relative, overlapping and linked roots before dispatch',()=>{
  for(const root of ['relative',source,path.join(source,'capture'),parent])expect(()=>validateEvidenceRoot(root,[source,out])).toThrow();
  const link=path.join(parent,'alias');symlinkSync(source,link,process.platform==='win32'?'junction':'dir');expect(()=>validateEvidenceRoot(path.join(link,'capture'),[source,out])).toThrow();
});

it('schema distinguishes missing, unsafe, corrupted and incomplete evidence from complete capture',()=>{
  const w=writer(),capture=w.begin(0,input('a'),'policy',repo());capture.request({dataBundle:null});
  capture.result(result(),params(),{startedAt:'s',finishedAt:'f',elapsedMs:1},'worker');w.finishCase(0,evaluation());w.finish();
  const copy=()=>JSON.parse(JSON.stringify(w.index));
  for(const mutate of [
    (x:any)=>{delete x.cases[0].files.stdout;},
    (x:any)=>{x.cases[0].files.stdout.path='../outside';},
    (x:any)=>{x.cases[0].files.stdout.sha256='corrupt';},
    (x:any)=>{x.cases[0].streams.stdout.complete=false;},
    (x:any)=>{x.state='running';},
    (x:any)=>{x.cases[0].native.failure='timeout';},
  ]){const value=copy();mutate(value);expect(validate(value).valid).toBe(false);}
});
it('pre-dispatch batch stop records every selected row as unavailable',()=>{
  const w=writer([input('a'),input('b')]);const receipt=w.finish('probe failed');
  expect(receipt.complete).toBe(false);expect(w.index.cases.every(c=>c.captureState==='unavailable'&&c.inputSha256.length===64)).toBe(true);
  expect(validate(w.index).valid).toBe(true);
});

it.each(['rename','partial'] as const)('retained disk bytes stay bounded after repeated %s failures',kind=>{
  const w=writer(undefined,{artifactBytes:12000,batchBytes:20000}),capture=w.begin(0,input('a'),'policy',repo());
  if(kind==='rename')control.failRename=true;else control.partialFile='request.json';
  for(let i=0;i<100;i++)capture.request({dataBundle:null});
  const receipt=w.finish();expect(receipt.complete).toBe(false);
  const size=(dir:string):number=>readdirSync(dir).reduce((sum,name)=>{const file=path.join(dir,name);return sum+(statSync(file).isDirectory()?size(file):statSync(file).size);},0);
  expect(size(w.root)).toBeLessThanOrEqual(20000);expect(receipt.errors.length).toBeGreaterThan(0);
});
