import {readFileSync} from 'node:fs';
import {relative,isAbsolute,join,sep} from 'node:path';
import type {CrlDecisionStructure,CrlStructureNode} from '@smile-digital-health/crl';
import {planPathMove,planStructureEdit} from '@smile-digital-health/crl/language-services';
import type {FocusNode,TreeTraversal} from './unpinnedTreeFocus';

export interface MoveAddress {lib:string;decision:string;nodeId:string;path?:string}
export interface PinnedMovePlan {file:string;before:string;after:string;focus:MoveAddress;anchor:MoveAddress;oldAnchorKey:string}
export function pinnedMovePlans(root:string,sources:ReadonlyMap<string,string>,structure:CrlDecisionStructure[],nodes:Record<string,FocusNode>,traversal:TreeTraversal,pathKeys:string[],key:string) {
  const answer:{up?:PinnedMovePlan;down?:PinnedMovePlan}={},focus=nodes[key];
  if(!focus||!pathKeys.includes(key)||focus.choice||focus.logic||focus.terminal)return answer;
  const rows=new Map<string,{row:CrlStructureNode;decision:CrlDecisionStructure}>();
  const walk=(decision:CrlDecisionStructure,list:CrlStructureNode[])=>{for(const row of list){rows.set(row.nodeKey,{row,decision});walk(decision,row.children);}};
  for(const d of structure)walk(d,d.children);
  const owner=rows.get(focus.outline?focus.owner:key);if(!owner||owner.row.kind!=='when')return answer;
  const file=owner.decision.location.filePath,rel=relative(join(root,'src/crl'),file);
  if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))return answer;
  const before=readFileSync(file,'utf8');if(sources.get(file)!==before)throw Error('CRL changed since this tree was built. Refresh the tree and refocus the item.');
  const route=traversal.route.nodeKeys.map(k=>rows.get(k)).filter((r):r is NonNullable<typeof r>=>!!r);
  const same=(r:NonNullable<typeof owner>)=>r.decision.lib===owner.decision.lib&&r.decision.decision===owner.decision.decision;
  const anchor=route.filter(same).at(-1);if(!anchor||anchor.row.kind!=='action')return answer;
  const address=(nodeId:string,path?:string):MoveAddress=>({lib:owner.decision.lib,decision:owner.decision.decision,nodeId,...(path!==undefined?{path}:{})});
  if(focus.outline){
    let path=focus.path??'',suffix='';
    // .b crosses a named criterion; .c and .inputs describe computed data,
    // which is not an independent authored decision operand. A transparent
    // single-question predicate moves together with its displayed question.
    const boundary=path.search(/\.(?:c|inputs)(?:\.|$)/);
    if(boundary>=0){
      const prefix=path.slice(0,boundary),members=Object.values(nodes).filter(n=>n.owner===focus.owner);
      const predicates=members.filter(n=>n.path===prefix&&n.singleInputPredicate);
      const questions=members.filter(n=>n.question&&n.path?.startsWith(prefix+'.'));
      if(path.slice(boundary)!=='.inputs.0'||!focus.question||predicates.length!==1||questions.length!==1||questions[0]!==focus)return answer;
      suffix=path.slice(boundary);path=prefix;
    }
    if(!/^0(?:\.(?:\d+|b))+$/.test(path))return answer;
    const operands=path.split('.').slice(1).filter(p=>p!=='b').map(Number);if(!operands.length)return answer;
    for(const direction of ['up','down'] as const)try{
      const plan=planStructureEdit(before,{target:{decision:owner.decision.decision,nodeId:owner.row.nodeId,operands},operation:direction});
      const tokens=path.split('.');let index=tokens.length-1;while(index>0&&!/^\d+$/.test(tokens[index]))index--;tokens[index]=String(Number(tokens[index])+(direction==='up'?-1:1));
      answer[direction]={file,before,after:plan.candidateSource,focus:address(owner.row.nodeId,tokens.join('.')+suffix),anchor:address(anchor.row.nodeId),oldAnchorKey:anchor.row.nodeKey};
    }catch{/* No adjacent authored operand in that direction. */}
    return answer;
  }
  const tests=route.filter(r=>r.row.kind==='when'),index=tests.findIndex(r=>r.row===owner.row);
  const outcomes:Record<string,boolean>={};
  for(const mark of traversal.conditions){const r=rows.get(mark.key);if(r&&same(r)&&mark.result!=='unknown')outcomes[r.row.nodeId]=mark.result==='true';}
  for(const direction of ['up','down'] as const){
    const neighbor=tests[index+(direction==='up'?-1:1)];if(!neighbor||!same(neighbor))continue;
    try{
      const plan=planPathMove(before,{decision:owner.decision.decision,firstNodeId:direction==='up'?neighbor.row.nodeId:owner.row.nodeId,secondNodeId:direction==='up'?owner.row.nodeId:neighbor.row.nodeId,focusedNodeId:owner.row.nodeId,outcomes,anchorNodeId:anchor.row.nodeId});
      answer[direction]={file,before,after:plan.candidateSource,focus:address(plan.focusNodeId),anchor:address(plan.anchorNodeId),oldAnchorKey:anchor.row.nodeKey};
    }catch{/* Never substitute another edge or independent branch for this pin. */}
  }
  return answer;
}
export function movedOccurrenceKey(structure:CrlDecisionStructure[],address:MoveAddress):string|undefined {
  const d=structure.find(d=>d.lib===address.lib&&d.decision===address.decision);if(!d)return;
  const walk=(nodes:CrlStructureNode[]):string|undefined=>{for(const n of nodes){if(n.nodeId===address.nodeId)return n.nodeKey;const nested=walk(n.children);if(nested)return nested;}};return walk(d.children);
}
