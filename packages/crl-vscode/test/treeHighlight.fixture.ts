import { criterionReviewMembership, projectCriterionReview } from '../src/criterionReviewProjection';
import { criterionGateIdentities } from '@smile-digital-health/crl/provenance';
// Production model and renderer; browser bridge uses their paint without an extension host.
import { resolveCelSuite, buildSuiteExecutionModel, nodeKey, conceptDeclRef, caseViewKey } from '@smile-digital-health/crl';
import { renderFlowPane, toggleCriterionExpansion, expandTraversalCriteria, expandQuestionInputs, FLOW_STYLE } from '../src/flowPaneHtml';
import { executionRoutes, buildRouteQuestionnaire } from '../src/executionRoutes';
import { buildRouteCards, definitionValueInputs } from '../src/routeCards';
import { leafBucketsFromQuestionnaire } from '../src/correspondenceCockpit';
import { conditionTruthKeys } from '../src/flowProjection';
export {COCKPIT_WEBVIEW_SCRIPT} from '../src/correspondenceCockpit';
import { treeTraversal, treeTraversalSignature, terminalTraversals, treeFocusPaint } from '../src/unpinnedTreeFocus';
import { buildRuntimeRefIndex } from '../src/failedCriterionPeek';
import { resolveThisNode } from '../src/thisNodeMarker';

