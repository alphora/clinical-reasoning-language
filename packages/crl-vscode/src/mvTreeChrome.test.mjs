import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderMvTreeChrome, hasReviewEditHistory, MV_TREE_CHROME_STYLE } from './mvTreeChrome.ts';
import { scopeNeedsRecovery, scopeHasRetainedLocks } from './mvEditRecovery.ts';

const input = () => ({status:'Reviewed 0/11',highlighting:'Highlight controls',explanation:'Explain outcome',tools:'Tools',questionnaires:'Questionnaires',legend:'Legend entries',documents:{documents:[],complete:true,warnings:[]},documentToken:'owned-token',history:false,recovery:false});
test('puts wider actions left and status above legend right, retaining gold emphasis', () => {
  const html=renderMvTreeChrome(input());
  assert.match(html,/aria-label="Actions"[\s\S]*mv-toolbar-context[\s\S]*aria-label="Status"[\s\S]*aria-label="Legend"/);
  assert.match(MV_TREE_CHROME_STYLE,/\.mv-toolbar\{display:grid;grid-template-columns:/);
  assert.match(MV_TREE_CHROME_STYLE,/overflow-x:auto/);
  assert.match(MV_TREE_CHROME_STYLE,/\.mv-toolbar-heading\{[^}]*text-shadow:[^}]*#ffd54f/);
  assert.doesNotMatch(html,/data-mv-edit-action/);
  assert.equal((html.match(/disabled/g)||[]).length,2);
});
test('orders actions as tools, highlighting, outcome, questionnaires, optional editing, then sources', () => {
  const x=input();x.tools='Review verdicts / Export snapshot';x.history=true;
  const html=renderMvTreeChrome(x);
  assert.match(html,/Review verdicts \/ Export snapshot[\s\S]*Highlight controls[\s\S]*Explain outcome[\s\S]*Questionnaires[\s\S]*Edit history[\s\S]*mv-document-buttons/);
});
test('direct source buttons use escaped names and host indices, never paths; empty/unreadable state is honest', () => {
  const x=input();x.documents={complete:false,warnings:['Cannot read <source>'],documents:[
    {group:'Source',relativePath:'a<&.pdf',filePath:'/private/a.pdf'},
    {group:'Source',relativePath:'b.docx',filePath:'/private/b.docx'},
    {group:'Refined source',relativePath:'refined.md',filePath:'/private/c.md'},
  ]};
  const html=renderMvTreeChrome(x);
  assert.match(html,/Source: a&lt;&amp;.pdf/);assert.match(html,/data-source-document="2"/);
  assert.match(html,/>Refined source<\/button>/);assert.match(html,/Cannot read &lt;source&gt;/);
  assert.doesNotMatch(html,/\/private|Source documents…/);
});
test('history and recovery are independently conditional; history includes unreadable matching receipts', () => {
  const x=input();x.history=true;assert.match(renderMvTreeChrome(x),/Edit history/);assert.doesNotMatch(renderMvTreeChrome(x),/Recover interrupted/);
  x.recovery=true;assert.match(renderMvTreeChrome(x),/Recover interrupted edit/);
  const root=mkdtempSync(join(tmpdir(),'crl-header-history-'));
  try {
    assert.equal(hasReviewEditHistory(root),false);
    const dir=join(root,'medical-validation/direct-edits');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'.gitkeep'),'');
    assert.equal(hasReviewEditHistory(root),false);
    writeFileSync(join(dir,'00000000-0000-0000-0000-000000000000.json'),'invalid json');
    assert.equal(hasReviewEditHistory(root),true);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('recovery availability uses backend operation eligibility, including retained locks but excluding pre-existing locks', () => {
  const phases=['planning','locked','acquiring','scope-outcome-unknown','publishing','local-applied','save-failed','save-in-flight','save-outcome-unknown','saved','no-live-change'];
  for(const phase of phases){
    const op={phase,acquired:[],preExisting:[]};
    assert.equal(scopeNeedsRecovery(op),!['saved','no-live-change'].includes(phase));
    assert.equal(scopeNeedsRecovery({...op,localComplete:true}),false);
  }
  assert.equal(scopeHasRetainedLocks({acquired:['ours','prior'],preExisting:['prior'],released:['ours']}),false);
  assert.equal(scopeHasRetainedLocks({acquired:[],attempted:['unknown'],preExisting:[]}),true);
});
