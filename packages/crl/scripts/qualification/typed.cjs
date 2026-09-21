// Installed-artifact qualification: reused four-step typed session assertions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pkg=process.env.CRL_TEST_PACKAGE, root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]);
const {emitCrlBundle}=require(pkg),{applySession,buildSessionResponse}=require(path.join(pkg,'dist/results/session'));
const {intakeAnswer,intakePresence,DATETIME_ANSWER}=require(path.join(pkg,'dist/authoring-kit/intakeExample'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const objects=x=>!x||typeof x!=='object'?[]:[x,...Object.values(x).flatMap(v=>Array.isArray(v)?v.flatMap(objects):objects(v))];
const one=(x,t)=>{const xs=objects(x).filter(o=>o.resourceType===t);assert.equal(xs.length,1,t);return xs[0]};
const itemPaths=(items,p='/item')=>(items??[]).flatMap((item,i)=>[{item,pointer:p+'/'+i},...itemPaths(item.item,p+'/'+i+'/item')]);
const find=(qr,slug)=>itemPaths(qr.item).find(x=>x.item.definition?.includes('-'+slug+'#'));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
(async()=>{
fs.mkdirSync(out);const source=path.join(out,'policy.crl');
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:'typed-session',version:'1.0.0',crl:{canonicalBase:'https://example.org/typed',date:'2026-09-20'}}));
fs.writeFileSync(source,'library "Typed".\n'+DATETIME_ANSWER+intakeAnswer('Choice','CodeableConcept','choice')+'- value domain is answer options. - value from is "Answers": - not qualifying is `na`.\nterminology "Answers": - system is `urn:answers`. - code is `unknown` display is `Unknown`. - code is `na` display is `N/A`.\n'+intakePresence('Has Date','"Treatment Start"')+intakePresence('Has Choice','"Choice"')+'\nactivity "Done": - request CPGCommunicationRequest. - with `DONE`.\nactivity "Missing": - request CPGCommunicationRequest. - with `MISSING`.\ndecision "Typed": first: - when "Has Date" and "Has Choice" then recommend activity "Done". - otherwise then recommend activity "Missing".');
const emitted=emitCrlBundle(source);assert(emitted.success,JSON.stringify(emitted));const base=emitted.bundle;assert(!base.entry.some(e=>e.resource.resourceType==='Questionnaire'));base.entry.push({resource:{resourceType:'Patient',id:'p'}});
const engine=JSON.parse(fs.readFileSync(process.env.CRL_TEST_ENGINE));
let q,qr;const state=new Map(),rows=[];
for(const [step,edits] of [['empty',[]],['date-only',[['treatment-start',{valueDateTime:'2030-01-02'}]]],['coding',[['choice',{valueCoding:{system:'urn:answers',code:'unknown'}}]]],['change-and-clear',[['treatment-start',{valueDateTime:'2030-01-02T10:30:00-04:00'}],['choice',null]]]]){
 const authored='2030-02-0'+(rows.length+1)+'T12:00:00Z';let response;
 if(edits.length)response=JSON.parse(buildSessionResponse(JSON.stringify(q),JSON.stringify(qr),{expectedResponseSha256:hash(JSON.stringify(qr)),authored,mode:'edits-only',edits:edits.map(([slug,value])=>({pointer:find(qr,slug).pointer,operation:value?'set':'clear',...(value?{answersJson:JSON.stringify([value])}:{})}))}));
 const data={resourceType:'Bundle',type:'collection',entry:[...state.entries()].filter(([slug])=>!edits.some(([s])=>s===slug)).map(([,resource])=>({resource})).concat(response?[{resource:response}]:[])};
 const repo={...base,entry:[...base.entry,...(q?[{resource:q}]:[])]};
 const r=await applySession({schemaVersion:1,requestId:step,caseId:'typed',stepId:step,planDefinitionId:'typed-session',subjectReference:'Patient/p',repositoryJson:JSON.stringify(repo),requestDataJson:JSON.stringify(data),engine},{outDir:path.join(out,step),limits:{timeoutMs:120000}});assert(r.ok,JSON.stringify(r));
 const native=read(r.artifacts['native-result.json'].path);q=one(native,'Questionnaire');qr=one(native,'QuestionnaireResponse');assert.equal(find(q,'treatment-start').item.type,'dateTime');assert.equal(find(q,'choice').item.type,'choice');
 assert.deepEqual(one(native,'CommunicationRequest').payload,[{contentString:step==='coding'?'DONE':'MISSING'}]);
 for(const [slug,value] of edits){const obs=read(r.artifacts['native-data.json'].path).entry.map(e=>e.resource).filter(o=>o.resourceType==='Observation'&&o.meta?.profile?.some(p=>p.split('|')[0].endsWith('-'+slug))&&o.effectiveDateTime===authored);assert.equal(obs.length,1);state.set(slug,obs[0]);if(value?.valueDateTime)assert.equal(obs[0].valueDateTime,value.valueDateTime);if(value?.valueCoding)assert.deepEqual(obs[0].valueCodeableConcept.coding,[value.valueCoding]);if(!value)assert(!obs[0].valueCodeableConcept);}
 if(step==='coding')assert.deepEqual(find(qr,'treatment-start').item.answer,[{valueDateTime:'2030-01-02'}]);
 rows.push({step,ok:r.ok,runtime:r.runtime,nativeMs:r.nativeMs});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(rows,null,2));console.log(step,'passed');
}
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,rows,scope:'Installed definitions Bundle SDK into native session; dateTime precision/offset, Coding, explicit clear and retained prior answer.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
