import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const control=vi.hoisted(()=>({produce:vi.fn(),inspect:vi.fn()}));
vi.mock('../results/produce',()=>({produceResults:control.produce,inspectNativeRuntime:control.inspect,shutdownProducer:vi.fn()}));
import {createServer} from './server';
afterEach(()=>{vi.unstubAllEnvs();control.produce.mockReset();control.inspect.mockReset();});
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

// REFACTOR:grounded: actual same-client tool ordering and validation remain caller-owned.
it.each([true,false])('MCP exposes independent runtime probe and propagates unavailable/error %s',async ok=>{
  vi.stubEnv('CRL_ENABLE_RESULTS','1');
  const context={ok,status:ok?'available':'unavailable',schemaVersion:1,operation:'native-runtime-context',challenge:'fresh-nonce',processInstanceId:'instance',fingerprintSha256:'a'.repeat(64),runtimeSha256:'b'.repeat(64),executionSha256:'c'.repeat(64)};
  control.inspect.mockResolvedValue(context);
  const server=createServer(),client=new Client({name:'probe-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(st);await client.connect(ct);
    const r=await client.callTool({name:'native_runtime_context',arguments:{challenge:'fresh-nonce',caseTimeoutMs:12345}});
    expect(r.isError===true).toBe(!ok);expect(JSON.parse((r.content as {text:string}[])[0].text)).toEqual(context);
    expect(control.inspect).toHaveBeenCalledWith(expect.objectContaining({challenge:'fresh-nonce',caseTimeoutMs:12345,crlVersion:expect.any(String)}));
    expect(control.produce).not.toHaveBeenCalled();
    const emit=(await client.listTools()).tools.find(t=>t.name==='emit_results')!;
    expect(emit.inputSchema.properties).toHaveProperty('expectedRuntimeContext');
  }finally{await client.close();await server.close();}
});
it('disabled runtime probe dispatches neither discovery nor clinical evaluation',async()=>{
  vi.stubEnv('CRL_ENABLE_RESULTS','0');const server=createServer(),client=new Client({name:'disabled-probe',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  try{await server.connect(st);await client.connect(ct);const r=await client.callTool({name:'native_runtime_context',arguments:{challenge:'nonce'}});expect(r.isError).toBe(true);expect(control.inspect).not.toHaveBeenCalled();expect(control.produce).not.toHaveBeenCalled();}
  finally{await client.close();await server.close();}
});
