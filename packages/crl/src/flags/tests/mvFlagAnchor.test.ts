// #212 flags→MV — the anchor resolver. (Ported node:test → jest, disc 248.)
import { resolveAnchor, type AnchorContext } from "../mvFlagAnchor";
import type { CrlDecisionStructure } from "../../provenance/crlStructure";
import type { MvFlagAnchor } from "../mvFlag";

// A minimal decision structure with ONE recommend-activity leaf. `~(top)→L:DoThing` is the leaf's occurrence signature.
const leaf = { kind: "action", actionKind: "recommend-activity", nodeId: "action[0]", nodeKey: "nk1", refKeys: ['["L","activity","DoThing",null]'], children: [] };
const dec = { decision: "D", lib: "L", children: [leaf] } as unknown as CrlDecisionStructure;
const LIVE_KEY = "action[0]~(top)→L:DoThing";
const ctx: AnchorContext = { decisions: [dec], concepts: [{ name: "C", lib: "L", id: "id1" }], libraries: ["L"] };
const anchor = (over: Partial<MvFlagAnchor> = {}): MvFlagAnchor => ({ scope: "decision", name: "D", library: "L", label: "the node", ...over }) as MvFlagAnchor;

test("ctx undefined (unparseable source) → error, NOT orphaned", () => {
  expect(resolveAnchor(anchor({ occurrenceKey: LIVE_KEY }), undefined)).toEqual({
    state: "error", reason: "CRL structure unavailable (source unparseable or not indexed)",
  });
});

test("occurrence: placed → live (carries ref + nodeKey for navigation)", () => {
  const r = resolveAnchor(anchor({ occurrenceKey: LIVE_KEY }), ctx);
  expect(r.state).toBe("live");
  if (r.state === "live") {
    expect(r.nodeKey).toBe("nk1");
    expect(r.ref!.nodeId).toBe("action[0]");
  }
});

test("occurrence: MOVED (nodeId resolves, signature changed) → orphaned, NEVER live", () => {
  expect(resolveAnchor(anchor({ occurrenceKey: "action[0]~(top)→L:SOMETHINGELSE" }), ctx)).toEqual({ state: "orphaned" });
});

test("occurrence: orphan (nodeId gone) → orphaned", () => {
  expect(resolveAnchor(anchor({ occurrenceKey: "when[9]~whatever" }), ctx)).toEqual({ state: "orphaned" });
});

test("decision-scope (no occurrenceKey): found → live; missing library → orphaned; not found → orphaned", () => {
  expect(resolveAnchor(anchor({}), ctx).state).toBe("live");
  expect(resolveAnchor(anchor({ library: undefined }), ctx)).toEqual({ state: "orphaned" });
  expect(resolveAnchor(anchor({ name: "Nope" }), ctx)).toEqual({ state: "orphaned" });
});

test("decision-scope: a multi-match (post-rename collision) → orphaned, never a guessed pick", () => {
  const dupCtx: AnchorContext = { ...ctx, decisions: [dec, { decision: "D", lib: "L", children: [] } as unknown as CrlDecisionStructure] };
  expect(resolveAnchor(anchor({}), dupCtx)).toEqual({ state: "orphaned" });
});

test("library-scope: present → live; absent → orphaned", () => {
  expect(resolveAnchor({ scope: "library", name: "L", label: "x" } as MvFlagAnchor, ctx).state).toBe("live");
  expect(resolveAnchor({ scope: "library", name: "Other", label: "x" } as MvFlagAnchor, ctx)).toEqual({ state: "orphaned" });
});

test("concept-scope: (name, library) match → live; name-alone → orphaned; not found → orphaned", () => {
  expect(resolveAnchor({ scope: "concept", name: "C", library: "L", label: "x" } as MvFlagAnchor, ctx).state).toBe("live");
  expect(resolveAnchor({ scope: "concept", name: "C", label: "x" } as MvFlagAnchor, ctx)).toEqual({ state: "orphaned" });
  expect(resolveAnchor({ scope: "concept", name: "C", library: "WrongLib", label: "x" } as MvFlagAnchor, ctx)).toEqual({ state: "orphaned" });
});

test("concept-scope: entityId (@id) wins — rename-safe (matches even when name/library differ)", () => {
  const r = resolveAnchor({ scope: "concept", name: "RenamedAway", library: "AlsoMoved", entityId: "id1", label: "x" } as MvFlagAnchor, ctx);
  expect(r.state).toBe("live");
});

test("concept-scope: an AMBIGUOUS @id (>1 match) → orphaned, never a fallback to the weaker name match", () => {
  const dupIdCtx: AnchorContext = { ...ctx, concepts: [{ name: "C", lib: "L", id: "id1" }, { name: "C2", lib: "L2", id: "id1" }] };
  expect(resolveAnchor({ scope: "concept", name: "C", library: "L", entityId: "id1", label: "x" } as MvFlagAnchor, dupIdCtx)).toEqual({ state: "orphaned" });
});

test("concept-scope: an @id that no longer exists falls back to (name, library)", () => {
  expect(resolveAnchor({ scope: "concept", name: "C", library: "L", entityId: "goneId", label: "x" } as MvFlagAnchor, ctx).state).toBe("live");
});

test("concept-scope: a (name, library) multi-match → orphaned", () => {
  const dupCtx: AnchorContext = { ...ctx, concepts: [{ name: "C", lib: "L" }, { name: "C", lib: "L" }] };
  expect(resolveAnchor({ scope: "concept", name: "C", library: "L", label: "x" } as MvFlagAnchor, dupCtx)).toEqual({ state: "orphaned" });
});

test("partial ctx (an array not yet populated) → error, NOT a crash and NOT a benign orphan", () => {
  for (const partial of [
    { decisions: undefined, concepts: [], libraries: [] },
    { decisions: [], concepts: undefined, libraries: [] },
    { decisions: [], concepts: [], libraries: undefined },
  ]) {
    expect(resolveAnchor(anchor({}), partial as unknown as AnchorContext).state).toBe("error");
  }
});
