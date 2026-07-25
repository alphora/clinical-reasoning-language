// #203 GAP 3 — occurrence-key addressing. (Ported node:test → jest, disc 248.)
import { occurrencesOf, occurrenceByNodeKey, occurrenceKeyValue, parseOccurrenceKey, resolveOccurrence, isOccurrenceNode, isOccurrenceKey } from "../occurrenceKey";
import type { CrlDecisionStructure, CrlStructureNode } from "../../provenance/crlStructure";

const rk = (lib: string, kind: string, name: string) => JSON.stringify([lib, kind, name, null]);
// Minimal node/decision fixtures — cast through `unknown` (the runtime shape is what occurrenceKey reads; full type conformance isn't the point).
const nd = (nodeId: string, kind: string, label: string, opts: { actionKind?: string; refKeys?: string[]; children?: unknown[] } = {}): CrlStructureNode =>
  ({ nodeKey: `k:${nodeId}`, nodeId, decision: "D", lib: "Pol", kind, label, actionKind: opts.actionKind, refKeys: opts.refKeys ?? [], location: {}, children: opts.children ?? [] }) as unknown as CrlStructureNode;
const dec = (): CrlDecisionStructure =>
  ({
    decision: "D", lib: "Pol", nodeKey: "k:D", location: {},
    children: [
      nd("when[0]", "when", "when Adult", { refKeys: [rk("Pol", "concept", "Adult")], children: [nd("when[0]/action[0]", "action", "Approve", { actionKind: "recommend-activity", refKeys: [rk("Pol", "activity", "Approve")] })] }),
      nd("otherwise", "otherwise", "otherwise", { children: [nd("otherwise/action[0]", "action", "Deny", { actionKind: "recommend-activity", refKeys: [rk("Pol", "activity", "Deny")] })] }),
    ],
  }) as unknown as CrlDecisionStructure;

test("occurrencesOf: the when-condition + the two recommend leaves, with LIBRARY-QUALIFIED signatures", () => {
  const occ = occurrencesOf(dec());
  const byId = Object.fromEntries(occ.map((o) => [o.nodeId, o.signature]));
  expect(byId["when[0]"]).toBe("Pol:Adult");
  expect(byId["when[0]/action[0]"]).toBe("Pol:Adult→Pol:Approve");
  expect(byId["otherwise/action[0]"]).toBe("otherwise→Pol:Deny");
  expect(occ.length).toBe(3);
  expect(occ.find((o) => o.nodeId === "when[0]")!.isLeaf).toBe(false);
  expect(occ.find((o) => o.nodeId === "when[0]/action[0]")!.isLeaf).toBe(true);
});

test("nested branches: same nearest-guard + activity under DIFFERENT outer guards get DISTINCT signatures", () => {
  const inner = (outer: number) => nd(`when[${outer}]`, "when", `when ${outer === 0 ? "A" : "C"}`, {
    refKeys: [rk("Pol", "concept", outer === 0 ? "A" : "C")],
    children: [nd(`when[${outer}]/when[0]`, "when", "when B", { refKeys: [rk("Pol", "concept", "B")], children: [nd(`when[${outer}]/when[0]/action[0]`, "action", "X", { actionKind: "recommend-activity", refKeys: [rk("Pol", "activity", "X")] })] })],
  });
  const d = { decision: "D", lib: "Pol", nodeKey: "k:D", location: {}, children: [inner(0), inner(1)] } as unknown as CrlDecisionStructure;
  const occ = occurrencesOf(d);
  const leaves = occ.filter((o) => o.isLeaf).map((o) => o.signature);
  expect(leaves.sort()).toEqual(["Pol:A/Pol:B→Pol:X", "Pol:C/Pol:B→Pol:X"]);
});

