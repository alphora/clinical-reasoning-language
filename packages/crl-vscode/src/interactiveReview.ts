import { decisionSpine,buildCRL,createPresentationCatalog,
  type DefinitionOrigin, type CrlDecisionStructure, type CrlStructureNode, type ScenarioViewModel } from '@smile-digital-health/crl';
import { executionRoutes, type ExecutionRoute } from './executionRoutes';
import { enumerateInteractiveNative, type Fhir } from './interactiveQuestionnaire';
import type {WordingTarget} from './presentationProposal';

export type QuestionOwner = { library: string; concept: string };
export type NativeReviewRoute = { keys?: string[]; reason?: string };
export function questionReviewPresentation(questionnaire:Fhir|undefined,origins:DefinitionOrigin[],disabledReason?:string){
  const owners=questionReviewOwners(questionnaire,origins),questions:{linkId:string;reason?:string}[]=[];
  const walk=(items:Fhir[])=>{for(const q of items??[]){if(!['group','display'].includes(q.type)){
    const url=typeof q.definition==='string'?q.definition.split('#')[0].split('|')[0]:undefined;
    const mismatch=url&&origins.some(o=>o.kind==='CaseFeature'&&o.canonical===url);
    const reason=disabledReason??(!owners.has(q.linkId)?mismatch?'This question profile version or occurrence does not match one current source owner.':'This question has no unique source-node identity.':undefined);
    questions.push({linkId:q.linkId,...reason?{reason}:{}});
  }walk(q.item);}};walk(questionnaire?.item);return questions;
}
/** A grouped input can retain the ordinary CPG prefix or use the capable engine's member text. */
export function interactiveQuestionWordingMatches(text:unknown,target:WordingTarget):boolean{
  if(typeof text!=='string')return false;
  if(target.owners.questionText&&text===target.questionText)return true;
  const ast=buildCRL(target.baseline).result;if(!ast||ast.library.name!==target.library)return false;
  const catalog=createPresentationCatalog(ast);
  // A missing default does not imply missing scoped wording. Never create a default for a clicked scoped question.
  if(!target.owners.questionText)return !catalog.hasDeclaration(target.concept);
  const group=catalog.groupFor(target.concept);
  return !!group&&text===`${group.questionText}: ${target.questionText}`;
}
const identity = (lib: string, name: string) => JSON.stringify([lib, name]);
const refName = (r: any) => typeof r === 'string' ? r : r.name;
const refLib = (r: any, owner: string) => typeof r === 'string' ? owner : r.libraryName;

export function questionReviewOwners(questionnaire: Fhir | undefined, origins: DefinitionOrigin[]) {
  const result = new Map<string, QuestionOwner>();
  const duplicates = new Set<string>(), seen = new Set<string>();
  const walk = (items: Fhir[], repeated=false) => { for (const item of items ?? []) {
    if (typeof item.linkId === 'string') {
      if (seen.has(item.linkId)) duplicates.add(item.linkId);seen.add(item.linkId);
      const definition = typeof item.definition === 'string' ? item.definition.split('#')[0] : '';
      const [url, version] = definition.split('|');
      const matches = origins.filter(o => o.kind === 'CaseFeature' && o.canonical === url && (!version || o.version === version));
      if (matches.length === 1 && item.type !== 'group' && item.type !== 'display' && !item.repeats && !repeated)
        result.set(item.linkId, { library: matches[0].library, concept: matches[0].name });
    }
    walk(item.item,repeated||!!item.repeats);
  } };
  walk(questionnaire?.item ?? []);
  for (const key of duplicates) result.delete(key);
  // LForms appends numeric instance paths to DOM ids; hierarchical linkIds can collide with those paths.
  for(const key of result.keys())if(key.includes('/')||[...seen].some(other=>other.startsWith(key+'/')))result.delete(key);
  return result;
}

