// REFACTOR:grounded: MV manual Fixed/Approved; KE retains Answer/Ignore and specialized requests use Q/A controls.
// Flag-ACTION drawer — renderFlagActionDrawer: the read-only view. Post disc-359: the HEADER is the summary (not the long
// target label); Target + id live in a collapsible Details (auto-opened + noted when the target isn't in the current tree).
// Pure HTML; no vscode.
import assert from "node:assert/strict";

import { renderFlagActionDrawer } from "./flagActionDrawerHtml.ts";

/** A representative OPEN validation flag with an occurrence signature, an extra `kind` field, a numeric issue ref, a present target. */
const OPEN_VIEW = {
  typeLabel: "CRL vs customer intent",
  category: "validation",
  status: "open",
  targetLabel: "this condition",
  targetTitle: "this condition (A/B/C signature)",
  anchorAddress: 'decision:D "Lib"',
  occurrenceSignature: "guard→activity",
  summary: "the age gate is inverted",
  description: "line one\nline two",
  fields: [{ key: "kind", value: "intent-divergence" }],
  issueRef: "#42",
  issueNo: 42,
  createdAt: "2026-07-31T10:00:00.000Z",
  editedAt: "2026-07-31T11:00:00.000Z",
  id: "flag-abc123",
  targetPresent: true,
  descriptionOnly: false,
};

// @kit review-flags:reader-layout
test('Question and quotation stay visible, with source reference only in Details, and all are escaped',()=>{
  const h=renderFlagActionDrawer({...OPEN_VIEW,question:'Which <option>?',sourceReference:'Policy <p.2>',sourceQuote:'<script>source</script>'});
  const main=h.slice(0,h.indexOf('<details'));
  assert.ok(main.indexOf('>Question<')<main.indexOf('>Source quotation<'));
  assert.ok(main.indexOf('>Source quotation<')<main.indexOf('>Description<'));
  assert.ok(!main.includes('Policy &lt;p.2&gt;'));
  assert.ok(h.slice(h.indexOf('<details')).includes('Policy &lt;p.2&gt;'));
  assert.ok(h.includes('Which &lt;option&gt;?'));
  assert.ok(!h.includes('<script>'));
  const old=renderFlagActionDrawer(OPEN_VIEW);assert.ok(!old.includes('>Question<'));assert.ok(old.includes('line one\nline two'));
});

test('run reporting has no status mutation and evidence buttons carry opaque keys',()=>{
  const h=renderFlagActionDrawer({...OPEN_VIEW,changes:[{runId:'run-1',recordedAt:'2026-11-01T12:00:00.000Z',beforeCommit:'a'.repeat(40),
    priorState:'Old <wording>',requestedChange:'Please clarify',change:'Reworded',implemented:true,targets:['Question'],
    evidence:[{label:'Report',path:'tests/results/report.json',key:'opaque-1'}]}]});
  const main=h.slice(0,h.indexOf('<details'));
  assert.ok(main.includes('<h3>Changes — '));assert.ok(main.includes('>Before<'));
  assert.ok(main.includes('>After<'));assert.ok(main.includes('Reworded'));
  assert.ok(!h.includes('>Run<')&&!main.includes('run-1'));
  assert.ok(h.slice(h.indexOf('<details')).includes('run-1.json'));
  assert.ok(!h.includes('Requested change')&&!h.includes('Change made'));
  assert.ok(!main.includes('a'.repeat(40)));assert.ok(h.includes('a'.repeat(40)));
  assert.ok(main.includes('Old &lt;wording&gt;'));assert.ok(!h.includes('Run reporting does not change'));
  assert.ok(main.includes('Pending fix'));assert.ok(main.includes('>Affected nodes<'));assert.ok(main.includes('>Evidence<'));
  assert.ok(h.includes('data-flag-summary-evidence="opaque-1"'));
  assert.ok(!h.includes('data-path='));
});

test("renderFlagActionDrawer: the shell — data-flag-action-drawer + distinct action intents (NOT the create drawer's)", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /data-flag-action-drawer/);
  assert.match(h, /data-flag-action-close/);
  assert.match(h, /data-flag-action-toggle/);
  assert.match(h, /data-flag-action-issue/);
  assert.match(h, /class="flag-drawer flag-action-drawer"/);
  for (const create of ["data-flag-insert", "data-flag-cancel", 'data-flag-close"', "data-flag-tag", "data-flag-summary", "data-flag-stub"]) {
    assert.ok(!h.includes(create), `${create} must not appear in the action drawer`);
  }
});

