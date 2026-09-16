// Todo 2 (disc 356/357) — computeFlagPlacement: the flag->node reverse-map assembly (concept-multi-occurrence, keyed-decision
// liveness, decision-object segments, collapsed-criterion per-flag rollup, dedup-by-id, order, moved-occurrence exclusion).
// Pure (no vscode); the two crlStructure/resolveAnchor lookups are simple test callbacks. Executable coverage of the accepted
// design test list (impl review 357 [important]).
import assert from "node:assert/strict";

import { computeFlagPlacement as placeResolved, conceptFlagTargetsForGids, summarizeFlagBadges } from "./flagPlacement.ts";

test("badge status and authoring step stay paired in mixed groups",()=>{
  const summaries=summarizeFlagBadges(new Map([
    ['human-open',[{status:'open',category:'validation'},{status:'resolved',category:'extraction'}]],
    ['ai-open',[{status:'resolved',category:'validation'},{status:'open',category:'extraction'}]],
    ['unknown',[{status:'open',category:'validation'}]],
  ]));
  assert.deepEqual(summaries,[
    {gid:'human-open',open:1,resolved:1,authoringOpen:0,authoringResolved:1},
    {gid:'ai-open',open:1,resolved:1,authoringOpen:1,authoringResolved:0},
    {gid:'unknown',open:1,resolved:0,authoringOpen:0,authoringResolved:0},
  ]);
});

let seq = 0;
/** A minimal MvFlag with the fields computeFlagPlacement reads (id + anchor). */
const mk = (anchor, opts = {}) => ({
  schemaVersion: 1,
  id: opts.id ?? `f${seq++}`,
  category: "validation",
  tag: opts.tag ?? "validation-concern",
  gist: opts.gist ?? "g",
  status: opts.status ?? "open",
  fields: {},
  anchor,
  createdAt: "2026-07-31T00:00:00.000Z",
});
const concept = (name, library) => ({ scope: "concept", name, library, label: `the concept "${name}"` });
const decObject = (name, library) => ({ scope: "decision", name, library, label: `decision ${name}` });
const decOccurrence = (name, library, occurrenceKey) => ({ scope: "decision", name, library, occurrenceKey, label: `${name} node` });

// Existing fixtures use ID-less names; identity tests below use the real resolver.
const computeFlagPlacement = (flags, sub, decisions, occurrence) => placeResolved(flags, sub, decisions, occurrence,
  a => a.library ? {lib: a.library, name: a.name} : undefined);
const NO_DECISION = () => [];
const NO_OCCURRENCE = () => undefined;

test("concept flag lights EVERY (lib,name) occurrence; the bucket carries the flag on each gid", () => {
  const f = mk(concept("Diabetes", "L"), { id: "c1" });
  const sub = { conceptOccurrences: [{ gid: "gA", lib: "L", name: "Diabetes" }, { gid: "gB", lib: "L", name: "Diabetes" }, { gid: "gC", lib: "L", name: "Other" }], criterionOccurrences: [] };
  const r = computeFlagPlacement([f], sub, NO_DECISION, NO_OCCURRENCE);
  assert.deepEqual([...r.gids].sort(), ["gA", "gB"]);
  assert.deepEqual(r.byGid.get("gA").map((x) => x.id), ["c1"]);
  assert.deepEqual(r.byGid.get("gB").map((x) => x.id), ["c1"]);
  assert.equal(r.byGid.has("gC"), false); // a different concept
  assert.equal(r.unplaced, 0);
});

test("concept match is (lib,name) — NEVER name alone (cross-lib same-name)", () => {
  const f = mk(concept("Age", "L1"));
  const sub = { conceptOccurrences: [{ gid: "g1", lib: "L1", name: "Age" }, { gid: "g2", lib: "L2", name: "Age" }], criterionOccurrences: [] };
  const r = computeFlagPlacement([f], sub, NO_DECISION, NO_OCCURRENCE);
  assert.deepEqual(r.gids, ["g1"]); // NOT g2 (other library)
});

test("a live keyed decision OCCURRENCE lands on its one gid; a moved one places nowhere and counts unplaced", () => {
  const live = mk(decOccurrence("D", "L", "n1~sig"), { id: "live" });
  const moved = mk(decOccurrence("D", "L", "n2~sig"), { id: "moved" });
  const occ = (a) => (a.occurrenceKey === "n1~sig" ? "gLive" : undefined);
  const r = computeFlagPlacement([live, moved], { conceptOccurrences: [], criterionOccurrences: [] }, NO_DECISION, occ);
  assert.deepEqual(r.gids, ["gLive"]);
  assert.deepEqual(r.byGid.get("gLive").map((x) => x.id), ["live"]);
  assert.equal(r.unplaced, 1); // the moved occurrence flag
});