export function fixture(cel: string) {
  const suite = resolveCelSuite(cel);
  if (!suite.ok) throw Error(JSON.stringify(suite.diagnostics));
  const model = buildSuiteExecutionModel(suite.suite)!;
  const opts = {
    concepts: model.conceptLayer, guardOutlines: model.guardOutlines,
    traversalNavigation: true, defExpr: (lib: string, name: string) => model.defExpr.get(nodeKey(conceptDeclRef(lib, name))),
    answerOptionsByConcept: new Map(model.conceptLayer.filter(c => c.answerOptions?.length).map(c => [c.nodeKey, c.answerOptions!])),
  };
  let expanded = new Set<string>();
  const expand = (nodes: {nodeKey: string; children: any[]}[]) => {
    for (const node of nodes) { expanded = toggleCriterionExpansion(expanded, node.nodeKey, model.crlStructure, opts); expand(node.children); }
  };
  for (const decision of model.crlStructure) expand(decision.children);
  const manualHtml=renderFlowPane(model.crlStructure,{...opts,expandedGuardWhens:expanded}).html;
  // This fixture also tests exclusion of visible answer rows from blue paths.
  // Open those explicitly, never as a side effect of expanding a Criterion.
  const folded=renderFlowPane(model.crlStructure,{...opts,expandedGuardWhens:expanded});
  for(const reveal of Object.values(folded.reveals))if('criterionToggle' in reveal && reveal.criterionToggle.endsWith('"opts"]')) {
    expanded=toggleCriterionExpansion(expanded,reveal.criterionToggle,model.crlStructure,opts);
  }
  const rendered = renderFlowPane(model.crlStructure, {...opts, expandedGuardWhens: expanded});
  const runtime = buildRuntimeRefIndex(model.crlStructure);
  const entries = model.scenarios.scenarios.flatMap(sv => executionRoutes(sv, model.crlStructure).map(route =>
    treeTraversal(model.caseIdByName[caseViewKey(sv.case)], sv, route, id => resolveThisNode(id,
      {lib: sv.decision?.libraryName ?? '', decision: sv.decision?.name ?? ''}, sv.tree, runtime, undefined).nodeKey)));
  const terminals = Object.entries(rendered.focusNodes).filter(([, n]) => n.terminal).map(([key]) => key);
  const choices = Object.fromEntries(terminals.map(key => [key, terminalTraversals(entries, key).map(entry => treeFocusPaint([entry], key, rendered.focusNodes))]));
  const auto=Object.fromEntries(terminals.map(key=>{
    let opened=new Set<string>();
    return [key,terminalTraversals(entries,key).map(entry=>{
      opened=expandTraversalCriteria(opened,entry,model.crlStructure,opts);
      const r=renderFlowPane(model.crlStructure,{...opts,expandedGuardWhens:opened});
      return {html:r.html,paint:treeFocusPaint([entry],key,r.focusNodes),opened:[...opened]};
    })];
  }));
  const prefixes = Object.fromEntries(Object.entries(rendered.focusNodes).filter(([, n]) => !n.terminal && !n.choice)
    .map(([key]) => [key, treeFocusPaint(entries, key, rendered.focusNodes)]));
  // Bleph has only root criterion tabs. Exercise nested tab rings explicitly too.
  const leaf = {kind:'leaf', lib:'Synthetic', name:'Answer', nodeKey:'synthetic-answer', isSource:true, isInferred:false};
  const criterion = (name: string, operand: any) => ({kind:'criterion', lib:'Synthetic', name, bodyHash:'fixture', operand});
  const nestedTree: any = [{lib:'Synthetic',decision:'Nested',nodeKey:'nested-root',children:[
    {lib:'Synthetic',decision:'Nested',nodeKey:'nested-when',kind:'when',label:'Root criterion',refKeys:[],children:[]}]}];
  const nestedOpts: any = {guardOutlines:new Map([['nested-when',{expr:criterion('Root',criterion('Middle',criterion('Inner',leaf)))}]])};
  nestedOpts.expandedGuardWhens=toggleCriterionExpansion(new Set(),'nested-when',nestedTree,nestedOpts);
  const nested=renderFlowPane(nestedTree,nestedOpts);
  for(const [key,n] of Object.entries(nested.focusNodes))if(!n.choice) prefixes[key]=treeFocusPaint([],key,nested.focusNodes);
  const pinnedRows=entries.filter(e=>rendered.focusNodes[e.route.nodeKeys.at(-1)!]?.terminal).map(e=>{
    const sv=model.scenarios.scenarios.find(s=>model.caseIdByName[caseViewKey(s.case)]===e.caseId)!;
    const resolve=(id:string)=>resolveThisNode(id,{lib:sv.decision?.libraryName??'',decision:sv.decision?.name??''},sv.tree,runtime,undefined).nodeKey;
    const byIdentity=(lib:string|undefined,name:string)=>model.conceptLayer.find(c=>c.lib===lib&&c.name===name);
    const q=buildRouteQuestionnaire(sv,e.route,(lib,name)=>byIdentity(lib,name)?.valueTypes??[],sv.decision?.libraryName,{
      conceptShape:(lib,name)=>lib?model.conceptShape.get(nodeKey(conceptDeclRef(lib,name))):undefined,defExpr:opts.defExpr,
    });
    // Real question construction; wording/edit ownership is not under test in this route audit.
    const {cards}=buildRouteCards(q,sv,resolve,()=>undefined,(lib,name)=>byIdentity(lib,name)?.answerOptions??[],
      definitionValueInputs(model.conceptLayer),(lib,name)=>!!byIdentity(lib,name)?.hasLocalCode,(lib,name)=>byIdentity(lib,name)?.answersFromTerminology);
    const opened=expandQuestionInputs(expandTraversalCriteria(new Set(),e,model.crlStructure,opts),cards,model.crlStructure,opts);
    const r=renderFlowPane(model.crlStructure,{...opts,expandedGuardWhens:opened});
    const leaves=leafBucketsFromQuestionnaire(q.questions,resolve,sv.conceptTruth,r.leafConcepts),ids=(keys:string[])=>keys.flatMap(k=>r.anchors[k]?.segmentIds??[]);
    const selected=new Set(e.route.nodeIds);
    const marks={yesIds:ids(leaves.yesKeys),noIds:ids(leaves.noKeys),conditions:conditionTruthKeys(sv.tree,id=>selected.has(id)?resolve(id):undefined).map(m=>({ids:ids([m.key]),result:m.result}))};
    const paint=treeFocusPaint([e],e.route.nodeKeys.at(-1)!,r.focusNodes);
    return {caseId:e.caseId,routeId:e.route.terminalId,leafKey:e.route.nodeKeys.at(-1)!,traversalKey:treeTraversalSignature(e),routeKeys:e.route.nodeKeys,
      html:r.html,cards,marks,pathNodeKeys:paint.nodeKeys,pathGroupKeys:paint.groupKeys,pathGroupOutcomes:paint.groupOutcomes,nodes:r.focusNodes,opened:[...opened],operands:e.operands,conditions:e.conditions};
  });
  // Synthetic topology exercises both authored group kinds; this is rendering evidence,
  // not a replacement for Bleph's actual execution/answer evidence above.
  const groupLeaf=(name:string)=>({...leaf,name,nodeKey:'group-'+name});
  const groupTree:any=[{lib:'Synthetic',decision:'Groups',nodeKey:'group-root',children:[
    {lib:'Synthetic',decision:'Groups',nodeKey:'group-a',kind:'when',label:'Mixed groups',refKeys:[],children:[
      {lib:'Synthetic',decision:'Groups',nodeKey:'group-result-a',kind:'action',label:'Met',actionKind:'recommend-activity',refKeys:[],children:[]}]},
    {lib:'Synthetic',decision:'Groups',nodeKey:'group-b',kind:'when',label:'Other group',refKeys:[],children:[
      {lib:'Synthetic',decision:'Groups',nodeKey:'group-result-b',kind:'action',label:'Unmet',actionKind:'recommend-activity',refKeys:[],children:[]}]}]}];
  const groupOpts:any={guardOutlines:new Map([
    ['group-a',{expr:criterion('Mixed',{kind:'and',operands:[groupLeaf('A'),criterion('Alternatives',{kind:'or',operands:[groupLeaf('B'),groupLeaf('C')]})]})}],
    ['group-b',{expr:criterion('Other',{kind:'or',operands:[groupLeaf('D'),groupLeaf('E')]})}]]),expandedGuardWhens:new Set(['group-a','group-b'])};
  for(const suffix of ['a','b']) groupOpts.expandedGuardWhens=expandTraversalCriteria(groupOpts.expandedGuardWhens,{route:{nodeKeys:['group-root','group-'+suffix]}} as any,groupTree,groupOpts);
  const groups=renderFlowPane(groupTree,groupOpts);
  const groupRoutes=['a','b'].map(suffix=>{
    const keys=['group-root','group-'+suffix,'group-result-'+suffix];
    const e:any={caseId:'synthetic-'+suffix,route:{nodeKeys:keys},operands:[],conditions:[{key:'group-'+suffix,result:'true'}],guards:[]};
    return {keys,paint:treeFocusPaint([e],keys.at(-1)!,groups.focusNodes),negativePaint:treeFocusPaint([{...e,conditions:[{key:'group-'+suffix,result:'false'}]}],keys.at(-1)!,groups.focusNodes),unknownPaint:treeFocusPaint([{...e,conditions:[{key:'group-'+suffix,result:'unknown'}]}],keys.at(-1)!,groups.focusNodes)};
  });
  const reviewExpanded = new Set([...expanded, ...pinnedRows.flatMap(r => r.opened)]);
  const reviewRendered = renderFlowPane(model.crlStructure, {...opts, expandedGuardWhens: reviewExpanded});
  const reviewCases = model.scenarios.scenarios.map(sc => ({caseId:model.duplicateScenarioNames.has(caseViewKey(sc.case))?undefined:model.caseIdByName[caseViewKey(sc.case)],status:sc.status,state:'pass' as const,
    nodeKeys:executionRoutes(sc,model.crlStructure).flatMap(r=>r.nodeKeys)}));
  const reviewInput = {nodes:reviewRendered.focusNodes,occurrences:reviewRendered.criterionOccurrences,
    membership:criterionReviewMembership(model.guardOutlines),live:criterionGateIdentities(model.guardOutlines,model.criterionIdentities),stored:{},cases:reviewCases,current:true};
  const reviewStep = (label:string,input:any) => {
    const p=projectCriterionReview(input),ids=(keys:Set<string>)=>[...keys].flatMap(k=>reviewRendered.anchors[k]?.segmentIds??[]);
    return {label,pass:ids(p.pass),states:p.states,allGids:reviewRendered.criterionOccurrences.map(o=>o.gid),
      byState:Object.fromEntries(['pass','fail','pending','stale'].map(s=>[s,Object.entries(p.states).filter(([,v])=>v===s).map(([gid])=>gid)]))};
  };
  const explicitStored=Object.fromEntries([...model.criterionIdentities].map(([k,v])=>[k,{state:'pass',bodyHash:v.bodyHash}]));
  const reviewSteps=[reviewStep('all approved paths',reviewInput),reviewStep('all To do',{...reviewInput,cases:reviewCases.map(c=>({...c,state:'unreviewed'}))}),
    reviewStep('explicit criterion Pass without cases',{...reviewInput,stored:explicitStored,cases:[]}),
    reviewStep('definitions checking',{...reviewInput,current:false}),reviewStep('passing verdict on errored case',{...reviewInput,cases:reviewCases.map(c=>({...c,status:'error'}))})];
  const reviewFixture={html:reviewRendered.html,nodes:reviewRendered.focusNodes,steps:reviewSteps,
    inputs:Object.entries(reviewRendered.focusNodes).filter(([k,n])=>n.outline&&!n.choice&&!n.logic&&k.includes('inputs')).map(([k])=>k)};
  return {reviewFixture,html: rendered.html+nested.html, manualHtml, collapsedHtml:renderFlowPane(model.crlStructure,opts).html, auto, style: FLOW_STYLE, nodes: {...rendered.focusNodes,...nested.focusNodes}, choices, prefixes, pinnedRows, terminalOrder:terminals,
    groupFixture:{html:groups.html,nodes:groups.focusNodes,routes:groupRoutes}};
}
