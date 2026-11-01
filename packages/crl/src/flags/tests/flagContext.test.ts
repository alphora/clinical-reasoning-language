import { validateAndBuildMvFlagDraft, flagCreationRetry } from '../buildFlagDraft';
import { coerceFlag } from '../mvFlag';
import { validateFlagFields } from '../flagVocab';
import type { CreateFlagInput } from '../flagVocab';
import baseline from './fixtures/baseline-6.4.45-flag.json';

const source = 'library "L".\nconcept "C":\n- type is Observation.\n- code is `c`.';
function build(extra: Partial<CreateFlagInput> = {}) {
  const r = validateAndBuildMvFlagDraft(source,{kind:'concept',name:'C'},
    {tag:'open-fork',title:'Concern',...extra},()=> 'flag-1',()=> '2026-11-01');
  if (!r.ok) throw new Error(r.message);
  return r.flag;
}

// @kit review-flags:structured-context
test('structured text is persisted separately and legacy creation identity stays byte-compatible',()=>{
  const legacy=build();
  expect(legacy.dedupKey).toBe('d-0a53c2726477c9bd99cb77eb59cefcfc12d61267');
  const f=build({question:'  Which option?  ',sourceReference:' Policy p. 2 ',sourceQuote:' `source`;\nsecond line ',description:' Detail '});
  expect(f).toMatchObject({question:'Which option?',sourceReference:'Policy p. 2',sourceQuote:'`source`;\nsecond line',description:'Detail'});
  expect(coerceFlag(JSON.parse(JSON.stringify(f)))).toEqual(f);
  expect(flagCreationRetry([f],build({...f,title:f.gist}))).toMatchObject({state:'deduped',flag:f});
  expect(build({question:' \n ',sourceQuote:' '}).dedupKey).toBe(legacy.dedupKey);
});

test('a verbatim baseline 6.4.45 record deduplicates a current retry',()=>{
  expect(baseline.revision).toBe('9771168b4457e516e7bf2ef902b6c963fe0c05f4');
  const captured=coerceFlag(baseline.flag);expect(captured).toBeDefined();
  expect(flagCreationRetry([captured!],build())).toMatchObject({state:'deduped',flag:captured});
});

test.each(['question','sourceReference','sourceQuote'] as const)('changed %s gets distinct identity; stale matching keys conflict',key=>{
  const a=build({[key]:'Old'}), b=build({[key]:'New'});
  expect(a.dedupKey).not.toBe(b.dedupKey);
  expect(flagCreationRetry([a],b)).toEqual({state:'create'});
  const edited={...a,[key]:'Edited externally'};
  expect(flagCreationRetry([edited],a)).toMatchObject({state:'conflict',flag:edited});
  const explicit=build({[key]:'Old',fields:{key:'authored-key'}});
  expect(flagCreationRetry([explicit],build({[key]:'New',fields:{key:'authored-key'}}))).toMatchObject({state:'conflict'});
});

test('a structured regeneration does not duplicate an open legacy concern or overwrite it',()=>{
  const legacy=build({description:'Human detail'}), before=JSON.stringify(legacy);
  expect(flagCreationRetry([legacy],build({question:'Which option?'}))).toMatchObject({state:'conflict',flag:legacy});
  expect(JSON.stringify(legacy)).toBe(before);
  expect(flagCreationRetry([{...legacy,status:'resolved'}],build({question:'Which option?'}))).toEqual({state:'create'});
  expect(flagCreationRetry([legacy],build({description:'New detail'}))).toMatchObject({state:'deduped',flag:legacy});
});

test.each(['question','sourceReference','sourceQuote'] as const)('malformed %s cannot silently disappear while loading or authoring',key=>{
  expect(coerceFlag({...build(),[key]:null})).toEqual(build());
  expect(coerceFlag({...build(),[key]:42})).toBeUndefined();
  expect(validateFlagFields({tag:'open-fork',title:'Concern',[key]:42} as never)).toMatchObject({ok:false,reason:'invalid-value'});
});

test.each(['question','sourceReference','sourceQuote','sourcereference','SOURCEQUOTE','source-quote'])('misplaced fields.%s has actionable top-level guidance',key=>{
  const r=validateFlagFields({tag:'open-fork',title:'Concern',fields:{[key]:'wrong location'}});
  expect(r).toMatchObject({ok:false,reason:'invalid-value'});
  if (!r.ok) expect(r.message).toContain('top-level');
});

test('content revision metadata remains host owned',()=>{
  expect(validateFlagFields({tag:'open-fork',title:'Concern',fields:{'ke-content-revision':'forged'}})).toMatchObject({ok:false});
});
