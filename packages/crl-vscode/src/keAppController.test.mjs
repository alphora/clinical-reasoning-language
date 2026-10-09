import assert from 'node:assert/strict';
import {KeAppController} from './keAppController.ts';
const request={id:'q',revision:'first',gist:'Question',editRequest:{kind:'question-edit',target:{kind:'question',file:'src/crl/p.crl',library:'L',concept:'Q'},before:{text:'Old?',description:''},desired:{text:'New?',description:''}}};
const preview={ok:true,state:'preview',requests:[{id:'q',revision:'first'}],changes:[],changedPaths:[],basis:'source1',refreshedFolders:['tests/results']};
function app(extra={}){const calls=[],controller=new KeAppController('/artifact',async input=>{calls.push(input);if(extra[input.operation])return await extra[input.operation](input);return input.operation==='discover'?{ok:true,requests:[request],pendingFindings:[],recoveryRequired:false}:input.operation==='preview'?preview:{ok:true,state:'changed',changedPaths:['src/crl/p.crl']};});return{controller,calls};}
test('Run requires a preview, rejects selection changes, and passes only the artifact and selected revisions',async()=>{
 const {controller:c,calls}=app();await c.act('refresh');c.select(['q','forged']);await c.act('run');assert.match(c.state.error,/Preview/);assert.equal(calls.some(x=>x.operation==='apply'),false);
 await c.act('preview');c.select([]);await c.act('run');assert.equal(calls.some(x=>x.operation==='apply'),false);
 c.select(['q']);await c.act('preview');await c.act('run');assert.deepEqual(calls.find(x=>x.operation==='apply'),{schemaVersion:1,operation:'apply',artifactRoot:'/artifact',requests:[{id:'q',revision:'first'}]});assert.equal(c.state.result.state,'changed');assert.equal(c.state.preview,undefined);
});
test('fresh source basis and request revisions must match the reviewed preview',async()=>{
 let basis='first';const {controller:c,calls}=app({preview:async()=>({...preview,basis})});await c.act('refresh');c.select(['q']);await c.act('preview');basis='changed';await c.act('run');assert.match(c.state.error,/Preview again/);assert.equal(c.state.preview,undefined);assert.equal(calls.some(x=>x.operation==='apply'),false);
});
test('closing the view does not cancel Run, reopening sees busy then result, and a second invocation is ignored',async()=>{
 let finish;const {controller:c,calls}=app({apply:()=>new Promise(resolve=>{finish=resolve;})});await c.act('refresh');c.select(['q']);await c.act('preview');let seen=[];const detach=c.subscribe(s=>seen.push(s.busy));const running=c.act('run');while(!finish)await Promise.resolve();detach();await c.act('run');const reopened=[];const off=c.subscribe(s=>reopened.push({busy:s.busy,result:s.result?.state}));assert.equal(reopened[0].busy,'run');finish({ok:true,state:'changed',changedPaths:['src/crl/p.crl']});await running;assert.equal(reopened.at(-1).result,'changed');assert.equal(calls.filter(x=>x.operation==='apply').length,1);off();
});
test('watch invalidation during a delayed preview withholds Run',async()=>{
 let finish;const {controller:c,calls}=app({preview:()=>new Promise(resolve=>{finish=resolve;})});await c.act('refresh');c.select(['q']);const pending=c.act('preview');c.invalidate();finish(preview);await pending;assert.match(c.state.error,/changed during Preview/);assert.equal(c.state.preview,undefined);await c.act('run');assert.equal(calls.some(x=>x.operation==='apply'),false);
});
test('failed apply is visible and requires another preview; separate artifacts keep separate work',async()=>{
 const {controller:c}=app({apply:async()=>({ok:false,error:'Native failed'})}),{controller:other}=app();await c.act('refresh');c.select(['q']);await c.act('preview');await c.act('run');assert.equal(c.state.error,'Native failed');assert.equal(c.state.busy,undefined);assert.equal(c.state.preview,undefined);assert.deepEqual(other.state.selected,[]);
});
test('publication failure refreshes recovery availability and retains the actual operation error',async()=>{
 let recovery=false;const {controller:c}=app({discover:async()=>({ok:true,requests:[request],recoveryRequired:recovery}),apply:async()=>{recovery=true;return{ok:false,error:'Publication interrupted'};}});await c.act('refresh');c.select(['q']);await c.act('preview');await c.act('run');assert.equal(c.state.recoveryRequired,true);assert.equal(c.state.error,'Publication interrupted');assert.equal(c.state.preview,undefined);
});
test('failed recovery preserves its error and separately reports failed discovery',async()=>{
 const {controller:c}=app({recover:async()=>({ok:false,error:'External conflict'}),discover:async()=>({ok:false,error:'Unreadable flag store'})});await c.act('recover');assert.equal(c.state.error,'External conflict\nCould not refresh recovery state: Unreadable flag store');assert.equal(c.state.busy,undefined);
});
test('interrupted recovery is explicit, no preview or apply until recovered; no KELP access call',async()=>{
 let recovery=true;const {controller:c,calls}=app({discover:async()=>({ok:true,requests:[request],recoveryRequired:recovery}),recover:async()=>{recovery=false;return{ok:true,state:'recovered',changedPaths:['src/crl/p.crl']};}});await c.act('refresh');c.select(['q']);await c.act('preview');assert.match(c.state.error,/Recover/);await c.act('recover');assert.equal(c.state.recoveryRequired,false);assert.equal(c.state.result.state,'recovered');assert.deepEqual(calls.map(x=>x.operation),['discover','recover','discover']);c.dispose();await c.act('refresh');assert.equal(calls.length,3);
});
