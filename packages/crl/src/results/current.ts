// REFACTOR:grounded (MV/KE): reuse native result identities to distinguish matching source from current forms.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCelSuite } from '../cel/suite';
import { emitCelSuite } from '../cel/suiteEmit';
import { buildProducerInputs } from './caseInput';
import { readRetry, reusableCase, caseKey } from './retry';
import { digest } from './runtimeFingerprint';
import { suiteResultsManifestPath } from './manifest';

/** Read-only, conservative freshness check. Missing/invalid output requests regeneration, never a load error. */
export function nativeResultsCurrent(inputPath:string,definitionClosureSha256:string,planDefinitionId:string,crlVersion:string):boolean {
  try {
    const selected=resolveCelSuite(inputPath);if(!selected.ok)return false;
    const root=selected.suite.projectRoot;
    if(!selected.suite.files.length){
      const m=JSON.parse(readFileSync(join(root,suiteResultsManifestPath()),'utf8'));
      return m.schemaVersion===1 && m.celLibrary==='mv' && m.useCase==='prior-auth' && m.provenance?.crlVersion===crlVersion && Array.isArray(m.cases) && !m.cases.length;
    }
    const manifest=readRetry(root,'mv','prior-auth');
    if(manifest.provenance.definitionClosureSha256!==definitionClosureSha256 || manifest.provenance.crlVersion!==crlVersion)return false;
    const emission=emitCelSuite(selected.suite,new Date(manifest.provenance.inputClock!));
    if(emission.result.diagnostics.some(d=>d.severity==='error'))return false;
    const built=buildProducerInputs(emission.result);if(built.diagnostics.length || built.inputs.length!==manifest.cases.length)return false;
    const prior=new Map(manifest.cases.map(c=>[caseKey(c),c]));
    return built.inputs.every(input=>!!reusableCase(root,prior.get(caseKey(input)),digest({input,planDefinitionId})));
  } catch { return false; }
}
