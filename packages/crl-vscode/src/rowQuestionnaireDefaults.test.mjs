// REFACTOR:grounded: Default uses exact source-owned producer inputs and is independent of saved result files.
import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {resolveCelSuite,buildSuiteExecutionModel,emitCelSuite,buildProducerInputs} from '@smile-digital-health/crl';
import {rowQuestionnaireDefaults} from './rowQuestionnaireDefaults';
const cel=resolve(import.meta.dirname,'../../../examples/bleph-medical-validation/src/cel/mv/medical-validation.cel');
it('loads one full Bleph row with exact patient/facts, pinned clock and no fabricated request',()=>{
 const suite=resolveCelSuite(cel).suite,scenario=buildSuiteExecutionModel(suite).scenarios.scenarios[0],clock=new Date('2026-11-20T12:00:00Z');
 const actual=rowQuestionnaireDefaults(cel,scenario,clock),expected=buildProducerInputs(emitCelSuite(suite,clock).result).inputs.find(i=>i.compartmentDir===scenario.compartmentDir);
 expect(actual.bundle.entry.map(e=>e.resource)).toEqual(expected.resources.map(r=>r.body));expect(actual.subject).toBe(expected.subjectReference);
 expect(actual.bundle.entry.filter(e=>e.resource.resourceType==='Observation')).toHaveLength(6);
 expect(actual.bundle.entry.some(e=>e.resource.resourceType==='ServiceRequest')).toBe(false);
 expect(rowQuestionnaireDefaults(cel,scenario,clock)).toEqual(actual);
 expect(rowQuestionnaireDefaults(cel,{...scenario,case:{...scenario.case,sourceFile:undefined,caseId:undefined}},clock)).toEqual(actual);
 expect(()=>rowQuestionnaireDefaults(cel,{...scenario,case:{...scenario.case,sourceFile:'other'}},clock)).toThrow(/source-matched/);
 expect(()=>rowQuestionnaireDefaults(cel,{...scenario,compartmentDir:undefined},clock)).toThrow(/no emitted patient/);
});
