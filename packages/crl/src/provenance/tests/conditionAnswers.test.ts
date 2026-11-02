// REFACTOR:grounded: display partitions follow prepared, selected coded-value semantics.
import { describe, it, expect } from 'vitest';
import { buildCRL } from '../../index';
import { prepareSingleLibraryPublication } from '../../emit/publicationProgram';
import { conditionAnswersFromProgram } from '../conditionAnswers';
import type { CrlConceptNode } from '../crlConceptLayer';

const source = `library "Answers".
terminology "Options":
- system is \`urn:choices\`.
- code is \`a\` display is \`Treatment A\`.
- code is \`b\` display is \`Treatment B\`.
- code is \`c\` display is \`Uncertain\`.
- code is \`d\` display is \`Treatment D\`.
terminology "First subset":
- system is \`urn:choices\`.
- code is \`a\`.
- code is \`c\`.
terminology "Second subset":
- system is \`urn:choices\`.
- code is \`b\`.
concept "Treatment":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`treatment\`.
- value domain is answer options.
- value from is "Options":
  - not qualifying is \`b\`.
  - not qualifying is \`d\`.
- shape reduction is most recent.
presentation for "Treatment":
- question text is "Which treatment?".
concept "First check":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Treatment" in "First subset".
- shape reduction is most recent.
concept "Second check":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Treatment" in "Second subset".
- shape reduction is most recent.
`;
function fixture(text = source) {
  const parsed = buildCRL(text); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  const program = prepareSingleLibraryPublication(parsed.result!, { canonicalBase:'https://example.org', policyId:'demo', localDomainId:'demo' }, 'answers.crl');
  const options = ['a','b','c','d'].map((code,i)=>({system:'urn:choices',code,display:['Treatment A','Treatment B','Uncertain','Treatment D'][i]}));
  const nodes = ['Treatment','First check','Second check', ...(text.includes('concept \"Aggregate\"')?['Treatment2','Aggregate']:[])].map(name=>({nodeKey:name,name,lib:'Answers',location:{filePath:'answers.crl'},definitionRefs:name.startsWith('Treatment')?[]:['Treatment'],valueTypes:[name.startsWith('Treatment')?'CodeableConcept':'boolean'],...(name.startsWith('Treatment')?{answerOptions:options,presentation:{questionText:'Which treatment?'}}:{})})) as CrlConceptNode[];
  return {program,nodes,checks:conditionAnswersFromProgram(program,nodes)};
}
describe('condition answer metadata',()=>{
  it('retains two distinct exact checks over one complete question, including a coded Uncertain answer',()=>{
    const {checks,nodes}=fixture();
    expect(checks.get('First check')?.status).toBe('simple');
    expect(checks.get('First check')?.subjects[0].matches.map(v=>v.code)).toEqual(['a','c']);
    expect(checks.get('First check')?.subjects[0].nonmatches.map(v=>v.code)).toEqual(['b','d']);
    expect(checks.get('Second check')?.subjects[0].matches.map(v=>v.code)).toEqual(['b']);
    expect(checks.get('Treatment')?.subjects[0].matches.map(v=>v.code)).toEqual(['a','c']);
    expect(nodes[0].answerOptions).toHaveLength(4);
    expect(checks.get('First check')?.id).not.toBe(checks.get('Second check')?.id);
  });
  it('does not assign membership-input answers to an arbitrated Boolean result',()=>{
    const {checks}=fixture(source.replace('concept "First check":','concept "First check":\n- code is `first-check`.'));
    expect(checks.get('First check')?.status).toBe('calculation');
    expect(checks.get('First check')?.note).toContain('another recorded value');
  });
  it('requires the interpreted and offered domains to agree by coding identity',()=>{
    const {program,nodes}=fixture(); nodes[0].answerOptions![0].system='urn:wrong';
    const checks=conditionAnswersFromProgram(program,nodes);
    expect(checks.get('First check')?.status).toBe('unsupported');
    expect(checks.get('First check')?.subjects).toEqual([]);
  });
  it.each(['any of','any available value of'])('preserves %s aggregate semantics separately',mode=>{
    const {checks}=fixture(source+source.slice(source.indexOf('concept "Treatment":'),source.indexOf('presentation for "Treatment"')).replace('concept "Treatment"','concept "Treatment2"').replace('`treatment`','`treatment2`')+`concept "Aggregate":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is ${mode} "Treatment" and "Treatment2" in "First subset" using validity of "Treatment".
- shape reduction is most recent.
`);
    expect(checks.get('Aggregate')?.status).toBe('aggregate');
    expect(!!checks.get('Aggregate')?.availableValuesOnly).toBe(mode==='any available value of');
    expect(checks.get('Aggregate')?.subjects[0].matches.map(v=>v.code)).toEqual(['a','c']);
  });
  it('refuses duplicate diagram owners instead of silently overwriting',()=>{
    const {program,nodes}=fixture();
    expect(conditionAnswersFromProgram(program,[...nodes,nodes[1]]).get('First check')?.status).toBe('unsupported');
  });
});
