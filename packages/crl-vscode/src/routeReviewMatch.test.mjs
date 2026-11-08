import assert from 'node:assert/strict';
import { createRouteReviewMatcher } from './routeReviewMatch.ts';
import { executionRoutes } from './executionRoutes.ts';

const node=(key,kind,children=[],extra={})=>({nodeKey:key,nodeId:key,lib:'L',decision:'D',kind,label:key,refKeys:[],location:{},children,...extra});
const leaf=key=>node(key,'action',[],{actionKind:'recommend-activity'});
const when=(key,children)=>node(key,'when',children);
const shape=[{nodeKey:'D',lib:'L',decision:'D',location:{},childrenQualifier:'first',children:[
  when('node1',[when('node2',[leaf('node3'),leaf('node4')])]),when('node5',[leaf('node6')]),
]}];
const left=['D','node1','node2','node3'],otherLeft=['D','node1','node2','node4'],right=['D','node1','node5','node6'];

test('same Yes branch shares despite different next nodes; opposite No branch does not',()=>{
 const matcher=createRouteReviewMatcher(shape,left);
 assert.deepEqual(matcher.matchingKeys(otherLeft),['D','node1','node2']);
 assert.deepEqual(matcher.matchingKeys(right),['D']);
 assert.deepEqual(createRouteReviewMatcher(shape,right).matchingKeys(left),['D']);
});
test('real evaluated first-sibling traces establish connector direction independently of displayed labels',()=>{
 const traceWhen=(key,value,children=[])=>({nodeId:key,kind:'when',label:'Identical label',evaluated:true,condition:{satisfied:value,expr:{op:'ref',concept:{name:key,libraryName:'L'},satisfied:value}},children});
 const action=key=>({nodeId:key,kind:'action',label:'Same terminal text',evaluated:true,action:{actionKind:'recommend-activity',produced:true,target:{name:key}},children:[]});
 const scenario=tree=>({status:'pass',decision:{name:'D',libraryName:'L'},tree,conceptTruth:[]});
 const a=executionRoutes(scenario([traceWhen('node1',true,[traceWhen('node2',true,[action('node3')])])]),shape)[0];
 const c=executionRoutes(scenario([traceWhen('node1',false),traceWhen('node5',true,[action('node6')])]),shape)[0];
 assert.deepEqual(a.nodeKeys,left);assert.deepEqual(c.nodeKeys,right);
 assert.deepEqual(createRouteReviewMatcher(shape,a.nodeKeys).matchingKeys(c.nodeKeys),['D']);
});
test('trailing, unmapped or conflicting conditional paths cannot supply or receive shared votes',()=>{
 const matcher=createRouteReviewMatcher(shape,left);
 assert(!matcher.matchingKeys(['D','node1']).includes('node1'));
 assert(!matcher.matchingKeys(['D','node1','unmapped']).includes('node1'));
 assert(!matcher.matchingKeys([...left,'node1','node5','node6']).includes('node1'));
 assert(!matcher.matchingKeys([...left,'node1']).includes('node1'));
 const incomplete=createRouteReviewMatcher(shape,['D','node1']);
 assert(!incomplete.keys.has('node1'));assert.deepEqual(incomplete.matchingKeys(left),['D']);
});
test('delegated source nodes keep structural identity while their outgoing branch remains directional',()=>{
 const source=[{nodeKey:'Root',lib:'L',decision:'Root',location:{},children:[node('call','action',[],{actionKind:'use-decision',refKeys:['D']})]},...shape];
 const matcher=createRouteReviewMatcher(source,['Root','call',...left]);
 assert.deepEqual(matcher.matchingKeys(['Root','call',...right]),['Root','call','D']);
 assert(!matcher.matchingKeys(['Root','another-call',...right]).includes('call'));
});
