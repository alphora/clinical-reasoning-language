// Tests for the scenario view-model (roadmap item #2). renderScenario projects the CRE run into the
// stable CRE↔UI contract: the FULL decision tree (AST spine) overlaid with run state. Covers the
// reviewer-required cases: full-tree/preempted/condition-false, decision-not-found, guard/guarded-out,
// use-decision leaf, nested when, graph-no-resolve, multi-case envelope + schemaVersion.
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { renderScenario, SCENARIO_VIEW_MODEL_SCHEMA_VERSION, type ViewNode } from "../viewModel";

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

const byId = (nodes: ViewNode[], id: string): ViewNode | undefined => {
  for (const n of nodes) {
    if (n.nodeId === id) return n;
    const f = n.children ? byId(n.children, id) : undefined;
    if (f) return f;
  }
  return undefined;
};

const COVERAGE_CRL = `# T
library "T".
concept "Excl":
- type is Condition.
- code is \`excl\`.
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "D":
first:
- when "Excl" then recommend activity "Deny".
- when "Indic" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

const COVERAGE_CEL = `# TC
library "TC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
case "indication only":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Approve".
case "neither -> otherwise":
- subject is "Pat".
- result is "D" is "Deny".`;

describe("renderScenario — view-model (#item 2)", () => {
  it("builds the FULL tree from the AST spine, overlaying run state (preempted + condition-false body)", () => {
    const vm = renderScenario(graphFrom(COVERAGE_CRL, COVERAGE_CEL));
    expect(vm.schemaVersion).toBe(SCENARIO_VIEW_MODEL_SCHEMA_VERSION);
    expect(vm.schemaVersion).toBe(5); // #224 1→2 (concept→expr), 2→3 (`not` view), #236 3→4 (`criterion` view), #189 Slice 0b 4→5 (ExplanationView and/or/not)
    const indic = vm.scenarios.find((s) => s.case.name === "indication only")!;
    expect(indic.status).toBe("pass");
    // All THREE branches present (the CRE trace short-circuited away `otherwise`; the AST restores it).
    expect(indic.tree.map((n) => n.nodeId)).toEqual(["when[0]", "when[1]", "otherwise"]);

    const excl = byId(indic.tree, "when[0]")!;
    expect(excl).toMatchObject({ kind: "when", evaluated: true });
    expect(excl.condition).toMatchObject({ expr: { concept: { name: "Excl" } }, satisfied: false });
    // Excl's body action did NOT run (condition false) → reached:false, no preempted reason.
    const exclDeny = byId(indic.tree, "when[0]/action[0]")!;
    expect(exclDeny).toMatchObject({ kind: "action", evaluated: false });
    expect(exclDeny.action).toMatchObject({
      actionKind: "recommend-activity",
      target: { name: "Deny" },
      produced: false,
    });
    expect(exclDeny.unreachedReason).toBeUndefined();

    const indicNode = byId(indic.tree, "when[1]")!;
    expect(indicNode.condition).toMatchObject({ satisfied: true, facts: ["fIndic"] });
    const approve = byId(indic.tree, "when[1]/action[0]")!;
    expect(approve.action).toMatchObject({ target: { name: "Approve" }, produced: true });

    // `otherwise` was preempted by the Indic match → unreached + reason.
    const otherwise = byId(indic.tree, "otherwise")!;
    expect(otherwise).toMatchObject({
      kind: "otherwise",
      evaluated: false,
      unreachedReason: "preempted",
    });

    // produced summary + source span.
    expect(indic.produced).toEqual([
      { recommendation: "Approve", actionKind: "recommend-activity" },
    ]);
    expect(approve.source.filePath).toBe("inline.crl");
  });

  it("envelope: multi-case counts + schemaVersion", () => {
    const vm = renderScenario(graphFrom(COVERAGE_CRL, COVERAGE_CEL));
    expect(vm.success).toBe(true);
    expect({ caseCount: vm.caseCount, passCount: vm.passCount }).toEqual({
      caseCount: 2,
      passCount: 2,
    });
    expect(vm.source.celFilePath).toBe("inline.cel");
  });

  it("case filter renders only the named case", () => {
    const vm = renderScenario(graphFrom(COVERAGE_CRL, COVERAGE_CEL), {
      case: "neither -> otherwise",
    });
    expect(vm.scenarios.map((s) => s.case.name)).toEqual(["neither -> otherwise"]);
    // No facts matched → both whens unsatisfied, otherwise fires (Deny).
    const sc = vm.scenarios[0];
    expect(byId(sc.tree, "otherwise")).toMatchObject({ evaluated: true });
    expect(sc.produced).toEqual([{ recommendation: "Deny", actionKind: "recommend-activity" }]);
  });

  const GUARD_CRL = `# G
