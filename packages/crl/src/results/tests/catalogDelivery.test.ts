// REFACTOR:grounded: verify exact executable bytes through normal Git delivery, not text equivalence after execution.
import {expect,it} from 'vitest';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {emitResultDefinitionClosure} from '../definitionClosure';
import {buildEngineRepoBundle} from '../repoBundle';
import {writeTwoLane} from '../../emit-writers';
// @kit produce-results:catalog-delivery-identity
it('preserves shared CQL bytes through standalone output, execution Library and Git eol=lf delivery',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'catalog-delivery-'));
  try{
    cpSync(path.join(__dirname,'../../../scripts/qualification/fixtures/native'),root,{recursive:true});
    const closure=emitResultDefinitionClosure(path.join(root,'src/crl/policy.crl'));expect(closure.emitted.success).toBe(true);
    writeTwoLane(closure.emitted,path.join(root,'src'));
    const repo=buildEngineRepoBundle({definitions:closure.definitions as never,cqlByLibraryFile:closure.cql,caseInput:{caseName:'byte check only',resources:[]}});expect(repo.missingCql).toEqual([]);
    writeFileSync(path.join(root,'.gitattributes'),'* text=auto eol=lf\n');
    const git=(args:string[])=>execFileSync('git',['-c','core.autocrlf=false',...args],{cwd:root,stdio:['ignore','pipe','pipe']});
    git(['init','--quiet']);git(['add','src/cql']);
    for(const name of ['CRLCommon','CaseFeatureCommon','FHIRHelpers']){
      const bytes=readFileSync(path.join(root,'src/cql',name+'.cql'));expect(bytes.includes(13)).toBe(false);
      expect(bytes).toEqual(Buffer.from(closure.cql[name+'.cql']));expect(git(['show',':src/cql/'+name+'.cql'])).toEqual(bytes);
      const library=repo.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='Library'&&r.id===name);
      if(name==='FHIRHelpers'){expect(library).toBeUndefined();continue;}
      expect(library).toBeDefined();expect(Buffer.from(library!.content!.find(c=>c.contentType==='text/cql')!.data!,'base64')).toEqual(bytes);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
