// REFACTOR:grounded: display role uses Presentation; it neither creates a question nor changes clinical values.
import { describe,it,expect } from 'vitest';
import { buildCRL,validateCRL } from '../../index';
import { createPresentationCatalog } from '../presentation';
const head='library "T". concept "Q": - shape is Record. - type is Observation. - value type is boolean. - shape reduction is most recent. criterion "Inner": - when ("Q"). criterion "Outer": - when ("Inner"). activity "A": - request CPGTaskRequest. - with `A`. decision "D": - when "Outer" then recommend activity "A".';
const ast=(source:string)=>{const r=buildCRL(source);expect(r.success,JSON.stringify(r.errors)).toBe(true);return r.result!;};
const presentation=(name:string,value:string,context='')=>`presentation for "${name}": ${context} - uncertainty guard passes when ${value}.`;
describe('uncertainty guard Presentation',()=>{
 // @kit uncertainty-guard-display:explicit-marker
 it.each([true,false])('retains explicit Boolean %s outside the computational declarations',value=>{
  const root=ast(head+presentation('Q',String(value)));expect(root.presentations![0].uncertaintyGuardPassWhen).toBe(value);
  const c=createPresentationCatalog(root);expect(c.diagnostics).toEqual([]);expect(c.resolveUncertaintyGuard('Q')).toBe(value);expect(c.resolve('Q')).toEqual({});expect(c.hasDeclaration('Q')).toBe(false);
 });
 // @kit uncertainty-guard-display:criterion-annotation
 it('targets a Criterion without inventing question text or an answer code',()=>{
  const c=createPresentationCatalog(ast(head+presentation('Outer','false')));expect(c.diagnostics).toEqual([]);expect(c.resolveUncertaintyGuard('Outer')).toBe(false);
 });
 it.each(['maybe','true. - uncertainty guard passes when false','false. - question description is "Only description"'])('refuses malformed, duplicate or incomplete question fields: %s',value=>{
  expect(buildCRL(head+presentation('Q',value)).success).toBe(false);
 });
 // @kit uncertainty-guard-display:target-validation
 it.each(['Missing','D'])('refuses wrong or absent role target %s',name=>expect(createPresentationCatalog(ast(head+presentation(name,'true'))).diagnostics.some(d=>d.severity==='error')).toBe(true));
 it('refuses nonBoolean and ambiguous concept/Criterion targets',()=>{
  for(const source of [head.replace('value type is boolean','value type is string'),head+'criterion "Q": - when ("Inner").'])expect(createPresentationCatalog(ast(source+presentation('Q','true'))).diagnostics.some(d=>d.severity==='error')).toBe(true);
 });
 it('keeps missing-question warnings and question-only eligibility independent',()=>{
  const coded=head.replace('concept "Q":','concept "Q": - code is `q`.');const c=createPresentationCatalog(ast(coded+presentation('Q','false')));
  expect(c.diagnostics).toMatchObject([{kind:'presentation-question-text-missing',severity:'warning'}]);expect(c.hasDeclaration('Q')).toBe(false);
  const mixed=createPresentationCatalog(ast(coded+presentation('Q','false').replace('- uncertainty','- question text is "Q?". - uncertainty')));expect(mixed.diagnostics).toEqual([]);expect(mixed.resolve('Q')).toEqual({questionText:'Q?'});
  const invalid=createPresentationCatalog(ast(head+'presentation for "Outer": - question text is "Invalid". - uncertainty guard passes when true.'));expect(invalid.diagnostics.some(d=>d.kind==='presentation-reference')).toBe(true);
 });
 it('uses only exact whole-guard criterion context, never descendant scope',()=>{
  const inner=createPresentationCatalog(ast(head+presentation('Outer','false','- in criterion "Inner".')));
  expect(inner.uncertaintyContext('Outer','D').criteria).toEqual(new Set(['Outer']));expect(inner.resolveUncertaintyGuard('Outer',inner.uncertaintyContext('Outer','D'))).toBeUndefined();
  const own=createPresentationCatalog(ast(head+presentation('Outer','false','- in criterion "Outer".')));expect(own.resolveUncertaintyGuard('Outer',own.uncertaintyContext('Outer','D'))).toBe(false);
  const overlap=createPresentationCatalog(ast(head+presentation('Outer','false','- in criterion "Outer". - in decision "D".')));expect(overlap.diagnostics.some(d=>d.kind==='presentation-overlap')).toBe(true);
  const concept=createPresentationCatalog(ast(head+presentation('Q','false','- in criterion "Inner".')));expect(concept.resolveUncertaintyGuard('Q',concept.uncertaintyContext('Q','D'))).toBeUndefined();
 });
 it('inherits the base role through question-only scope and rejects duplicate defaults',()=>{
  const coded=head.replace('concept "Q":','concept "Q": - code is `q`.');const c=createPresentationCatalog(ast(coded+presentation('Q','false')+'presentation for "Q": - in decision "D". - question text is "Q?".'));
  expect(c.resolveUncertaintyGuard('Q',c.uncertaintyContext('Q','D'))).toBe(false);
  expect(createPresentationCatalog(ast(head+presentation('Q','true')+presentation('Q','false'))).resolveUncertaintyGuard('Q')).toBeUndefined();
 });
 it('refuses foreign overrides and diagnoses the retired metadata spelling',()=>{
  const c=createPresentationCatalog(ast(head+'presentation for "Foreign"."Q": - uncertainty guard passes when true.'));expect(c.diagnostics.some(d=>d.kind==='presentation-override-unsupported')).toBe(true);
  const r=validateCRL(head.replace('concept "Q":','concept "Q": - meta is `@tree-uncertainty-guard: Check; pass false`.'));
  expect(r.errors.some(e=>e.kind==='meta-invalid-target'&&e.message.includes('presentation for'))).toBe(true);
  expect(buildCRL('library "T". criterion "C": - meta is `@tree-uncertainty-guard: Check; pass false`. - when ("Q").').success).toBe(false);
 });
});
