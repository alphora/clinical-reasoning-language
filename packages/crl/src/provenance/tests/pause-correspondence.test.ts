import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import * as path from "node:path";
import {generateProvenanceFiles} from "../generateFiles";
import {validateProvenanceFiles} from "../validateFiles";
import {buildCockpitModel} from "../cockpitModel";
import {checkCockpitCorrespondence} from "../correspondenceCheck";
import {resolveCelImports} from "../../cel/imports";
import {executionRuntimePaths} from "../runPath";
import type {ScenarioViewModel, ViewNode} from "../../cre/viewModel";
const POLICY = "library \"P\".\nconcept \"A\":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `a`.\n- shape reduction is most recent.\nconcept \"B\":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `b`.\n- shape reduction is most recent.\nactivity \"Met\": - request CPGCommunicationRequest. - with `MET`.\nactivity \"Unmet\": - request CPGCommunicationRequest. - with `UNMET`.\ndecision \"D\": first:\n- when \"A\" then use decision \"Sub\".\n- otherwise then recommend activity \"Unmet\".\ndecision \"Sub\": first:\n- when \"B\" then recommend activity \"Met\".\n- otherwise then recommend activity \"Unmet\".\n";
const CASES = "library \"Cases\". covers \"P\".\nfact \"Patient\": - name is \"Synthetic\". - birth date is \"1970-01-01\". - defined by \"Patient\".\nfact \"A yes\": - value is true. - date is \"2026-09-16\". - defined by \"P\".\"A\".\nfact \"B yes\": - value is true. - date is \"2026-09-16\". - defined by \"P\".\"B\".\ncase \"Root pause\": - id is \"root-pause\". - subject is \"Patient\". - result is \"D\" is pause.\ncase \"Sub pause\": - id is \"sub-pause\". - subject is \"Patient\". - fact is \"A yes\". - result is \"D\" is pause.\ncase \"Complete\": - id is \"complete\". - subject is \"Patient\". - fact is \"A yes\". - fact is \"B yes\". - result is \"D\" is \"Met\".\n";

