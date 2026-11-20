// REFACTOR:grounded: manual FHIR Default replaces the retired saved pane; retained navigation contracts stay covered.
import {describe,it,expect} from 'vitest';
import {interactiveQuestionnaireHtml} from './interactiveQuestionnaireHtml.ts';
import {renderApplyQuestionnairePane} from './applyQuestionnairePaneHtml.ts';
import {COCKPIT_WEBVIEW_SCRIPT} from './correspondenceCockpit.ts';
describe('Boolean control webview delivery',()=>{
  const q={resourceType:'Questionnaire',status:'active',item:[{linkId:'a',type:'boolean'}]};
  it('ships the adapter in both questionnaire bootstraps',()=>{
    const saved=renderApplyQuestionnairePane({questionnaire:q,nonce:'n',styleNonce:'s',assets:{zoneJs:'z',lhcFormsJs:'l',lformsFhirR4Js:'f',stylesCss:'c'}}).html;
    for(const script of [interactiveQuestionnaireHtml('n','host',n=>n),saved]) {
      expect(script).toContain('booleanClear');expect(script).toContain('Clear answer');
      expect(script).toContain('presentation-choice-group');expect(script).toContain('data-crl-choice-proxy');
    }
  });
  it('retired saved-form bootstrap is absent from the cockpit',()=>{expect(COCKPIT_WEBVIEW_SCRIPT).not.toContain("m.type==='fhirQuestionnaire'");});
});
