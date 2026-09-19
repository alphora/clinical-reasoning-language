const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertQuestionAssociation,assertOtherAnswersUnchanged}=require('./presentation-check.cjs');
const profile='https://example.org/StructureDefinition/answer';
function fixture(){const a={linkId:'1.1',definition:profile+'#Observation.value[x]',text:'Value',type:'string',answer:[{valueString:'A'}]};const b={linkId:'2.1',definition:profile+'-other#Observation.value[x]',text:'Value',type:'string',answer:[{valueString:'B'}]};return {q:{item:[{linkId:'1',definition:profile,type:'group',text:'Edited question?',item:[a]},{linkId:'2',definition:profile+'-other',type:'group',text:'Other question?',item:[b]}]},qr:{item:[structuredClone(a),structuredClone(b)]}};}
// @kit concept-presentation:native-association
 test('exact input group and QR association rejects missing and misassociated wording',()=>{
 const {q,qr}=fixture();assertQuestionAssociation(q,qr,profile,'Edited question?');
 const missing=structuredClone(q);delete missing.item[0].text;assert.throws(()=>assertQuestionAssociation(missing,qr,profile,'Edited question?'));
 const swapped=structuredClone(q);[swapped.item[0].text,swapped.item[1].text]=[swapped.item[1].text,swapped.item[0].text];assert.throws(()=>assertQuestionAssociation(swapped,qr,profile,'Edited question?'));
 const wrong=structuredClone(q);wrong.item[1].item.push(wrong.item[0].item.pop());assert.throws(()=>assertQuestionAssociation(wrong,qr,profile,'Edited question?'));
 });
// @kit concept-presentation:sibling-answer-preservation
 test('equal leaf labels cannot conceal a modified sibling answer',()=>{const {qr}=fixture();const changed=structuredClone(qr);changed.item[0].answer=[{valueString:'New'}];assertOtherAnswersUnchanged(qr,changed,qr.item[0]);changed.item[1].answer=[{valueString:'Wrong'}];assert.throws(()=>assertOtherAnswersUnchanged(qr,changed,qr.item[0]));});
