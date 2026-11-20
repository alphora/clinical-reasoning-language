// REFACTOR:grounded: a selected case supplies exact producer inputs, never saved native results or UI labels.
import {resolveCelSuite,emitCelSuite,buildProducerInputs,type ScenarioViewModel} from '@smile-digital-health/crl';
import type {InitialState} from './interactiveQuestionnaire';

export function rowQuestionnaireDefaults(cel:string,scenario:ScenarioViewModel,clock:Date):InitialState {
  if(!scenario.compartmentDir)throw new Error('The selected row has no emitted patient compartment.');
  const selected=resolveCelSuite(cel);
  if(!selected.ok)throw new Error(selected.diagnostics.map(d=>d.message).join('; '));
  const emitted=emitCelSuite(selected.suite,clock).result;
  if(emitted.diagnostics.some(d=>d.severity==='error'))throw new Error('Cannot load row defaults: '+emitted.diagnostics.filter(d=>d.severity==='error').map(d=>d.message).join('; '));
  const built=buildProducerInputs(emitted);
  const matches=built.inputs.filter(input=>input.compartmentDir===scenario.compartmentDir&&
    (scenario.case.sourceFile===undefined||input.sourceFile===scenario.case.sourceFile)&&(scenario.case.caseId===undefined||input.caseId===scenario.case.caseId));
  if(matches.length!==1)throw new Error('The selected row does not have one source-matched case input.');
  const input=matches[0];
  return {id:'row-default:'+JSON.stringify([input.sourceFile,input.caseId,input.compartmentDir]),label:scenario.case.name,
    subject:input.subjectReference,bundle:{resourceType:'Bundle',type:'collection',entry:input.resources.map(resource=>({resource:resource.body}))}};
}