test("a decision-OBJECT flag (no occurrence key) lands on every segment gid; NOT counted unplaced when it matches nothing", () => {
  const f = mk(decObject("D", "L"), { id: "obj" });
  const decGids = (a) => (a.name === "D" ? ["s1", "s2"] : []);
  const r = computeFlagPlacement([f], { conceptOccurrences: [], criterionOccurrences: [] }, decGids, NO_OCCURRENCE);
  assert.deepEqual([...r.gids].sort(), ["s1", "s2"]);
  assert.deepEqual(r.byGid.get("s1").map((x) => x.id), ["obj"]);
  // a decision-object flag drawn nowhere is "not charted", not "moved" → no unplaced
  const none = computeFlagPlacement([mk(decObject("Z", "L"))], { conceptOccurrences: [], criterionOccurrences: [] }, () => [], NO_OCCURRENCE);
  assert.equal(none.unplaced, 0);
  assert.equal(none.gids.length, 0);
});

test("a library-scope flag places nowhere and is not unplaced (the start-badge catch-all covers it)", () => {
  const f = mk({ scope: "library", name: "L", label: "library L" });
  const r = computeFlagPlacement([f], { conceptOccurrences: [], criterionOccurrences: [] }, NO_DECISION, NO_OCCURRENCE);
  assert.equal(r.gids.length, 0);
  assert.equal(r.unplaced, 0);
});

test("collapsed criterion rolls up EACH open concept flag in its body; expanded does NOT", () => {
  const fa = mk(concept("A", "L"), { id: "fa" });
  const fb = mk(concept("B", "L"), { id: "fb" });
  const sub = {
    conceptOccurrences: [], // neither concept draws directly (only inside the folded body)
    criterionOccurrences: [
      { gid: "critX", collapsed: true, bodyConcepts: [{ lib: "L", name: "A" }, { lib: "L", name: "B" }] },
      { gid: "critY", collapsed: true, bodyConcepts: [{ lib: "L", name: "A" }] },
      { gid: "critZ", collapsed: false, bodyConcepts: [{ lib: "L", name: "A" }] }, // expanded → no rollup
    ],
  };
  const r = computeFlagPlacement([fa, fb], sub, NO_DECISION, NO_OCCURRENCE);
  assert.deepEqual(r.byGid.get("critX").map((x) => x.id), ["fa", "fb"]); // both, in open order
  assert.deepEqual(r.byGid.get("critY").map((x) => x.id), ["fa"]); // only A
  assert.equal(r.byGid.has("critZ"), false); // expanded → its own body badges, no rollup
});

test("rollup body match is (lib,name) collision-safe with spaces in names", () => {
  const f = mk(concept("Age 18 Or Older", "Lib A"), { id: "sp" });
  const sub = {
    conceptOccurrences: [],
    criterionOccurrences: [{ gid: "c", collapsed: true, bodyConcepts: [{ lib: "Lib A", name: "Age 18 Or Older" }] }],
  };
  const r = computeFlagPlacement([f], sub, NO_DECISION, NO_OCCURRENCE);
  assert.deepEqual(r.byGid.get("c").map((x) => x.id), ["sp"]);
  // a would-be collision (lib "Lib" + name "A Age 18 Or Older") must NOT match
  const collide = mk(concept("A Age 18 Or Older", "Lib"), { id: "x" });
  const r2 = computeFlagPlacement([collide], sub, NO_DECISION, NO_OCCURRENCE);
  assert.equal(r2.byGid.has("c"), false);
});

test("dedup by flag id — a flag placed on the same gid twice appears once; order preserved", () => {
  // two concept occurrences with the SAME gid (a concept drawn twice into one merged node) → dedup
  const f = mk(concept("A", "L"), { id: "dup" });
  const sub = { conceptOccurrences: [{ gid: "g", lib: "L", name: "A" }, { gid: "g", lib: "L", name: "A" }], criterionOccurrences: [] };
  const r = computeFlagPlacement([f], sub, NO_DECISION, NO_OCCURRENCE);
  assert.deepEqual(r.byGid.get("g").map((x) => x.id), ["dup"]); // once, not twice
});

test("multiple flags on one node preserve open order; main-loop placements precede rolled-up ones on a shared gid", () => {
  const obj = mk(decObject("D", "L"), { id: "obj" }); // main loop → 'shared'
  const rolled = mk(concept("A", "L"), { id: "rolled" }); // rollup → 'shared'
  const sub = {
    conceptOccurrences: [],
    criterionOccurrences: [{ gid: "shared", collapsed: true, bodyConcepts: [{ lib: "L", name: "A" }] }],
  };
  const decGids = (a) => (a.name === "D" ? ["shared"] : []);
  const r = computeFlagPlacement([obj, rolled], sub, decGids, NO_OCCURRENCE);
  assert.deepEqual(r.byGid.get("shared").map((x) => x.id), ["obj", "rolled"]); // main-loop obj first, then rollup
});