/** Reconstruct source paths from this call's recorded condition carriers, never patient-data guesses. */
export function nativeReviewRoutes(native: Fhir | undefined, planId: string, origins: DefinitionOrigin[], structure: CrlDecisionStructure[]): NativeReviewRoute[] {
  if (!native) return [];
  const {resources,outcomes:orderedOutcomes}=enumerateInteractiveNative(native);
  const isGroup = (r: Fhir) => ['RequestGroup', 'RequestOrchestration'].includes(r.resourceType??'');
  const groups = resources.filter(isGroup);
  const resolve = (ref: string) => {
    const id = ref.replace(/^#/, '').split('/').pop();
    const matches = resources.filter(r => r.id === id && (ref.startsWith('#') || ref.split('/').slice(-2)[0] === r.resourceType));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const originFor = (ref: string, kind?: string) => {
    const [url, version] = ref.split('|');
    const hits = origins.filter(o => o.canonical === url && (!version || o.version === version) && (!kind || o.kind === kind));
    return hits.length === 1 ? hits[0] : undefined;
  };
  const originOfGroup = (g: Fhir) => {
    const refs = Array.isArray(g.instantiatesCanonical) ? g.instantiatesCanonical : [g.instantiatesCanonical];
    const hits = refs.filter((x: unknown): x is string => typeof x === 'string').map((r: string) => originFor(r)).filter(Boolean);
    return hits.length === 1 ? hits[0] : undefined;
  };
  const root = groups.filter(g => g.id === planId && originOfGroup(g)?.kind === 'Decision');
  const outcomes: { ref: string; paths: { conditions: { origin: DefinitionOrigin; condition: Fhir }[]; root: DefinitionOrigin; recommendation?: DefinitionOrigin }[] }[] = orderedOutcomes.map(({ref})=>({ref,paths:[]}));
  if (root.length !== 1) return outcomes.map(() => ({ reason: 'The native result has no unambiguous root route.' }));
  const trace = (group: Fhir, conditions: { origin: DefinitionOrigin; condition: Fhir }[], stack: Set<Fhir>) => {
    if (stack.has(group) || stack.size > 100) return;
    const origin = originOfGroup(group); if (!origin) return;
    const walk = (items: Fhir[], inherited: typeof conditions) => { for (const a of items ?? []) {
      const current = [...inherited, ...(a.condition ?? []).map((condition: Fhir) => ({ origin, condition }))];
      if (a.resource?.reference) {
        const target = resolve(a.resource.reference);
        if (target && isGroup(target)) trace(target, current, new Set([...stack, group]));
        else for (const out of outcomes.filter(o => o.ref === a.resource.reference)) out.paths.push({ conditions: current, root: originOfGroup(root[0])!,recommendation:origin.kind==='Recommendation'?origin:undefined });
      }
      walk(a.action, current);
    } };
    walk(group.action, conditions);
  };
  trace(root[0], [], new Set());
  const declarations = new Map(structure.map(d => [identity(d.lib, d.decision), d]));
  const sourceDecisions = new Map(origins.filter(o => o.kind === 'Decision' && o.decision).map(o => [identity(o.library, o.name), o]));
  return outcomes.map(out => {
    const terminal = resolve(out.ref), activityRef = terminal?.instantiatesCanonical;
    if(!terminal||isGroup(terminal))return {reason:'The native determination resource is missing or ambiguous.'};
    const refs=(Array.isArray(activityRef)?activityRef:[activityRef]).filter((r:unknown):r is string=>typeof r==='string');
    const activities=refs.map((r:string)=>originFor(r,'Activity')).filter((o:DefinitionOrigin|undefined):o is DefinitionOrigin=>!!o);
    const recommendation=out.paths.length===1?out.paths[0].recommendation:undefined;
    const fallback=recommendation?origins.filter(o=>o.kind==='Activity'&&o.library===recommendation.library&&o.name===recommendation.name):[];
    const activity=activities.length===1?activities[0]:refs.length===0&&fallback.length===1?fallback[0]:undefined;
    if (!activity || out.paths.length !== 1) return { reason: 'The native determination cannot be joined to one source route.' };
    const path = out.paths[0], evidence = new Map<string, boolean>(), actionEvidence = new Map<string, boolean>();
    let unsupported = false;
    const conditionId = (lib: string, decision: string, c: any) => JSON.stringify([lib, decision, c.type, c.location.start.line, c.location.start.column]);
    for (const observed of path.conditions) {
      const { origin, condition } = observed;
      if (condition.kind !== 'applicability') continue;
      const entry = origin.conditions?.filter(g => g.name === condition.expression?.expression);
      const results = condition.extension?.filter((e: Fhir) => e.url === 'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-action-condition-result');
      if (!entry || entry.length !== 1 || results?.length !== 1 || results[0].valueBoolean !== true || !entry[0].planCondition) { unsupported = true; continue; }
      const g = entry[0], id = conditionId(origin.library, origin.name, g.condition);
      const key = JSON.stringify([origin.library, origin.name, g.name]);
      if (actionEvidence.has(key) && actionEvidence.get(key) !== results[0].valueBoolean) unsupported = true;
      actionEvidence.set(key, results[0].valueBoolean);
      if (g.planCondition!.carrier === 'branch') {
        const value = g.planCondition!.negated ? !results[0].valueBoolean : results[0].valueBoolean;
        if (evidence.has(id) && evidence.get(id) !== value) unsupported = true;
        evidence.set(id, value);
      }
    }
    if (unsupported) return { reason: 'Native route condition evidence is incomplete or ambiguous.' };
    const truth = (lib: string, dec: string, condition: any): boolean | undefined => {
      const exact = evidence.get(conditionId(lib, dec, condition)); if (exact !== undefined) return exact;
      if (condition.type === 'BranchConditionNot') { const v = truth(lib, dec, condition.operand); return v === undefined ? undefined : !v; }
      if (['BranchConditionAnd', 'BranchConditionOr'].includes(condition.type)) {
        const values = condition.operands.map((c: any) => truth(lib, dec, c));
        const all = condition.type === 'BranchConditionAnd';
        return values.includes(!all) ? !all : values.includes(undefined) ? undefined : all;
      }
      return undefined;
    };
    let incomplete = false, steps = 0;const reachCache=new Map<string,boolean>();
    const couldReach = (lib: string, name: string, stack = new Set<string>()): boolean => {
      const id = identity(lib, name), source = sourceDecisions.get(id);
      if(++steps>10000){incomplete=true;return true;}
      if(reachCache.has(id))return reachCache.get(id)!;
      if (!source?.decision || stack.has(id)) return true;
      const reaches=decisionSpine(source.decision).some(n => {
        if (n.node.type !== 'ActionStatement') return false;
        const a = n.node.action, ref = a.type === 'UseDecision' ? a.decisionName : a.activityName;
        return a.type === 'UseDecision' ? couldReach(refLib(ref,lib),refName(ref),new Set([...stack,id])) : refLib(ref,lib) === activity.library && refName(ref) === activity.name;
      });
      reachCache.set(id,reaches);return reaches;
    };
    const enter = (lib: string, name: string, prefix: string, stack: Set<string>): any[] => {
      const id = identity(lib, name), decl = declarations.get(id), source = sourceDecisions.get(id);
      if (!decl || !source?.decision || stack.has(id) || stack.size > 100) { incomplete = true; return []; }
      const ast = new Map(decisionSpine(source.decision).map(n => [n.nodeId, n.node]));
      const relevant=(nodes:CrlStructureNode[]):boolean=>nodes.some(node=>{
        if(++steps>10000){incomplete=true;return true;}
        if(node.kind!=='action')return relevant(node.children);
        const raw:any=ast.get(node.nodeId);if(!raw)return true;
        const a=raw.action,ref=a.type==='UseDecision'?a.decisionName:a.activityName;
        return node.actionKind==='use-decision'?couldReach(refLib(ref,lib),refName(ref)):refLib(ref,lib)===activity.library&&refName(ref)===activity.name;
      });
      const walk = (nodes: CrlStructureNode[], qualifier: string | undefined): any[] => {
        const result: any[] = [];
        for (const node of nodes) {
          if (++steps > 10000) { incomplete = true; return result; }
          const raw: any = ast.get(node.nodeId); if (!raw) { incomplete = true; return result; }
          const vm: any = {nodeId:prefix ? prefix+'/'+node.nodeId : node.nodeId,kind:node.kind,label:node.label,evaluated:true,children:[]};
          if (node.kind === 'when') {
            const value = truth(lib, name, raw.condition);
            if (value === undefined) {
              // A missing native carrier is not proof that a competing route was false.
              if (qualifier === 'first' || relevant(node.children)) incomplete=true;
              if (qualifier === 'first') return result;
              continue;
            }
            vm.condition={satisfied:value};
            if (value) vm.children=walk(node.children,node.childrenQualifier);
            result.push(vm); if (value && qualifier === 'first') return result;
          } else if (node.kind === 'otherwise') { vm.children=walk(node.children,node.childrenQualifier);result.push(vm); }
          else {
            const a=raw.action,ref=a.type==='UseDecision'?a.decisionName:a.activityName;
            const targetLib=refLib(ref,lib),targetName=refName(ref);
            const targetRelevant=node.actionKind==='use-decision'?couldReach(targetLib,targetName):targetLib===activity.library&&targetName===activity.name;
            if(raw.guard){
              const pos=raw.guard.location.start;
              const carrier=source.conditions?.find(g=>g.planCondition?.carrier==='action'&&g.planCondition.negated===(raw.guard.polarity==='unless')&&g.condition.location.start.line===pos.line&&g.condition.location.start.column===pos.column);
              const value=carrier&&actionEvidence.get(JSON.stringify([lib,name,carrier.name]));
              if(value!==true){if(value===undefined&&targetRelevant)incomplete=true;continue;}
            }
            vm.action={actionKind:node.actionKind,target:{name:targetName,libraryName:targetLib},produced:node.actionKind!=='use-decision'&&targetRelevant};
            if(node.actionKind==='use-decision'){vm.action.expanded=true;vm.children=enter(targetLib,targetName,vm.nodeId,new Set([...stack,id]));}
            result.push(vm);if(qualifier==='first')return result;
          }
        }
        return result;
      };
      return walk(decl.children,decl.childrenQualifier);
    };
    const tree=enter(path.root.library,path.root.name,'',new Set());
    const candidates=executionRoutes({tree,decision:{libraryName:path.root.library,name:path.root.name}} as ScenarioViewModel,structure)
      .filter(r=>r.terminalKind==='produced'&&!r.gaps.length);
    const unique=[...new Map(candidates.map(r=>[JSON.stringify(r.nodeKeys),r.nodeKeys])).values()];
    return !incomplete && unique.length===1?{keys:unique[0]}:{reason:steps>10000?'The route proof exceeded its inspection limit.':incomplete?'The recorded conditions do not identify one complete source route.':unique.length>1?'The native evidence matches multiple source routes.':'The native evidence does not identify a source route.'};
  });
}

export function reviewCasesForRoute(keys: string[] | undefined, entries: { caseId: string; route: ExecutionRoute }[]) {
  const matching = keys ? entries.filter(e => e.route.terminalKind === 'produced' && JSON.stringify(e.route.nodeKeys) === JSON.stringify(keys)) : [];
  const caseIds = [...new Set(matching.map(e => e.caseId))];
  const collateral = entries.some(e => caseIds.includes(e.caseId) && JSON.stringify(e.route.nodeKeys) !== JSON.stringify(keys));
  return { caseIds: collateral ? [] : caseIds, reason: collateral ? 'A matching case also reviews another route. A route-only verdict cannot safely update that case.' : !caseIds.length ? 'No saved MV case covers this route.' : undefined };
}
