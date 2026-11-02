import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync} from 'node:fs';
import {dirname,join,relative,isAbsolute,resolve,sep} from 'node:path';
import {validateCRLImports,canonicalMvValue,resolveImports,findProjectRoot} from '@smile-digital-health/crl';
import {planStructureEdit,resolvePresentationFile,sourceSha256,type StructureEditRequest} from '@smile-digital-health/crl/language-services';
import {loadSidecar,saveSidecar,type MedicalValidationSidecar} from './medicalValidationStore';

const statePath=(root:string)=>join(root,'src/medical-validation/tree-edits.json');
export function hasStructuralEditHistory(root:string):boolean{return existsSync(statePath(root));}
export function structuralEditsPending(root:string,policy?:string):boolean {
  const file=statePath(root);if(!existsSync(file))return false;
  const state=JSON.parse(readFileSync(file,'utf8'));
  if(state.schemaVersion!==1||typeof state.pending!=='boolean')throw Error('The tree edit status is unreadable.');
  return state.pending || !!policy && state.sourceSha256!==structuralInputIdentity(root,policy);
}
export function setStructuralEditsPending(root:string,pending:boolean,policy?:string):void {
  const sourceSha256=!pending&&policy?structuralInputIdentity(root,policy):undefined;
  const file=statePath(root);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify({schemaVersion:1,pending,...(sourceSha256?{sourceSha256}:{})},null,2)+'\n');
}
export function structuralReviewReset(sidecar:MedicalValidationSidecar):MedicalValidationSidecar {
  const next=structuredClone(sidecar);
  for(const id of Object.keys(next.byCaseId))if(next.byCaseId[id]==='pass')next.byCaseId[id]='pending';
  for(const verdict of Object.values(next.criterionVerdictsByKey??{}))if(verdict.state==='pass')verdict.state='pending';
  return next;
}
/** Conservative persistent invalidation precedes source save; a failed save never revives approvals. */
export function prepareStructuralSave(root:string,sidecarPath:string):void {
  const loaded=loadSidecar(sidecarPath);if(loaded.warning)throw Error(loaded.warning);
  setStructuralEditsPending(root,true);saveSidecar(sidecarPath,structuralReviewReset(loaded.sidecar));
}
export function previewStructuralEdit(root:string,policy:string,file:string,source:string,request:StructureEditRequest) {
  const plan=planStructureEdit(source,request);
  validateStructuralCandidate(root,policy,file,plan.candidateSource);
  return {...plan,file:resolvePresentationFile({projectRoot:root,filePath:file}).filePath};
}
export function validateStructuralCandidate(root:string,policy:string,file:string,candidateSource:string):void {
  const target=resolvePresentationFile({projectRoot:root,filePath:file}),lane=resolve(root,'src/crl'),rel=relative(lane,target.filePath);
  if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('Select a locally owned file in src/crl.');
  const overlays=new Map([[target.filePath,candidateSource.replace(/^\uFEFF/,'')]]);
  const checked=validateCRLImports(policy,{overlays});
  if(!checked.success)throw Error('The edit does not validate: '+[...checked.importDiagnostics.filter(d=>d.severity==='error').map(d=>JSON.stringify(d)),...checked.validationErrors.map(e=>JSON.stringify(e))].join('; '));
}
/** The source fingerprint includes installed libraries and package configuration. */
export function structuralInputIdentity(root:string,policy:string):string {
  const graph=resolveImports(policy),paths=new Set([join(root,'package.json'),realpathSync(policy)]);
  for(const e of [...graph.resolvedLibraries,...graph.localLibraries,...graph.registry?.byNamePackage.values()??[]]){paths.add(realpathSync(e.filePath));const owner=findProjectRoot(e.filePath);if(owner)paths.add(join(owner,'package.json'));}
  const inputs=[...paths].map(file=>{
    const rel=relative(root,file),owner=findProjectRoot(file);
    const key=!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep)?'local/'+rel.replace(/\\/g,'/'):
      owner?'dependency/'+JSON.parse(readFileSync(join(owner,'package.json'),'utf8')).name+'/'+relative(owner,file).replace(/\\/g,'/'):'source/'+sourceSha256(readFileSync(file,'utf8'));
    return [key,sourceSha256(readFileSync(file,'utf8'))];
  }).sort(([a],[b])=>a.localeCompare(b));
  return sourceSha256(canonicalMvValue(inputs));
}