test("empty open set → empty result", () => {
  const r = computeFlagPlacement([], { conceptOccurrences: [{ gid: "g", lib: "L", name: "A" }], criterionOccurrences: [] }, NO_DECISION, NO_OCCURRENCE);
  assert.equal(r.gids.length, 0);
  assert.equal(r.byGid.size, 0);
  assert.equal(r.unplaced, 0);
});

console.log("flagPlacement.test: ok");

test("Criterion creation offers all hidden helper targets without changing their identity", () => {
  const occurrences = [
    { gid: 'hiddenA', flagGid: 'criterion', lib: 'L', name: 'A' },
    { gid: 'hiddenB', flagGid: 'criterion', lib: 'L', name: 'B' },
    { gid: 'repeatA', flagGid: 'criterion2', lib: 'L', name: 'A' },
    { gid: 'unrelated', flagGid: 'other', lib: 'L', name: 'C' },
    { gid: 'input', lib: 'L', name: 'Question' },
  ];
  assert.deepEqual(conceptFlagTargetsForGids(occurrences, ['criterion', 'criterion2']), [{lib:'L',name:'A'}, {lib:'L',name:'B'}]);
  assert.deepEqual(conceptFlagTargetsForGids(occurrences, ['input']), [{lib:'L',name:'Question'}]);
  assert.deepEqual(conceptFlagTargetsForGids(occurrences, ['hiddenA']), [{lib:'L',name:'A'}]);
  assert.deepEqual(conceptFlagTargetsForGids(occurrences, ['missing']), []);
});

test("hidden helper display placement preserves separate creation identity and original flags",()=>{
 const flags=[mk({scope:'concept',library:'L',name:'A'}),mk({scope:'concept',library:'L',name:'B'})];
 const occurrences=[{gid:'hiddenA',flagGid:'criterion',lib:'L',name:'A'},{gid:'hiddenB',flagGid:'criterion',lib:'L',name:'B'}];
 const r=computeFlagPlacement(flags,{conceptOccurrences:occurrences,criterionOccurrences:[]},NO_DECISION,NO_OCCURRENCE);
 assert.deepEqual(r.gids,['criterion']);assert.deepEqual(r.byGid.get('criterion'),flags);assert.ok(!occurrences.find(o=>o.gid==='criterion'));
 assert.equal(flags[0].anchor.name,'A');assert.equal(flags[1].anchor.name,'B');
});


test("authoritative concept resolution drives every occurrence and folded rollup without changing stored flags", async () => {
  const {resolveAnchor} = await import('../../crl/src/flags/mvFlagAnchor.ts');
  const a = {...concept('Old','OldLib'), entityId:'stable'};
  const open = mk(a,{id:'ke',status:'open'});open.category='extraction';
  const done = mk(a,{id:'mv',status:'resolved'}), original=JSON.stringify([open,done]);
  const sub={conceptOccurrences:[{gid:'one',lib:'NewLib',name:'New'}, {gid:'two',lib:'NewLib',name:'New'}, {gid:'replacement',lib:'OldLib',name:'Old'}],
    criterionOccurrences:[{gid:'fold',collapsed:true,bodyConcepts:[{lib:'NewLib',name:'New'}]},{gid:'unfold',collapsed:false,bodyConcepts:[{lib:'NewLib',name:'New'}]}]};
  const context={decisions:[],libraries:['NewLib','OldLib'],concepts:[{lib:'NewLib',name:'New',id:'stable'},{lib:'OldLib',name:'Old',id:'replacement'}]};
  const resolve=a=>{const r=resolveAnchor(a,context);return r.state==='live'?r.concept:undefined;};
  const placed=placeResolved([open,done],sub,NO_DECISION,NO_OCCURRENCE,resolve);
  assert.deepEqual([...placed.gids].sort(),['fold','one','two']);
  assert.deepEqual(placed.byGid.get('fold').map(f=>f.id),['ke','mv']);
  assert.equal(JSON.stringify([open,done]),original);
  context.concepts[0].id='removed';
  assert.deepEqual(placeResolved([open],sub,NO_DECISION,NO_OCCURRENCE,resolve).gids,[]);
  context.concepts[0].id='stable';context.concepts.push({lib:'Hidden',name:'Unrendered',id:'stable'});
  assert.deepEqual(placeResolved([open],sub,NO_DECISION,NO_OCCURRENCE,resolve).gids,[]);
});
