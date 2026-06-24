import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { renderScenario, type ViewNode } from "../../cre/viewModel";
import type { RegistryEntry } from "../../imports/types";
import { buildCrlStructure, type CrlStructureNode } from "../crlStructure";
import { buildProvenanceIndex, decisionDeclRef, nodeKey } from "../indexer";

// Reuses the decisionSpine.test fixture (full id space: when-action, nested all:/menu, guard, use-decision, otherwise).
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

// A second LOCAL library with a decision the covered policy never reaches (over-reach denominator, never in the trace).
const U = `# U
library "U".
concept "Q":
- type is Condition.
- code is \`q\`.
activity "W":
- request CPGCommunicationRequest.
- with \`w\`.
decision "Unused":
first:
- when "Q" then recommend activity "W".`;

function entry(src: string, filePath: string, origin: "root" | "local"): RegistryEntry {
  return {
    name: parseInput(src).library.name,
    filePath,
    ast: parseInput(src),
    isRoot: origin === "root",
    origin,
  };
}
function graphFrom(
  crlSrc: string,
  celSrc: string,
  extraLocal: RegistryEntry[] = [],
): ResolvedCelGraph {
  const built = buildCEL(celSrc);
  if (!built.success || !built.result)
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const byNameLocal = new Map<string, RegistryEntry>();
  for (const e of extraLocal) byNameLocal.set(e.name, e);
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget: entry(crlSrc, "inline.crl", "root"),
    crlRegistry: { byNameLocal, byNamePackage: new Map() },
    celParseErrors: [],
    diagnostics: [],
  } as ResolvedCelGraph;
}

function flatten(nodes: (CrlStructureNode | ViewNode)[], acc: Map<string, string>): void {
  for (const n of nodes) {
    acc.set(n.nodeId, n.label);
    if (n.children) flatten(n.children as (CrlStructureNode | ViewNode)[], acc);
  }
}

