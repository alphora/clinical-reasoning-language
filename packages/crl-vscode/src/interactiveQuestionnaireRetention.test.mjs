import { describe, it, expect } from "vitest";
import { retainSubmittedAnswers } from "./interactiveQuestionnaireRetention";
import { InteractiveSession } from "./interactiveQuestionnaire";

const item = (id, name) => ({ linkId: id, definition: "urn:answer:"+name, type: "boolean", text: name });
const pair = (questions, responses, version = "1") => ({
  questionnaire: { resourceType: "Questionnaire", url: "urn:q", version, item: questions },
  response: { resourceType: "QuestionnaireResponse", questionnaire: "urn:q|"+version, status: "in-progress",
    subject: { reference: "Patient/p" }, item: responses },
  activities: ["Met"],
});
const answer = (id, value) => ({ linkId: id, answer: [{ valueBoolean: value }] });
const retain = (submitted, native) => retainSubmittedAnswers(submitted.questionnaire, submitted.response, native);

// @kit interactive-questionnaire:submitted-answer-retention
describe("current submitted answers remain editable after native apply", () => {
  it("retains A with its binding and answer, without introducing unanswered B or mutating inputs", () => {
    const old = pair([item("1","G"),item("2","A"),item("3","B")],[answer("1",true),answer("2",true),{linkId:"3"}]);
    old.questionnaire.item[1].extension = [{url:"extract",valueCanonical:"urn:profile:a"}];
    const native = pair([item("1","G")],[answer("1",true)],"2");
    const snapshot = structuredClone({old,native});
    const result = retain(old,native);
    expect(result.questionnaire.item).toEqual(old.questionnaire.item.slice(0,2));
    expect(result.response.item).toEqual(old.response.item.slice(0,2));
    expect(result.response.questionnaire).toBe("urn:q|2");
    expect(result.activities).toEqual(["Met"]);
    expect({old,native}).toEqual(snapshot);
  });
  it("never mistakes a reused positional linkId for the prior question", () => {
    const old = pair([item("1","G"),item("2","A")],[answer("1",true),answer("2",false)]);
    const native = pair([item("1","G"),item("2","B")],[answer("1",true),{linkId:"2"}],"2");
    const result = retain(old,native);
    expect(result.questionnaire.item.map(q=>q.definition)).toEqual(["urn:answer:G","urn:answer:B","urn:answer:A"]);
    const a = result.questionnaire.item[2];
    expect(a.linkId).not.toBe("2");
    expect(result.response.item.find(r=>r.linkId===a.linkId).answer).toEqual([{valueBoolean:false}]);
    expect(result.response.item.find(r=>r.linkId==="2").answer).toBeUndefined();
  });
  it("matches a returned definition after native renumbering and keeps its selected native value", () => {
    const old = pair([item("2","A")],[answer("2",true)]);
    const native = pair([item("1","A")],[answer("1",false)],"2");
    expect(retain(old,native)).toBe(native);
  });
  it.each([false, "", 0])("preserves an explicit value %s", value => {
    const key = typeof value === "boolean" ? "valueBoolean" : typeof value === "number" ? "valueInteger" : "valueString";
    const old = pair([item("1","A")],[{linkId:"1",answer:[{[key]:value}]}]);
    expect(retain(old,pair([],[])).response.item[0].answer[0][key]).toBe(value);
  });
  it("does not resurrect a cleared or pruned answer", () => {
    const cleared = pair([item("1","A")],[{linkId:"1"}]);
    const native = pair([],[]);
    expect(retain(cleared,native)).toBe(native);
    expect(retain(pair([],[]),native)).toBe(native);
  });
  it("retains answered items when completion has no Q/QR, and leaves an initial no-form result alone", () => {
    const old = pair([item("1","A"),item("2","B")],[answer("1",true),{linkId:"2"}]);
    const result = retain(old,{activities:["Met"]});
    expect(result.questionnaire.item).toEqual([old.questionnaire.item[0]]);
    expect(result.response.questionnaire).toBe("urn:q|1");
    expect(retainSubmittedAnswers(undefined,undefined,{activities:["Met"]})).toEqual({activities:["Met"]});
  });
  it("retains an ordinary group's answered child with its extraction ancestry", () => {
    const group = {linkId:"g",type:"group",extension:[{url:"extract",valueCanonical:"urn:profile"}],item:[item("a","A"),item("b","B")]};
    const old = pair([group],[{linkId:"g",item:[answer("a",true),{linkId:"b"}]}]);
    const result = retain(old,pair([],[]));
    expect(result.questionnaire.item[0].item).toEqual([group.item[0]]);
    expect(result.questionnaire.item[0].extension).toEqual(group.extension);
    expect(result.response.item[0].item).toEqual([answer("a",true)]);
  });
  it("retains a wholly missing repeated subtree without matching occurrences by position", () => {
    const group = {linkId:"g",type:"group",repeats:true,item:[item("a","A")]};
    const old = pair([group],[{linkId:"g",item:[answer("a",false)]},{linkId:"g",item:[answer("a",true)]}]);
    const result = retain(old,pair([],[]));
    expect(result.questionnaire.item).toEqual([group]);
    expect(result.response.item).toEqual(old.response.item);
  });
  it("refuses partial retention inside repeated groups rather than guessing occurrence identity", () => {
    const group = {linkId:"g",type:"group",repeats:true,item:[item("a","A"),item("b","B")]};
    const old = pair([group],[{linkId:"g",item:[answer("a",true),answer("b",false)]}]);
    const native = pair([{...group,item:[group.item[0]]}],[{linkId:"g",item:[answer("a",true)]}]);
    expect(()=>retain(old,native)).toThrow(/occurrence identity/);
  });
  it("remaps literal enableWhen references after positional IDs change", () => {
    const a = {...item("2","A"), enableWhen:[{question:"1",operator:"=",answerBoolean:true}]};
    const old = pair([item("1","G"),a],[answer("1",true),answer("2",true)]);
    const native = pair([item("3","G"),item("2","B")],[answer("3",true),{linkId:"2"}],"2");
    expect(retain(old,native).questionnaire.item[2].enableWhen[0].question).toBe("3");
  });
  it("rejects expression-dependent renumbering instead of rewriting arbitrary FHIRPath", () => {
    const a = {...item("2","A"),extension:[{url:"expression",valueExpression:{language:"text/fhirpath",expression:"%resource.item.where(linkId='2').answer.value"}}]};
    const old = pair([a],[answer("2",true)]);
    expect(()=>retain(old,pair([item("2","B")],[{linkId:"2"}],"2"))).toThrow(/expression references/);
  });
  it("rejects changed canonical or extraction context", () => {
    const old = pair([item("1","A")],[answer("1",true)]);
    const native = pair([],[]); native.questionnaire.url="urn:other";
    expect(()=>retain(old,native)).toThrow(/canonical changed/);
    native.questionnaire.url="urn:q";native.questionnaire.extension=[{url:"context",valueString:"different"}];
    expect(()=>retain(old,native)).toThrow(/context changed/);
  });
  it("allows only the verified generated population reference shape through a collision", () => {
    const base="https://example.org";
    const a={...item("2","A"),definition:base+"/StructureDefinition/example-a#Observation.value[x]",
      extension:[{url:"http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-questionnaire-definitionPopulationContext",extension:[
        {url:"definition",valueCanonical:base+"/StructureDefinition/example-a|1"},
        {url:"expression",valueExpression:{language:"text/cql-identifier",name:"A",expression:"A",reference:base+"/Library/ExampleInferences"}},
      ]}]};
    const old=pair([a],[answer("2",true)]),native=pair([item("2","B")],[{linkId:"2"}],"2");
    expect(retain(old,native).questionnaire.item[1].definition).toBe(a.definition);
    const arbitrary=structuredClone(old);
    arbitrary.questionnaire.item[0].extension=[{url:"arbitrary-expression",valueExpression:{
      language:"text/cql-identifier",expression:"ReadQuestionTwo",reference:base+"/Library/ExampleInferences"}}];
    expect(()=>retain(arbitrary,native)).toThrow(/expression references/);
    const wrongOwner=structuredClone(old);
    wrongOwner.questionnaire.item[0].extension[0].extension[0].valueCanonical="https://other/StructureDefinition/other";
    expect(()=>retain(wrongOwner,native)).toThrow(/expression references/);
  });
  it("uses the immutable submitted snapshot and carries the retained pair into the next request", async () => {
    const initial = pair([item("1","A"),item("2","B")],[{linkId:"1"},{linkId:"2"}]);
    let finish; const requests=[];
    const session=new InteractiveSession({resourceType:"Bundle",entry:[]},"plan",async request=>{
      requests.push(request);
      if(requests.length===1)return initial;
      if(requests.length===2)return new Promise(resolve=>finish=resolve);
      return pair([],[]);
    });
    session.reset({id:"one",subject:"Patient/p",bundle:{resourceType:"Bundle",entry:[]},label:"one"});
    await session.evaluate();
    const edited=structuredClone(initial.response);edited.item[0]=answer("1",true);
    const pending=session.evaluate(edited);await Promise.resolve();await Promise.resolve();
    edited.item[0].answer[0].valueBoolean=false;
    finish(pair([],[],"2"));
    const result=await pending;
    expect(result.response.item).toEqual([answer("1",true)]);
    await session.evaluate(result.response,result.questionnaire);
    expect(JSON.parse(requests[2].requestDataJson).entry[0].resource.item).toEqual([answer("1",true)]);
  });
  it("leaves the current form and submitted edit intact when unsafe metadata prevents retention", async () => {
    const initial = pair([{...item("2","A"),extension:[{url:"arbitrary",valueExpression:{
      language:"text/cql-identifier",expression:"ReadQuestionTwo",reference:"urn:library"}}]}],[{linkId:"2"}]);
    let calls=0;
    const session=new InteractiveSession({resourceType:"Bundle",entry:[]},"plan",async()=>
      ++calls===1?initial:pair([item("2","B")],[{linkId:"2"}],"2"));
    session.reset({id:"one",subject:"Patient/p",bundle:{resourceType:"Bundle",entry:[]},label:"one"});
    await session.evaluate();
    const edited=structuredClone(initial.response);edited.item[0]=answer("2",true);
    await expect(session.evaluate(edited,initial.questionnaire)).rejects.toThrow(/expression references/);
    expect(session.result).toBe(initial);
    expect(edited.item).toEqual([answer("2",true)]);
  });
});
