import assert from 'node:assert/strict';
import {caseReviewReach, criterionReviewMembership, projectCriterionReview} from './criterionReviewProjection.ts';
import {criterionVerdictKey as id, criterionProgress, mvCriteriaClean} from './medicalValidationStore.ts';
const leaf=name=>({kind:'leaf',lib:'L',name,nodeKey:name,isSource:true,isInferred:false});
const crit=(name,operand)=>({kind:'criterion',lib:'L',name,bodyHash:'hash',operand});
function fixture(kind='and') {
 const root=crit('Root',{kind,operands:[leaf('A'),crit('Inner',leaf('B'))]});
 const outlines=new Map([['owner',{expr:root}]]),live=new Map(['Root','Inner'].map(name=>[id('L',name),{bodyHash:'hash',elided:false}]));
 const n=(parent,extra={})=>({parent,owner:'owner',outline:true,terminal:false,choice:false,...extra});
 const nodes={owner:n('',{outline:false,criterion:true}),a:n('owner',{concept:['L','A']}),inner:n('owner',{criterion:true}),b:n('inner',{concept:['L','B']}),input:n('b'),choice:n('input',{choice:true}),logic:n('owner',{logic:true}),downstream:n('owner',{owner:'downstream',outline:false})};
 const occurrences=[{gid:'root-gid',occurrenceKey:'owner',lib:'L',name:'Root'},{gid:'inner-gid',occurrenceKey:'inner',lib:'L',name:'Inner'}];
 const cases=[{caseId:'left',state:'pass',status:'complete',nodeKeys:['owner','left-end']},{caseId:'right',state:'pass',status:'complete',nodeKeys:['owner','right-end']}];
 return {nodes,occurrences,membership:criterionReviewMembership(outlines),live,stored:{},cases,current:true};
}
for(const kind of ['and','or']) test(kind+' both reviewed paths green the complete body and check criterion regardless of clinical truth',()=>{
 const f=fixture(kind),p=projectCriterionReview(f);
 assert.deepEqual([...p.pass].sort(),['a','b','inner','input','owner']);assert.equal(p.states['root-gid'],'pass');assert.equal(p.states['inner-gid'],'pass');
 assert.equal(mvCriteriaClean(criterionProgress(f.live,f.stored)),false,'display approval never writes encoding-completion gate');
 f.cases[1].state='unreviewed';assert.equal(projectCriterionReview(f).states['root-gid'],'unreviewed');assert.equal(projectCriterionReview(f).pass.size,0);
});
test('shared review reach includes false operands and inputs but excludes answer and logic decorations',()=>{
 const f=fixture();assert.deepEqual(caseReviewReach(['owner','left-end'],f.nodes).sort(),['a','b','inner','input','left-end','owner']);
});
test('explicit criterion approval paints only its occurrence body and nested inputs, without cases',()=>{
 const f=fixture();f.cases=[];f.stored[id('L','Root')]={state:'pass',bodyHash:'hash'};
 const p=projectCriterionReview(f);assert.deepEqual([...p.pass].sort(),['a','b','inner','input','owner']);assert.equal(p.states['inner-gid'],'pass');
});
for(const state of ['fail','pending','stale']) test('nested '+state+' survives explicit parent approval',()=>{
 const f=fixture();f.stored[id('L','Root')]={state:'pass',bodyHash:'hash'};f.stored[id('L','Inner')]={state:state==='stale'?'pass':state,bodyHash:state==='stale'?'old':'hash'};
 const p=projectCriterionReview(f);assert.equal(p.states['inner-gid'],state);assert(p.pass.has('a'));assert(!p.pass.has('b'));assert(!p.pass.has('input'));
 delete f.stored[id('L','Root')];assert.equal(projectCriterionReview(f).states['root-gid'],'unreviewed');
});
for(const blocker of ['error','ambiguous','missing-case','missing-identity','empty','elided','in-situ-elided','checking','recovery']) test(blocker+' cannot derive full approval',()=>{
 const f=fixture();
 if(blocker==='error')f.cases[1].status='error';
 if(blocker==='ambiguous')f.cases[1].caseId=undefined;
 if(blocker==='missing-case')f.cases[1].state='unreviewed';
 if(blocker==='missing-identity')f.live.delete(id('L','Root'));
 if(blocker==='empty')f.cases=[];
 if(blocker==='elided')f.live.get(id('L','Root')).elided=true;
 if(blocker==='in-situ-elided')f.membership.incomplete.add(id('L','Root'));
 if(['checking','recovery'].includes(blocker))f.current=false;
 const p=projectCriterionReview(f);assert.notEqual(p.states['root-gid'],'pass');assert(!p.pass.has('a'));
});
test('clearing explicit approval falls back to case coverage; Pending overrides it; demotion immediately removes paint',()=>{
 const f=fixture();f.stored[id('L','Root')]={state:'pending',bodyHash:'hash'};assert.equal(projectCriterionReview(f).states['root-gid'],'pending');
 delete f.stored[id('L','Root')];assert.equal(projectCriterionReview(f).states['root-gid'],'pass');
 f.cases[0].state='pending';assert.equal(projectCriterionReview(f).pass.size,0);
});
test('canonical shared identity requires approval at every owner; unrelated same-named library stays separate',()=>{
 const f=fixture();f.membership.owners.get(id('L','Root')).add('other-owner');f.cases.push({caseId:'other',state:'unreviewed',nodeKeys:['other-owner']});
 assert.equal(projectCriterionReview(f).states['root-gid'],'unreviewed');assert(!projectCriterionReview(f).pass.has('a'));
 f.cases.at(-1).state='pass';assert.equal(projectCriterionReview(f).states['root-gid'],'pass');
 f.stored[id('Other','Root')]={state:'fail',bodyHash:'hash'};assert.equal(projectCriterionReview(f).states['root-gid'],'pass');
});
test('all explicitly approved child criteria check their parent even without case evidence',()=>{
 const f=fixture();f.cases=[];f.membership.bodies.set(id('L','Root'),{kind:'or',operands:[crit('Inner',leaf('B'))]});
 f.stored[id('L','Inner')]={state:'pass',bodyHash:'hash'};assert.equal(projectCriterionReview(f).states['root-gid'],'pass');
});
test('collapsed or expanded visible body does not determine approval',()=>{
 const f=fixture(),expanded=projectCriterionReview(f);f.nodes={owner:f.nodes.owner};f.occurrences=[f.occurrences[0]];
 assert.equal(projectCriterionReview(f).states['root-gid'],expanded.states['root-gid']);f.cases[1].state='fail';assert.equal(projectCriterionReview(f).states['root-gid'],'unreviewed');
});
test('complete membership follows nested composite leaves, not only top-level criterion refs',()=>{
 const m=criterionReviewMembership(new Map([['owner',{expr:{...leaf('Composite'),composite:crit('Inner',leaf('B'))}}]]));
 assert.deepEqual([...m.owners.get(id('L','Inner'))],['owner']);
});

