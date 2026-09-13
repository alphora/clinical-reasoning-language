import assert from 'node:assert/strict';
import { leafRouteNeighbors } from './branchNavigation.ts';
test('leaf navigation uses first representative, including from a later route to the same leaf',()=>{
 const a={caseId:'a',routeId:'r1',leafKey:'leaf-one'},alternate={caseId:'a',routeId:'r2',leafKey:'leaf-one'},
 b={caseId:'b',routeId:'r1',leafKey:'leaf-two'},later={caseId:'c',routeId:'r3',leafKey:'leaf-one'},
 c={caseId:'d',routeId:'r4',leafKey:'leaf-three'},routes=[a,alternate,b,later,c];
 assert.deepEqual(leafRouteNeighbors(routes,a),{previous:undefined,next:b,index:0,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,later),leafRouteNeighbors(routes,a));
 assert.deepEqual(leafRouteNeighbors(routes,alternate),leafRouteNeighbors(routes,a));
 assert.deepEqual(leafRouteNeighbors(routes,b),{previous:a,next:c,index:1,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,c),{previous:b,next:undefined,index:2,total:3});
});
test('distinct structural leaves remain separate even when runtime terminal labels/ids match',()=>{
 const a={caseId:'a',routeId:'Met',leafKey:'decision-a/outcome'},b={caseId:'b',routeId:'Met',leafKey:'decision-b/outcome'};
 assert.equal(leafRouteNeighbors([a,b],a).next,b);
});
test('unknown and unmapped routes cannot navigate; endpoints do not wrap',()=>{
 const a={caseId:'a',routeId:'r',leafKey:'leaf'},missing={caseId:'missing',routeId:'r'},unmapped={caseId:'x',routeId:'r',leafKey:''};
 assert.deepEqual(leafRouteNeighbors([unmapped,a],missing),{previous:undefined,next:undefined,index:-1,total:1});
 assert.deepEqual(leafRouteNeighbors([unmapped,a],unmapped),{previous:undefined,next:undefined,index:-1,total:1});
 assert.deepEqual(leafRouteNeighbors([],a),{previous:undefined,next:undefined,index:-1,total:0});
 assert.deepEqual(leafRouteNeighbors([a],a),{previous:undefined,next:undefined,index:0,total:1});
});
