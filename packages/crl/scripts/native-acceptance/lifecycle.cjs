#!/usr/bin/env node
'use strict';
// Native lifecycle integration: real MCP EOF while its Java case is active.
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {once}=require('node:events');
const root=path.resolve(__dirname,'../../../..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function main(){
  assert.equal(process.platform,'win32','This probe exercises Windows job ownership');
  const [jarArg,fixtureArg]=process.argv.slice(2);
  assert.ok(jarArg&&fixtureArg,'lifecycle.cjs ENGINE_JAR UNICODE_FIXTURE');
  const fixture=fs.realpathSync(fixtureArg), jar=fs.realpathSync(jarArg);
  const output=path.join(fixture,'mcp-lifecycle');fs.mkdirSync(output);
  const server=spawn(process.execPath,[path.join(root,'packages/crl/dist/cli/run-mcp-server.js')],{
    env:{...process.env,CRL_ENABLE_RESULTS:'1',TEMP:output,TMP:output},
    windowsHide:true,stdio:['pipe','pipe','pipe']
  });
  let stdout='',stderr='';server.stdout.on('data',b=>stdout+=b);server.stderr.on('data',b=>stderr+=b);
  const send=x=>server.stdin.write(JSON.stringify(x)+'\n');
  const closed=once(server,'close');
  try{
    send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'native-lifecycle-probe',version:'1'}}});
    for(let i=0;i<200&&!stdout.includes('"id":1');i++)await sleep(50);
    assert.ok(stdout.includes('"id":1'),stderr);
    send({jsonrpc:'2.0',method:'notifications/initialized'});
    send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'emit_results',arguments:{celPath:path.join(fixture,'src/cel/mv/cases.cel'),crlPath:path.join(fixture,'src/crl/policy.crl'),outRoot:output,useCase:'prior-auth',jarPath:jar,caseTimeoutMs:60000}}});
    let javaPid;
    for(let i=0;i<30&&!javaPid;i++){
      await sleep(500);
      const query="$wrappers=Get-CimInstance Win32_Process -Filter 'ParentProcessId = "+server.pid+"'; foreach($w in $wrappers){Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+$w.ProcessId) | Where-Object {$_.CommandLine -like '*ApplyDriver*'} | Select-Object -ExpandProperty ProcessId}";
      const found=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',query],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      if(found)javaPid=Number(found.split(/\s+/)[0]);
    }
    assert.ok(javaPid,'No active owned Java case observed: '+stdout+'\n'+stderr);
    const start=Date.now();server.stdin.end();
    let deadline;
    try { await Promise.race([closed,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('MCP did not finish bounded cleanup after EOF')),20000);})]); } finally { clearTimeout(deadline); }
    assert.equal(alive(javaPid),false,'Owned Java survived MCP stdin EOF');
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({stdinEof:true,javaGone:true,cleanupMs:Date.now()-start})+'\n');
    console.log('MCP EOF cleaned active native JVM');
  } finally {
    if(server.exitCode===null)server.kill('SIGTERM');
    fs.writeFileSync(path.join(output,'stdout.log'),stdout);fs.writeFileSync(path.join(output,'stderr.log'),stderr);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
