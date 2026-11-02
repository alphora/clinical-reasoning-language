/** Occurrence-based CRL tree edits. Shared definitions and case expectations are never deleted. */
import { buildCRL } from '../index';
import { decisionSpine } from '../ast/decisionSpine';
import { getRefLibrary, getRefName, type ASTNode, type CRL, type Decision, type DecisionBody, type WhenBlock, type BranchCondition, type BlockBody, type BranchBlock, type Criterion } from '../ast/types';
import { sourceSha256 } from './presentationEdit';

export interface StructureTarget { decision: string; nodeId: string; operands?: number[] }
export interface StructureSite extends StructureTarget { label: string; condition: string; kind: 'test'|'operand'; parentOperator?: 'and'|'or' }
export type StructureOperation = 'up'|'down'|'delete'|'combine'|'split';
export interface StructureEditRequest {
  target: StructureTarget; operation: StructureOperation;
  /** Deleting a test bypasses it through this explicitly selected continuation. */
  continuation?: 'yes'|'no';
  /** Explicit replacement Boolean conditions, not natural-language interpretations. */
  conditions?: string[]; operator?: 'and'|'or';
  /** Optional new concepts, terminology and presentation declarations for new questions. */
  declarations?: string;
}
export interface StructureEditPlan { beforeSha256: string; candidateSource: string; message: string }
function parse(source: string): CRL {
  const result=buildCRL(source.replace(/^\uFEFF/,''));
  if(!result.success || !result.result)throw Error('CRL is not parseable: '+result.errors?.map(e=>e.message).join('; '));
  return result.result;
}
function offset(source:string,p:{line:number;column:number}):number {
  let n=source.startsWith('\uFEFF')?1:0;
  for(let i=1;i<p.line;i++){const next=source.indexOf('\n',n);if(next<0)throw Error('Invalid source location.');n=next+1;}
  return n+p.column;
}
function span(source:string,node:Pick<ASTNode,'location'>){return {start:offset(source,node.location.start),end:offset(source,node.location.end)};}
function text(source:string,node:ASTNode){const s=span(source,node);return source.slice(s.start,s.end);}
function replace(source:string,node:ASTNode,value:string){const s=span(source,node);return source.slice(0,s.start)+value+source.slice(s.end);}
const quote=(s:string)=>{if(/["\r\n]/.test(s))throw Error('The generated name cannot be quoted safely.');return '"'+s+'"';};
export function structureConditionText(c:BranchCondition):string {
  if(c.type==='BranchConditionRef'||c.type==='BranchConditionCriterionRef')return (getRefLibrary(c.ref)?quote(getRefLibrary(c.ref)!)+'.':'')+quote(getRefName(c.ref));
  if(c.type==='BranchConditionNot')return 'not ('+structureConditionText(c.operand)+')';
  return '('+c.operands.map(structureConditionText).join(c.type==='BranchConditionAnd'?' and ':' or ')+')';
}
function condition(value:string):BranchCondition {
  if(typeof value!=='string'||!value.trim())throw Error('Supply each resulting condition explicitly.');
  const ast=parse('library "Edit".\ndecision "Edit":\n- when '+value+' then recommend activity "Continue".\n');
  if(ast.statements.length!==1 || ast.presentations?.length || ast.presentationGroups?.length)throw Error('Enter a Boolean condition only.');
  const d=ast.statements[0];if(d.type!=='Decision'||d.body.statements.length!==1||d.body.statements[0].type!=='WhenBlock')throw Error('Enter a Boolean condition only.');
  return d.body.statements[0].condition;
}
function criterionOf(ast:CRL,c:BranchCondition):Criterion|undefined {
  if(c.type!=='BranchConditionRef'&&c.type!=='BranchConditionCriterionRef')return;
  if(getRefLibrary(c.ref)&&getRefLibrary(c.ref)!==ast.library.name)return;
  return ast.statements.find((s):s is Criterion=>s.type==='Criterion'&&s.name===getRefName(c.ref));
}
function expanded(ast:CRL,c:BranchCondition,seen=new Set<string>()):BranchCondition {
  const criterion=criterionOf(ast,c);
  if(criterion){if(seen.has(criterion.name))throw Error('Cyclic criterion.');return expanded(ast,criterion.condition,new Set([...seen,criterion.name]));}
  if(c.type==='BranchConditionAnd'||c.type==='BranchConditionOr')return {...c,operands:c.operands.map(o=>expanded(ast,o,seen))};
  if(c.type==='BranchConditionNot')return {...c,operand:expanded(ast,c.operand,seen)};
  return c;
}
export function listStructureSites(source:string):StructureSite[] {
  const ast=parse(source),out:StructureSite[]=[];
  for(const d of ast.statements)if(d.type==='Decision')for(const n of decisionSpine(d))if(n.kind==='when'){
    const root=expanded(ast,(n.node as WhenBlock).condition),target={decision:d.name,nodeId:n.nodeId};
    out.push({...target,label:d.name+' / '+n.nodeId,condition:structureConditionText((n.node as WhenBlock).condition),kind:'test'});
    const walk=(c:BranchCondition,path:number[])=>{
      if(c.type!=='BranchConditionAnd'&&c.type!=='BranchConditionOr')return;
      c.operands.forEach((child,i)=>{const operands=[...path,i];out.push({...target,operands,label:d.name+' / '+n.nodeId+' / '+operands.map(i=>i+1).join('.'),condition:structureConditionText(child),kind:'operand',parentOperator:c.type==='BranchConditionAnd'?'and':'or'});walk(child,operands);});
    };walk(root,[]);
  }
  return out;
}
function semantic(value:unknown):string{return JSON.stringify(value,(k,v)=>k==='location'?undefined:v);}
function branches(d:Decision,target:WhenBlock):{members:BranchBlock[];index:number;container:DecisionBody|BlockBody}|undefined {
  const walk=(container:DecisionBody|BlockBody):{members:BranchBlock[];index:number;container:DecisionBody|BlockBody}|undefined=>{
    const members=container.statements as BranchBlock[],index=members.indexOf(target);if(index>=0)return {members,index,container};
    for(const m of members)if(m.body.type==='BlockBody'&&m.body.statements.some(s=>s.type==='WhenBlock')){const r=walk(m.body);if(r)return r;}
  };return walk(d.body);
}
/** Both exits are preserved; encounter order (including pauses/errors) intentionally changes. */
function nestedPair(d:Decision,parent:WhenBlock,child:WhenBlock):boolean {
  if(parent.body.type!=='BlockBody'||parent.body.qualifier!=='first')return false;
  const m=parent.body.statements;
  if(m.length!==2||m[0]!==child||m[1].type!=='OtherwiseBlock')return false;
  const p=branches(d,parent);if(!p)return false;
  const outerNo=p.members[p.index+1];
  return outerNo?.type==='OtherwiseBlock'&&semantic(outerNo.body)===semantic(m[1].body);
}
function bodyText(source:string,b:WhenBlock['body']):string {
  if(b.type==='ActionStatement')return text(source,b)+'.';
  return text(source,b);
}
function thenBody(source:string,b:WhenBlock['body']):string{return b.type==='ActionStatement'?' '+bodyText(source,b):bodyText(source,b);}
function uniqueName(ast:CRL,name:string):string {let candidate=name+' edited',i=2;while(ast.statements.some(s=>s.name===candidate))candidate=name+' edited '+i++;return candidate;}

export function planStructureEdit(source:string,request:StructureEditRequest):StructureEditPlan {
  const ast=parse(source),d=ast.statements.find((s):s is Decision=>s.type==='Decision'&&s.name===request.target.decision);
  if(!d)throw Error('The selected decision no longer exists.');
  const entry=decisionSpine(d).find(n=>n.nodeId===request.target.nodeId&&n.kind==='when');
  if(!entry)throw Error('Select an authored condition occurrence.');
  const node=entry.node as WhenBlock,op=request.operation,eol=source.includes('\r\n')?'\r\n':'\n';
  if(!['up','down','delete','combine','split'].includes(op))throw Error('Unsupported tree operation.');
  let candidate=source,extra='',message='Generated artifacts and approvals need updating after this CRL change.';
  const definitions=request.declarations?.trim();
  if(definitions){
    if(op!=='combine'&&op!=='split')throw Error('New question definitions belong to Combine or Split.');
    const additions=parse('library "Additions".\n'+definitions);
    if(additions.includes.length||additions.statements.some(s=>!['Concept','Terminology'].includes(s.type)))throw Error('New definitions may contain concepts, terminology and presentations only.');
    extra+=eol+eol+definitions.replace(/\r?\n/g,eol)+eol;
  }
  const parsedConditions=()=>{
    const conditions=request.conditions;
    const count=op==='split'?2:1;
    if(!Array.isArray(conditions)||conditions.length!==count)throw Error('Supply '+count+' resulting condition'+(count===1?'':'s')+'.');
    return conditions.map(condition);
  };
  const operands=request.target.operands;
  if(operands?.length){
    if(operands.some(i=>!Number.isInteger(i)||i<0))throw Error('Invalid operand path.');
    // Clone only named criteria crossed by the selected path. Preserve original
    // presentation declarations: their context lists identify existing MV flags.
    const clones=new Map<string,string>();
    const edit=(current:BranchCondition,path:number[]):BranchCondition=>{
      const criterion=criterionOf(ast,current);
      if(criterion){
        if(clones.has(criterion.name))throw Error('Cyclic criterion edit.');
        const name=uniqueName(ast,criterion.name);clones.set(criterion.name,name);
        const next=edit(criterion.condition,path);
        const original=text(source,criterion),nameEnd=original.indexOf('"',original.indexOf('"')+1),whenEnd=offset(source,criterion.condition.location.start)-span(source,criterion).start;
        const header=original.slice(original.indexOf(':',nameEnd+1)+1,original.lastIndexOf('- when',whenEnd));
        extra+=eol+eol+'criterion '+quote(name)+':'+header+'- when ('+structureConditionText(next)+').'+eol;
        return {...current,type:'BranchConditionRef',ref:name} as BranchCondition;
      }
      if(current.type!=='BranchConditionAnd'&&current.type!=='BranchConditionOr')throw Error('This selection is no longer a compound condition.');
      const [index,...rest]=path,items=[...current.operands];
      if(index>=items.length)throw Error('The selected operand no longer exists.');
      if(rest.length)items[index]=edit(items[index],rest);
      else if(op==='up'||op==='down'){
        const next=index+(op==='up'?-1:1);if(next<0||next>=items.length)throw Error('There is no operand in that direction.');
        [items[index],items[next]]=[items[next],items[index]];
        message='Operand order changed. Question encounter, pause and error order may change. Run Updates before reviewing results.';
      }else if(op==='delete')items.splice(index,1);
      else if(op==='combine'){
        if(index+1>=items.length)throw Error('Select the first of two adjacent operands to combine.');
        items.splice(index,2,parsedConditions()[0]);
      }else{
        if(request.operator!=='and'&&request.operator!=='or')throw Error('Choose ALL (AND) or ANY (OR) explicitly.');
        items[index]={...current,type:request.operator==='and'?'BranchConditionAnd':'BranchConditionOr',operands:parsedConditions()};
      }
      if(!items.length)throw Error('A compound condition must retain a condition.');
      return items.length===1?items[0]:{...current,operands:items};
    };
    const replacement=edit(node.condition,operands);
    for(const p of ast.presentations??[]){
      const changes=p.contexts.filter(c=>c.kind==='criterion'&&(!getRefLibrary(c.ref)||getRefLibrary(c.ref)===ast.library.name)&&clones.has(getRefName(c.ref)));
      if(!changes.length)continue;
      const start=span(source,p).start,names=[...new Set(changes.map(c=>clones.get(getRefName(c.ref))!))];
      let copy=text(source,p);
      // Contexts are alternatives. Carry only remapped criteria into the copy;
      // unrelated original decision/criterion scopes stay on the original.
      for(const context of [...p.contexts].sort((a,b)=>offset(source,b.location.start)-offset(source,a.location.start))){const s=span(source,context);copy=copy.slice(0,s.start-start)+copy.slice(s.end-start);}
      extra+=eol+eol+copy+names.map(name=>eol+'- in criterion '+quote(name)+'.').join('')+eol;
    }
    candidate=replace(source,node.condition,structureConditionText(replacement));
  }else if(op==='up'||op==='down'){
    const all=decisionSpine(d).filter(n=>n.kind==='when'),parent=all.filter(n=>entry.nodeId.startsWith(n.nodeId+'/')).at(-1)?.node as WhenBlock|undefined;
    const child=node.body.type==='BlockBody'?node.body.statements[0]:undefined;
    const other=op==='up'?parent:child?.type==='WhenBlock'?child:undefined;
    if(other&&nestedPair(d,op==='up'?other:node,op==='up'?node:other)){
      const a=span(source,node.condition),b=span(source,other.condition),edits=[{...a,value:text(source,other.condition)},{...b,value:text(source,node.condition)}].sort((a,b)=>b.start-a.start);
      for(const e of edits)candidate=candidate.slice(0,e.start)+e.value+candidate.slice(e.end);
    }else{
      const owner=branches(d,node)!;const i=owner.index+(op==='up'?-1:1),sibling=owner.members[i];
      if(!sibling||sibling.type!=='WhenBlock')throw Error('No adjacent test can move here while preserving its Yes/No exits.');
      const a=span(source,node),b=span(source,sibling);for(const e of [{...a,value:text(source,sibling)},{...b,value:text(source,node)}].sort((a,b)=>b.start-a.start))candidate=candidate.slice(0,e.start)+e.value+candidate.slice(e.end);
    }
    message='Test order changed. First-match priority, question encounter, pauses and errors may change. Review the preview and run updates.';
  }else if(op==='combine'){
    const child=node.body.type==='BlockBody'?node.body.statements[0]:undefined;
    if(!child||child.type!=='WhenBlock'||!nestedPair(d,node,child))throw Error('Combine requires adjacent tests with the same No exit. Select adjacent compound operands for an ALL/ANY group.');
    const c=parsedConditions()[0];
    candidate=replace(source,node,'- when '+structureConditionText(c)+' then'+thenBody(source,child.body));
    message='The two tests now use the supplied condition. Compound and sequential tests can pause differently. Run Updates and review cases.';
  }else if(op==='split'){
    const cs=parsedConditions();if(request.operator!=='and'&&request.operator!=='or')throw Error('Choose ALL (AND) or ANY (OR) explicitly.');
    candidate=replace(source,node.condition,'('+cs.map(structureConditionText).join(request.operator==='and'?' and ':' or ')+')');
    message='The test now uses two explicit conditions in an '+request.operator.toUpperCase()+' group. New question definitions must be supplied explicitly. Run Updates.';
  }else{
    if(request.continuation!=='yes'&&request.continuation!=='no')throw Error('Choose the Yes or No continuation to retain.');
    const owner=branches(d,node)!,after=owner.members[owner.index+1];
    if(owner.container.qualifier && owner.container.qualifier!=='first')throw Error('A Yes/No bypass requires an ordered path. Select a compound operand instead.');
    const promote=(body:WhenBlock['body'])=>{
      if(owner.container.type==='BlockBody')return replace(source,owner.container,thenBody(source,body));
      if(body.type!=='BlockBody'||!body.statements.some(s=>s.type==='WhenBlock'))throw Error('This is the final decision test. Removing it would make the decision unconditional; retain a test or supply a replacement condition.');
      const members=body.statements as BranchBlock[],s=span(source,members[0]),end=span(source,members.at(-1)!).end;
      return replace(source,owner.container,(body.qualifier?body.qualifier+':'+eol:'')+source.slice(s.start,end));
    };
    if(request.continuation==='no'){
      if(!after)throw Error('The selected test has no explicit No continuation.');
      if(owner.members.length===2&&after.type==='OtherwiseBlock')candidate=promote(after.body);
      else {const s=span(source,node);candidate=source.slice(0,s.start)+source.slice(s.end);}
    }else if(owner.index===0)candidate=promote(node.body);
    else {
      const first=span(source,node),last=span(source,owner.members.at(-1)!);
      candidate=source.slice(0,first.start)+'- otherwise then'+thenBody(source,node.body)+source.slice(last.end);
    }
    message='The selected test is bypassed through its '+request.continuation.toUpperCase()+' continuation. Shared questions and existing case facts are retained. Run Updates.';
  }
  candidate+=extra;
  parse(candidate);
  return {beforeSha256:sourceSha256(source),candidateSource:candidate,message};
}