test("renderFlagActionDrawer: the HEADER is the summary (disc 359), not the target label; no separate Summary/Target rows in the body", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /<span class="flag-title" title="the age gate is inverted">Flag — the age gate is inverted<\/span>/);
  // the old header (target label) is gone from the header; the target label now only appears inside Details
  assert.ok(!/Flag — this condition/.test(h), "header must be the summary, not the target label");
  assert.ok(!/>Summary<\/span>/.test(h), "no standalone Summary row (it's the header now)");
  // the Target row is INSIDE <details>, not a top-level body row
  const body = h.slice(h.indexOf('class="fa-body"'), h.indexOf("fa-details"));
  assert.ok(!/>Target<\/span>/.test(body), "Target is not a top-level body row — it's in Details");
});

test("renderFlagActionDrawer: empty gist → the header falls back to the question or target (never a bare 'Flag —')", () => {
  const h = renderFlagActionDrawer({ ...OPEN_VIEW, summary: "" });
  assert.match(h, /Flag — this condition</);
  assert.match(renderFlagActionDrawer({...OPEN_VIEW,summary:"",question:"Which option?"}), /Flag — Which option\?</);
});

test("renderFlagActionDrawer: visible user content and technical Type/Workflow only inside Details", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  const main=h.slice(0,h.indexOf("<details"));
  assert.ok(!main.includes(">Type<")&&!main.includes(">Workflow<"));
  const details=h.slice(h.indexOf("<details"));
  assert.match(details, />Type<\/span><span class="fa-val[^"]*">CRL vs customer intent</);
  assert.match(details, />Workflow<\/span><span class="fa-val[^"]*">MV</);
  assert.match(h, /fa-status fa-status-open">Pending fix</);
  assert.match(h, /line one\nline two/); // multiline description preserved (fa-pre → pre-wrap)
  assert.match(h, />kind<\/span><span class="fa-val[^"]*">intent-divergence</);
  assert.match(h, />Ref<\/span><span class="fa-val[^"]*">#42</);
  assert.match(h, /2026-07-31T10:00:00\.000Z/); // created
  assert.match(h, />Edited<\/span>/);
});

test("renderFlagActionDrawer: Target + id live in a Details (collapsed when the target IS present)", () => {
  const h = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(h, /<details class="fa-details"><summary>Details<\/summary>/); // collapsed (no `open` attr) when present
  const details = h.slice(h.indexOf("fa-details"));
  assert.match(details, />Target<\/span>/);
  assert.match(details, /this condition/); // the label
  assert.match(details, /decision:D &quot;Lib&quot;/); // escaped anchor address
  assert.match(details, /guard→activity/); // occurrence signature
  assert.match(details, />Id<\/span><span class="fa-val[^"]*">flag-abc123</);
  assert.ok(!details.includes("fa-note"), "no missing-target note when the target is present");
});

