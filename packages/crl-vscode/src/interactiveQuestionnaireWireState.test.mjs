import { describe, it, expect } from 'vitest';
import { InteractiveSession } from './interactiveQuestionnaire';

const question = (id, name) => ({ linkId: id, type: 'boolean', text: name, definition: 'urn:answer:' + name });
const answer = (id, value) => ({ linkId: id, answer: [{ valueBoolean: value }] });
const pair = (questions, responses, version = '1') => ({
  questionnaire: { resourceType: 'Questionnaire', url: 'urn:q', version, item: questions },
  response: { resourceType: 'QuestionnaireResponse', questionnaire: 'urn:q|' + version,
    status: 'in-progress', subject: { reference: 'Patient/p' }, item: responses }, activities: [],
});
const initial = { id: 'one', label: 'one', subject: 'Patient/p',
  bundle: { resourceType: 'Bundle', type: 'collection', entry: [
    { resource: { resourceType: 'Patient', id: 'p' } },
    { resource: { resourceType: 'ServiceRequest', id: 'r', subject: { reference: 'Patient/p' } } },
  ] } };
const defs = { resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'PlanDefinition', id: 'plan' } }] };

// @kit interactive-questionnaire:native-wire-state
describe('native Q/QR owns the current assessment state', () => {
  it('does not restore an omitted answered branch and submits only the returned pair next', async () => {
    const old = pair([question('1','Gate'),question('2','Old branch')],[answer('1',false),answer('2',true)]);
    const native = pair([question('1','Gate')],[answer('1',true)],'2'); native.activities=['Unmet'];
    const requests=[]; let calls=0;
    const session=new InteractiveSession(defs,'plan',async request=>{requests.push(request);return ++calls===1?old:native;});
    session.reset(initial); await session.evaluate();
    const submitted=structuredClone(old.response); submitted.item[0]=answer('1',true);
    const before=structuredClone({old,native,submitted,initial,defs});
    expect(await session.evaluate(submitted,old.questionnaire)).toBe(native);
    expect(session.result).toBe(native);
    await session.evaluate(native.response,native.questionnaire);
    const data=JSON.parse(requests[2].requestDataJson),repo=JSON.parse(requests[2].repositoryJson);
    expect(data.entry.map(e=>e.resource)).toEqual([...initial.bundle.entry.map(e=>e.resource),native.response]);
    expect(repo.entry.map(e=>e.resource)).toEqual([...defs.entry.map(e=>e.resource),native.questionnaire]);
    expect({old,native,submitted,initial,defs}).toEqual(before);
  });
  it('keeps a no-form completion as returned, without synthesizing a form', async () => {
    const old=pair([question('1','A')],[answer('1',true)]),native={activities:['Met']}; let calls=0;
    const session=new InteractiveSession(defs,'plan',async()=>++calls===1?old:native);
    session.reset(initial); await session.evaluate();
    expect(await session.evaluate(old.response,old.questionnaire)).toBe(native);
    expect(session.result.questionnaire).toBeUndefined(); expect(session.result.response).toBeUndefined();
  });
  it('preserves returned values, metadata and renumbered identities without merging old answers', async () => {
    const old=pair([question('1','A')],[answer('1',true)]);
    const native=pair([{...question('new','A'),extension:[{url:'urn:context',valueString:'native'}]}],[answer('new',false)],'2');
    let calls=0; const session=new InteractiveSession(defs,'plan',async()=>++calls===1?old:native);
    session.reset(initial); await session.evaluate();
    expect(await session.evaluate(old.response,old.questionnaire)).toBe(native);
    expect(native.response.item).toEqual([answer('new',false)]);
  });
  it('snapshots the wire request, while adopting only the native reply', async () => {
    const old=pair([question('1','A')],[{linkId:'1'}]),native={activities:['Met']}; let finish,calls=0; const requests=[];
    const session=new InteractiveSession(defs,'plan',async request=>{requests.push(request);return ++calls===1?old:await new Promise(resolve=>finish=resolve);});
    session.reset(initial); await session.evaluate();
    const submitted=structuredClone(old.response);submitted.item[0]=answer('1',true);
    const pending=session.evaluate(submitted,old.questionnaire);
    submitted.item[0].answer[0].valueBoolean=false;
    await Promise.resolve();await Promise.resolve();finish(native);
    expect(await pending).toBe(native);
    expect(JSON.parse(requests[1].requestDataJson).entry.at(-1).resource.item).toEqual([answer('1',true)]);
  });
});
