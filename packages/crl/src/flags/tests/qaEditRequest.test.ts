// REFACTOR:grounded (MV/KE workflow): requested state, manual MV lifecycle, no KE receipt.
import { describe, expect, it } from "vitest";
import { coerceFlag, isOpen } from "../mvFlag";
import { coerceQaEditRequest, type QaEditRequest, type AnswerEditState } from "../qaEditRequest";
import { buildQaEditFlag, mvReviewStatus, qaEditFlagId, renewMvFlag, transitionMvFlag } from "../mvFlagReview";
import { validateFlagFields, flagTags } from "../flagVocab";
const q: QaEditRequest = {kind:"question-edit",target:{kind:"question",file:"src/crl/policy.crl",library:"L",concept:"Question"},
  before:{text:"Old question",description:"Old detail"},desired:{text:"New question",description:"New detail"}};
const state = (display:string):AnswerEditState=>({display,description:"",qualifications:{'["L","Q1"]':true,'["L","Q2"]':false}});
const a: QaEditRequest = {kind:"answer-crud",target:{kind:"answer",file:"src/crl/options.crl",library:"L",terminology:"Options",system:"urn:local",code:"a"},
  before:state("Original"),desired:state("Edited")};
describe("MV current-state edit flags",()=>{
 it("loads one Question Edit request without discarding payload",()=>{const f=buildQaEditFlag(q)!;expect(coerceFlag(JSON.parse(JSON.stringify(f)))).toEqual(f);});
 // @kit mv-wording-patches:current-state
 it("question identity excludes wording, distinguishes presentation scope",()=>{
  const f=buildQaEditFlag(q)!;const r={...q,desired:{text:"Second edit",description:""}} as QaEditRequest;
  const next=buildQaEditFlag(r,f,"later")!;expect(next.id).toBe(f.id);expect(next.createdAt).toBe(f.createdAt);
  expect(next.editRequest?.before).toEqual(q.before);
  expect(qaEditFlagId({...q.target,context:{decision:"D",criteria:[]}} as any)).not.toBe(f.id);
 });
 // @kit mv-wording-patches:answer-delete
 it("answer update then delete retains only requested deletion and original baseline",()=>{
  const f=buildQaEditFlag(a)!;const next=buildQaEditFlag({...a,desired:null},f)!;
  expect(next.id).toBe(f.id);expect(next.editRequest).toMatchObject({before:state("Original"),desired:null});
 });
 it("answer create then delete removes an unapplied addition",()=>{
  const f=buildQaEditFlag({...a,before:null})!;expect(buildQaEditFlag({...a,desired:null},f)).toBeUndefined();
 });
 it("returning to the authored value removes the pending request",()=>{const f=buildQaEditFlag(q)!;expect(buildQaEditFlag({...q,desired:q.before},f)).toBeUndefined();});
 it("amending an applied request captures current authored baseline",()=>{
  const f=buildQaEditFlag(q)!;const next=buildQaEditFlag({...q,before:q.desired,desired:{text:"Third",description:""}},f,"later",true)!;
  expect(next.editRequest?.before).toEqual(q.desired);expect(next.status).toBe("open");
 });
 it("answer identity is shared across consumers, distinguishes system and member",()=>{
  const f=buildQaEditFlag(a)!;expect(f.editRequest?.desired).toEqual(state("Edited"));
  expect(qaEditFlagId({...a.target,system:"urn:other"} as any)).not.toBe(f.id);
  expect(qaEditFlagId({...a.target,code:"b"} as any)).not.toBe(f.id);
 });
 it.each(["../x.crl","/x.crl","C:/x.crl","src/../x.crl","src\\x.crl"])("rejects unsafe target paths %s",file=>{
  expect(coerceQaEditRequest({...q,target:{...q.target,file}})).toBeUndefined();
 });
 it("corrupt reserved payload cannot load as a generic flag",()=>{
  const f=buildQaEditFlag(a)!;expect(coerceFlag({...f,editRequest:undefined})).toBeUndefined();
  expect(coerceFlag({...f,tag:"question-edit"})).toBeUndefined();
  expect(coerceFlag({...f,schemaVersion:1})).toBeUndefined();
  expect(coerceFlag({...f,id:"wrong-identity"})).toBeUndefined();
 });
 it("classification is required and retained in requested state",()=>{
  expect(coerceQaEditRequest({...a,desired:{display:"Edited",description:"",qualifications:{}}})).toBeUndefined();
  expect(coerceQaEditRequest({...a,desired:{display:"Edited",description:"",qualifications:{bad:true}}})).toBeUndefined();
  expect(coerceQaEditRequest({...a,desired:{display:"Edited",description:"",qualifications:{'["L", "Q1"]':true}}})).toBeUndefined();
 });
 // @kit mv-wording-patches:reserved-ui
 it("only dedicated Q/A UI creates reserved types",()=>{
  for(const tag of ["question-edit","answer-crud"])expect(validateFlagFields({tag,title:"Generic mutation"}).ok).toBe(false);
  expect(flagTags().filter(f=>f.editor).map(f=>f.displayName)).toEqual(["Question Edit","Answer CRUD"]);
 });
 // @kit review-flags:manual-mv-review
 it("manual Pending -> Fixed -> Approved blocks completion until approval",()=>{
  const pending=buildQaEditFlag(q)!;expect(mvReviewStatus(pending)).toBe("pending-fix");
  expect(()=>transitionMvFlag(pending,"approved")).toThrow("Fixed");
  const fixed=transitionMvFlag(pending,"fixed");expect(isOpen(fixed)).toBe(true);expect(mvReviewStatus(fixed)).toBe("fixed");
  const approved=transitionMvFlag(fixed,"approved");expect(isOpen(approved)).toBe(false);expect(mvReviewStatus(approved)).toBe("approved");
  expect(coerceFlag(JSON.parse(JSON.stringify(fixed)))).toEqual(fixed);
  expect(coerceFlag(JSON.parse(JSON.stringify(approved)))).toEqual(approved);
  expect(mvReviewStatus(renewMvFlag(approved,{description:"Changed finding"}))).toBe("pending-fix");
 });
 it("normal MV creation starts pending and cannot bypass approval",()=>{
  expect(validateFlagFields({tag:"validation-concern",title:"Finding",status:"resolved"}).ok).toBe(false);
 });
 it("unchanged Q/A and generic saves preserve manual review state, even after source application",()=>{
  for (const request of [q,a]) {
   const fixed=transitionMvFlag(buildQaEditFlag(request)!,"fixed");
   const approved=transitionMvFlag(fixed,"approved");
   for (const current of [fixed,approved]) {
    expect(buildQaEditFlag(request,current)).toBe(current);
    expect(buildQaEditFlag({...request,before:request.desired} as QaEditRequest,current,"later",true)).toBe(current);
    expect(renewMvFlag(current,{})).toBe(current);
    expect(renewMvFlag(current,{gist:current.gist,fields:{...current.fields}})).toBe(current);
   }
  }
 });
 it("equivalent approval aliases and repeated fixed transitions are no-ops",()=>{
  const fixed=transitionMvFlag(buildQaEditFlag(q)!,"fixed");expect(transitionMvFlag(fixed,"fixed")).toBe(fixed);
  const approved=transitionMvFlag(fixed,"resolved");expect(transitionMvFlag(approved,"resolved")).toBe(approved);
  const legacy={...approved,status:"resolved" as const};expect(transitionMvFlag(legacy,"approved")).toBe(legacy);
 });
 it("legacy resolved MV flags remain approved; KE lifecycle is unchanged",()=>{
  const f=buildQaEditFlag(q)!;expect(mvReviewStatus({...f,schemaVersion:1,tag:"other",status:"resolved"})).toBe("approved");
  expect(()=>transitionMvFlag({...f,category:"extraction"},"fixed")).toThrow("KE");
  expect(coerceFlag({...f,category:"extraction",status:"fixed"})).toBeUndefined();
 });
});
