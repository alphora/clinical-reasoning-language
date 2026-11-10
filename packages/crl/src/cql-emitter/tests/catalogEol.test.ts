// REFACTOR:grounded: serialization is canonical before standalone and embedded consumers receive CQL.
import {expect,it,vi} from 'vitest';
const input=vi.hoisted(()=>({mixed:false}));
vi.mock('fs',async original=>{
  const real=await original<typeof import('fs')>();
  return {...real,readFileSync:(...args:Parameters<typeof real.readFileSync>)=>{
    if(input.mixed&&/[/\\](CRLCommon|CaseFeatureCommon|FHIRHelpers)\.cql$/.test(String(args[0])))return 'line1\r\nline2\rline3\n';
    return real.readFileSync(...args);
  }};
});
import {loadCatalogLibraries} from '../catalog/loadCatalog';
// @kit produce-results:canonical-cql-bytes
it('canonicalizes CRLF and bare CR at the shared loader before emission',()=>{
  input.mixed=true;
  try{const all=loadCatalogLibraries();expect(all).toHaveLength(3);for(const c of all)expect(c.cql).toBe('line1\nline2\nline3\n');}
  finally{input.mixed=false;}
});
it('ships all three catalog sources with LF bytes',()=>{
  for(const c of loadCatalogLibraries()){expect(c.cql).not.toContain('\r');expect(c.cql).toMatch(/^library /m);}
});
