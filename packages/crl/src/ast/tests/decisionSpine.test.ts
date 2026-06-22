import { parseInput } from "./parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { renderScenario, type ViewNode } from "../../cre/viewModel";
import { decisionSpine } from "../decisionSpine";
import type { Decision } from "../types";

function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const coversTarget: RegistryEntry = { name: crl.library.name, filePath: "inline.crl", ast: crl, isRoot: true, origin: "root" };
  return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
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
  it("produces the expected decision-local childId paths for D", () => {
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
    const spineIds = new Set(decisionSpine(d).map((n) => n.nodeId));
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
});
