import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const control=vi.hoisted(()=>({produce:vi.fn(),regression:vi.fn()}));
vi.mock('../../results/produce',()=>({produceResults:control.produce,produceRegressionResults:control.produce,shutdownProducer:vi.fn()}));
vi.mock('../../cel/regression',()=>({runRegression:()=>({success:true})}));
vi.mock('../../cel/suite',()=>({resolveCelSuite:()=>({ok:true,suite:{policyPath:'test.crl'}})}));
vi.mock('../nativeSignals',()=>({installNativeSignals:()=>({interrupted:false})}));
afterEach(()=>{vi.restoreAllMocks();control.produce.mockReset();process.exitCode=0;});
it.each(['emit','regression'])('native %s CLI forwards capture and exits nonzero without changing clinical failed count',async mode=>{
  vi.resetModules();const root=mkdtempSync(join(tmpdir(),'evidence-cli-'));writeFileSync(join(root,'package.json'),'{}');
  const evidenceRoot=join(root,'capture'),evidence={indexPath:join(evidenceRoot,'batch-evidence.json'),complete:false,errors:['capture failed']};
  control.produce.mockResolvedValue({ok:true,manifestPath:'manifest.json',failed:0,manifest:{cases:[]},notEmitted:[],pruned:[],skippedLinks:[],orphaned:[],java:{exe:'test',major:21},engineJar:{path:'test',defaulted:false},evidence});
  const argv=process.argv;process.argv=['node','test',...(mode==='emit'?['--cel',join(root,'case.cel'),'--crl',join(root,'policy.crl'),'--use-case','prior-auth','--out',root,'--enable']:['--project',root,'--native']),'--evidence-root',evidenceRoot];
  const exit=vi.spyOn(process,'exit').mockImplementation((()=>undefined) as never);
  vi.spyOn(process.stdout,'write').mockImplementation(()=>true);vi.spyOn(process.stderr,'write').mockImplementation(()=>true);vi.spyOn(console,'log').mockImplementation(()=>{});
  try{
    if(mode==='emit')await import('../run-emit-results');else await import('../run-regression');
    await vi.waitFor(()=>expect(control.produce).toHaveBeenCalledTimes(1));
    expect(control.produce.mock.calls[0][0].evidenceRoot).toBe(evidenceRoot);
    if(mode==='emit')await vi.waitFor(()=>expect(exit).toHaveBeenCalledWith(2));else await vi.waitFor(()=>expect(process.exitCode).toBe(2));
  }finally{process.argv=argv;rmSync(root,{recursive:true,force:true});}
});
