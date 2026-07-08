// Tests for CaseRun.conceptTruth (#187 Todo 2) — the CRE's per-concept case answer that lets the Medical-Validation
// panes show a case-derived answer for an OFF-path (preempted) concept `:first` never evaluated. Covers: an off-path
// inferred sibling gets a truth row (both false AND the corpus-faithful true), ISOLATION (eager-eval never pollutes the
// case's diagnostics), error cases → [], and the ScenarioViewModel projection (concrete libraryName).
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { runCel, type CaseRun } from "../run";
import { renderScenario } from "../viewModel";

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

// `Covered` (a covered treatment) sits BEFORE the inferred `Experimental` sibling in a `first:` block, so a case that
// asserts Covered preempts Experimental. `Cyc`/`Cyc2` are a cyclic pair (also preempted) — used for the isolation test.
const M = `# M
library "M".
concept "Covered":
- type is Condition.
- code is \`cov\`.
concept "ExpA":
- type is Condition.
- code is \`expa\`.
concept "Experimental":
- defined as ( "ExpA" ).
concept "Cyc":
- defined as ( "Cyc2" ).
concept "Cyc2":
- defined as ( "Cyc" ).
concept "BR":
- type is Observation.
- code is \`br\`.
- defined as ( "Leaf" ).
concept "Leaf":
- type is Condition.
- code is \`lf\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Covered" then recommend activity "Approve".
- when "Experimental" then recommend activity "Deny".
- when "Cyc" then recommend activity "Deny".
- otherwise then recommend activity "Approve".`;

const cel = (caseName: string, factLines: string): string => `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fCov":
- code is "http://x|cov".
- defined by "Covered".
fact "fExp":
- code is "http://x|expa".
- defined by "ExpA".
fact "fBR":
- code is "http://x|br".
- defined by "BR".
case "${caseName}":
- subject is "Pat".
${factLines}
- result is "D" is "Approve".`;

const truthOf = (run: CaseRun, name: string): boolean | undefined =>
  run.conceptTruth.find((r) => r.name === name && r.lib === "M")?.satisfied;

describe("CaseRun.conceptTruth (#187 Todo 2)", () => {
  it("an OFF-path (preempted) inferred sibling gets a truth row — FALSE when its leaf is absent", () => {
    const [run] = runCel(graphFrom(M, cel("cov only", `- fact is "fCov".`))).runs;
    expect(run.status).toBe("pass"); // Covered wins → Approve produced; Experimental never evaluated on-path
    expect(truthOf(run, "Experimental")).toBe(false); // preempted, but its case answer is computed (ExpA absent)
    expect(truthOf(run, "ExpA")).toBe(false);
    expect(truthOf(run, "Covered")).toBe(true);
  });

  it("the corpus case: a preempted inferred sibling shows its case-derived answer TRUE (its leaf IS asserted)", () => {
    const [run] = runCel(
      graphFrom(M, cel("cov + exp", `- fact is "fCov".\n- fact is "fExp".`)),
    ).runs;
    expect(run.status).toBe("pass"); // Covered STILL wins first (Approve); Experimental is preempted...
    expect(truthOf(run, "Experimental")).toBe(true); // ...yet its dimmed case answer is TRUE (the leaf was asserted)
    expect(truthOf(run, "ExpA")).toBe(true);
  });

  it("both-rep concept (`code is` + `defined as`): overall sat is `direct || composed` — TRUE via the code even when the `defined as` leaf is absent", () => {
    const [run] = runCel(
      graphFrom(M, cel("br via code, leaf absent", `- fact is "fCov".\n- fact is "fBR".`)),
    ).runs;
    expect(truthOf(run, "BR")).toBe(true); // BR asserted directly; its `defined as ( "Leaf" )` is false (Leaf absent) → direct wins
    expect(truthOf(run, "Leaf")).toBe(false);
  });

  it("ISOLATION: eager-evaluating a preempted CYCLIC concept does NOT leak its cycle diagnostic into the case", () => {
    const [run] = runCel(graphFrom(M, cel("cov only, cyc preempted", `- fact is "fCov".`))).runs;
    // Cyc is preempted (Covered won), so the main run never evaluates it; truthOf DOES (in an isolated scratch ctx).
    expect(run.diagnostics.some((d) => /cycle/i.test(d))).toBe(false); // the scratch cycle diagnostic was discarded
    expect(truthOf(run, "Cyc")).toBe(false); // but its truth is still reported (cycle → unsatisfied)
    expect(run.status).toBe("pass"); // and status/produced are unchanged
  });

  it("error run (missing decision) → conceptTruth is []", () => {
    const badCel = `# MC
library "MC".
covers "M".
case "names a missing decision":
- result is "Nope" is "Approve".`;
    const [run] = runCel(graphFrom(M, badCel)).runs;
    expect(run.status).toBe("error");
    expect(run.conceptTruth).toEqual([]);
  });

  it("error run (no branch `result is`) → conceptTruth is []", () => {
    const noResult = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "no result assertion":
- subject is "Pat".`;
    const [run] = runCel(graphFrom(M, noResult)).runs;
    expect(run.status).toBe("error");
    expect(run.conceptTruth).toEqual([]);
  });

  it("error run (delegation cycle → runtimeError) → conceptTruth is []", () => {
    const CY = `# CY
library "CY".
concept "X":
- type is Condition.
- code is \`x\`.
activity "Z":
- request CPGCommunicationRequest.
- with \`z\`.
decision "A":
first:
- when "X" then use decision "B".
- otherwise then recommend activity "Z".
decision "B":
first:
- when "X" then use decision "A".
- otherwise then recommend activity "Z".`;
    const CYC = `# CYC
library "CYC".
covers "CY".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fX":
- code is "http://x|x".
- defined by "X".
case "cycle":
- subject is "Pat".
- fact is "fX".
- result is "A" is "Z".`;
    const [run] = runCel(graphFrom(CY, CYC)).runs;
    expect(run.status).toBe("error"); // delegation A→B→A cycle → runtimeError
    expect(run.conceptTruth).toEqual([]);
  });

  it("renderScenario projects conceptTruth with a CONCRETE libraryName", () => {
    const vm = renderScenario(graphFrom(M, cel("cov only", `- fact is "fCov".`)));
    const row = vm.scenarios[0].conceptTruth.find((r) => r.name === "Experimental");
    expect(row).toEqual({ name: "Experimental", libraryName: "M", satisfied: false });
  });
});