test("renderFlagActionDrawer: target NOT present → Details AUTO-OPENS + a note (disc 359 zero-placement)", () => {
  const h = renderFlagActionDrawer({ ...OPEN_VIEW, targetPresent: false });
  assert.match(h, /<details class="fa-details" open><summary>Details<\/summary>/); // auto-opened
  assert.match(h, /fa-note">This flag's target isn't drawn in the current tree/);
});

test("renderFlagActionDrawer: Pending → Mark Fixed; legacy Approved → Reopen (no primary); Open-issue only with a numeric issueNo", () => {
  const open = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(open, /class="fa-btn fa-toggle fa-primary" data-flag-action-toggle>Mark Fixed</);
  assert.match(open, /data-flag-action-issue>↗ Open issue #42</);
  const resolved = renderFlagActionDrawer({ ...OPEN_VIEW, status: "resolved" });
  assert.match(resolved, /class="fa-btn fa-toggle" data-flag-action-toggle>↻ Reopen flag</);
  assert.ok(!resolved.includes("fa-primary"));
  const noNumeric = renderFlagActionDrawer({ ...OPEN_VIEW, issueNo: undefined, issueRef: "see PR" });
  assert.ok(!noNumeric.includes("data-flag-action-issue"));
  assert.match(noNumeric, />Ref<\/span><span class="fa-val[^"]*">see PR</);
});

test("renderFlagActionDrawer: absent optional data (no signature / description / editedAt / ref) → those ROWS omitted, no issue button", () => {
  const min = renderFlagActionDrawer({
    typeLabel: "fidelity-defect",
    category: "extraction",
    status: "open",
    targetLabel: 'the concept "x"',
    anchorAddress: "concept:x",
    summary: "",
    fields: [],
    createdAt: "2026-07-31T10:00:00.000Z",
    id: "f1",
    targetPresent: true,
    descriptionOnly: true, // an extraction flag (fidelity-defect) → "Edit description"
  });
  assert.match(min, /Flag — the concept &quot;x&quot;</); // internal type stays out of the header
  assert.match(min, /fa-status-open/);
  assert.ok(!min.includes("guard→"), "no occurrence signature");
  assert.ok(!min.includes(">Edited<"), "no Edited row when editedAt absent");
  assert.ok(!min.includes("data-flag-action-issue"), "no issue button when no ref");
  // operator: Description is ALWAYS shown (em-dash when empty — it's human-editable); Ref is omitted when empty (not editable)
  assert.match(min, />Description<\/span><span class="fa-val fa-pre"><span class="fa-em">—/); // Description row present, em-dash value
  assert.ok(!min.includes(">Ref<"), "no Ref row when ref absent");
});

test("renderFlagActionDrawer: all interpolated text is escaped (header / address / description / field / ref / id)", () => {
  const h = renderFlagActionDrawer({
    typeLabel: "<script>t</script>",
    category: "<b>x</b>",
    status: "open",
    targetLabel: "</span><script>a</script>",
    anchorAddress: '"><img>',
    occurrenceSignature: "</span><i>s</i>",
    summary: "<script>b</script>",
    description: "</span><script>c</script>",
    fields: [{ key: "<u>k</u>", value: "</span><script>v</script>" }],
    issueRef: "<script>r</script>",
    createdAt: "<x>",
    id: "</details><script>id</script>",
    targetPresent: true,
    descriptionOnly: false,
  });
  for (const raw of ["<script>t</script>", "<script>a</script>", '"><img>', "<i>s</i>", "<script>b</script>", "<script>c</script>", "<u>k</u>", "<script>v</script>", "<script>r</script>", "<script>id</script>"]) {
    assert.ok(!h.includes(raw), `must escape: ${raw}`);
  }
  assert.match(h, /&lt;script&gt;/);
});

// ── Todo 3.5 (operator): Edit is offered for mutable MV flags — "Edit flag" (human MV Type) vs "Edit description" (retained authoring-tag) ──
test("edit button: always rendered; label 'Edit flag' for a human Type, 'Edit description' for an retained authoring-tag flag", () => {
  const human = renderFlagActionDrawer(OPEN_VIEW); // descriptionOnly:false
  assert.match(human, /data-flag-action-edit/);
  assert.match(human, /Edit flag/);
  const ai = renderFlagActionDrawer({ ...OPEN_VIEW, descriptionOnly: true });
  assert.match(ai, /data-flag-action-edit/); // still editable (description only)
  assert.match(ai, /Edit description/);
  assert.ok(!/Edit flag/.test(ai), "an authoring-tag MV flag says 'Edit description', not 'Edit flag'");
});
test("delete button (Todo 4): always rendered with data-flag-action-delete, destructive styling, for every flag", () => {
  const human = renderFlagActionDrawer(OPEN_VIEW);
  assert.match(human, /data-flag-action-delete/);
  assert.match(human, /fa-danger/);
  assert.match(human, /Delete flag/);
  const ai = renderFlagActionDrawer({ ...OPEN_VIEW, descriptionOnly: true });
  assert.match(ai, /data-flag-action-delete/); // offered for an authoring-tag MV flag too
});
test("description row: ALWAYS shown (operator — human-editable on authoring-tag MV flags), em-dash when empty; Ref omitted when empty", () => {
  const noDesc = renderFlagActionDrawer({ ...OPEN_VIEW, description: undefined });
  assert.match(noDesc, />Description<\/span><span class="fa-val fa-pre"><span class="fa-em">—/); // Description row present with em-dash
  const noRef = renderFlagActionDrawer({ ...OPEN_VIEW, issueRef: undefined, issueNo: undefined });
  assert.ok(!/>Ref</.test(noRef), "no Ref row when ref absent");
});

test('Open KE flags offer Answer and Ignore, while closed KE flags offer Reopen',()=>{
 for(const status of ['open','resolved']){
  const html=renderFlagActionDrawer({...OPEN_VIEW,category:'extraction',status,readOnly:true,issueNo:42});
  assert.match(html,/KE flag · Content read only/);assert.doesNotMatch(html,/data-flag-action-(edit|delete)/);
  if(status==='open'){
   assert.match(html,/data-flag-action-answer>Answer Flag/);assert.match(html,/data-flag-action-ignore>Ignore Flag/);
   assert.doesNotMatch(html,/data-flag-action-toggle|Resolve flag/);
  }else{
   assert.match(html,/Reopen flag/);assert.doesNotMatch(html,/data-flag-action-(answer|ignore)/);
  }
  assert.match(html,/data-flag-action-issue/);assert.match(html,/data-flag-action-close/);
 }
});

test('manual Fixed -> Approve and Q/A generic drawer has no mutation actions',()=>{
 const fixed=renderFlagActionDrawer({...OPEN_VIEW,status:'fixed'});assert.match(fixed,/Fixed<\/span>/);assert.match(fixed,/data-flag-action-toggle>Approve flag/);
 const approved=renderFlagActionDrawer({...OPEN_VIEW,status:'approved'});assert.match(approved,/Approved<\/span>/);assert.match(approved,/Reopen flag/);
 for(const status of ['open','fixed','approved']){const special=renderFlagActionDrawer({...OPEN_VIEW,qaEdit:true,status});assert.doesNotMatch(special,/data-flag-action-(toggle|edit|delete|answer|ignore)/);assert.match(special,/pinned Question and Answer controls/);}
});

// @kit review-flags:reader-layout
test('historical implementation and deferral outcomes remain visible with their dates',()=>{
 const original={runId:'internal-token',recordedAt:'2026-11-02T12:00:00.000Z',beforeCommit:'b'.repeat(40),
  priorState:'Separate questions',requestedChange:'Combine them',change:'One question now accepts either activity',implemented:true,targets:['Activity question'],evidence:[]};
 const html=renderFlagActionDrawer({...OPEN_VIEW,changes:[original,{...original,recordedAt:'2026-11-01T12:00:00.000Z',change:'Source clarification is needed',implemented:false}]});
 const main=html.slice(0,html.indexOf('<details'));
 for(const text of ['>Before<','>After<','One question now accepts either activity','>Not implemented<','Source clarification is needed','2026-11-02','2026-11-01'])assert.ok(main.includes(text),text);
 assert.equal((main.match(/<h3>Changes — /g)||[]).length,2);
 assert.ok(!main.includes('internal-token'));
 assert.ok(html.slice(html.indexOf('<details')).includes('internal-token.json'));
 const sameTime=renderFlagActionDrawer({...OPEN_VIEW,description:undefined,changes:[original,{...original,change:'Waiting for clarification',implemented:false}]});
 const sameMain=sameTime.slice(0,sameTime.indexOf('<details'));
 assert.ok(sameMain.includes('From latest change report:'));
 assert.ok(!main.includes('From latest change report:'));
 for(const text of ['Combine them','One question now accepts either activity','Waiting for clarification','>Not implemented<'])assert.ok(sameMain.includes(text),text);
 const legacy=renderFlagActionDrawer(OPEN_VIEW);assert.ok(!legacy.includes('<h3>Changes — '));assert.ok(!legacy.includes('>After<'));
});

test("degraded empty legacy labels have a readable header without a technical identifier",()=>{
 const h=renderFlagActionDrawer({...OPEN_VIEW,summary:undefined,targetLabel:" ",question:" "});assert.match(h,/Flag — Review flag</);
});
