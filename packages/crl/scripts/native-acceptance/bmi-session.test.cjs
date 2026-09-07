'use strict';
// REFACTOR:grounded (#320): prevent expected invalid BMI input from masking other failures.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {checkErrors,edited,answer,checkExtractedValue,options}=require('./bmi-session.cjs');
test('probe options refuse missing, unknown, duplicate and overlay options before build',()=>{
 for(const args of [[],['--unknown','x'],['--out','x','--out','y'],['--engine-overlay','x']])assert.throws(()=>options(args));
});
const failure=JSON.parse(fs.readFileSync(path.join(__dirname,'../../test/acceptance/bmi/expected-invalid.json')));
const code='publication-bmi-nonpositive';
test('accepts measured original4.7 expected input failure',()=>checkErrors(failure.issues,failure.log,code));
test('accepts error-free output only without an expected failure',()=>{checkErrors([], 'INFO done', undefined);assert.throws(()=>checkErrors([], 'INFO done', code));});
test('expected error does not mask another OperationOutcome error',()=>{
 assert.throws(()=>checkErrors([...failure.issues,{severity:'error',code:'exception',diagnostics:'unrelated failure'}],failure.log,code));
});
test('expected error does not mask another error on the same diagnostic',()=>{
 const f=structuredClone(failure);f.issues[0].diagnostics+='\nOutOfMemoryError';assert.throws(()=>checkErrors(f.issues,f.log,code));
});
for(const extra of ['\nERROR unrelated failure','\nException in thread "main" java.lang.OutOfMemoryError', ' ERROR unrelated failure']){
 test('rejects unrelated log failure '+JSON.stringify(extra),()=>assert.throws(()=>checkErrors(failure.issues,failure.log+extra,code)));
}
test('missing native error evidence cannot pass',()=>assert.throws(()=>checkErrors(failure.issues,'',code)));
test('unexpected native errors fail a successful stage',()=>assert.throws(()=>checkErrors([],failure.log)));
const def=k=>'http://example.org/bmi/StructureDefinition/bmi-publication-'+k+'#Observation.value[x]';
const slot=answers=>({resourceType:'QuestionnaireResponse',item:[{linkId:'1',definition:def('bmi'),answer:answers}]});
test('unknown slot requires zero answers, not an uninterpretable value',()=>{
 assert.equal(answer(slot([]),'bmi',null),null);
 for(const value of [{valueBoolean:false},{valueString:'not empty'},{valueQuantity:{unit:'kg/m2'}},{valueQuantity:{value:null}}])assert.throws(()=>answer(slot([value]),'bmi',null));
});
test('known slot requires exactly one numeric Quantity with correct unit',()=>{
 const good={valueQuantity:{value:35,unit:'kg/m2'}};
 assert.equal(answer(slot([good]),'bmi',35).value,35);
 for(const values of [[],[good,good],[{valueBoolean:true}],[{valueQuantity:{value:'35',unit:'kg/m2'}}],[{valueQuantity:{value:35,unit:'kg'}}],[{...good,valueBoolean:false}]])assert.throws(()=>answer(slot(values),'bmi',35));
});
test('cleared extraction has no value choice field',()=>{
 checkExtractedValue({resourceType:'Observation'},null,'kg/m2');
 for(const value of [{valueBoolean:false},{valueString:'not empty'},{valueQuantity:{unit:'kg/m2'}}])assert.throws(()=>checkExtractedValue({resourceType:'Observation',...value},null,'kg/m2'));
});
test('numeric extraction cannot conceal another value choice field',()=>{
 const r={valueQuantity:{value:35,unit:'kg/m2',system:'http://unitsofmeasure.org',code:'kg/m2'}};
 checkExtractedValue(r,35,'kg/m2');assert.throws(()=>checkExtractedValue({...r,valueBoolean:false},35,'kg/m2'));
});
test('a delta keeps explicit clear and ancestors without copying untouched values',()=>{
 const qr={resourceType:'QuestionnaireResponse',subject:{reference:'Patient/p'},item:[
  {linkId:'1',item:[{linkId:'1.1',definition:def('bmi'),answer:[{valueQuantity:{value:35}}]}]},
  {linkId:'2',item:[{linkId:'2.1',definition:def('weight'),answer:[{valueQuantity:{value:40}}]}]},
 ]};
 const prior=structuredClone(qr),clear=edited(qr,{key:'bmi',value:null},9);
 assert.deepEqual(qr,prior);assert.deepEqual(clear.subject,qr.subject);assert.equal(clear.item.length,1);
 assert.equal(clear.item[0].item[0].definition,def('bmi'));assert.equal(clear.item[0].item[0].answer,undefined);
 assert.equal(clear.authored,'2026-09-07T12:09:00Z');
});
