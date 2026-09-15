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
test('tree order controls numbering and both arrows regardless of CEL case order',()=>{
 const first={caseId:'last-case',routeId:'r1',leafKey:'top'},
 alternate={caseId:'later-case',routeId:'alternate',leafKey:'top'},
 middle={caseId:'second-case',routeId:'r2',leafKey:'middle'},
 last={caseId:'first-case',routeId:'r3',leafKey:'bottom'};
 const routes=[last,middle,first,alternate],visual=['top','uncovered','middle','bottom'];
 assert.deepEqual(leafRouteNeighbors(routes,alternate,visual),{previous:undefined,next:middle,index:0,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,middle,visual),{previous:first,next:last,index:1,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,last,visual),{previous:middle,next:undefined,index:2,total:3});
 assert.deepEqual(routes,[last,middle,first,alternate], 'navigation must not reorder authored cases');
});
test('non-disposition endpoints keep encounter order after mapped leaves without duplicate entries',()=>{
 const unknown={caseId:'paused',routeId:'paused-when',leafKey:'when-key'},
 known={caseId:'known',routeId:'r2',leafKey:'known'},
 other={caseId:'other',routeId:'r3',leafKey:'other'};
 const routes=[unknown,known,other],visual=['known','known','uncovered'];
 assert.deepEqual(leafRouteNeighbors(routes,known,visual),{previous:undefined,next:unknown,index:0,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,unknown,visual),{previous:known,next:other,index:1,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,other,visual),{previous:unknown,next:undefined,index:2,total:3});
 assert.deepEqual(leafRouteNeighbors(routes,unknown,[]),leafRouteNeighbors(routes,unknown));
 assert.deepEqual(leafRouteNeighbors([{caseId:'missing',routeId:'r',leafKey:''},...routes],unknown,visual),leafRouteNeighbors(routes,unknown,visual));
});
test('unknown and unmapped routes cannot navigate; endpoints do not wrap',()=>{
 const a={caseId:'a',routeId:'r',leafKey:'leaf'},missing={caseId:'missing',routeId:'r'},unmapped={caseId:'x',routeId:'r',leafKey:''};
 assert.deepEqual(leafRouteNeighbors([unmapped,a],missing),{previous:undefined,next:undefined,index:-1,total:1});
 assert.deepEqual(leafRouteNeighbors([unmapped,a],unmapped),{previous:undefined,next:undefined,index:-1,total:1});
 assert.deepEqual(leafRouteNeighbors([],a),{previous:undefined,next:undefined,index:-1,total:0});
 assert.deepEqual(leafRouteNeighbors([a],a),{previous:undefined,next:undefined,index:0,total:1});
});
