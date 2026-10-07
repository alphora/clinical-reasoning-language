import assert from 'node:assert/strict';
import { traversalRouteNeighbors } from './branchNavigation.ts';
const route=(caseId,leafKey,traversalKey=leafKey,routeId=caseId)=>({caseId,routeId,leafKey,traversalKey});

test('different traversals of one terminal are separate stops; duplicate cases share their traversal stop',()=>{
 const a=route('a','one','a'),alternate=route('alternate','one','alternate'),duplicate=route('duplicate','one','a'),b=route('b','two');
 const routes=[a,alternate,b,duplicate];
 assert.deepEqual(traversalRouteNeighbors(routes,a),{previous:undefined,next:alternate,index:0,total:3});
 assert.deepEqual(traversalRouteNeighbors(routes,duplicate),traversalRouteNeighbors(routes,a));
 assert.deepEqual(traversalRouteNeighbors(routes,alternate),{previous:a,next:b,index:1,total:3});
 assert.deepEqual(traversalRouteNeighbors(routes,b),{previous:alternate,next:undefined,index:2,total:3});
});

test('distinct structural leaves remain separate even when terminal ids and traversal keys match',()=>{
 const a=route('a','decision-a/outcome','same','Met'),b=route('b','decision-b/outcome','same','Met');
 assert.equal(traversalRouteNeighbors([a,b],a).next,b);
});

test('tree order groups every terminal variant regardless of CEL case order',()=>{
 const first=route('last-case','top','first'),alternate=route('alternate','top','second'),duplicate=route('duplicate','top','first'),
 middle=route('middle','middle'),last=route('first-case','bottom');
 const routes=[last,middle,first,alternate,duplicate],visual=['top','uncovered','middle','bottom'];
 assert.deepEqual(traversalRouteNeighbors(routes,first,visual),{previous:undefined,next:alternate,index:0,total:4});
 assert.deepEqual(traversalRouteNeighbors(routes,alternate,visual),{previous:first,next:middle,index:1,total:4});
 assert.deepEqual(traversalRouteNeighbors(routes,middle,visual),{previous:alternate,next:last,index:2,total:4});
 assert.deepEqual(traversalRouteNeighbors(routes,last,visual),{previous:middle,next:undefined,index:3,total:4});
 assert.deepEqual(traversalRouteNeighbors(routes,duplicate,visual),traversalRouteNeighbors(routes,first,visual));
 assert.deepEqual(routes,[last,middle,first,alternate,duplicate]);
});

test('unmapped visual order retains encounter order after mapped terminals without duplicate entries',()=>{
 const unknown=route('unknown','not-in-order'),known=route('known','known'),other=route('other','other');
 const routes=[unknown,known,other],visual=['known','known','uncovered'];
 assert.deepEqual(traversalRouteNeighbors(routes,known,visual),{previous:undefined,next:unknown,index:0,total:3});
 assert.deepEqual(traversalRouteNeighbors(routes,unknown,visual),{previous:known,next:other,index:1,total:3});
 assert.deepEqual(traversalRouteNeighbors(routes,other,visual),{previous:unknown,next:undefined,index:2,total:3});
 assert.deepEqual(traversalRouteNeighbors(routes,unknown,[]),{previous:undefined,next:known,index:0,total:3});
 assert.deepEqual(traversalRouteNeighbors([route('missing','',''),...routes],unknown,visual),traversalRouteNeighbors(routes,unknown,visual));
});

test('unknown and unmapped identities cannot navigate; endpoints do not wrap',()=>{
 const a=route('a','leaf'),missing={caseId:'missing',routeId:'missing'},unmapped=route('x','');
 assert.deepEqual(traversalRouteNeighbors([unmapped,a],missing),{previous:undefined,next:undefined,index:-1,total:1});
 assert.deepEqual(traversalRouteNeighbors([unmapped,a],unmapped),{previous:undefined,next:undefined,index:-1,total:1});
 assert.deepEqual(traversalRouteNeighbors([],a),{previous:undefined,next:undefined,index:-1,total:0});
 assert.deepEqual(traversalRouteNeighbors([a],a),{previous:undefined,next:undefined,index:0,total:1});
});

test('several ANY witnesses in one case/route retain their selected navigation identity',()=>{
 const a=route('case','leaf','witness-a','route'),b=route('case','leaf','witness-b','route');
 assert.equal(traversalRouteNeighbors([a,b],a).next,b);
 assert.equal(traversalRouteNeighbors([a,b],b).previous,a);
 assert.equal(traversalRouteNeighbors([a,b],b).index,1);
 assert.equal(traversalRouteNeighbors([a,b],{...b,traversalKey:'stale'}).index,-1);
});