const dirs: string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function fixture(policy=POLICY, cases=CASES, libraries: Record<string,string>={}) {
  const root=mkdtempSync(path.join(tmpdir(),"prov-pauses-"));dirs.push(root);
  for(const dir of ["src/crl","src/cel/mv","src/provenance"])mkdirSync(path.join(root,dir),{recursive:true});
  writeFileSync(path.join(root,"package.json"),JSON.stringify({name:"pause",version:"1.0.0",crl:{canonicalBase:"https://example.org/pause"}}));
  writeFileSync(path.join(root,"src/crl/p.crl"),policy);
  for(const [name,source] of Object.entries(libraries))writeFileSync(path.join(root,"src/crl",name+".crl"),source);
  const cel=path.join(root,"src/cel/mv/cases.cel"),anchor=path.join(root,"anchor.txt"),artifactPath=path.join(root,"src/provenance/p.json");
  writeFileSync(cel,cases);writeFileSync(anchor,"Synthetic A and B requirements.");
  const graph=resolveCelImports(cel);
  if(graph.diagnostics.some(d=>d.severity==="error"))throw Error(JSON.stringify(graph.diagnostics));
  const result=generateProvenanceFiles(cel,anchor,{clusterBy:"disposition-path",artifactCarrierPath:artifactPath});
  writeFileSync(artifactPath,JSON.stringify(result.artifact));
  return {...result,cel,anchor,artifactPath,model:()=>buildCockpitModel(artifactPath,cel,anchor,"final")};
}
const run = (model: ReturnType<ReturnType<typeof fixture>["model"]>, name:string) => {
  const scenario=model.scenarios.scenarios.find(s=>s.case.name===name)!;
  expect(scenario).toBeDefined();
  if(scenario.status==="error")throw Error(JSON.stringify({diagnostics:scenario.diagnostics,tree:scenario.tree}));
  return executionRuntimePaths(scenario,{lib:"P",decision:"D"});
};
// @kit: provenance-pause-paths -- actual CRE evidence, not an expected-pause waiver.
test("root and shared-decision pauses round trip through FINAL correspondence with exact partial refs",()=>{
  const f=fixture(), model=f.model();
  expect(model.scenarios.scenarios.map(s=>s.status)).toEqual(["pass","pass","pass"]);
  expect(f.diagnostics.filter(d=>d.kind==="deferred-disposition-path")).toEqual([]);
  expect(validateProvenanceFiles(f.artifactPath,f.cel,f.anchor,"final").findings.filter(f=>f.kind==="cockpit-correspondence")).toEqual([]);
  const root=run(model,"Root pause"),sub=run(model,"Sub pause");
  expect(root).toMatchObject({kind:"comparable",producedCount:0,pausedCount:1,paths:[{endpoint:"pause",gaps:[],refs:[{lib:"P",decision:"D",nodeId:"when[0]"}]}]});
  expect(sub).toMatchObject({kind:"comparable",producedCount:0,pausedCount:1});
  if(sub.kind!=="comparable")return;
  expect(sub.paths[0].refs).toEqual([{lib:"P",decision:"D",nodeId:"when[0]"},{lib:"P",decision:"D",nodeId:"when[0]/action[0]"},{lib:"P",decision:"Sub",nodeId:"when[0]"}]);
  const clusters=f.artifact.clusters.filter(c=>c.cel.length);
  expect(clusters).toHaveLength(3);
  expect(clusters.filter(c=>c.label?.includes("Awaiting input"))).toHaveLength(2);
  expect(new Set(clusters.map(c=>c.id)).size).toBe(3);
  const repeat=generateProvenanceFiles(f.cel,f.anchor,{clusterBy:"disposition-path",artifactCarrierPath:f.artifactPath});
  expect(repeat.artifact.clusters).toEqual(f.artifact.clusters);
});
test("a false expected activity does not turn a real pause into a produced action",()=>{
  const f=fixture(POLICY,CASES.replace('"D" is pause','"D" is "Met"'));
  expect(f.model().scenarios.scenarios[0].status).toBe("fail");
  expect(run(f.model(),"Root pause")).toMatchObject({kind:"comparable",producedCount:0,pausedCount:1});
  expect(checkCockpitCorrespondence(f.model())).toEqual([]);
});
const prelude=POLICY.slice(0,POLICY.indexOf('decision "D"'));
const facts=CASES.slice(0,CASES.indexOf('case "Root pause"'));
test("all retains multiple pause frontiers and mixed production plus pause without a completed label",()=>{
  const f=fixture(prelude+'decision "D": all: - when "A" then recommend activity "Met". - when "B" then recommend activity "Unmet".',
    facts+'case "None": - id is "none". - subject is "Patient". - result is "D" is pause.\n'+
    'case "Partial": - id is "partial". - subject is "Patient". - fact is "A yes". - result is "D" is "Met".\n'+
    'case "Complete": - id is "complete". - subject is "Patient". - fact is "A yes". - fact is "B yes". - result is "D" is "Met".');
  expect(run(f.model(),"None")).toMatchObject({kind:"comparable",producedCount:0,pausedCount:2});
  expect(run(f.model(),"Partial")).toMatchObject({kind:"comparable",producedCount:1,pausedCount:1});
  expect(run(f.model(),"Complete")).toMatchObject({kind:"comparable",producedCount:2,pausedCount:0});
  const partial=f.artifact.clusters.find(c=>c.cel.some(r=>r.caseId==="partial"))!;
  expect(partial.label).toContain("Met");expect(partial.label).toContain("Awaiting input");
  expect(checkCockpitCorrespondence(f.model())).toEqual([]);
});
test("an unresolved sibling cannot hide behind a valid pause or a produced action",()=>{
  const f=fixture(prelude+'decision "D": all: - when "A" then use decision "Missing". - when "B" then recommend activity "Met".',
    facts+'case "Broken": - id is "broken". - subject is "Patient". - fact is "A yes". - result is "D" is pause.');
  expect(checkCockpitCorrespondence(f.model())).toContainEqual(expect.objectContaining({kind:"unchecked",reason:"unresolved-decision"}));
  expect(f.diagnostics).toContainEqual(expect.objectContaining({kind:"deferred-disposition-path",reason:"unresolved-decision"}));
});
test("pause paths still reject extra lighting, missing lighting and missing structure rows",()=>{
  const f=fixture();
  const root=f.artifact.clusters.find(c=>c.cel.some(r=>r.caseId==="root-pause"))!;
  root.crl.push({lib:"P",kind:"decision",name:"D",nodeId:"otherwise",nodeKind:"decision-node",relation:"implements-criterion"});
  writeFileSync(f.artifactPath,JSON.stringify(f.artifact));
  expect(checkCockpitCorrespondence(f.model())).toContainEqual(expect.objectContaining({kind:"mismatch",caseName:"Root pause",bleed:expect.arrayContaining([expect.objectContaining({nodeId:"otherwise"})])}));
  root.crl=[];writeFileSync(f.artifactPath,JSON.stringify(f.artifact));
  expect(checkCockpitCorrespondence(f.model())).toContainEqual(expect.objectContaining({kind:"mismatch",caseName:"Root pause",miss:expect.arrayContaining([expect.objectContaining({nodeId:"when[0]"})])}));
  const model=f.model();model.scenarios.scenarios[0].tree[0].nodeId="when[99]";
  expect(checkCockpitCorrespondence(model)).toContainEqual(expect.objectContaining({kind:"unchecked",reason:"unmapped-runtime-node"}));
});
test("empty no-action execution is not a pause; failures and unreached unknowns stay distinct",()=>{
  const node=(extra: Partial<ViewNode>)=>({kind:"when",nodeId:"when[0]",evaluated:true,children:[],...extra} as ViewNode);
  const evaluate=(tree:ViewNode[],extra:Partial<ScenarioViewModel>={})=>executionRuntimePaths({tree,status:"pass",...extra} as ScenarioViewModel,{lib:"P",decision:"D"});
  expect(evaluate([node({satisfied:false})])).toMatchObject({kind:"unchecked",reason:"no-produced-action"});
  expect(evaluate([node({unknown:true,evaluated:false})])).toMatchObject({kind:"unchecked",reason:"no-produced-action"});
  for(const extra of [{status:"error" as const},{discardedUnknown:true as const}])expect(evaluate([node({unknown:true})],extra)).toMatchObject({kind:"unchecked",reason:"run-error"});
  expect(evaluate([node({unknown:true,invalidated:true})])).toMatchObject({kind:"unchecked",reason:"run-error"});
  const delegated=node({kind:"action",nodeId:"action[0]",action:{actionKind:"use-decision",produced:false,expanded:false} as ViewNode["action"]});
  expect(evaluate([node({unknown:true}),delegated])).toMatchObject({kind:"unchecked",reason:"unresolved-decision"});
  delegated.guardedOut=true;
  expect(evaluate([node({unknown:true}),delegated])).toMatchObject({kind:"comparable",pausedCount:1});
});


