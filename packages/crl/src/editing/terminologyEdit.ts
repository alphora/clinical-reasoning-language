// REFACTOR:grounded (Medical Review): vocabulary belongs to terminology, classification to its consumers.
import { buildCRL, parseCRL } from '../index';
import type { CRL, Terminology, TerminologyCode } from '../ast/types';
import type { CrlContext } from '../grammar/generated/antlr/CRLParser';
import { readFiniteAnswerMembers } from '../emit/answerDomain';
import { PresentationEditError, sourceSha256, type SourceEdit } from './presentationEdit';

export interface AnswerEditRequest {
  library: string; terminology: string; canonicalBase: string;
  operation: 'create' | 'update' | 'delete'; system: string; code: string;
  display?: string; description?: string;
}
const fail = (message: string): never => {throw new PresentationEditError('answer-edit',message);};
const clean = (v: any): any => Array.isArray(v) ? v.map(clean) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k])=>k!=='location').map(([k,x])=>[k,clean(x)])) : v;
function sourceTree(source: string) {
  const text=source.replace(/^\uFEFF/,''), ast=buildCRL(text), parsed=parseCRL(text);
  if (!ast.success || !ast.result || !parsed.success || !parsed.result) return fail('CRL source is not parseable.');
  const offsets=[source.startsWith('\uFEFF')?1:0]; for(const cp of text) offsets.push(offsets.at(-1)!+cp.length);
  const pos=(index:number)=>offsets[index] ?? fail('Invalid CRL source location.');
  return {ast:ast.result, tree:parsed.result as CrlContext, range:(ctx:any):[number,number]=>[pos(ctx.start?.startIndex ?? ctx.startIndex),pos((ctx.stop?.stopIndex ?? ctx.stopIndex)+1)]};
}
function apply(source:string,edits:SourceEdit[],expected:CRL) {
  let candidateSource=source, previous=source.length+1;
  for(const e of [...edits].sort((a,b)=>b.start-a.start)) {
    if(e.end>previous || source.slice(e.start,e.end)!==e.before) return fail('Overlapping answer source edits.');
    candidateSource=candidateSource.slice(0,e.start)+e.text+candidateSource.slice(e.end);previous=e.start;
  }
  const parsed=buildCRL(candidateSource.replace(/^\uFEFF/,''));
  if(!parsed.success || !parsed.result || JSON.stringify(clean(parsed.result))!==JSON.stringify(clean(expected))) return fail('Answer edit changed unrelated CRL structure.');
  if(candidateSource===source) return fail('There are no answer changes to save.');
  return {candidateSource,edits,beforeSha256:sourceSha256(source),afterSha256:sourceSha256(candidateSource)};
}
function literal(value:string) {
  if(typeof value!=='string' || /[`\\]/.test(value) || Buffer.from(value,'utf8').toString('utf8')!==value) return fail('Answer text cannot be represented losslessly in a CRL backtick literal.');
  return '`'+value+'`';
}
export function planTerminologyEdit(source:string,request:AnswerEditRequest) {
  const {ast,tree,range}=sourceTree(source), expected=structuredClone(ast);
  if(ast.library.name!==request.library) return fail('The terminology source owner changed.');
  const matches=ast.statements.filter((s):s is Terminology=>s.type==='Terminology' && s.name===request.terminology);
  if(matches.length!==1) return fail('The answer terminology has no unique local declaration.');
  const term=matches[0], intended=expected.statements[ast.statements.indexOf(term)] as Terminology;
  const finite=readFiniteAnswerMembers(term);if(finite.kind==='error') return fail(finite.message);
  const prefix=request.canonicalBase.replace(/\/$/,'')+'/CodeSystem/';
  if(!request.system.startsWith(prefix) || !/^[A-Za-z0-9.-]{1,64}$/.test(request.system.slice(prefix.length))) return fail('Answers from an externally owned CodeSystem are read-only. Edit them in their owning workspace.');
  if(!request.code?.trim() || /\s/.test(request.code) || request.code.length>256) return fail('A nonempty code without whitespace is required.');
  literal(request.code);
  if(!['create','update','delete'].includes(request.operation)) return fail('Unknown answer operation.');
  if(request.operation!=='delete' && (typeof request.display!=='string' || !request.display.trim() || request.display.length>8000 || (request.description?.length ?? 0)>16000)) return fail('Answer text is required and must fit the editing limit.');
  const before=finite.members.find(m=>m.system===request.system && m.code===request.code);
  if(request.operation==='create' ? !!before : !before) return fail(request.operation==='create'?'This answer coding already exists.':'The selected answer no longer exists.');
  if(request.operation==='delete' && finite.members.length===1) return fail('The final answer cannot be deleted. Add its replacement first.');
  const ctx=tree.statement().map(s=>s.terminologyStatement()).find(t=>t?.terminologyIdentifier().text.slice(1,-1)===term.name)!;
  const groups=ctx.terminologyBody().terminologyLine().map(l=>l.terminologySystemCode()).filter(g=>!!g);
  const systemGroups=groups.filter(g=>g!.terminologySystem().backtickString().text.slice(1,-1)===request.system);
  const group=request.operation==='create'?systemGroups.at(-1):systemGroups.find(g=>g!.terminologyCode().some(c=>c.backtickString(0).text.slice(1,-1)===request.code));
  if(!group) return fail('Choose an existing locally owned answer system.');
  const codeCtx=group.terminologyCode().find(c=>c.backtickString(0).text.slice(1,-1)===request.code);
  const edits:SourceEdit[]=[];
  const edit=(ctx:any,text:string)=>{const [start,end]=range(ctx);edits.push({start,end,before:source.slice(start,end),text});};
  const after:TerminologyCode={type:'TerminologyCode',code:request.code,display:request.display,...(request.description ? {description:request.description} : {}),location:term.location};
  const line=()=>'- code is '+literal(after.code)+' display is '+literal(after.display!) +(after.description?' description is '+literal(after.description):'')+'.';
  let index=-1,systemIndex=-1,currentSystemIndex=-1,system:string|undefined;
  intended.body.forEach((l,i)=>{if(l.type==='TerminologySystem'){system=l.system;currentSystemIndex=i;}else if(l.type==='TerminologyCode' && system===request.system && l.code===request.code){index=i;systemIndex=currentSystemIndex;}});
  if(request.operation==='create') {
    const last=group.terminologyCode().at(-1)!,[,end]=range(last), newline=source.indexOf('\n',end), at=newline<0?source.length:newline+1;
    const eol=source.includes('\r\n')?'\r\n':'\n',startOfLine=source.lastIndexOf('\n',range(last)[0]-1)+1,indent=source.slice(startOfLine,range(last)[0]).match(/^\s*/)?.[0]??'';
    edits.push({start:at,end:at,before:'',text:(newline<0?eol:'')+indent+line()+eol});
    let lastIndex=-1,sys:string|undefined;intended.body.forEach((l,i)=>{if(l.type==='TerminologySystem')sys=l.system;else if(l.type==='TerminologyCode' && sys===request.system)lastIndex=i;});
    intended.body.splice(lastIndex+1,0,after);
  } else if(request.operation==='update') {
    const current=codeCtx!,parts=current.backtickString();
    if(current.DISPLAY_IS())edit(parts[1],literal(after.display!));
    else {const at=range(parts[0])[1];edits.push({start:at,end:at,before:'',text:' display is '+literal(after.display!)});}
    if(current.DESCRIPTION_IS()){
      const description=parts[current.DISPLAY_IS()?2:1];
      if(after.description)edit(description,literal(after.description));
      else {const start=range(current.DESCRIPTION_IS()!.symbol)[0],end=range(description)[1];edits.push({start,end,before:source.slice(start,end),text:''});}
    }else if(after.description){const at=range(current.DOT().symbol)[0];edits.push({start:at,end:at,before:'',text:' description is '+literal(after.description)});}
    intended.body[index]=after;
  }
  else {edit(codeCtx!,'');intended.body.splice(index,1);if(group.terminologyCode().length===1){edit(group.terminologySystem(),'');intended.body.splice(systemIndex,1);}}
  return {...apply(source,edits,expected),before:before?{system:before.system,code:before.code,display:before.display,...(before.description?{description:before.description}:{})}:null,after:request.operation==='delete'?null:{system:request.system,code:after.code,display:after.display,description:after.description}};
}

/** Classification is concept-local; callers resolve the actual terminology owner before choosing concepts. */
export function planAnswerClassificationEdit(source:string,concepts:readonly string[],code:string,notQualifying:boolean) {
  const {ast,tree,range}=sourceTree(source),expected=structuredClone(ast),edits:SourceEdit[]=[];
  for(const name of concepts) {
    const matches=ast.statements.filter(s=>s.type==='Concept' && s.name===name);
    if(matches.length!==1 || matches[0].type!=='Concept' || !matches[0].valueFrom) return fail('The answer consumer no longer has a unique value-from binding.');
    const concept=matches[0],intended=expected.statements[ast.statements.indexOf(concept)];if(intended.type!=='Concept')return fail('Invalid consumer.');
    const ctx=tree.statement().map(s=>s.conceptStatement()).find(c=>c?.conceptIdentifier().text.slice(1,-1)===name)!.conceptBody().valueFromLine()[0];
    const exceptions=ctx.notQualifyingLine(),matchesCode=exceptions.filter(c=>c.backtickString().text.slice(1,-1)===code);
    if(matchesCode.length>1) return fail('The consumer repeats this nonqualifying code.');
    if(notQualifying && !matchesCode.length) {
      const eol=source.includes('\r\n')?'\r\n':'\n',[,end]=range(ctx);
      if(ctx.DOT()){const [start,stop]=range(ctx.DOT()!.symbol);edits.push({start,end:stop,before:source.slice(start,stop),text:':'});}
      edits.push({start:end,end,before:'',text:eol+'  - not qualifying is '+literal(code)+'.'});
      intended.valueFrom!.notQualifying=[...(intended.valueFrom!.notQualifying??[]),{code,location:concept.location}];
    } else if(!notQualifying && matchesCode.length) {
      const [start,end]=range(matchesCode[0]);edits.push({start,end,before:source.slice(start,end),text:''});
      intended.valueFrom!.notQualifying=intended.valueFrom!.notQualifying!.filter(x=>x.code!==code);
      if(!intended.valueFrom!.notQualifying.length){const [start,end]=range(ctx.COLON()!.symbol);edits.push({start,end,before:source.slice(start,end),text:'.'});}
    }
  }
  return edits.length ? apply(source,edits,expected) : {candidateSource:source,edits,beforeSha256:sourceSha256(source),afterSha256:sourceSha256(source)};
}
