import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { renderScenario, type ViewNode } from "../../cre/viewModel";
import type { RegistryEntry } from "../../imports/types";
import { decisionSpine, idOf, nameOf } from "../decisionSpine";
import type { Decision } from "../types";

import { parseInput } from "./parseInput";

function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result)
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget,
    celParseErrors: [],
    diagnostics: [],
  };
}

function collectIds(nodes: ViewNode[], acc: Set<string>): void {
  for (const n of nodes) {
    acc.add(n.nodeId);
    if (n.children) collectIds(n.children, acc);
  }
}

// Exercises the full id space: inline when-action, a nested `then:`/`all:` menu (two actions), a guard, a
// use-decision, and an otherwise — so the parity check covers every childId construction path.
const CRL = `# T
library "T".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
concept "G":
- type is Condition.
- code is \`g\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
activity "Y":
- request CPGCommunicationRequest.
- with \`y\`.
activity "Z":
- request CPGCommunicationRequest.
- with \`z\`.
decision "Sub":
first:
- otherwise then recommend activity "Z".
decision "D":
first:
- when "A" then recommend activity "X".
- when "B" then:
  all:
  - recommend activity "Y" unless "G".
  - use decision "Sub".
  end.
- otherwise then recommend activity "Z".`;

const CEL = `# TC
library "TC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "Z".`;

