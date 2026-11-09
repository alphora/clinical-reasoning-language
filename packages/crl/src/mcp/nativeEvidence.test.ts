import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const control=vi.hoisted(()=>({produce:vi.fn()}));
vi.mock('../results/produce',()=>({produceResults:control.produce,shutdownProducer:vi.fn()}));
import {createServer} from './server';
afterEach(()=>{vi.unstubAllEnvs();control.produce.mockReset();});
it.each([true,false,undefined])('MCP forwards opt-in evidence and reports capture completeness %s independently',async complete=>{
  const root=mkdtempSync(join(tmpdir(),'evidence-mcp-'));writeFileSync(join(root,'package.json'),'{}');
  const evidence=complete===undefined?undefined:{indexPath:join(root,'capture','batch-evidence.json'),complete,errors:complete?[]:['disk unavailable']};
  control.produce.mockResolvedValue({ok:true,manifestPath:'manifest.json',failed:0,manifest:{cases:[]},notEmitted:[],pruned:[],skippedLinks:[],orphaned:[],java:{exe:'test',major:21},engineJar:{path:'test',defaulted:false},...(evidence?{evidence}:{})});
  vi.stubEnv('CRL_ENABLE_RESULTS','1');
  const server=createServer(),client=new Client({name:'evidence-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(st);await client.connect(ct);
    const tool=(await client.listTools()).tools.find(t=>t.name==='emit_results')!;expect(tool.inputSchema.properties).toHaveProperty('evidenceRoot');
    const args={celPath:join(root,'case.cel'),crlPath:join(root,'policy.crl'),outRoot:root,useCase:'prior-auth',...(evidence?{evidenceRoot:join(root,'capture')}:{})};
    const result=await client.callTool({name:'emit_results',arguments:args});
    expect(control.produce).toHaveBeenCalledTimes(1);expect(control.produce.mock.calls[0][0].evidenceRoot).toBe(args.evidenceRoot);
    expect(result.isError===true).toBe(complete===false);expect(JSON.parse((result.content as {text:string}[])[0].text).evidence).toEqual(evidence);
  }finally{await client.close();await server.close();rmSync(root,{recursive:true,force:true});}
});
