import {emitOwnedValueSetCodeSystems} from '../namedAnswerSet';
import {emitValueSet} from '../valueSet';
import {buildCRL} from '../../index';
import type {CpgMetadata,EmittedResource} from '../types';
const metadata={name:'policy',canonicalBase:'http://example.org',version:'1.0.0',title:'Policy',description:'Policy',status:'draft',experimental:false,publisher:'Synthetic',contact:[],jurisdiction:[],useContext:[]} as CpgMetadata;
const system='http://example.org/CodeSystem/answers';
function valueSet(name:string,description?:string,sys=system){
 const ast=buildCRL('library "V". terminology "'+name+'": - system is `'+sys+'`. - code is `a` display is `A`'+(description===undefined?'':' description is `'+description+'`')+'.').result!;
 const term=ast.statements[0];if(term.type!=='Terminology')throw Error();const emitted=emitValueSet(term,'V',metadata,{capability:'computable'});if(!emitted.resource)throw Error(JSON.stringify(emitted.errors));return emitted.resource;
}
// @kit terminology-forms:member-description
test('member description is in compose and expansion and locally generated CodeSystem definition',()=>{
 const vs=valueSet('T','Meaning'),errors:any[]=[],cs=emitOwnedValueSetCodeSystems([vs],metadata,{capability:'computable'},e=>errors.push(e));
 expect(errors).toEqual([]);expect((vs.resource as any).compose.include[0].concept[0].extension).toEqual([{url:'http://hl7.org/fhir/StructureDefinition/valueset-concept-definition',valueString:'Meaning'}]);expect((vs.resource as any).expansion.contains[0].extension).toEqual((vs.resource as any).compose.include[0].concept[0].extension);expect((cs[0].resource as any).concept).toEqual([{code:'a',display:'A',definition:'Meaning'}]);
});
test('external description stays in its ValueSet and creates no external CodeSystem',()=>{
 const vs=valueSet('External','Nuance','urn:external'),cs=emitOwnedValueSetCodeSystems([vs],metadata,{capability:'computable'},()=>{throw Error();});expect(cs).toEqual([]);expect((vs.resource as any).expansion.contains[0].extension[0].valueString).toBe('Nuance');
});
test.each([false,true])('description conflict and missing/present merge are independent of declaration order (%s)',reverse=>{
 const errors:any[]=[],a=valueSet('A','One'),b=valueSet('B','Two');emitOwnedValueSetCodeSystems(reverse?[b,a]:[a,b],metadata,{capability:'computable'},e=>errors.push(e));expect(errors.map(e=>e.code)).toContain('answer-options-conflicting-description');
 const absent=valueSet('Absent'),present=valueSet('Present','Meaning'),cs=emitOwnedValueSetCodeSystems(reverse?[present,absent]:[absent,present],metadata,{capability:'computable'},()=>{throw Error();});expect((cs[0].resource as any).concept[0].definition).toBe('Meaning');
});
test('already emitted local CodeSystem retains its metadata and gets the authored definition',()=>{
 const existing={resourceType:'CodeSystem',relativePath:'CodeSystem/answers.json',resource:{resourceType:'CodeSystem',url:system,concept:[{code:'a',display:'A'}],title:'Retain title'},sourceKind:'LocalCodeSystem',sourceName:'V'} as EmittedResource;
 expect(emitOwnedValueSetCodeSystems([existing,valueSet('T','Meaning')],metadata,{capability:'computable'},()=>{throw Error();})).toEqual([]);expect((existing.resource as any).title).toBe('Retain title');expect((existing.resource as any).concept[0].definition).toBe('Meaning');
});
