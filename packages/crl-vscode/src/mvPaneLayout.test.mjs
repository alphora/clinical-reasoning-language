import assert from 'node:assert/strict';
import { compactMvLayout, createMvPaneLayout } from './mvPaneLayout.ts';

const layout = (...sizes) => ({orientation:0, groups:sizes.map(size=>({size}))});
const sizes = l => l.groups.map(g=>g.size);
test('a giant FHIR pane and tiny Result become equal compact panes with a greedy tree',()=>{
  const original=layout(200,200,1600),next=compactMvLayout(original,1,[2,3]);
  assert.deepEqual(sizes(next),[1240,380,380]);assert.deepEqual(sizes(original),[200,200,1600]);
  assert.equal(compactMvLayout(next,1,[2,3]),undefined,'already at defaults is a no-op');
  assert.deepEqual(sizes(compactMvLayout(layout(100,100,100,2100),2,[1,3,4])),[380,1260,380,380],'source uses the same width');
  assert.deepEqual(sizes(compactMvLayout(layout(100,1900),1,[2])),[1620,380]);
});
test('narrow windows shrink side panes equally; unrelated columns keep their sizes',()=>{
  assert.deepEqual(sizes(compactMvLayout(layout(100,100,900),1,[2,3])),[500,300,300]);
  assert.deepEqual(sizes(compactMvLayout(layout(100,50,150),1,[2,3])),[100,100,100]);
  assert.deepEqual(sizes(compactMvLayout(layout(150,200,200,1450),2,[3,4])),[150,1090,380,380]);
});
test('nested horizontal siblings resize without flattening other rows, columns or groups',()=>{
  const input={orientation:1,groups:[{size:700,groups:layout(100,100,1800).groups},{size:300,groups:layout(900,1100).groups}]};
  const next=compactMvLayout(input,1,[2,3]);
  assert.deepEqual(sizes(next.groups[0]),[1240,380,380]);assert.deepEqual(next.groups[1],input.groups[1]);assert.equal(next.groups[0].size,700);
  assert.equal(compactMvLayout(input,1,[4]),undefined,'separate rows are left alone');
  for(const support of [[],[1],[2,2],[9],[undefined]])assert.equal(compactMvLayout(input,1,support),undefined);
  assert.equal(compactMvLayout({orientation:1,groups:layout(200,200,1600).groups},1,[2,3]),undefined);
});
const settle=()=>new Promise(r=>setTimeout(r,85));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function harness(){
  const calls=[],errors=[],identities=[{},{},{}],groupIds=[{},{},{}];let current=layout(200,200,1600),pending;
  let snapshot={epoch:'policy:1',tree:{identity:identities[0],column:1},support:identities.slice(1).map((identity,i)=>({identity,column:i+2})),groups:groupIds.map((identity,i)=>({identity,column:i+1}))};
  const control=createMvPaneLayout(()=>snapshot,async(name,value)=>{
    calls.push([name,value]);if(name==='vscode.getEditorLayout'){if(pending){const p=pending;pending=undefined;return p.promise;}return structuredClone(current);}
    current=value;
  },e=>errors.push(e));
  return {control,calls,errors,get snapshot(){return snapshot},set snapshot(v){snapshot=v},get layout(){return current},set layout(v){current=v},defer(){pending=deferred();return pending}};
}
test('reopening/depth requests restore defaults while focus-only events preserve manual sizing',async()=>{
  const h=harness();try{
    h.control.request();h.control.request();await settle();assert.deepEqual(sizes(h.layout),[1240,380,380]);
    h.layout=layout(1100,450,450);h.control.groupsChanged();await settle();assert.deepEqual(sizes(h.layout),[1100,450,450]);
    assert.equal(h.calls.filter(c=>c[0]==='vscode.setEditorLayout').length,1,'focusing a different group must not reset widths');
    for(const action of ['reopen','shallower','deeper']){h.layout=layout(200,200,1600);h.control.request();await settle();assert.deepEqual(sizes(h.layout),[1240,380,380],action);}
  }finally{h.control.dispose();}
});
test('an unrelated split during the awaited read invalidates it, preserving the new group',async()=>{
  const h=harness(),p=h.defer();try{
    h.control.request();await settle();
    h.snapshot={...h.snapshot,groups:[...h.snapshot.groups,{identity:{},column:4}]};h.layout=layout(200,200,1200,400);h.control.groupsChanged();
    p.resolve(layout(200,200,1600));await settle();
    const writes=h.calls.filter(c=>c[0]==='vscode.setEditorLayout');assert.equal(writes.length,1);assert.equal(writes[0][1].groups.length,4);assert.deepEqual(sizes(h.layout),[840,380,380,400]);
  }finally{h.control.dispose();}
});
test('changed policy, replaced panels and disposal invalidate pending reads',async()=>{
  for(const change of ['policy','panel','dispose']){
    const h=harness(),p=h.defer();h.control.request();await settle();
    if(change==='policy')h.snapshot={...h.snapshot,epoch:'new:2'};
    if(change==='panel')h.snapshot={...h.snapshot,tree:{identity:{},column:1}};
    if(change==='dispose')h.control.dispose();
    p.resolve(layout(200,200,1600));await settle();h.control.dispose();assert(!h.calls.some(c=>c[0]==='vscode.setEditorLayout'),change);
  }
});
test('command failure is reported and a later request can recover',async()=>{
  let fail=true;const errors=[],writes=[],identity={};
  const c=createMvPaneLayout(()=>({epoch:'1',tree:{identity,column:1},support:[{identity,column:2}],groups:[{identity,column:1},{identity,column:2}]}),async(name,value)=>{
    if(fail)throw Error('command failed');if(value)writes.push(value);return layout(100,1900);
  },e=>errors.push(e));
  try{c.request();await settle();assert.equal(errors.length,1);fail=false;c.request();await settle();assert.equal(writes.length,1);}finally{c.dispose();}
});
