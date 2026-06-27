import { join } from "path";

import { collectDecisionArmsTransitive } from "../../ast/decisionArms";
import { buildGlobalDecisionMap, makeResolveDecision } from "../../ast/decisionResolver";
import { parseInput } from "../../ast/tests/parseInput";
import type { CRL, Decision } from "../../ast/types";
import { buildCEL } from "../../cel";
import { resolveCelImports } from "../../cel/imports";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { runCel } from "../run";

/**
 * Unit-test the evaluator on inline CRL+CEL by assembling a ResolvedCelGraph
 * directly (bypasses the import resolver / project root). The covered library is
 * the parsed CRL; the CEL's `defined by` refs resolve against it.
 */
function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) {
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  }
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

function statuses(crlSrc: string, celSrc: string): string[] {
  return runCel(graphFrom(crlSrc, celSrc)).runs.map((r) => `${r.case}:${r.status}`);
}

/** Structural invariant: every produced recommendation is a TRANSITIVE arm of its decision (the produced set now
 *  bubbles delegated sub-decision determinations up via `use decision`, so the bound must be the transitive arms). */
function assertProducedSubsetOfArms(crlSrc: string, celSrc: string): void {
  const crl = parseInput(crlSrc);
  const r = runCel(graphFrom(crlSrc, celSrc));
  const rootLib = crl.library.name ?? "";
  const map = buildGlobalDecisionMap({
    coveredLib: rootLib,
    coveredFilePath: "inline.crl",
    coveredStatements: crl.statements.filter((s): s is Decision => s.type === "Decision"),
  });
  const resolve = makeResolveDecision(map);
  const byName = (name: string): Decision | undefined =>
    crl.statements.find((s): s is Decision => s.type === "Decision" && s.name === name);
  for (const run of r.runs) {
    if (!run.decision) continue;
    const d = byName(run.decision);
    const arms = d ? collectDecisionArmsTransitive(d, resolve, rootLib) : new Set<string>();
    for (const p of run.produced) {
      expect(arms.has(p.recommendation)).toBe(true);
    }
  }
}

