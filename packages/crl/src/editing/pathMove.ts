/** Reorder two adjacent tests on an explicitly selected path, preserving both exits. */
import {buildCRL,tokenizeCRL} from '../index';
import {decisionSpine} from '../ast/decisionSpine';
import type {ASTNode,Decision,BranchBlock,WhenBlockBody,WhenBlock} from '../ast/types';
import {sourceSha256} from './presentationEdit';
import {structureConditionText} from './structureEdit';

interface Test {kind:'test';id:string;condition:string;conditionKey:string;yes:Binary;no:Binary}
interface Body {kind:'body';body:WhenBlockBody}
interface Empty {kind:'empty'}
type Binary=Test|Body|Empty;
export interface PathMoveRequest {
  decision:string;firstNodeId:string;secondNodeId:string;focusedNodeId:string;
  /** Outcomes of the actual pinned path, addressed by authored occurrence. */
  outcomes:Record<string,boolean>;anchorNodeId:string;
}
export interface PathMovePlan {candidateSource:string;beforeSha256:string;focusNodeId:string;anchorNodeId:string}
function ast(source:string){const p=buildCRL(source.replace(/^\uFEFF/,''));if(!p.success||!p.result)throw Error('CRL is not parseable.');return p.result;}
function offset(source:string,p:{line:number;column:number}){let n=source.startsWith('\uFEFF')?1:0;for(let line=1;line<p.line;line++)n=source.indexOf('\n',n)+1;return n+p.column;}
function range(source:string,n:ASTNode){return {start:offset(source,n.location.start),end:offset(source,n.location.end)};}
function raw(source:string,n:ASTNode){const r=range(source,n);return source.slice(r.start,r.end);}

