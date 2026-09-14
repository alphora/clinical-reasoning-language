import { describe, expect, it } from "vitest";
import { checkPresentationReachability } from "../presentationReachability";
import type { EmittedResource } from "../types";
const base = "https://example.org/";
const text = (wording: string) => ({ profile: [`${base}StructureDefinition/answer`], extension: [
  { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text", valueString: wording },
] });
const guard = [{}];
const first = [{ url: "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior", valueString: "any" }];
const plan = (name: string, action: unknown[]): EmittedResource => ({ resourceType: "PlanDefinition",
  relativePath: `PlanDefinition/${name}.json`, sourceKind: "Decision", sourceName: name,
  resource: { resourceType: "PlanDefinition", url: `${base}PlanDefinition/${name}`, action } });

type ProbeAction = { input?: ReturnType<typeof text>[]; condition?: unknown[]; extension?: typeof first; action?: ProbeAction[] };
// REFACTOR:grounded: independently execute every Boolean guard assignment on small authored trees.
// A visited guard asks its own inputs even when false; only a true guard enters its body.
function exhaustiveConflict(actions: ProbeAction[]): boolean {
  const ids = new Map<ProbeAction, number>();
  const index = (rows: ProbeAction[]) => { for (const a of rows) { if (a.condition?.length) ids.set(a, ids.size); index(a.action ?? []); } };
  index(actions);
  for (let mask = 0; mask < 2 ** ids.size; mask++) {
    const seen = new Map<string, Set<string>>();
    const execute = (rows: ProbeAction[], ordered: boolean): void => {
      for (const a of rows) {
        for (const i of a.input ?? []) for (const profile of i.profile) {
          const words = seen.get(profile) ?? new Set<string>();
          words.add(JSON.stringify(i.extension)); seen.set(profile, words);
        }
        const matches = !ids.has(a) || (mask & (1 << ids.get(a)!)) !== 0;
        if (matches) execute(a.action ?? [], !!a.extension);
        if (ordered && matches) break;
      }
    };
    execute(actions, false);
    if ([...seen.values()].some(v => v.size > 1)) return true;
  }
  return false;
}
describe("presentation form reachability", () => {
  it("agrees with exhaustive guard execution across 256 single-plan nested structures", () => {
    for (let bits = 0; bits < 256; bits++) {
      const rows: ProbeAction[] = [{ condition: guard, ...(bits & 1 ? { input: [text("A?")] } : {}),
        action: [{ condition: guard, input: [text(bits & 2 ? "B?" : "A?")] }, { input: [text("A?")] }],
        ...(bits & 4 ? { extension: first } : {}) },
      { ...(bits & 8 ? { condition: guard } : {}), ...(bits & 16 ? { input: [text("A?")] } : {}),
        action: [{ input: [text(bits & 32 ? "B?" : "A?")] }] },
      { condition: guard, input: [text(bits & 64 ? "B?" : "A?")] }];
      const actions: ProbeAction[] = [{ action: rows, ...(bits & 128 ? { extension: first } : {}) }];
      expect(checkPresentationReachability([plan("P", actions)]).some(e => e.kind === "presentation-overlap"), `structure ${bits}`).toBe(exhaustiveConflict(actions));
    }
  });
  // REFACTOR:grounded: sharing changes neither coexistence nor definition identity.
  it("checks each shared definition once instead of enumerating its caller paths", () => {
    let reads = 0;
    const resources: EmittedResource[] = [];
    for (let i = 0; i < 40; i++) resources.push(plan(`P${i}`, [{ extension: first, action: [
      { condition: guard, get input() { reads++; return [text("Same?")]; }, action: [{ definitionCanonical: `${base}PlanDefinition/P${i + 1}` }] },
      { definitionCanonical: `${base}PlanDefinition/P${i + 1}` },
    ] }]));
    resources.push(plan("P40", [{ input: [text("Same?")] }]));
    expect(checkPresentationReachability(resources)).toEqual([]);
    expect(reads).toBe(40);
    // A different descendant question still conflicts with the caller's own guard question.
    resources[40] = plan("P40", [{ input: [text("Different?")] }]);
    const conflicts = checkPresentationReachability(resources);
    expect(conflicts.every(e => e.kind === "presentation-overlap")).toBe(true);
    for (let i = 0; i < 40; i++) expect(conflicts.some(e => e.message.includes(`${base}PlanDefinition/P${i}/`))).toBe(true);
  });
  // @kit concept-presentation:shared-coexistence
  it("distinguishes exclusive delegation bodies from simultaneous delegation", () => {
    const a = plan("A", [{ input: [text("A?")] }]), b = plan("B", [{ input: [text("B?")] }]);
    const calls = [{ condition: guard, action: [{ definitionCanonical: `${base}PlanDefinition/A|1` }] },
      { condition: guard, action: [{ definitionCanonical: `${base}PlanDefinition/B` }] }];
    expect(checkPresentationReachability([a, b, plan("P", [{ extension: first, action: calls }])])).toEqual([]);
    expect(checkPresentationReachability([a, b, plan("P", calls)])).toMatchObject([{ kind: "presentation-overlap" }]);
    expect(checkPresentationReachability([a, b, plan("P", calls)])[0].message).toContain(`${base}PlanDefinition/P/1`);
    // The later question can coexist with an earlier checked guard, even when its body is exclusive.
    calls[0] = { ...calls[0], input: [text("A?")] } as typeof calls[0];
    expect(checkPresentationReachability([a, b, plan("P", [{ extension: first, action: calls }])]).some(e => e.kind === "presentation-overlap")).toBe(true);
  });
  it("retains cycle verification even when every question uses identical wording", () => {
    const a = plan("A", [{ input: [text("Same?")], definitionCanonical: `${base}PlanDefinition/B` }]);
    const b = plan("B", [{ input: [text("Same?")], definitionCanonical: `${base}PlanDefinition/A` }]);
    expect(checkPresentationReachability([a, b])).toMatchObject([{ kind: "presentation-delegation-unverified" }]);
  });
  it("refuses shared cycles deterministically before caching partial overlap summaries", () => {
    const a = plan("A", [{ input: [text("A?")] }, { definitionCanonical: `${base}PlanDefinition/B` }]);
    const b = plan("B", [{ definitionCanonical: `${base}PlanDefinition/A` }]);
    const c = plan("C", [{ input: [text("Other?")] }, { definitionCanonical: `${base}PlanDefinition/B` }]);
    const expected = checkPresentationReachability([a,b,c]);
    expect(expected).toMatchObject([{ kind: "presentation-delegation-unverified" }]);
    for (const order of [[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]) expect(checkPresentationReachability(order)).toEqual(expected);
  });
  it("cycle preflight ignores first siblings after an unconditional action", () => {
    const a = plan("A", [{ extension: first, action: [{ input: [text("A?")] }, { definitionCanonical: `${base}PlanDefinition/A` }] }]);
    expect(checkPresentationReachability([a])).toEqual([]);
  });
  it("retains unrelated conflicts and missing targets beside a cycle", () => {
    const resources = [plan("Cycle", [{ definitionCanonical: `${base}PlanDefinition/Cycle` }]),
      plan("Bad", [{ input: [text("A?"), text("B?")] }]),
      plan("Missing", [{ definitionCanonical: `${base}PlanDefinition/Absent` }])];
    const errors = checkPresentationReachability(resources);
    expect(errors.map(e => e.kind)).toEqual(["presentation-delegation-unverified", "presentation-overlap", "presentation-delegation-unverified"]);
    expect(errors[1].message).toContain('"A?"'); expect(errors[1].message).toContain('"B?"');
    expect(checkPresentationReachability([...resources].reverse())).toEqual(errors);
  });
  it("compares an outside wording with both exclusive alternatives without conflating them", () => {
    const errors = checkPresentationReachability([plan("P", [
      { extension: first, action: [
        { condition: guard, action: [{ input: [text("W1")] }] }, { action: [{ input: [text("W2")] }] },
      ] }, { input: [text("W3")] },
    ])]);
    expect(errors).toHaveLength(2);
    expect(errors.every(e => e.kind === "presentation-overlap" && e.message.includes('"W3"'))).toBe(true);
  });
  it("reports independent composition sites while deduplicating shared inherited conflicts", () => {
    const a=plan("A",[{input:[text("A?")]}]), b=plan("B",[{input:[text("B?")]}]);
    const calls=[{definitionCanonical:`${base}PlanDefinition/A`},{definitionCanonical:`${base}PlanDefinition/B`}];
    const p=plan("P",calls),q=plan("Q",calls),r=plan("R",[{definitionCanonical:`${base}PlanDefinition/P`}]);
    const errors=checkPresentationReachability([a,b,p,q,r]);
    expect(errors).toHaveLength(2);
    expect(errors.some(e=>e.message.includes(`${base}PlanDefinition/P/1`))).toBe(true);
    expect(errors.some(e=>e.message.includes(`${base}PlanDefinition/Q/1`))).toBe(true);
  });
  it("compares missing wording using the actual concept-name fallback", () => {
    const profile: EmittedResource = { resourceType: "StructureDefinition", relativePath: "StructureDefinition/answer.json",
      resource: { resourceType: "StructureDefinition", url: `${base}StructureDefinition/answer`, title: "Answer" } };
    const p = plan("P", [{ input: [{ profile: [`${base}StructureDefinition/answer`] }] }, { input: [text("Answer")] }]);
    expect(checkPresentationReachability([profile, p])).toEqual([]);
    expect(checkPresentationReachability([profile, plan("P", [{ input: [{ profile: [`${base}StructureDefinition/answer`] }] }, { input: [text("Different?")] }])]))
      .toMatchObject([{ kind: "presentation-overlap" }]);
  });
  it("rejects earlier false guard wording that can coexist with a later guard", () => {
    const p = plan("P", [{ extension: first, action: [
      { condition: guard, input: [text("Earlier?")] }, { condition: guard, input: [text("Later?")] },
    ] }]);
    expect(checkPresentationReachability([p])).toMatchObject([{ kind: "presentation-overlap" }]);
  });
  it("accepts different wording in mutually exclusive branch descendants", () => {
    const p = plan("P", [{ extension: first, action: [
      { condition: guard, action: [{ input: [text("Inside earlier?")] }] },
      { condition: guard, action: [{ input: [text("Inside later?")] }] },
    ] }]);
    expect(checkPresentationReachability([p])).toEqual([]);
  });
  it("includes delegated decisions in the caller's form", () => {
    const p = plan("P", [{ definitionCanonical: `${base}PlanDefinition/A` }, { definitionCanonical: `${base}PlanDefinition/B` }]);
    expect(checkPresentationReachability([p, plan("A", [{ input: [text("A?")] }]), plan("B", [{ input: [text("B?")] }])]))
      .toMatchObject([{ kind: "presentation-overlap" }]);
  });
  it("does not visit siblings after an unconditional first match", () => {
    expect(checkPresentationReachability([plan("P", [{ extension: first, action: [
      { input: [text("First?")] }, { input: [text("Unreachable?")] },
    ] }])])).toEqual([]);
  });
  it("refuses unresolved delegation instead of certifying it", () => {
    expect(checkPresentationReachability([plan("P", [{ definitionCanonical: `${base}PlanDefinition/Missing` }])]))
      .toMatchObject([{ kind: "presentation-delegation-unverified" }]);
  });
  it("does not duplicate a missing-target error for an already diagnosed resource collision", () => {
    expect(checkPresentationReachability([plan("P", [{ definitionCanonical: `${base}PlanDefinition/Missing` }])], new Set(["PlanDefinition/Missing.json"]))).toEqual([]);
  });
});
