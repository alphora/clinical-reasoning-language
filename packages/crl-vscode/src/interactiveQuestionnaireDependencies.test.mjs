import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { interactiveQuestionnaireDependencies as graph } from './interactiveQuestionnaireDependencies';
import { pruneInteractiveResponse as prune,retainInteractiveQuestionnaire as retain } from './interactiveQuestionnaireResponse';
const input=p=>({input:[{type:'Observation',profile:[p]}]});
const bundle=action=>({entry:[{resource:{resourceType:'PlanDefinition',id:'p',url:'urn:p',action}}]});
const any=action=>({extension:[{url:'http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior',valueString:'any'}],action});
const pair=()=>({q:{resourceType:'Questionnaire',item:['g','a','b','c'].map(linkId=>({linkId,type:'boolean',definition:'urn:'+linkId+'#Observation.value[x]'}))},qr:{item:['g','a','b','c'].map(linkId=>({linkId,answer:[{valueBoolean:true}]}))}});
describe('definition-backed editing dependencies',()=>{
  // @kit interactive-questionnaire:definition-pruning
  it('orders guards, preserves grouped peers and intersects independent uses',()=>{
    const d=bundle([any([{...input('urn:g')},{input:[...input('urn:a').input,...input('urn:b').input],action:[input('urn:c')]}])]);
    expect(graph(d,'p')).toEqual({'urn:g':[],'urn:a':['urn:g'],'urn:b':['urn:g'],'urn:c':['urn:g','urn:a','urn:b']});
    d.entry[0].resource.action.push(input('urn:c'));
    expect(graph(d,'p')['urn:c']).toEqual([]);
  });
  it.each(['missing','duplicate','cycle'])('disables inferred pruning for %s delegation',kind=>{
    const d=bundle([any([input('urn:g'),{...input('urn:a'),definitionCanonical:'urn:other'}])]);
    if(kind==='duplicate')d.entry.push(...[1,2].map(version=>({resource:{resourceType:'PlanDefinition',url:'urn:other',version:String(version),action:[]}})));
    if(kind==='cycle')d.entry.push({resource:{resourceType:'PlanDefinition',url:'urn:other',action:[{definitionCanonical:'urn:p'}]}});
    expect(graph(d,'p')).toEqual({});
  });
  it('prunes only downstream profiles, including several edits in one export',()=>{
    const {q,qr}=pair(),incoming=structuredClone(qr);incoming.item[0].answer=[];incoming.item[1].answer=[{valueBoolean:false}];
    const result=prune(q,qr,incoming,retain,{'urn:a':['urn:g'],'urn:b':[],'urn:c':['urn:a']});
    expect(result.questionnaire.item.map(i=>i.linkId)).toEqual(['g','b']);
    expect(result.response.item.map(i=>i.linkId)).toEqual(['g','b']);
    expect(result.pruned).toBe(true);expect(q.item).toHaveLength(4);
  });
  it('skips optional pruning that would break enableWhen, and protects repeats',()=>{
    const {q,qr}=pair(),incoming=structuredClone(qr);incoming.item[0].answer=[];
    q.item[3].enableWhen=[{question:'a',operator:'exists',answerBoolean:true}];
    expect(prune(q,qr,incoming,retain,{'urn:a':['urn:g']}).pruned).toBe(false);
    delete q.item[3].enableWhen;q.item[1].repeats=true;
    expect(prune(q,qr,incoming,retain,{'urn:a':['urn:g']}).pruned).toBe(false);
  });
  it('defers flat pruning when a retained question references a removed descendant',()=>{
    const {q,qr}=pair(),incoming=structuredClone(qr);incoming.item[0].answer=[];
    q.item[1].item=[{linkId:'descendant',type:'string'}];
    q.item[3].enableWhen=[{question:'descendant',operator:'exists',answerBoolean:true}];
    const result=prune(q,qr,incoming,retain,{'urn:a':['urn:g']});
    expect(result.pruned).toBe(false);expect(result.questionnaire.item).toHaveLength(4);
  });
  it('proves Cosmetic is an ancestor of maintained Bleph clinical inputs',()=>{
    const pd=JSON.parse(readFileSync(new URL('../../../examples/bleph-medical-validation/src/fhir/PlanDefinition/l34194-bleph-example.json',import.meta.url)));
    const dir=new URL('../../../examples/bleph-medical-validation/src/fhir/',import.meta.url);
    const children=['PlanDefinition/l34194-bleph-example-certify-met-recommendation.json','PlanDefinition/l34194-bleph-example-not-certify-unmet-recommendation.json','ActivityDefinition/l34194-bleph-example-certify-met.json','ActivityDefinition/l34194-bleph-example-not-certify-unmet.json'].map(p=>JSON.parse(readFileSync(new URL(p,dir))));
    const d=graph({entry:[pd,...children].map(resource=>({resource}))},pd.id);
    const cosmetic='http://example.org/crl/StructureDefinition/l34194-bleph-example-cosmetic-surgical-purpose';
    expect(d[cosmetic]).toEqual([]);
    for(const [profile,parents] of Object.entries(d))if(profile!==cosmetic)expect(parents).toContain(cosmetic);
    expect(Object.keys(d).length).toBeGreaterThan(5);
  });
});