describe("CRE — runCel", () => {
  it("dme101-030: all 3 real cases pass against the fixture (end-to-end)", () => {
    const celPath = join(__dirname, "../../tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = runCel(resolveCelImports(celPath));
    expect(r.success).toBe(true);
    expect(r.runs.length).toBe(3);
    expect(r.runs.every((x) => x.status === "pass")).toBe(true);
  });

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
fact "fExcl":
- code is "http://example.org|excl".
- date is "2026-01-01".
- defined by "Excl".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "indication only -> approve":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Approve".
case "exclusion wins over indication -> deny":
- subject is "Pat".
- fact is "fIndic".
- fact is "fExcl".
- result is "D" is "Deny".
case "neither -> otherwise deny":
- subject is "Pat".
- result is "D" is "Deny".`;

  it("first:/otherwise precedence — exclusion wins over a satisfied indication", () => {
    expect(statuses(COVERAGE_CRL, COVERAGE_CEL)).toEqual([
      "indication only -> approve:pass",
      "exclusion wins over indication -> deny:pass",
      "neither -> otherwise deny:pass",
    ]);
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
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "no contraindication -> med offered":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Med".
case "contraindication -> med dropped, referral still offered":
- subject is "Pat".
- fact is "fIndic".
- fact is "fContra".
- result is "D" is "Referral".
case "contraindication -> med is NOT produced (expected fail)":
- subject is "Pat".
- fact is "fIndic".
- fact is "fContra".
- result is "D" is "Med".`;

  it("unless guard — med offered unless contraindicated; referral always offered", () => {
    expect(statuses(GUARD_CRL, GUARD_CEL)).toEqual([
      "no contraindication -> med offered:pass",
      "contraindication -> med dropped, referral still offered:pass",
      "contraindication -> med is NOT produced (expected fail):fail",
    ]);
  });

  it("produces a trace with guard provenance", () => {
    const r = runCel(graphFrom(GUARD_CRL, GUARD_CEL));
    const contraRun = r.runs.find((x) => x.case.startsWith("contraindication -> med dropped"))!;
    // The Med menu item should be recorded as guarded-out under the contraindication.
    const menu = contraRun.trace[0].children ?? [];
    const med = menu.find((n) => n.node === "Med");
    expect(med?.guardedOut).toBe(true);
    expect(med?.guard?.concept).toBe("Contra");
    expect(contraRun.produced.map((p) => p.recommendation)).toEqual(["Referral"]);
  });

  it("trace nodes carry decision-relative nodeId paths + a covered-library source span", () => {
    // Roadmap item #2 prerequisite (#132 follow-on): the trace is the view-model's alignment key.
    const r = runCel(graphFrom(COVERAGE_CRL, COVERAGE_CEL));
    const indic = r.runs.find((x) => x.case.startsWith("indication only"))!;
    // first:: when[0]"Excl" (unsatisfied, body not run), when[1]"Indic" (satisfied → action),
    // otherwise short-circuited away — so the EXECUTED trace stops at the match. The full tree
    // (incl. the absent `otherwise`) is reconstructed by the view-model from the AST.
    expect(indic.trace.map((n) => n.nodeId)).toEqual(["when[0]", "when[1]"]);
    const excl = indic.trace[0];
    expect(excl).toMatchObject({
      nodeId: "when[0]",
      kind: "when",
      concept: "Excl",
      satisfied: false,
    });
    expect(excl.children).toEqual([]); // unsatisfied → body not executed
    const indicNode = indic.trace[1];
    expect(indicNode).toMatchObject({ nodeId: "when[1]", kind: "when", satisfied: true });
    expect(indicNode.children?.[0]).toMatchObject({
      nodeId: "when[1]/action[0]",
      kind: "action",
      node: "Approve",
    });
    // source span: the covered library file, a well-formed 0-based range.
    expect(indicNode.source.filePath).toBe("inline.crl");
    const rng = indicNode.source.range;
    expect(rng.startLine).toBeGreaterThanOrEqual(0);
    expect(
      rng.endLine > rng.startLine || (rng.endLine === rng.startLine && rng.endCol > rng.startCol),
    ).toBe(true);
  });

  const ALL_CRL = `# A
library "A".
concept "NeedsImaging":
- type is Condition.
- code is \`img\`.
concept "NeedsLabs":
- type is Condition.
- code is \`lab\`.
activity "OrderImaging":
- request CPGCommunicationRequest.
- with \`i\`.
activity "OrderLabs":
- request CPGCommunicationRequest.
- with \`l\`.
decision "D":
all:
- when "NeedsImaging" then recommend activity "OrderImaging".
- when "NeedsLabs" then recommend activity "OrderLabs".`;

  const ALL_CEL = `# AC
library "AC".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fImg":
- code is "http://example.org|img".
- date is "2026-01-01".
- defined by "NeedsImaging".
fact "fLab":
- code is "http://example.org|lab".
- date is "2026-01-01".
- defined by "NeedsLabs".
case "both -> imaging fires":
- subject is "Pat".
- fact is "fImg".
- fact is "fLab".
- result is "D" is "OrderImaging".
case "both -> labs ALSO fires (all: does not short-circuit)":
- subject is "Pat".
- fact is "fImg".
- fact is "fLab".
- result is "D" is "OrderLabs".
case "imaging only -> labs branch did NOT fire (expected fail)":
- subject is "Pat".
- fact is "fImg".
- result is "D" is "OrderLabs".`;

  it("all: over branches — every matching branch fires (no short-circuit)", () => {
    expect(statuses(ALL_CRL, ALL_CEL)).toEqual([
      "both -> imaging fires:pass",
      "both -> labs ALSO fires (all: does not short-circuit):pass",
      "imaging only -> labs branch did NOT fire (expected fail):fail",
    ]);
  });

  const ONLYWHEN_CRL = `# O
library "O".
concept "Indic":
- type is Condition.
- code is \`indic\`.
concept "ImgEligible":
- type is Condition.
- code is \`eimg\`.
concept "SpecEligible":
- type is Condition.
- code is \`espec\`.
activity "Imaging":
- request CPGCommunicationRequest.
- with \`i\`.
activity "Specialist":
- request CPGCommunicationRequest.
- with \`s\`.
decision "D":
- when "Indic" then:
  any:
  - recommend activity "Imaging" only when "ImgEligible".
  - recommend activity "Specialist" only when "SpecEligible".
  end.`;

  const ONLYWHEN_CEL = `# OC
library "OC".
covers "O".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fImgElig":
- code is "http://example.org|eimg".
- date is "2026-01-01".
- defined by "ImgEligible".
fact "fSpecElig":
- code is "http://example.org|espec".
- date is "2026-01-01".
- defined by "SpecEligible".
case "imaging-eligible -> imaging offered":
- subject is "Pat".
- fact is "fIndic".
- fact is "fImgElig".
- result is "D" is "Imaging".
case "specialist-eligible -> specialist offered":
- subject is "Pat".
- fact is "fIndic".
- fact is "fSpecElig".
- result is "D" is "Specialist".
case "neither eligible -> whole menu guarded out (expected fail)":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Imaging".`;

  it("only when guard — item offered only when its condition holds", () => {
    expect(statuses(ONLYWHEN_CRL, ONLYWHEN_CEL)).toEqual([
      "imaging-eligible -> imaging offered:pass",
      "specialist-eligible -> specialist offered:pass",
      "neither eligible -> whole menu guarded out (expected fail):fail",
    ]);
  });

  it("a menu with every item guarded out produces nothing + a diagnostic", () => {
    const r = runCel(graphFrom(ONLYWHEN_CRL, ONLYWHEN_CEL));
    const empty = r.runs.find((x) => x.case.startsWith("neither eligible"))!;
    expect(empty.produced).toEqual([]);
    expect(empty.diagnostics.some((d) => /guarded out/.test(d))).toBe(true);
  });

  it("produced is always a subset of the decision's declared arms (structural invariant)", () => {
    assertProducedSubsetOfArms(COVERAGE_CRL, COVERAGE_CEL);
    assertProducedSubsetOfArms(GUARD_CRL, GUARD_CEL);
    assertProducedSubsetOfArms(ALL_CRL, ALL_CEL);
    assertProducedSubsetOfArms(ONLYWHEN_CRL, ONLYWHEN_CEL);
  });

  // ── transitive `use decision` (#166) ──────────────────────────────────────────────────────────────────

  const DELEG_CRL = `# DG
library "DG".
concept "Indic":
- type is Condition.
- code is \`indic\`.
concept "Severe":
- type is Condition.
- code is \`sev\`.
activity "Escalate":
- request CPGCommunicationRequest.
- with \`e\`.
activity "Routine":
- request CPGCommunicationRequest.
- with \`r\`.
decision "Sub":
first:
- when "Severe" then recommend activity "Escalate".
- otherwise then recommend activity "Routine".
decision "D":
- when "Indic" then:
  - use decision "Sub".
  end.`;

  const DELEG_CEL = `# DGC
library "DGC".
covers "DG".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fSevere":
- code is "http://example.org|sev".
- date is "2026-01-01".
- defined by "Severe".
case "severe -> sub escalates":
- subject is "Pat".
- fact is "fIndic".
- fact is "fSevere".
- result is "D" is "Escalate".
case "not severe -> sub routine":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Routine".`;

  it("delegation: a same-library use decision recurses; the sub's determination satisfies the oracle", () => {
    expect(statuses(DELEG_CRL, DELEG_CEL)).toEqual([
      "severe -> sub escalates:pass",
      "not severe -> sub routine:pass",
    ]);
  });

  it("REPLACE: the bare sub-decision NAME is NOT in produced — only the sub's determinations bubble up", () => {
    const r = runCel(graphFrom(DELEG_CRL, DELEG_CEL));
    const severe = r.runs.find((x) => x.case.startsWith("severe"))!;
    const names = severe.produced.map((p) => p.recommendation);
    expect(names).toEqual(["Escalate"]);
    expect(names).not.toContain("Sub"); // delegation, not a disposition
    // The use-decision trace node carries the recursed sub-tree as children (Escalate is nested under Sub's when[0]).
    const useNode = severe.trace[0].children?.find((n) => n.node === "Sub");
    const hasNode = (ns: typeof severe.trace, name: string): boolean =>
      ns.some((n) => n.node === name || (n.children ? hasNode(n.children, name) : false));
    expect(useNode?.children && hasNode(useNode.children, "Escalate")).toBe(true);
  });

  const CYCLE_CRL = `# CY
library "CY".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D2":
- when "Indic" then:
  - use decision "D".
  end.
decision "D":
- when "Indic" then:
  - use decision "D2".
  end.`;

  const CYCLE_CEL = `# CYC
library "CYC".
covers "CY".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "cycle":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "D2".`;

  it("cycle: D → D2 → D delegation cycle yields status:error + a cycle diagnostic (no hang)", () => {
    const r = runCel(graphFrom(CYCLE_CRL, CYCLE_CEL));
    const run = r.runs[0];
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /delegation cycle/.test(d))).toBe(true);
  });

  // #172: the delegation-cycle chain is keyed `(lib,name)` internally but rendered by NAME via `nameOf` — pin the EXACT
  // message byte-for-byte through the REAL CRE guard (the run.ts delegationStack + the nameOf/idOf round-trip in the
  // diagnostic path), so a future idOf encoding change can't silently corrupt it. Same-lib → bare names, no JSON leaks.
  it("cycle: the diagnostic renders the chain by name byte-identically (D → D2 → D, no (lib,name) keys leak)", () => {
    const r = runCel(graphFrom(CYCLE_CRL, CYCLE_CEL));
    expect(r.runs[0].diagnostics).toContain("decision delegation cycle: D → D2 → D");
  });

  // ── #172 todo-2: cross-library `use decision` EVALUATES transitively (the four XLIB deferral tests FLIP). ─────────

  // Multi-library graph harness: a root "Policy" lib (covered) delegating to a sibling local "Shared" lib's determination
  // sub. The single-lib `graphFrom` has no crlRegistry, so a cross-lib target can't resolve there — this adds one.
  function multiLibGraph(
    rootCrl: string,
    sharedLibs: { src: string; origin?: RegistryEntry["origin"]; filePath?: string }[],
    celSrc: string,
  ): ResolvedCelGraph {
    const policy = parseInput(rootCrl);
    const built = buildCEL(celSrc);
    if (!built.success || !built.result)
      throw new Error("CEL build failed: " + JSON.stringify(built.errors));
    const entry = (ast: CRL, fp: string, origin: RegistryEntry["origin"]): RegistryEntry => ({
      name: ast.library.name,
      filePath: fp,
      ast,
      isRoot: origin === "root",
      origin,
    });
    const byNameLocal = new Map<string, RegistryEntry>();
    const byNamePackage = new Map<string, RegistryEntry>();
    sharedLibs.forEach((lib, i) => {
      const ast = parseInput(lib.src);
      const e = entry(ast, lib.filePath ?? `shared${i}.crl`, lib.origin ?? "local");
      (e.origin === "package" ? byNamePackage : byNameLocal).set(ast.library.name ?? `lib${i}`, e);
    });
    return {
      filePath: "policy.cel",
      cel: built.result,
      coversTarget: entry(policy, "policy.crl", "root"),
      crlRegistry: { byNameLocal, byNamePackage },
      celParseErrors: [],
      diagnostics: [],
    };
  }

  // Root policy: covers "D", which delegates the determination to the SHARED library's "Sub".
  const POLICY_CRL = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Shared"."Sub".
  end.`;

  // The shared determination library: "Sub" recommends Approve/Deny on its OWN criterion concept "Crit".
  const SHARED_CRL = `# Shared
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

  // CEL covers "D"; the fact QUALIFIES its criterion against the SHARED lib (`defined by "Shared"."Crit"`) — contract A.
  const QUALIFIED_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fCrit":
- code is "http://example.org|crit".
- date is "2026-01-01".
- defined by "Shared"."Crit".
case "qualified crit -> sub approves":
- subject is "Pat".
- fact is "fIndic".
- fact is "fCrit".
- result is "D" is "Approve".
case "no crit -> sub denies (otherwise)":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Deny".`;

  it("#172: a cross-library use decision EVALUATES — the shared sub's disposition (Approve/Deny) satisfies the oracle", () => {
    const r = runCel(multiLibGraph(POLICY_CRL, [{ src: SHARED_CRL }], QUALIFIED_CEL));
    expect(r.runs.map((x) => `${x.case}:${x.status}`)).toEqual([
      "qualified crit -> sub approves:pass",
      "no crit -> sub denies (otherwise):pass",
    ]);
    // No deferred diagnostic anywhere — the cross-lib path is now evaluated, not refused.
    for (const run of r.runs) {
      expect(run.diagnostics.some((d) => /deferred/.test(d))).toBe(false);
    }
  });

  it("#172 REPLACE: the bubbled name is the sub's BARE activity name (Approve), not 'Sub'", () => {
    const r = runCel(multiLibGraph(POLICY_CRL, [{ src: SHARED_CRL }], QUALIFIED_CEL));
    const approve = r.runs.find((x) => x.case.startsWith("qualified"))!;
    const names = approve.produced.map((p) => p.recommendation);
    expect(names).toEqual(["Approve"]);
    expect(names).not.toContain("Sub");
    // The cross-lib use-decision trace node carries the recursed sub-tree; Approve nests under Shared.Sub's when[0].
    const useNode = approve.trace[0].children?.find((n) => n.node === "Sub");
    const hasNode = (ns: typeof approve.trace, name: string): boolean =>
      ns.some((n) => n.node === name || (n.children ? hasNode(n.children, name) : false));
    expect(useNode?.children && hasNode(useNode.children, "Approve")).toBe(true);
    // The sub's trace spans point at the SUB'S file (frame currentFilePath), not the policy file.
    const approveLeaf = useNode!.children!.find((n) => n.node === "when Crit")!.children![0];
    expect(approveLeaf.source.filePath).toBe("shared0.crl");
  });

  // Contract A (STRICT): a BARE `defined by "Crit"` (unqualified) keys under the COVERED lib, NOT the shared lib — so it
  // does NOT satisfy the cross-lib sub's bare `when "Crit"` (which resolves in Shared, closed-world). The run must DIFFER
  // from the qualified case: the sub falls to `otherwise` → Deny, not Approve. Mirrors #170's rx501 lib-keying rigor.
  const BARE_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fCritBare":
- code is "http://example.org|crit".
- date is "2026-01-01".
- defined by "Crit".
case "bare crit -> does NOT satisfy the cross-lib criterion -> sub denies":
- subject is "Pat".
- fact is "fIndic".
- fact is "fCritBare".
- result is "D" is "Deny".`;

  it('#172 contract A: a BARE `defined by "Crit"` does NOT satisfy the cross-lib sub\'s criterion (lib-keying is real)', () => {
    const bare = runCel(multiLibGraph(POLICY_CRL, [{ src: SHARED_CRL }], BARE_CEL));
    // Bare crit keys under Policy, not Shared → the sub's `when "Crit"` (resolved in Shared) is UNSATISFIED → otherwise → Deny.
    expect(bare.runs[0].status).toBe("pass"); // oracle expects Deny, and Deny is produced
    expect(bare.runs[0].produced.map((p) => p.recommendation)).toEqual(["Deny"]);
    // Prove the run DIFFERS from the qualified case: the qualified crit DID reach Approve.
    const qualified = runCel(multiLibGraph(POLICY_CRL, [{ src: SHARED_CRL }], QUALIFIED_CEL));
    const qApprove = qualified.runs.find((x) => x.case.startsWith("qualified"))!;
    expect(qApprove.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  // UNRESOLVED: the target library is not in the graph at all → the distinct `unresolved-cross-lib` diagnostic, no production.
  const UNRESOLVED_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "missing shared lib":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Sub".`;

  it("#172 unresolved: a cross-lib target whose library is absent → unresolved-cross-lib diagnostic, no production", () => {
    // No shared libs in the registry → "Shared"."Sub" can't resolve.
    const r = runCel(multiLibGraph(POLICY_CRL, [], UNRESOLVED_CEL));
    const run = r.runs[0];
    expect(run.produced).toEqual([]);
    expect(run.status).toBe("fail"); // the "Sub" oracle can't be satisfied
    // The distinct unresolved-cross-lib message — NOT "deferred", NOT the bare not-found-in-current-lib message.
    expect(
      run.diagnostics.some((d) =>
        /cross-library `use decision`.*not found in the resolved graph/.test(d),
      ),
    ).toBe(true);
    expect(run.diagnostics.some((d) => /deferred/.test(d))).toBe(false);
    expect(run.diagnostics.some((d) => /not found in library/.test(d))).toBe(false);
    // FIX 4 (preserved): the lone menu item is an unresolved delegation, not a guard-exclusion.
    expect(run.diagnostics.some((d) => /guarded out/.test(d))).toBe(false);
    expect(run.diagnostics.some((d) => /determined a recommendation/.test(d))).toBe(true);
  });

  // FIX 2: a BARE `use decision "Missing"` INSIDE a cross-library sub must blame the SUB'S library (frame.currentLib),
  // not the covered policy lib. Shared.Sub delegates to a bare "Missing" that exists in NEITHER lib → the not-found
  // message names `Shared`, the frame it was resolved in.
  const SHARED_BAD_CRL = `# Shared
library "Shared".
concept "Crit":
- type is Condition.
- code is \`crit\`.
decision "Sub":
- when "Crit" then:
  - use decision "Missing".
  end.`;
  const FIX2_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fCrit":
- code is "http://example.org|crit".
- date is "2026-01-01".
- defined by "Shared"."Crit".
case "bare missing inside the shared sub":
- subject is "Pat".
- fact is "fIndic".
- fact is "fCrit".
- result is "D" is "Approve".`;

  it("#172 FIX 2: a bare unresolved `use decision` inside a cross-lib sub blames the SUB'S library, not the policy", () => {
    const r = runCel(multiLibGraph(POLICY_CRL, [{ src: SHARED_BAD_CRL }], FIX2_CEL));
    const run = r.runs[0];
    // The bare "Missing" resolves in frame.currentLib = Shared → the message names `Shared`, NOT `Policy`.
    expect(run.diagnostics.some((d) => /`use decision "Missing"` target not found in library `Shared`/.test(d))).toBe(true);
    expect(run.diagnostics.some((d) => /not found in library `Policy`/.test(d))).toBe(false);
  });

  // FIX 3: a SELF-QUALIFIED same-library `use decision "Policy"."Sub"` (was deferred pre-#172) now RESOLVES (resolved.lib
  // === currentLib) and EVALUATES exactly like the bare form — produces the sub's disposition; nodeId parity holds. This
  // is a deliberate NEW evaluation, not a same-lib byte-identity regression (only the BARE same-lib form is byte-identical).
  const SELFQ_CRL = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
concept "Severe":
- type is Condition.
- code is \`sev\`.
activity "Escalate":
- request CPGCommunicationRequest.
- with \`e\`.
activity "Routine":
- request CPGCommunicationRequest.
- with \`r\`.
decision "Sub":
first:
- when "Severe" then recommend activity "Escalate".
- otherwise then recommend activity "Routine".
decision "D":
- when "Indic" then:
  - use decision "Policy"."Sub".
  end.`;
  const SELFQ_CEL = `# Cases
library "Cases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fSevere":
- code is "http://example.org|sev".
- date is "2026-01-01".
- defined by "Severe".
case "self-qualified sub escalates":
- subject is "Pat".
- fact is "fIndic".
- fact is "fSevere".
- result is "D" is "Escalate".`;

  it("#172 FIX 3: a SELF-qualified same-lib `use decision \"Policy\".\"Sub\"` evaluates like the bare form", () => {
    const r = runCel(graphFrom(SELFQ_CRL, SELFQ_CEL));
    const run = r.runs[0];
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Escalate"]); // the sub's disposition bubbles (REPLACE)
    expect(run.diagnostics.some((d) => /deferred|not found/.test(d))).toBe(false);
    // nodeId parity for the self-qualified case: the sub's body nests under the use-decision action, same as bare.
    const useNode = run.trace[0].children?.find((n) => n.node === "Sub");
    const hasNode = (ns: typeof run.trace, name: string): boolean =>
      ns.some((n) => n.node === name || (n.children ? hasNode(n.children, name) : false));
    expect(useNode?.children && hasNode(useNode.children, "Escalate")).toBe(true);
  });

  // CROSS-LIB CYCLE: A.Main → B.Sub → A.Main. Keyed (lib,name) → caught, status:error, no hang.
  const CYCLE_A_CRL = `# A
library "A".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Main":
- when "P" then:
  - use decision "B"."Sub".
  end.`;
  const CYCLE_B_CRL = `# B
library "B".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Sub":
- when "P" then:
  - use decision "A"."Main".
  end.`;
  const CYCLE_XLIB_CEL = `# XCases
library "XCases".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fPa":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "P".
fact "fPb":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "B"."P".
case "xlib cycle":
- subject is "Pat".
- fact is "fPa".
- fact is "fPb".
- result is "Main" is "Sub".`;

  it("#172 cross-lib cycle: A.Main → B.Sub → A.Main → status:error + cycle diagnostic (no hang)", () => {
    const r = runCel(
      multiLibGraph(CYCLE_A_CRL, [{ src: CYCLE_B_CRL, filePath: "b.crl" }], CYCLE_XLIB_CEL),
    );
    const run = r.runs[0];
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /delegation cycle/.test(d))).toBe(true);
  });

  // A.Sub and B.Sub (same name, DIFFERENT libs) must NOT false-cycle: A.Root → B.Sub → A.Sub is a valid chain.
  const NOCYCLE_A_CRL = `# A
library "A".
concept "P":
- type is Condition.
- code is \`p\`.
activity "Done":
- request CPGCommunicationRequest.
- with \`x\`.
decision "Sub":
first:
- otherwise then recommend activity "Done".
decision "Root":
- when "P" then:
  - use decision "B"."Sub".
  end.`;
  const NOCYCLE_B_CRL = `# B
library "B".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Sub":
- when "P" then:
  - use decision "A"."Sub".
  end.`;
  const NOCYCLE_CEL = `# NCases
library "NCases".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fPa":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "P".
fact "fPb":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "B"."P".
case "distinct-lib subs do not false-cycle":
- subject is "Pat".
- fact is "fPa".
- fact is "fPb".
- result is "Root" is "Done".`;

  it("#172: A.Sub and B.Sub (same name, different libs) do NOT false-cycle — the chain resolves to Done", () => {
    const r = runCel(
      multiLibGraph(NOCYCLE_A_CRL, [{ src: NOCYCLE_B_CRL, filePath: "b.crl" }], NOCYCLE_CEL),
    );
    const run = r.runs[0];
    expect(run.status).toBe("pass"); // Root → B.Sub → A.Sub → Done; no spurious cycle
    expect(run.diagnostics.some((d) => /delegation cycle/.test(d))).toBe(false);
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Done"]);
  });
});