test('derived descendant checks share body eligibility through a Pending ancestor and errored owner',()=>{
 const f=fixture();f.stored[id('L','Root')]={state:'pass',bodyHash:'hash'};
 f.live.set(id('L','Child'),{bodyHash:'hash',elided:false});f.membership.owners.set(id('L','Child'),new Set(['owner']));f.membership.bodies.set(id('L','Child'),leaf('B'));
 f.nodes.child={...f.nodes.inner,parent:'inner'};f.nodes.b.parent='child';f.occurrences.push({gid:'child-gid',occurrenceKey:'child',lib:'L',name:'Child'});
 f.stored[id('L','Inner')]={state:'pending',bodyHash:'hash'};
 let p=projectCriterionReview(f);assert.equal(p.states['root-gid'],'pass');assert.equal(p.states['child-gid'],'unreviewed');assert(!p.pass.has('child'));
 delete f.stored[id('L','Inner')];f.cases[0].status='error';p=projectCriterionReview(f);
 assert.equal(p.states['inner-gid'],'unreviewed');assert.equal(p.states['child-gid'],'unreviewed');assert.equal(p.pass.size,0);
 delete f.stored[id('L','Root')];f.stored[id('L','Inner')]={state:'pass',bodyHash:'hash'};f.membership.bodies.set(id('L','Root'),crit('Inner',leaf('B')));
 assert.equal(projectCriterionReview(f).states['root-gid'],'unreviewed','nested body approval cannot bypass execution error');
});
test('input questions outside criteria green as soon as a path through them passes',()=>{
 const f=fixture();f.nodes={input:{parent:'owner',owner:'owner',outline:true,choice:false,terminal:false}};f.occurrences=[];f.cases[1].state='unreviewed';
 assert(projectCriterionReview(f).pass.has('input'));
});

test('missing canonical identity remains To do without a false changed-since-review claim',()=>{
 const f=fixture();f.live.delete(id('L','Root'));const p=projectCriterionReview(f);
 assert.equal(p.states['root-gid'],'unreviewed');assert(!p.pass.has('a'));
});
