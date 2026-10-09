// REFACTOR:grounded (MV/KE): native forms retain authored help text omitted by the engine.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {ProduceOutcome} from '@smile-digital-health/crl';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const textExtension='http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text';
const descriptionExtension='http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description';
const canonical=(ref:string)=>ref.split('#')[0].split('|')[0];
export function retainStaticQuestionDescriptions(root:string,definitions:Record<string,unknown>[],result:Pick<Extract<ProduceOutcome,{ok:true}>,'manifest'|'manifestPath'>){
  const descriptions=new Map<string,Set<string>>();
  const collect=(node:any)=>{
    if(!node || typeof node!=='object')return;
    for(const input of node.input??[]){
      const text=input.extension?.find((e:any)=>e.url===textExtension)?.valueString;
      const description=input.extension?.find((e:any)=>e.url===descriptionExtension)?.valueMarkdown??'';
      if(typeof text!=='string' || typeof description!=='string')continue;
      for(const profile of input.profile??[]){const key=JSON.stringify([canonical(profile),text]);let set=descriptions.get(key);if(!set)descriptions.set(key,set=new Set());set.add(description);}
    }
    for(const value of Object.values(node))if(value && typeof value==='object')if(Array.isArray(value))value.forEach(collect);else collect(value);
  };
  definitions.filter(d=>d.resourceType==='PlanDefinition').forEach(collect);
  for(const entry of result.manifest.cases)for(const artifact of entry.artifacts??[])if(artifact.resourceType==='Questionnaire'){
    const file=join(root,artifact.path),original=readFileSync(file,'utf8'),q=JSON.parse(original),ids=new Set<string>();
    const inventory=(items:any[])=>{for(const i of items){ids.add(i.linkId);inventory(i.item??[]);}};inventory(q.item??[]);
    const visit=(items:any[])=>{for(const i of items){
      visit(i.item??[]);if(typeof i.definition!=='string')continue;
      const values=descriptions.get(JSON.stringify([canonical(i.definition),i.text]));if(!values)continue;
      if(values.size!==1)throw Error('Static question description has ambiguous authored contexts. Reconcile its presentation before applying.');
      const description=[...values][0],linkId='crl-help-'+hash(i.linkId).slice(0,24),existing=i.item?.find((child:any)=>child.linkId===linkId);
      const ownHelp=existing?.type==='display' && existing.extension?.some((e:any)=>e.url==='http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' && e.valueCodeableConcept?.coding?.some((c:any)=>c.system==='http://hl7.org/fhir/questionnaire-item-control' && c.code==='help'));
      if(ids.has(linkId) && !ownHelp)throw Error('Static question help identity conflicts with an existing item.');
      if(!description){if(ownHelp){i.item=i.item.filter((child:any)=>child!==existing);if(!i.item.length)delete i.item;ids.delete(linkId);}continue;}
      if(ownHelp){existing.text=description;continue;}ids.add(linkId);
      (i.item??=[]).push({linkId,text:description,type:'display',extension:[{url:'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',valueCodeableConcept:{coding:[{system:'http://hl7.org/fhir/questionnaire-item-control',code:'help'}]}}]});
    }};visit(q.item??[]);
    const text=JSON.stringify(q,null,2)+'\n';if(text!==original){writeFileSync(file,text);artifact.sha256=hash(text);}
  }
  writeFileSync(result.manifestPath,JSON.stringify(result.manifest,null,2)+'\n');
}