library "G".
concept "Indic":
- type is Condition.
- code is \`indic\`.
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Referral":
- request CPGCommunicationRequest.
- with \`r\`.
activity "Med":
- request CPGCommunicationRequest.
- with \`m\`.
decision "D":
- when "Indic" then:
  any:
  - recommend activity "Referral".
  - recommend activity "Med" unless "Contra".
  end.`;

  const GUARD_CEL = `# GC
library "GC".
covers "G".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
fact "fContra":
- date is "2026-01-01".
- defined by "Contra".
case "contraindicated":
- subject is "Pat".
- fact is "fIndic".
- fact is "fContra".
- result is "D" is "Referral".`;

  it("surfaces guard provenance + guardedOut + the any: qualifier on action nodes", () => {
    const vm = renderScenario(graphFrom(GUARD_CRL, GUARD_CEL));
    const sc = vm.scenarios[0];
    const med = byId(sc.tree, "when[0]/action[1]")!;
    expect(med.action).toMatchObject({
      target: { name: "Med" },
      qualifier: "any",
      produced: false,
    });
    expect(med.guardedOut).toBe(true);
    expect(med.guard).toMatchObject({
      polarity: "unless",
      concept: { name: "Contra" },
      evaluated: true,
      satisfied: true,
    });
    const referral = byId(sc.tree, "when[0]/action[0]")!;
    expect(referral.action).toMatchObject({ qualifier: "any", produced: true });
  });

  it("decision-not-found → status error, decision {resolved:false}, empty tree", () => {
    const cel = COVERAGE_CEL.replace('result is "D" is "Approve"', 'result is "Missing" is "X"');
    const vm = renderScenario(graphFrom(COVERAGE_CRL, cel));
    const sc = vm.scenarios.find((s) => s.case.name === "indication only")!;
    expect(sc.status).toBe("error");
    expect(sc.decision).toEqual({ name: "Missing", resolved: false });
    expect(sc.tree).toEqual([]);
    expect(vm.success).toBe(false);
  });

  it("graph that does not resolve → success:false, errors, no scenarios", () => {
    const broken: ResolvedCelGraph = { filePath: "x.cel", celParseErrors: [], diagnostics: [] };
    const vm = renderScenario(broken);
    expect(vm.success).toBe(false);
    expect(vm.scenarios).toEqual([]);
    expect(vm.errors.length).toBeGreaterThan(0);
  });

  const USE_CRL = `# U
library "U".
concept "Indic":
- type is Condition.
- code is \`i\`.
activity "SubRec":
- request CPGCommunicationRequest.
- with \`sr\`.
decision "Sub":
first:
- otherwise then recommend activity "SubRec".
decision "D":
- when "Indic" then:
  - use decision "Sub".
  end.`;

  const USE_CEL = `# UC
library "UC".
covers "U".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
case "uses sub":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "SubRec".`;

  it("recurses a same-library use-decision: expanded:true, sub-tree inlined, sub's determination produced (REPLACE)", () => {
    const vm = renderScenario(graphFrom(USE_CRL, USE_CEL));
    const sc = vm.scenarios[0];
    expect(sc.status).toBe("pass");
    const use = byId(sc.tree, "when[0]/action[0]")!;
    // The use-decision node itself is NOT produced (it delegates); it is expanded with Sub's body inlined under it.
    expect(use.action).toMatchObject({
      actionKind: "use-decision",
      target: { name: "Sub" },
      produced: false,
      expanded: true,
    });
    // Sub's body recursed UNDER the use-decision action's nodeId.
    const subRec = byId(sc.tree, "when[0]/action[0]/otherwise/action[0]")!;
    expect(subRec.action).toMatchObject({
      actionKind: "recommend-activity",
      target: { name: "SubRec" },
      produced: true,
    });
    // The bare sub-name "Sub" is NOT in the produced summary; the delegated determination "SubRec" IS (REPLACE).
    expect(sc.produced).toEqual([{ recommendation: "SubRec", actionKind: "recommend-activity" }]);
  });

  const XLIB_CRL = `# XU
library "XU".
concept "Indic":
- type is Condition.
- code is \`i\`.
decision "D":
- when "Indic" then:
  - use decision "Other"."Sub".
  end.`;

  const XLIB_CEL = `# XUC
library "XUC".
covers "XU".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
case "uses cross-lib sub":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Sub".`;

  it("an UNRESOLVED cross-library use-decision stays a leaf: expanded:false, no children, not produced", () => {
    // The target library "Other" is not in this single-lib graph (no registry) → unresolved → leaf (#172: a RESOLVABLE
    // cross-lib target instead recurses + expands — covered by the multi-lib eval tests + the spine parity golden).
    const vm = renderScenario(graphFrom(XLIB_CRL, XLIB_CEL));
    const sc = vm.scenarios[0];
    const use = byId(sc.tree, "when[0]/action[0]")!;
    expect(use.action).toMatchObject({
      actionKind: "use-decision",
      target: { name: "Sub" },
      produced: false,
      expanded: false,
    });
    expect(use.children).toBeUndefined();
    expect(sc.produced).toEqual([]);
    // The distinct unresolved-cross-lib diagnostic — "deferred" is GONE from the cross-lib path (#172 todo-2).
    expect(
      sc.diagnostics.some((d) =>
        /cross-library `use decision`.*not found in the resolved graph/.test(d),
      ),
    ).toBe(true);
    expect(sc.diagnostics.some((d) => /deferred/.test(d))).toBe(false);
  });

  // #172: a RESOLVABLE cross-library use-decision EXPANDS in the VM — the shared sub's body becomes the node's children,
  // `expanded:true`, and `target.libraryName` carries the sub's owning lib (so #175's decomposer re-roots into its frame).
  const X_POLICY_CRL = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Shared"."Sub".
  end.`;
  const X_SHARED_CRL = `# Shared
