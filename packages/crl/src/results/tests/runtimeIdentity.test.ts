// REFACTOR:grounded: test drift without changing the live checkout or claiming disk hashes attest memory.
import {expect,it} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
it.each(['replace','add','remove'])('refuses runtime disk drift after module initialization: %s',kind=>{
  const dir=mkdtempSync(join(tmpdir(),'runtime-identity-'));
  try{
    mkdirSync(join(dir,'driver'));for(const n of ['ApplyDriver.class','ApplyWorker.class','windows-owned-process.ps1'])writeFileSync(join(dir,'driver',n),'test bytes');
    const source=readFileSync(join(__dirname,'../runtimeIdentity.ts'),'utf8');
    writeFileSync(join(dir,'runtimeIdentity.js'),ts.transpile(source,{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}));
    writeFileSync(join(dir,'driver.js'),'exports.driverDir=()=>require("node:path").join(__dirname,"driver");');
    const code=`const fs=require('node:fs'),path=require('node:path'),a=require('./runtimeIdentity');a.assertRuntimeCodeUnchanged();
      const file=path.join(__dirname,'driver.js');if(${JSON.stringify(kind)}==='replace')fs.appendFileSync(file,'\\n// replaced');
      if(${JSON.stringify(kind)}==='add')fs.writeFileSync(path.join(__dirname,'extra.js'),'module.exports=1');
      if(${JSON.stringify(kind)}==='remove')fs.unlinkSync(file);
      try{a.assertRuntimeCodeUnchanged();process.exit(2);}catch(e){if(!String(e).includes('Runtime files changed'))throw e;console.log('refused');}`;
    writeFileSync(join(dir,'probe.cjs'),code);expect(execFileSync(process.execPath,[join(dir,'probe.cjs')],{cwd:dir,encoding:'utf8'})).toContain('refused');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it.each(['missing','unreadable'])('keeps nonnative module loading available with native disabled and %s startup files',kind=>{
 const dir=mkdtempSync(join(tmpdir(),'runtime-unavailable-'));
 try{
  mkdirSync(join(dir,'driver'));for(const n of ['ApplyDriver.class','ApplyWorker.class','windows-owned-process.ps1'])writeFileSync(join(dir,'driver',n),'test bytes');
  writeFileSync(join(dir,'runtimeIdentity.js'),ts.transpile(readFileSync(join(__dirname,'../runtimeIdentity.ts'),'utf8'),{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}));
  writeFileSync(join(dir,'driver.js'),'exports.driverDir=()=>require("node:path").join(__dirname,"driver");');
  const code=`const fs=require('node:fs'),path=require('node:path');process.env.CRL_ENABLE_RESULTS='0';
   const target=path.join(__dirname,'driver','ApplyDriver.class');if(${JSON.stringify(kind)}==='missing')fs.unlinkSync(target);
   if(${JSON.stringify(kind)}==='unreadable'){const read=fs.readFileSync;fs.readFileSync=function(file,...args){if(file===target)throw new Error('EACCES control');return read.call(fs,file,...args);};}
   const a=require('./runtimeIdentity');if(a.startupFilesSha256!==undefined)process.exit(2);
   try{a.assertRuntimeCodeUnchanged();process.exit(3);}catch(e){if(!String(e).includes('Cannot establish startup runtime identity'))throw e;}console.log('loaded nonnative; bound execution refused');`;
  writeFileSync(join(dir,'probe.cjs'),code);expect(execFileSync(process.execPath,[join(dir,'probe.cjs')],{cwd:dir,encoding:'utf8'})).toContain('loaded nonnative; bound execution refused');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
