const assert=require('node:assert/strict');
const items=xs=>(xs||[]).flatMap(x=>[x,...items(x.item),...(x.answer||[]).flatMap(a=>items(a.item))]);
function assertQuestionAssociation(q,qr,profile,text){
 const groups=items(q.item).filter(x=>x.type==='group'&&x.definition===profile);
 assert.equal(groups.length,1,'Exactly one owning input group');const group=groups[0];assert.equal(group.text,text,'Authored wording on owning group');
 const definition=profile+'#Observation.value[x]';
 const answers=items(group.item).filter(x=>x.definition===definition&&x.type!=='group');
 assert.equal(answers.length,1,'Exactly one answer inside its owning group');
 assert.equal(items(q.item).filter(x=>x.definition===definition).length,1,'Unique answer association');
 const responses=items(qr.item).filter(x=>x.linkId===answers[0].linkId&&x.definition===definition);
 assert.equal(responses.length,1,'QR linkId and definition match the answer item');
 return {group,answer:answers[0],response:responses[0]};
}
function assertOtherAnswersUnchanged(before,after,target){
 const selected=x=>x.definition===target.definition&&x.linkId===target.linkId;
 const all=r=>items(r.item).filter(x=>x.definition?.endsWith('#Observation.value[x]'));
 assert.equal(all(before).filter(selected).length,1);assert.equal(all(after).filter(selected).length,1);
 const siblings=r=>all(r).filter(x=>!selected(x)).map(x=>({linkId:x.linkId,definition:x.definition,answer:x.answer}));
 assert.deepEqual(siblings(after),siblings(before),'Other answer identities and values must remain unchanged');
}
module.exports={assertQuestionAssociation,assertOtherAnswersUnchanged};