export function planPathMove(source:string,request:PathMoveRequest):PathMovePlan {
  const before=ast(source),decision=before.statements.find((s):s is Decision=>s.type==='Decision'&&s.name===request.decision);
  if(!decision)throw Error('The selected decision no longer exists.');
  const spine=decisionSpine(decision),ids=new Map(spine.map(n=>[n.node,n.nodeId])),empty:Empty={kind:'empty'};
  // AST expression spans can omit grouping parentheses. Copy the complete
  // authored guard between WHEN and THEN, including comments and grouping.
  const lexed=tokenizeCRL(source.replace(/^\uFEFF/,''));if(!lexed.success)throw Error('CRL is not tokenizable.');
  const tokens=lexed.result!.map(t=>({...t,start:offset(source,t)})),guards=new Map<WhenBlock,{start:number;end:number}>();
  for(const entry of spine)if(entry.kind==='when'){
    const node=entry.node as WhenBlock,start=range(source,node).start,bodyStart=range(source,node.body).start;
    const when=tokens.find(t=>t.start>=start&&t.start<bodyStart&&t.type==='WHEN');
    const then=when&&tokens.find(t=>t.start>when.start&&t.start<bodyStart&&t.type==='THEN');
    if(!when||!then)throw Error('The authored guard could not be located.');
    guards.set(node,{start:when.start+when.text.length,end:then.start});
  }
  const body=(b:WhenBlockBody):Binary=>b.type==='BlockBody'&&b.statements.every(s=>s.type==='WhenBlock'||s.type==='OtherwiseBlock')?branches(b.statements as BranchBlock[],b.qualifier):{kind:'body',body:b};
  function branches(members:BranchBlock[],qualifier?:string):Binary {
    if(qualifier&&qualifier!=='first')throw Error('Move is available within an ordered Yes/No path, not an independent ALL action region.');
    let next:Binary=empty;
    for(const member of [...members].reverse()){
      const guard=member.type==='WhenBlock'?guards.get(member):undefined;
      next=member.type==='OtherwiseBlock'?body(member.body):{kind:'test',id:ids.get(member)!,condition:source.slice(guard!.start,guard!.end),conditionKey:structureConditionText(member.condition),yes:body(member.body),no:next};
    }
    return next;
  }
  const root=branches(decision.body.statements,decision.body.qualifier);
  const walk=(node:Binary,visit:(t:Test)=>void)=>{if(node.kind==='test'){visit(node);walk(node.yes,visit);walk(node.no,visit);}};
  let first:Test|undefined;walk(root,t=>{if(t.id===request.firstNodeId)first=t;});
  if(!first)throw Error('Select an authored test on the pinned branch.');
  const outcome=request.outcomes[first.id];
  if(typeof outcome!=='boolean')throw Error('Pin a branch with a known exit from this test.');
  const second=outcome?first.yes:first.no;
  if(second.kind!=='test'||second.id!==request.secondNodeId)throw Error('The destination is not the adjacent test on this pinned branch.');
  if(typeof request.outcomes[second.id]!=='boolean')throw Error('Pin a branch with a known exit from the destination.');
  if(![first.id,second.id].includes(request.focusedNodeId))throw Error('The focused item is not part of this move.');
  if(first.conditionKey===second.conditionKey)throw Error('These adjacent tests have the same condition.');
  const other=outcome?first.no:first.yes;
  const containsEmpty=(n:Binary):boolean=>n.kind==='empty'||n.kind==='test'&&(containsEmpty(n.yes)||containsEmpty(n.no));
  if(containsEmpty(first))throw Error('This path has an implicit no-action exit; it cannot be moved automatically.');
  const parentFor=(continuation:Binary):Test=>({...first!,yes:outcome?continuation:other,no:outcome?other:continuation});
  const rotated:Test={...second,yes:parentFor(second.yes),no:parentFor(second.no)};
  // Rotations can encounter a copy of a test already established above it.
  // Prune that copy through its known exit, preventing growth on repeat moves.
  const reduce=(n:Binary,known:Map<string,boolean>):Binary=>{
    if(n.kind!=='test')return n;
    const established=known.get(n.conditionKey);
    if(established!==undefined)return reduce(established?n.yes:n.no,known);
    return {...n,yes:reduce(n.yes,new Map([...known,[n.conditionKey,true]])),no:reduce(n.no,new Map([...known,[n.conditionKey,false]]))};
  };
  const replace=(n:Binary):Binary=>n===first?reduce(rotated,new Map()):n.kind==='test'?{...n,yes:replace(n.yes),no:replace(n.no)}:n;
  const result=replace(root),selected=new Set<Binary>();
  let leaf=result;
  while(leaf.kind==='test'){
    selected.add(leaf);const value=request.outcomes[leaf.id];
    if(typeof value!=='boolean')throw Error('The pinned branch does not identify the resulting continuation.');
    leaf=value?leaf.yes:leaf.no;
  }
  if(leaf.kind!=='body')throw Error('The selected continuation has no authored body.');
  const leafRange=range(source,leaf.body),anchor=spine.find(n=>n.nodeId===request.anchorNodeId);
  if(!anchor||range(source,anchor.node).start<leafRange.start||range(source,anchor.node).start>=leafRange.end)throw Error('The pinned branch anchor is not in the selected continuation.');
  const eol=source.includes('\r\n')?'\r\n':'\n',r=range(source,decision.body),firstStart=range(source,decision.body.statements[0]).start;
  const preamble=source.slice(r.start,firstStart);
  const pieces:string[]=[preamble],marks:{at:number;id:string}[]=[];
  let size=preamble.length;
  const write=(s:string)=>{pieces.push(s);size+=s.length;};
  const addBody=(b:Body,indent:string)=>{
    const start=size,content=raw(source,b.body);write(content+(b.body.type==='ActionStatement'?'.':''));
    if(b===leaf)for(const n of spine){const p=range(source,n.node).start;if(p>=leafRange.start&&p<leafRange.end)marks.push({at:start+p-leafRange.start,id:n.nodeId});}
  };
  const then=(b:Binary,indent:string)=>{
    if(b.kind==='body'){write(b.body.type==='ActionStatement'?' ':'');addBody(b,indent);return;}
    if(b.kind==='empty')throw Error('Cannot render an implicit continuation.');
    write(':'+eol+indent+'    first:'+eol);render(b,indent+'    ');write(eol+indent+'end.');
  };
  const render=(n:Binary,indent:string)=>{
    if(n.kind!=='test')throw Error('A decision needs an authored test.');
    write(indent);if(selected.has(n))marks.push({at:size,id:n.id});
    write('- when'+n.condition+'then');then(n.yes,indent);
    if(n.no.kind==='test'){write(eol);render(n.no,indent);}
    else if(n.no.kind==='body'){write(eol+indent+'- otherwise then');then(n.no,indent);}
  };
  // Retain guard/branch comments that are outside copied condition and body spans.
  const retained:{start:number;end:number}[]=[];
  walk(result,n=>{const old=spine.find(s=>s.nodeId===n.id)!.node as WhenBlock;retained.push(guards.get(old)!);});
  const bodies=(n:Binary)=>{if(n.kind==='body')retained.push(range(source,n.body));else if(n.kind==='test'){bodies(n.yes);bodies(n.no);}};bodies(result);
  const comments:string[]=[];
  for(let i=firstStart;i<r.end;){
    const covered=retained.find(s=>i>=s.start&&i<s.end);if(covered){i=covered.end;continue;}
    const token=tokens.find(t=>i>=t.start&&i<t.start+t.text.length);if(token){i=token.start+token.text.length;continue;}
    if(source.startsWith('//',i)){const end=source.indexOf('\n',i);comments.push(source.slice(i,end<0?r.end:Math.min(end,r.end)).replace(/\r$/,''));i=end<0?r.end:end;}
    else if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2)+2;if(end<2)throw Error('Unclosed comment.');comments.push(source.slice(i,end));i=end;}
    else i++;
  }
  if(comments.length)write(comments.join(eol)+eol);
  render(result,'');
  const rendered=pieces.join(''),candidateSource=source.slice(0,r.start)+rendered+source.slice(r.end),after=ast(candidateSource);
  const next=after.statements.find((s):s is Decision=>s.type==='Decision'&&s.name===decision.name)!;
  const byStart=new Map(decisionSpine(next).map(n=>[range(candidateSource,n.node).start,n.nodeId]));
  const remap=(id:string)=>{const positions=marks.filter(m=>m.id===id).map(m=>byStart.get(r.start+m.at)).filter((v):v is string=>!!v);if(positions.length!==1)throw Error('The moved occurrence could not be mapped uniquely.');return positions[0];};
  return {candidateSource,beforeSha256:sourceSha256(source),focusNodeId:remap(request.focusedNodeId),anchorNodeId:remap(request.anchorNodeId)};
}
