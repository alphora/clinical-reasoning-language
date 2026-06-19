import { join } from "path";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import { resolveCelImports } from "../../cel/imports";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import type { Decision } from "../../ast/types";
import { collectDecisionArms } from "../../cel/validator/validator";

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
  return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
}

function statuses(crlSrc: string, celSrc: string): string[] {
  return runCel(graphFrom(crlSrc, celSrc)).runs.map((r) => `${r.case}:${r.status}`);
}

/** Structural invariant: every produced recommendation is a DIRECT arm of its decision. */
function assertProducedSubsetOfArms(crlSrc: string, celSrc: string): void {
  const crl = parseInput(crlSrc);
  const r = runCel(graphFrom(crlSrc, celSrc));
  for (const run of r.runs) {
    if (!run.decision) continue;
    const d = crl.statements.find(
      (s): s is Decision => s.type === "Decision" && s.name === run.decision,
    );
    const arms = d ? collectDecisionArms(d) : new Set<string>();
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
    expect(excl).toMatchObject({ nodeId: "when[0]", kind: "when", concept: "Excl", satisfied: false });
    expect(excl.children).toEqual([]); // unsatisfied → body not executed
    const indicNode = indic.trace[1];
    expect(indicNode).toMatchObject({ nodeId: "when[1]", kind: "when", satisfied: true });
    expect(indicNode.children?.[0]).toMatchObject({ nodeId: "when[1]/action[0]", kind: "action", node: "Approve" });
    // source span: the covered library file, a well-formed 0-based range.
    expect(indicNode.source.filePath).toBe("inline.crl");
    const rng = indicNode.source.range;
    expect(rng.startLine).toBeGreaterThanOrEqual(0);
    expect(rng.endLine > rng.startLine || (rng.endLine === rng.startLine && rng.endCol > rng.startCol)).toBe(true);
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
});
