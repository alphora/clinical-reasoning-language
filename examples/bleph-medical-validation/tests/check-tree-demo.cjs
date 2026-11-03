// Maintained teaching-fixture check; it does not substitute for native or UI qualification.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runRegression, resolveCelSuite, buildSuiteExecutionModel } = require('@smile-digital-health/crl');
const project = join(__dirname, '..');
const result = runRegression(project);
assert.equal(result.success, true, JSON.stringify(result));
assert.equal(result.caseCount, 52);
const selected = resolveCelSuite(project);
assert.equal(selected.ok, true, JSON.stringify(selected.diagnostics));
const model = buildSuiteExecutionModel(selected.suite);
assert.equal(model.scenarios.scenarios.length, 18);
assert(model.scenarios.scenarios.every(s => s.status === 'pass'));

const marked = [];
function visit(node, parents = []) {
  if (node.uncertaintyGuard) marked.push({ node, parents });
  node.children.forEach(child => visit(child, [...parents, node.label]));
}
model.crlStructure.forEach(node => visit(node));
assert.equal(marked.length, 1, 'Only the upper branch has a presentation guard');
assert.equal(marked[0].node.uncertaintyGuard.passWhen, false);
assert(marked[0].parents.includes('when Upper Blepharoplasty Evidence'));
assert(!marked[0].parents.includes('when Blepharoptosis Repair Evidence'));
const concept = name => {
  const node = model.conceptLayer.find(n => n.name === name);
  assert(node, name);
  return node;
};
assert.equal(marked[0].node.uncertaintyGuard.target.kind, 'criterion');
const codes = members => members.map(m => m.code).sort();
for (const [name, count, ordinary, nonqualifying] of [
  ['Documented Patient Complaint', 6, 'reading', 'none'],
  ['Upper Eyelid Skin Finding', 5, 'pseudo-mrd-at-most-2-mm', 'neither'],
]) {
  const source = concept(name);
  const check = concept(name === 'Documented Patient Complaint'
    ? 'Complaint Answer Is Uncertain' : 'Skin Answer Is Uncertain').conditionAnswers;
  assert.equal(check.status, 'simple');
  assert.equal(check.subjects.length, 1);
  const subject = check.subjects.find(s => s.key === source.nodeKey);
  assert(subject, name);
  assert.deepEqual(codes(subject.matches), ['uncertain-no', 'uncertain-yes']);
  assert.equal(subject.matches.length + subject.nonmatches.length, count);
  assert.deepEqual(codes([...subject.matches, ...subject.nonmatches]), codes(source.answerOptions));
  assert(subject.nonmatches.some(m => m.code === ordinary));
  assert(subject.nonmatches.some(m => m.code === nonqualifying));
  const qualification = concept(name === 'Documented Patient Complaint'
    ? 'Qualifying Patient Complaint Reported' : 'Qualifying Skin Finding Documented').conditionAnswers;
  assert.equal(qualification.status, 'simple');
  assert(qualification.subjects[0].matches.some(m => m.code === ordinary));
  assert(qualification.subjects[0].matches.some(m => m.code === 'uncertain-yes'));
  assert(qualification.subjects[0].nonmatches.some(m => m.code === 'uncertain-no'));
}
console.log('Bleph tree demo: 52 CRE expectations; one upper-only guard; two complete, check-specific answer partitions verified.');
