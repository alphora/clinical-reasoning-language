import {describe,it,expect} from 'vitest';
import {interactiveQuestionnaireHtml} from './interactiveQuestionnaireHtml.ts';
import {renderApplyQuestionnairePane} from './applyQuestionnairePaneHtml.ts';
import {COCKPIT_WEBVIEW_SCRIPT} from './correspondenceCockpit.ts';
describe('Boolean control webview delivery',()=>{
  const q={resourceType:'Questionnaire',status:'active',item:[{linkId:'a',type:'boolean'}]};
  it('ships the adapter in all three bootstraps',()=>{
    const saved=renderApplyQuestionnairePane({questionnaire:q,nonce:'n',styleNonce:'s',assets:{zoneJs:'z',lhcFormsJs:'l',lformsFhirR4Js:'f',stylesCss:'c'}}).html;
    for(const script of [interactiveQuestionnaireHtml('n','host',n=>n),saved,COCKPIT_WEBVIEW_SCRIPT]) {
      expect(script).toContain('booleanClear');expect(script).toContain('Clear answer');
    }
  });
  it('disposes cockpit observers before generic renders and replacement case mounts',()=>{
    expect(COCKPIT_WEBVIEW_SCRIPT).toMatch(/m.type==='render'.*?__aqClearDispose/s);
    expect(COCKPIT_WEBVIEW_SCRIPT).toMatch(/m.type==='fhirQuestionnaire'.*?__aqClearDispose.*?host.replaceChildren/s);
  });
});
