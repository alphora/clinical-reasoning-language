import { displayDetermination, type ConditionAnswerCheck, type CrlConceptNode, type CrlDecisionStructure, type CrlStructureNode, type GuardOutline } from '@smile-digital-health/crl';
import { projectFlowStructure, type ProjectedFlowNode } from './flowProjection';
import { conditionAnswerExpression, type ConditionAnswerExpr } from './conditionAnswerExpr';

// REFACTOR:grounded: a contribution previews a branch, never claims an individual answer determines its whole criterion.
export interface AnswerContribution {
  ownerKey:string; checkId:string; checkLabel:string; subjectKey:string; negated:boolean;
  system:string; code:string; matches:boolean; branch:'left'|'right';
  criteria:{lib:string;name:string}[];
  label:string; kind:'terminal'|'continue'|'unavailable'; explanation:string;
}
export function buildAnswerContributions(structure:CrlDecisionStructure[], concepts:readonly CrlConceptNode[], outlines?:ReadonlyMap<string,GuardOutline>, projected=false):Map<string,AnswerContribution[]> {
  const result=new Map<string,AnswerContribution[]>(),byKey=new Map(concepts.map(c=>[c.nodeKey,c]));
  const next=(n:ProjectedFlowNode,matched:boolean):Pick<AnswerContribution,'label'|'kind'|'explanation'>=>{
    const flatten=(c:ProjectedFlowNode):ProjectedFlowNode[]=>c.kind==='otherwise'?c.children.flatMap(flatten):[c];
    const nodes=(n.children as ProjectedFlowNode[]).filter(c=>c.incomingOutcome===(matched?'Yes':'No')).flatMap(flatten);
    if(!nodes.length)return {label:'No next step',kind:'unavailable',explanation:'No next step is defined for this branch.'};
    if(nodes.length!==1)return {label:'Multiple next steps',kind:'continue',explanation:'This branch has several next steps.'};
    const node=nodes[0];
    return node.kind==='action' && node.actionKind==='recommend-activity' && node.refKeys.length<2
      ?{label:displayDetermination(node.label),kind:'terminal',explanation:'The next node on this branch is this terminal.'}
      :{label:'Continue',kind:'continue',explanation:'Another node follows on this branch.'};
  };
  const visit=(n:CrlStructureNode):void=>{
    if(n.kind==='when'){
      const expr=conditionAnswerExpression(n,byKey,outlines),rows:AnswerContribution[]=[];
      const walk=(e:ConditionAnswerExpr,negated=false,criteria:AnswerContribution['criteria']=[]):void=>{
        if(e.kind==='not'){walk(e.operand,!negated,criteria);return;}
        if(e.kind==='group'){walk(e.operand,negated,[...criteria,{lib:e.lib,name:e.label}]);return;}
        if(e.kind==='and'||e.kind==='or'){e.children.forEach(c=>walk(c,negated,criteria));return;}
        if(e.kind!=='check'||!['simple','aggregate'].includes(e.check.status))return;
        for(const subject of e.check.subjects)for(const [matches,members] of [[true,subject.matches],[false,subject.nonmatches]] as const){
          const positive=matches!==negated,preview=next(n as ProjectedFlowNode,positive);
          for(const member of members)rows.push({ownerKey:n.nodeKey,checkId:e.check.id,checkLabel:(negated?'Not ':'')+e.check.label,subjectKey:subject.key,negated,criteria,
            system:member.system,code:member.code,matches,branch:positive?'left':'right',...preview,
            explanation:`${matches?'Matches':'Does not match'} ${e.check.label}. Contributes toward the ${positive?'left (green)':'right (red)'} branch. ${preview.explanation} Other checks may also apply.`});
        }
      };
      if(expr)walk(expr);
      result.set(n.nodeKey,[...new Map(rows.map(r=>[JSON.stringify([r.checkId,r.negated,r.subjectKey,r.criteria,r.system,r.code]),r])).values()]);
    }
    n.children.forEach(visit);
  };
  (projected?structure:projectFlowStructure(structure)).forEach(d=>d.children.forEach(visit));return result;
}
/** A wording variant only receives contributions from its paired owner/criterion uses. */
export function contributionsForOccurrences(index:ReadonlyMap<string,AnswerContribution[]>,occurrences:readonly {ownerKey:string;criterionPaths:{lib:string;name:string}[][]}[],subjectKey:string):AnswerContribution[] {
  return occurrences.flatMap(o=>(index.get(o.ownerKey)??[]).filter(r=>r.subjectKey===subjectKey && o.criterionPaths.some(p=>p.length===r.criteria.length&&p.every((c,i)=>c.lib===r.criteria[i].lib&&c.name===r.criteria[i].name))));
}
/** Group display choices by the prepared classifier's result; never derive a complement from text or display labels. */
export function partitionAnswerChoices<T extends {system?:string;code:string}>(choices:readonly T[],check:ConditionAnswerCheck|undefined,subjectKey:string,negated=false):{branch:'left'|'right';choices:T[]}[]|undefined {
  const subject=check?.subjects.find(s=>s.key===subjectKey);
  if(!subject || !['simple','aggregate'].includes(check!.status))return;
  if(choices.length!==subject.matches.length+subject.nonmatches.length || new Set(choices.map(c=>JSON.stringify([c.system,c.code]))).size!==choices.length)return;
  const groups:{branch:'left'|'right';choices:T[]}[]=[{branch:'left',choices:[]},{branch:'right',choices:[]}];
  for(const choice of choices){
    const matches=subject.matches.some(v=>v.system===choice.system&&v.code===choice.code);
    const nonmatch=subject.nonmatches.some(v=>v.system===choice.system&&v.code===choice.code);
    if(matches===nonmatch)return;
    groups[(matches!==negated)?0:1].choices.push(choice);
  }
  return groups.filter(g=>g.choices.length>0);
}