library "Shared".
concept "Crit":
- type is Condition.
- code is \`crit\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "Sub":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
  const X_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
fact "fCrit":
- date is "2026-01-01".
- defined by "Shared"."Crit".
case "c":
- subject is "Pat".
- fact is "fIndic".
- fact is "fCrit".
- result is "D" is "Approve".`;

  it("#172: a RESOLVABLE cross-library use-decision expands; target.libraryName = the sub's lib; spans → sub's file", () => {
    const policy = parseInput(X_POLICY_CRL);
    const shared = parseInput(X_SHARED_CRL);
    const built = buildCEL(X_CEL);
    if (!built.success || !built.result) throw new Error("CEL build failed");
    const entry = (
      ast: ReturnType<typeof parseInput>,
      fp: string,
      origin: RegistryEntry["origin"],
    ): RegistryEntry => ({
      name: ast.library.name,
      filePath: fp,
      ast,
      isRoot: origin === "root",
      origin,
    });
    const graph: ResolvedCelGraph = {
      filePath: "policy.cel",
      cel: built.result,
      coversTarget: entry(policy, "policy.crl", "root"),
      crlRegistry: {
        byNameLocal: new Map([["Shared", entry(shared, "shared.crl", "local")]]),
        byNamePackage: new Map(),
      },
      celParseErrors: [],
      diagnostics: [],
    };
    const sc = renderScenario(graph).scenarios[0];
    const use = byId(sc.tree, "when[0]/action[0]")!;
    expect(use.action).toMatchObject({
      actionKind: "use-decision",
      produced: false,
      expanded: true,
    });
    // target.libraryName = the resolved sub's owning library (the qualified ref already carries it; #175 re-root anchor).
    expect(use.action!.target.libraryName).toBe("Shared");
    // The sub's body is inlined as children; the Approve leaf nests under Sub's when[0], with its span in the SUB'S file.
    const approve = byId(sc.tree, "when[0]/action[0]/when[0]/action[0]")!;
    expect(approve.action).toMatchObject({
      actionKind: "recommend-activity",
      target: { name: "Approve" },
      produced: true,
    });
    expect(approve.source.filePath).toBe("shared.crl");
    // REPLACE: the bubbled produced name is the bare activity, not "Sub".
    expect(sc.produced).toEqual([{ recommendation: "Approve", actionKind: "recommend-activity" }]);
  });

  const NESTED_CRL = `# N
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
decision "D":
- when "A" then:
  first:
  - when "B" then recommend activity "X".
  end.`;

  const NESTED_CEL = `# NC
library "NC".
covers "N".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- date is "2026-01-01".
- defined by "A".
fact "fB":
- date is "2026-01-01".
- defined by "B".
case "nested":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "D" is "X".`;

  it("walks nested when→when branches (children populated in executed mode, not only skeletons)", () => {
    const vm = renderScenario(graphFrom(NESTED_CRL, NESTED_CEL));
    const sc = vm.scenarios[0];
    expect(sc.status).toBe("pass");
    const outer = byId(sc.tree, "when[0]")!;
    expect(outer.condition).toMatchObject({ expr: { concept: { name: "A" } }, satisfied: true });
    const inner = byId(sc.tree, "when[0]/when[0]")!;
    expect(inner).toMatchObject({ kind: "when", evaluated: true });
    expect(inner.condition).toMatchObject({ expr: { concept: { name: "B" } }, satisfied: true });
    expect(byId(sc.tree, "when[0]/when[0]/action[0]")).toMatchObject({
      action: { target: { name: "X" }, produced: true },
    });
  });

  const COMP_CRL = `# C
library "C".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
concept "Both":
- defined as ( "A" sem-and "B" ).
activity "Go":
- request CPGCommunicationRequest.
- with \`g\`.
decision "D":
- when "Both" then recommend activity "Go".`;

  const COMP_CEL = `# CC
library "CC".
covers "C".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- date is "2026-01-01".
- defined by "C"."A".
fact "fB":
- date is "2026-01-01".
- defined by "C"."B".
case "both -> go":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "D" is "Go".`;

  it("projects the defined-as composition into condition.explanation + populates decision.libraryName", () => {
    const vm = renderScenario(graphFrom(COMP_CRL, COMP_CEL));
    const sc = vm.scenarios[0];
    expect(sc.decision).toMatchObject({ name: "D", libraryName: "C", resolved: true });
    const both = byId(sc.tree, "when[0]")!;
    expect(both.condition?.satisfied).toBe(true);
    // #224: the leaf `defined as` explanation now lives on the guard expression's ref leaf.
    const leaf = both.condition?.expr;
    const exp = leaf && leaf.op === "ref" ? leaf.explanation : undefined;
    expect(exp).toMatchObject({ op: "sem-and", satisfied: true });
    if (exp?.op === "sem-and") {
      expect(exp.operands.map((o) => o.op)).toEqual(["ref", "ref"]);
      expect(exp.operands.every((o) => o.satisfied)).toBe(true);
      expect(exp.operands.map((o) => (o.op === "ref" ? o.concept.name : null))).toEqual(["A", "B"]);
    }
  });

  const ONLYWHEN_CRL = `# O
library "O".
concept "Indic":
- type is Condition.
- code is \`i\`.
concept "Eligible":
- type is Condition.
- code is \`e\`.
activity "Treat":
- request CPGCommunicationRequest.
- with \`t\`.
decision "D":
- when "Indic" then:
  any:
  - recommend activity "Treat" only when "Eligible".
  end.`;

  const ONLYWHEN_CEL = `# OC
library "OC".
covers "O".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
case "indic but not eligible -> treat excluded":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Treat".`;

  it("only-when guard: excluded when the gate concept is unsatisfied", () => {
    const vm = renderScenario(graphFrom(ONLYWHEN_CRL, ONLYWHEN_CEL));
    const sc = vm.scenarios[0];
    const treat = byId(sc.tree, "when[0]/action[0]")!;
    expect(treat.guardedOut).toBe(true);
    expect(treat.guard).toMatchObject({
      polarity: "only-when",
      concept: { name: "Eligible" },
      evaluated: true,
      satisfied: false,
    });
    expect(treat.action?.produced).toBe(false);
    expect(sc.status).toBe("fail"); // Treat not produced → the result-is "Treat" oracle fails
  });

  const ALL_CRL = `# AL
library "AL".
concept "X":
- type is Condition.
- code is \`x\`.
concept "Y":
- type is Condition.
- code is \`y\`.
activity "DoX":
- request CPGCommunicationRequest.
- with \`dx\`.
activity "DoY":
- request CPGCommunicationRequest.
- with \`dy\`.
decision "D":
all:
- when "X" then recommend activity "DoX".
- when "Y" then recommend activity "DoY".`;

  const ALL_CEL = `# ALC
library "ALC".
covers "AL".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fX":
- date is "2026-01-01".
- defined by "X".
case "only X":
- subject is "Pat".
- fact is "fX".
- result is "D" is "DoX".`;

  it("all: block — an unsatisfied branch is evaluated (satisfied:false), NOT preempted", () => {
    const vm = renderScenario(graphFrom(ALL_CRL, ALL_CEL));
    const sc = vm.scenarios[0];
    expect(byId(sc.tree, "when[0]")!.condition).toMatchObject({ satisfied: true });
    const y = byId(sc.tree, "when[1]")!;
    expect(y.evaluated).toBe(true);
    expect(y.condition?.satisfied).toBe(false);
    expect(y.unreachedReason).toBeUndefined();
  });

  const PREEMPT_CEL = `# PC
library "PC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fExcl":
- date is "2026-01-01".
- defined by "Excl".
case "exclusion -> deny, indic preempted":
- subject is "Pat".
- fact is "fExcl".
- result is "D" is "Deny".`;

  it("graph-fail envelope folds structured parse + resolver diagnostics into errors", () => {
    const failGraph = {
      filePath: "bad.cel",
      celParseErrors: [{ message: "CEL parse error: unexpected token" }],
      diagnostics: [
        {
          kind: "unresolved-covers",
          severity: "error",
          coversName: "MissingLib",
          filePath: "bad.cel",
        },
      ],
    } as unknown as ResolvedCelGraph;
    const vm = renderScenario(failGraph);
    expect(vm.success).toBe(false);
    expect(vm.errors).toContain("CEL parse error: unexpected token");
    expect(vm.errors.some((e) => e.includes("MissingLib"))).toBe(true);
  });

  it("a when preempted by a prior first: match → unreached, condition.satisfied absent, facts empty", () => {
    const vm = renderScenario(graphFrom(COVERAGE_CRL, PREEMPT_CEL));
    const sc = vm.scenarios[0];
    expect(sc.status).toBe("pass");
    expect(byId(sc.tree, "when[0]")!.condition).toMatchObject({ satisfied: true }); // Excl matched
    const indic = byId(sc.tree, "when[1]")!; // preempted
    expect(indic).toMatchObject({ evaluated: false, unreachedReason: "preempted" });
    expect(indic.condition?.satisfied).toBeUndefined();
    expect(indic.condition?.facts).toEqual([]);
  });
});