test("#224 compound guard: occurrence sig = structural sigLabel; operator swap differs; single-ref byte-identical", () => {
  const mkWhen = (sigLabel: string): CrlDecisionStructure =>
    ({
      decision: "D",
      lib: "Pol",
      nodeKey: "k:D",
      location: {},
      children: [
        {
          nodeKey: "k:w",
          nodeId: "when[0]",
          decision: "D",
          lib: "Pol",
          kind: "when",
          label: "when g",
          refKeys: [rk("Pol", "concept", "A"), rk("Pol", "concept", "B")],
          sigLabel,
          location: {},
          children: [
            {
              nodeKey: "k:a",
              nodeId: "when[0]/action[0]",
              decision: "D",
              lib: "Pol",
              kind: "action",
              actionKind: "recommend-activity",
              label: "Approve",
              refKeys: [rk("Pol", "activity", "Approve")],
              location: {},
              children: [],
            },
          ],
        },
      ],
    }) as unknown as CrlDecisionStructure;
  const sigOf = (d: CrlDecisionStructure) => {
    const occ = occurrencesOf(d);
    return {
      when: occ.find((o) => o.nodeId === "when[0]")!.signature,
      leaf: occ.find((o) => o.isLeaf)!.signature,
    };
  };
  const andS = sigOf(mkWhen("and(Pol:A,Pol:B)"));
  const orS = sigOf(mkWhen("or(Pol:A,Pol:B)"));
  expect(andS.when).toBe("and(Pol:A,Pol:B)"); // structural, operator-aware (not refKeys[0])
  expect(andS.when).not.toBe(orS.when); // operator swap → DIFFERENT persisted key
  expect(andS.leaf).toBe("and(Pol:A,Pol:B)→Pol:Approve"); // ancestor chain uses sigLabel too
  expect(sigOf(mkWhen("Pol:Adult")).when).toBe("Pol:Adult"); // single-ref = pre-#224 refSig output
});

test("isOccurrenceKey: a nodeId-path key is an occurrence; a re-add-guard source-hash key is NOT", () => {
  expect(isOccurrenceKey("when[0]/action[0]~Pol:Adult→Pol:Approve")).toBe(true);
  expect(isOccurrenceKey("otherwise~x")).toBe(true);
  expect(isOccurrenceKey("sha256:abc123")).toBe(false);
  expect(isOccurrenceKey("some-source-span-hash")).toBe(false);
});

test("cross-lib same-name nodes get DISTINGUISHABLE signatures (the refKey lib differs)", () => {
  const d = { decision: "D", lib: "Pol", nodeKey: "k:D", location: {}, children: [
    nd("when[0]", "when", "when Adult", { refKeys: [rk("LibA", "concept", "Adult")] }),
    nd("when[1]", "when", "when Adult", { refKeys: [rk("LibB", "concept", "Adult")] }),
  ] } as unknown as CrlDecisionStructure;
  const occ = occurrencesOf(d);
  expect(occ[0].signature).not.toBe(occ[1].signature);
});

test("isOccurrenceNode: leaves (recommend-activity) + when only; not otherwise/use-decision", () => {
  expect(isOccurrenceNode({ kind: "when" } as never)).toBe(true);
  expect(isOccurrenceNode({ kind: "action", actionKind: "recommend-activity" } as never)).toBe(true);
  expect(isOccurrenceNode({ kind: "action", actionKind: "use-decision" } as never)).toBe(false);
  expect(isOccurrenceNode({ kind: "otherwise" } as never)).toBe(false);
});

test("key value + parse round-trip; split on the FIRST ~ (nodeId is ~-free)", () => {
  const ref = occurrenceByNodeKey(dec(), "k:when[0]/action[0]")!;
  const key = occurrenceKeyValue(ref);
  expect(key).toBe("when[0]/action[0]~Pol:Adult→Pol:Approve");
  const p = parseOccurrenceKey(key);
  expect(p.nodeId).toBe("when[0]/action[0]");
  expect(p.signature).toBe("Pol:Adult→Pol:Approve");
});

test("resolveOccurrence: placed on an exact match", () => {
  const key = occurrenceKeyValue(occurrenceByNodeKey(dec(), "k:when[0]/action[0]")!);
  const r = resolveOccurrence(dec(), key);
  expect(r.placed).toBe(true);
  if (r.placed) expect(r.ref.nodeId).toBe("when[0]/action[0]");
});

test("resolveOccurrence: ORPHAN when the nodeId no longer resolves", () => {
  const r = resolveOccurrence(dec(), "when[9]/action[0]~when Ghost→Pol:X");
  expect(r.placed).toBe(false);
  if (!r.placed) expect(r.reason).toBe("orphan");
});

test("resolveOccurrence: MOVED when nodeId resolves but the signature changed", () => {
  const r = resolveOccurrence(dec(), "when[0]/action[0]~Pol:Adult→Pol:Reject");
  expect(r.placed).toBe(false);
  if (!r.placed) expect(r.reason).toBe("moved");
});