describe("buildCrlStructure — CRL-structure view-model (C2b-1)", () => {
  it("nodeKey parity: structure sub-node keys === index keys with a nodeId; roots === decision-decl keys", () => {
    const graph = graphFrom(CRL, CEL);
    const struct = buildCrlStructure(graph);
    const index = buildProvenanceIndex(graph);

    const structSub = new Set<string>();
    for (const d of struct) flattenKeys(d.children, structSub);
    const indexSub = new Set(
      [...index.nodes.values()]
        .filter((n) => n.ref.nodeId !== undefined)
        .map((n) => nodeKey(n.ref)),
    );
    expect([...structSub].sort()).toEqual([...indexSub].sort());

    const structRoots = new Set(struct.map((d) => d.nodeKey));
    const indexDeclDecisions = new Set(
      [...index.nodes.values()]
        .filter((n) => n.ref.kind === "decision" && n.ref.nodeId === undefined)
        .map((n) => nodeKey(n.ref)),
    );
    expect([...structRoots].sort()).toEqual([...indexDeclDecisions].sort());
  });

  it("shared decisionDeclRef matches the indexer's generic decision-decl key", () => {
    const graph = graphFrom(CRL, CEL);
    const index = buildProvenanceIndex(graph);
    expect(index.nodes.has(nodeKey(decisionDeclRef("T", "D")))).toBe(true);
    expect(decisionDeclRef("T", "D")).toEqual({ lib: "T", kind: "decision", name: "D" });
  });

  it("includes an UNREACHED registry-library decision (full inventory, not reachability)", () => {
    const graph = graphFrom(CRL, CEL, [entry(U, "u.crl", "local")]);
    const struct = buildCrlStructure(graph);
    const index = buildProvenanceIndex(graph);
    const unusedKey = nodeKey(decisionDeclRef("U", "Unused"));
    expect(struct.some((d) => d.decision === "Unused" && d.lib === "U")).toBe(true);
    expect(index.nodes.has(unusedKey)).toBe(true); // in the inventory
    expect(index.decisionReachability.has(unusedKey)).toBe(false); // but never reached
  });

  it("nearest-ancestor nesting: the full parent map for D (nested actions parent to their branch, not the root)", () => {
    const d = buildCrlStructure(graphFrom(CRL, CEL)).find((x) => x.decision === "D")!;
    expect(d.children.map((c) => c.nodeId)).toEqual(["when[0]", "when[1]", "otherwise"]);
    const byId = new Map(d.children.map((c) => [c.nodeId, c]));
    expect(byId.get("when[0]")!.children.map((c) => c.nodeId)).toEqual(["when[0]/action[0]"]);
    expect(byId.get("when[1]")!.children.map((c) => c.nodeId)).toEqual([
      "when[1]/action[0]",
      "when[1]/action[1]",
    ]);
    expect(byId.get("otherwise")!.children.map((c) => c.nodeId)).toEqual(["otherwise/action[0]"]);
  });

  it("label parity: structure labels === the scenario view-model's (run-state stripped)", () => {
    const graph = graphFrom(CRL, CEL);
    const d = buildCrlStructure(graph).find((x) => x.decision === "D")!;
    const structLabels = new Map<string, string>();
    flatten(d.children, structLabels);
    const vmLabels = new Map<string, string>();
    flatten(renderScenario(graph).scenarios[0].tree, vmLabels);
    expect(structLabels).toEqual(vmLabels);
  });

  it("actionKind: undefined on when/otherwise, normalized on actions", () => {
    const d = buildCrlStructure(graphFrom(CRL, CEL)).find((x) => x.decision === "D")!;
    const all = new Map<string, CrlStructureNode>();
    collect(d.children, all);
    expect(all.get("when[0]")!.actionKind).toBeUndefined();
    expect(all.get("otherwise")!.actionKind).toBeUndefined();
    expect(all.get("when[0]/action[0]")!.actionKind).toBe("recommend-activity");
    expect(all.get("when[1]/action[1]")!.actionKind).toBe("use-decision"); // use decision "Sub"
  });

  it("location is collapsed-to-start, byte-identical to the index node for the same nodeKey", () => {
    const graph = graphFrom(CRL, CEL);
    const d = buildCrlStructure(graph).find((x) => x.decision === "D")!;
    const index = buildProvenanceIndex(graph);
    const all = new Map<string, CrlStructureNode>();
    collect(d.children, all);
    const n = all.get("when[0]")!;
    expect(n.location).toEqual(index.nodes.get(n.nodeKey)!.location);
    expect(n.location.range.startLine).toBe(n.location.range.endLine); // collapsed
    expect(n.location.range.startCol).toBe(n.location.range.endCol);
  });

  it("nested branch under a `when` → exercises nest()'s recursive-branch path (parent-id reuse)", () => {
    const NESTED = `# N
library "N".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
activity "Y":
- request CPGCommunicationRequest.
- with \`y\`.
decision "Nest":
first:
- when "A" then:
  first:
  - when "B" then recommend activity "X".
  - otherwise then recommend activity "Y".
  end.
- otherwise then recommend activity "Y".`;
    const celN = CEL.replace(/covers "T"\./, 'covers "N".').replace(/"D" is "Z"/, '"Nest" is "Y"');
    const d = buildCrlStructure(graphFrom(NESTED, celN)).find((x) => x.decision === "Nest")!;
    // nested branches reuse the outer when's id: when[0]/when[0], when[0]/otherwise
    const outer = d.children.find((c) => c.nodeId === "when[0]")!;
    expect(outer.children.map((c) => c.nodeId).sort()).toEqual([
      "when[0]/otherwise",
      "when[0]/when[0]",
    ]);
    const innerWhen = outer.children.find((c) => c.nodeId === "when[0]/when[0]")!;
    expect(innerWhen.children.map((c) => c.nodeId)).toEqual(["when[0]/when[0]/action[0]"]);
    expect(d.children.map((c) => c.nodeId)).toContain("otherwise");
  });

  it("cross-kind same-name: a concept sharing a decision's name → exactly one (decision) root", () => {
    const SHARED = `# S
library "S".
concept "D":
- type is Condition.
- code is \`d\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- otherwise then recommend activity "X".`;
    const celS = CEL.replace(/covers "T"\./, 'covers "S".').replace(/"D" is "Z"/, '"D" is "X"');
    const struct = buildCrlStructure(graphFrom(SHARED, celS));
    expect(struct.filter((d) => d.decision === "D")).toHaveLength(1); // the concept "D" is filtered out
  });

  it("decisions are emitted in SOURCE order (Sub before D, per the fixture)", () => {
    const struct = buildCrlStructure(graphFrom(CRL, CEL));
    expect(struct.map((d) => d.decision)).toEqual(["Sub", "D"]);
  });

  it("a package-origin registry library's decision is inventoried + keyed by its lib", () => {
    const built = buildCEL(CEL);
    if (!built.success || !built.result) throw new Error("CEL build failed");
    const pkg = { ...entry(U, "u.crl", "local"), origin: "package" as const };
    const graph = {
      filePath: "inline.cel",
      cel: built.result,
      coversTarget: entry(CRL, "inline.crl", "root"),
      crlRegistry: { byNameLocal: new Map(), byNamePackage: new Map([["U", pkg]]) },
      celParseErrors: [],
      diagnostics: [],
    } as ResolvedCelGraph;
    const struct = buildCrlStructure(graph);
    expect(struct.some((d) => d.decision === "Unused" && d.lib === "U")).toBe(true);
  });

  it("refKeys: when→concept, recommend→activity (+guard concept), use-decision→decision; all indexed", () => {
    const graph = graphFrom(CRL, CEL);
    const d = buildCrlStructure(graph).find((x) => x.decision === "D")!;
    const index = buildProvenanceIndex(graph);
    const all = new Map<string, CrlStructureNode>();
    collect(d.children, all);
    const k = (kind: string, name: string) => nodeKey({ lib: "T", kind, name });
    expect(all.get("when[0]")!.refKeys).toEqual([k("concept", "A")]);
    expect(all.get("when[0]/action[0]")!.refKeys).toEqual([k("activity", "X")]);
    expect(all.get("when[1]/action[0]")!.refKeys).toEqual([k("activity", "Y"), k("concept", "G")]); // `unless "G"` guard
    expect(all.get("when[1]/action[1]")!.refKeys).toEqual([k("decision", "Sub")]); // use decision "Sub"
    expect(all.get("otherwise")!.refKeys).toEqual([]);
    for (const key of [k("concept", "A"), k("activity", "X"), k("activity", "Y"), k("concept", "G"), k("decision", "Sub")])
      expect(index.nodes.has(key)).toBe(true); // every refKey is a real indexed node (byte-identical)
  });

  it("refKeys use the OWNING decision's lib (a registry-lib decision keys to its own lib, not the policy)", () => {
    const graph = graphFrom(CRL, CEL, [entry(U, "u.crl", "local")]);
    const u = buildCrlStructure(graph).find((x) => x.decision === "Unused" && x.lib === "U")!;
    const index = buildProvenanceIndex(graph);
    const all = new Map<string, CrlStructureNode>();
    collect(u.children, all);
    const qKey = nodeKey({ lib: "U", kind: "concept", name: "Q" });
    expect(all.get("when[0]")!.refKeys).toEqual([qKey]);
    expect(index.nodes.has(qKey)).toBe(true);
  });

  it("refKeys honor a QUALIFIED ref's library (when \"U\".\"Q\" → lib U, not the decision's lib)", () => {
    const Q = `# QT
library "QT".
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "U"."Q" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const celQ = CEL.replace(/covers "T"\./, 'covers "QT".').replace(/"D" is "Z"/, '"D" is "X"');
    const d = buildCrlStructure(graphFrom(Q, celQ)).find((x) => x.decision === "D")!;
    const all = new Map<string, CrlStructureNode>();
    collect(d.children, all);
    // the qualified library "U" overrides the decision's lib "QT" (getRefLibrary(ref) ?? decisionLib)
    expect(all.get("when[0]")!.refKeys).toEqual([nodeKey({ lib: "U", kind: "concept", name: "Q" })]);
  });

  it("cross-kind same-name: when Z→concept, recommend Z→activity, use decision Z→decision", () => {
    const X = `# X
library "X".
concept "Z":
- type is Condition.
- code is \`z\`.
activity "Z":
- request CPGCommunicationRequest.
- with \`z\`.
decision "Z":
first:
- otherwise then recommend activity "Z".
decision "Main":
first:
- when "Z" then:
  all:
  - recommend activity "Z".
  - use decision "Z".
  end.
- otherwise then recommend activity "Z".`;
    const celX = CEL.replace(/covers "T"\./, 'covers "X".').replace(/"D" is "Z"/, '"Main" is "Z"');
    const main = buildCrlStructure(graphFrom(X, celX)).find((x) => x.decision === "Main")!;
    const all = new Map<string, CrlStructureNode>();
    collect(main.children, all);
    expect(all.get("when[0]")!.refKeys).toEqual([nodeKey({ lib: "X", kind: "concept", name: "Z" })]);
    expect(all.get("when[0]/action[0]")!.refKeys).toEqual([nodeKey({ lib: "X", kind: "activity", name: "Z" })]);
    expect(all.get("when[0]/action[1]")!.refKeys).toEqual([nodeKey({ lib: "X", kind: "decision", name: "Z" })]);
  });

  it("degenerate: no policy anchor → []", () => {
    const graph = {
      filePath: "x.cel",
      cel: buildCEL(CEL).result,
      coversTarget: undefined,
      celParseErrors: [],
      diagnostics: [],
    } as unknown as ResolvedCelGraph;
    expect(buildCrlStructure(graph)).toEqual([]);
  });
});

function flattenKeys(nodes: CrlStructureNode[], acc: Set<string>): void {
  for (const n of nodes) {
    acc.add(n.nodeKey);
    flattenKeys(n.children, acc);
  }
}
function collect(nodes: CrlStructureNode[], acc: Map<string, CrlStructureNode>): void {
  for (const n of nodes) {
    acc.set(n.nodeId, n);
    collect(n.children, acc);
  }
}
