// REFACTOR:grounded: delayed renders and page/case changes cannot authorize stale actions or captures.
import assert from 'node:assert/strict';
import { branchMessageIsCurrent, branchCaptureManifest } from './decisionTableSessions.ts';
const row=(id,extra={})=>({id,epoch:'table',sourceVersion:4,generation:2,renderToken:id+'-case1',ready:true,mounted:true,...extra});
const manifest=rows=>branchCaptureManifest('table',4,'scope',0n,rows);
test('only current mounted messages reach row handlers, independent of another row becoming active',()=>{
 const a=row('a'),b=row('b');
 const message={epoch:'table',rowId:'a',gen:2};
 assert(branchMessageIsCurrent(a,'table',4,message));
 assert(!branchMessageIsCurrent(b,'table',4,message));
 for(const change of [{epoch:'old'},{rowId:'b'},{gen:1}])assert(!branchMessageIsCurrent(a,'table',4,{...message,...change}));
 assert(!branchMessageIsCurrent({...a,mounted:false},'table',4,message));
 assert(!branchMessageIsCurrent(a,'table',5,message));
 assert(branchMessageIsCurrent(a,'table',4,message),'B activation is not a session invalidation');
});
test('final layout barrier refuses a pending row and invalidates case, page, scope, render and source changes',()=>{
 const a=row('a'),b=row('b'),frozen=manifest([a,b]);assert.equal(typeof frozen,'string');
 assert.equal(manifest([a,{...b,ready:false}]),undefined);
 assert.equal(manifest([a,{...b,mounted:false}]),undefined);
 assert.equal(manifest([a,{...b,sourceVersion:3}]),undefined);
 assert.notEqual(manifest([a,{...b,renderToken:'b-case2'}]),frozen);
 assert.notEqual(manifest([{...a,generation:3},b]),frozen);
 assert.notEqual(manifest([a]),frozen);assert.notEqual(manifest([b,a]),frozen);
 assert.notEqual(branchCaptureManifest('table',4,'scope',20n,[a,b]),frozen);
 assert.notEqual(branchCaptureManifest('table',4,'other scope',0n,[a,b]),frozen);
 assert.equal(manifest([a,b]),frozen,'unchanged final layout can settle its frozen capture');
});