describe("decisionSpine — static spine + view-model id parity (§5)", () => {
  // Same-library resolver — looks a bare `use decision` target up among the CRL's top-level decisions.
  const resolverFor = (crl: ReturnType<typeof parseInput>) => (name: string): Decision | undefined =>
    crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === name);

  it("produces the expected decision-local childId paths for D (use decision recurses Sub's body)", () => {
    const crl = parseInput(CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    expect(decisionSpine(d, resolverFor(crl)).map((n) => n.nodeId)).toEqual([
      "when[0]",
      "when[0]/action[0]",
      "when[1]",
      "when[1]/action[0]",
      "when[1]/action[1]",
      // Sub's body recursed UNDER the use-decision action `when[1]/action[1]`.
      "when[1]/action[1]/otherwise",
      "when[1]/action[1]/otherwise/action[0]",
      "otherwise",
      "otherwise/action[0]",
    ]);
  });

  it("WITHOUT a resolver, a use decision stays a leaf (no recursion) — back-compat", () => {
    const crl = parseInput(CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    expect(decisionSpine(d).map((n) => n.nodeId)).toEqual([
      "when[0]",
      "when[0]/action[0]",
      "when[1]",
      "when[1]/action[0]",
      "when[1]/action[1]",
      "otherwise",
      "otherwise/action[0]",
    ]);
  });

  it("GOLDEN: decisionSpine nodeIds are byte-identical to the scenario view-model's (no drift)", () => {
    const crl = parseInput(CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    const vm = renderScenario(graphFrom(CRL, CEL));
    const vmIds = new Set<string>();
    for (const sc of vm.scenarios) collectIds(sc.tree, vmIds);
    const spineIds = new Set(decisionSpine(d, resolverFor(crl)).map((n) => n.nodeId));
    expect([...spineIds].sort()).toEqual([...vmIds].sort());
  });

  it("kinds + node identity: when→WhenBlock, otherwise→OtherwiseBlock, action→ActionStatement (with guard/target)", () => {
    const crl = parseInput(CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    const spine = decisionSpine(d);
    const guarded = spine.find((n) => n.nodeId === "when[1]/action[0]")!;
    expect(guarded.kind).toBe("action");
    expect(guarded.node.type).toBe("ActionStatement");
    if (guarded.node.type === "ActionStatement") {
      expect(guarded.node.guard?.conceptName).toBeDefined(); // the `unless "G"` guard
      expect(guarded.node.action.type).toBe("RecommendActivity");
    }
    const useDec = spine.find((n) => n.nodeId === "when[1]/action[1]")!;
    expect(useDec.node.type === "ActionStatement" && useDec.node.action.type).toBe("UseDecision");
  });

  // ── FIX 6: DIAMOND delegation — D uses A and B; both A and B `use decision "C"`. C is reached on TWO paths and must
  //    NOT be flagged a cycle (the cycle guard is per-PATH, not global). Spine == VM parity; C's nodes appear under both.
  const DIAMOND_CRL = `# DM
library "DM".
concept "P":
- type is Condition.
- code is \`p\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "C":
first:
- otherwise then recommend activity "Final".
decision "A":
first:
- otherwise then use decision "C".
decision "B":
first:
- otherwise then use decision "C".
decision "D":
first:
- when "P" then use decision "A".
- when "P" then use decision "B".`;

  const DIAMOND_CEL = `# DMC
library "DMC".
covers "DM".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "Final".`;

  it("FIX 6: diamond delegation — C reached on two paths (not a cycle); spine ids cover BOTH action paths", () => {
    const crl = parseInput(DIAMOND_CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    const ids = decisionSpine(d, resolverFor(crl)).map((n) => n.nodeId);
    // A recursed under when[0]/action[0]; C recursed under A's otherwise action; same for B under when[1]/action[0].
    expect(ids).toEqual([
      "when[0]",
      "when[0]/action[0]",
      "when[0]/action[0]/otherwise",
      "when[0]/action[0]/otherwise/action[0]",
      "when[0]/action[0]/otherwise/action[0]/otherwise",
      "when[0]/action[0]/otherwise/action[0]/otherwise/action[0]",
      "when[1]",
      "when[1]/action[0]",
      "when[1]/action[0]/otherwise",
      "when[1]/action[0]/otherwise/action[0]",
      "when[1]/action[0]/otherwise/action[0]/otherwise",
      "when[1]/action[0]/otherwise/action[0]/otherwise/action[0]",
    ]);
    // C's leaf "Final" recommend appears under BOTH paths (the diamond's two arms), not deduped.
    const finals = ids.filter((i) => i.endsWith("/otherwise/action[0]/otherwise/action[0]"));
    expect(finals).toHaveLength(2);
  });

  it("FIX 6 GOLDEN: diamond spine ids are byte-identical to the view-model's (no drift, no cycle false-positive)", () => {
    const crl = parseInput(DIAMOND_CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    const vm = renderScenario(graphFrom(DIAMOND_CRL, DIAMOND_CEL));
    const vmIds = new Set<string>();
    for (const sc of vm.scenarios) collectIds(sc.tree, vmIds);
    const spineIds = new Set(decisionSpine(d, resolverFor(crl)).map((n) => n.nodeId));
    expect([...spineIds].sort()).toEqual([...vmIds].sort());
  });

  // ── FIX 6: a CROSS-LIBRARY (qualified) `use decision` stays a LEAF in both spine and VM (parity; no recursion). ──
  const XLIB_CRL = `# XL
library "XL".
concept "P":
- type is Condition.
- code is \`p\`.
decision "D":
- when "P" then:
  - use decision "Other"."Sub".
  end.`;

  const XLIB_CEL = `# XLC
library "XLC".
covers "XL".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "Sub".`;

  it("FIX 6: a cross-library use decision stays a leaf in the spine (no recursion even WITH a resolver)", () => {
    const crl = parseInput(XLIB_CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    expect(decisionSpine(d, resolverFor(crl)).map((n) => n.nodeId)).toEqual([
      "when[0]",
      "when[0]/action[0]",
    ]);
  });

  it("FIX 6 GOLDEN: cross-library use-decision spine ids are byte-identical to the view-model's (both leaf)", () => {
    const crl = parseInput(XLIB_CRL);
    const d = crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === "D")!;
    const vm = renderScenario(graphFrom(XLIB_CRL, XLIB_CEL));
    const vmIds = new Set<string>();
    for (const sc of vm.scenarios) collectIds(sc.tree, vmIds);
    const spineIds = new Set(decisionSpine(d, resolverFor(crl)).map((n) => n.nodeId));
    expect([...spineIds].sort()).toEqual([...vmIds].sort());
  });
});

describe("idOf / nameOf — (lib,name) key contract (#172)", () => {
  // nameOf is the only consumer that parses an idOf key back (the delegation-cycle diagnostic). Pin the round-trip so
  // the encoding is an explicit contract — a future idOf change that breaks this fails HERE, not silently in a message.
  it("nameOf(idOf(lib, name)) === name — round-trips, including names with spaces/quotes/dots", () => {
    for (const [lib, name] of [
      ["Policy", "Sub"],
      ["Shared Lib", "Documented Nonunion"],
      ["A", 'has "quotes"'],
      ["B", "dotted.name"],
      ["", "Root"],
    ] as const) {
      expect(nameOf(idOf(lib, name))).toBe(name);
    }
  });

  it("idOf is injective across the (lib,name) split — (A B, C) ≠ (A, B C); A.Sub ≠ B.Sub", () => {
    expect(idOf("A B", "C")).not.toBe(idOf("A", "B C")); // the space-join collision JSON avoids
    expect(idOf("A", "Sub")).not.toBe(idOf("B", "Sub")); // the #172 cross-lib false-collision guard
  });
});