test("unsupported selected-publication cross-library delegation stays an error, never an admitted pause",()=>{
  const policy=POLICY.slice(0,POLICY.lastIndexOf('decision "Sub"')).replace('use decision "Sub"','use decision "Shared"."Sub"');
  const shared=prelude.replace('library "P"','library "Shared"')+POLICY.slice(POLICY.lastIndexOf('decision "Sub"'));
  const cases=CASES.slice(0,CASES.indexOf('case "Complete"'));
  const f=fixture(policy,cases,{shared});
  expect(f.model().scenarios.scenarios).toHaveLength(2);
  for(const scenario of f.model().scenarios.scenarios) {
    expect(scenario.status).toBe("error");
    expect(scenario.diagnostics.join(" ")).toContain("publication-unsupported-scope");
  }
  expect(checkCockpitCorrespondence(f.model())).toHaveLength(2);
  expect(checkCockpitCorrespondence(f.model()).every(r=>r.kind==="unchecked" && r.reason==="run-error")).toBe(true);
  expect(f.artifact.clusters.filter(c=>c.cel.length)).toEqual([]);
});
test("unknown operands in a settled compound guard are not pause endpoints",()=>{
  const policy=prelude+'decision "D": first: - when ( "A" or "B" ) then recommend activity "Met". - otherwise then recommend activity "Unmet".';
  const f=fixture(policy,facts+'case "Settled": - id is "settled". - subject is "Patient". - fact is "A yes". - result is "D" is "Met".');
  expect(run(f.model(),"Settled")).toMatchObject({kind:"comparable",producedCount:1,pausedCount:0});
  expect(checkCockpitCorrespondence(f.model())).toEqual([]);
});
test("pause cases still require frozen unique identities",()=>{
  const unfrozen=fixture(POLICY,CASES.replace('- id is "root-pause".',''));
  expect(checkCockpitCorrespondence(unfrozen.model())).toContainEqual(expect.objectContaining({kind:"unchecked",reason:"unfrozen-case"}));
  const collision=fixture(POLICY,CASES.replace('case "Sub pause"','case "Root pause"'));
  expect(checkCockpitCorrespondence(collision.model())).toContainEqual(expect.objectContaining({kind:"unchecked",reason:"case-name-collision"}));
});
