import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { flagChangeSummaryJsonSchema, validateFlagChangeSummary } from '../changeSummary';

const base = () => ({schemaVersion:1,runId:'run-1',recordedAt:'2026-11-01T12:00:00.000Z',beforeCommit:'a'.repeat(40),items:[{
  flagIds:['mv-1'],priorState:'Old wording',requestedChange:'Clarify wording',implementedChange:'Updated wording',
  affectedTargets:[{scope:'concept',name:'C',library:'L',label:'Question C'}],
  evidence:[{label:'Delivered CRL',path:'src/crl/policy.crl',sha256:'b'.repeat(64)}],
}]});
const producer=new AjvJsonSchemaValidator().getValidator(flagChangeSummaryJsonSchema as never);
function check(input:unknown,valid:boolean) {
  expect(validateFlagChangeSummary(input).success).toBe(valid);
  expect(producer(input).valid).toBe(valid);
}

test('runtime and exported producer JSON Schema agree on implemented and nonimplementation variants',()=>{
  check(base(),true);
  const no=base(); delete (no.items[0] as Partial<typeof no.items[0]>).implementedChange;
  Object.assign(no.items[0],{notImplementedReason:'Awaiting source clarification'});
  check(no,true);
  Object.assign(no.items[0],{implementedChange:'Both are not valid'}); check(no,false);
  const neither=base(); delete (neither.items[0] as Partial<typeof neither.items[0]>).implementedChange; check(neither,false);
});

test.each(['../outside','src/../outside','src/a/../../outside','src/a/./x','src//x','E:/x','/tmp/x','tests\\x','https://example.com/x','src/a\u0000b','tmp/run/evidence.json'])('rejects unsafe or undelivered evidence path %j',path=>{
  const v=base();v.items[0].evidence[0].path=path;check(v,false);
});
test.each(['src/crl/a.crl','src/medical-validation/change-summaries/run-1/evidence.json','tests/results/report.json'])('permits delivered artifact path %s',path=>{
  const v=base();v.items[0].evidence[0].path=path;check(v,true);
});
test('rejects invalid identities, missing/invalid digests, blank text and status/approval claims',()=>{
  const cases:unknown[]=[];
  const invalid=base(); invalid.items[0].flagIds=['../flag'];cases.push(invalid);
  const run=base();run.runId='../run';cases.push(run);
  for(const recordedAt of ['not a timestamp','2026-11-01T12:00:00Z','2026-11-01T13:00:00+01:00','2026-11-01T12:00:00.1234Z'])cases.push({...base(),recordedAt});
  const missingTime=base(); delete (missingTime as {recordedAt?:string}).recordedAt;cases.push(missingTime);
  const hash=base();hash.items[0].evidence[0].sha256='B'.repeat(64);cases.push(hash);
  const blank=base();blank.items[0].priorState=' \n ';cases.push(blank);
  const noDigest=base();delete (noDigest.items[0].evidence[0] as {sha256?:string}).sha256;cases.push(noDigest);
  cases.push({...base(),approved:true});
  for(const v of cases)check(v,false);
  const empty=base();empty.items[0].evidence=[];check(empty,true);
});
