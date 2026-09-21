import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { runCel } from "../run";
import { renderScenario } from "../viewModel";
import { createRecordCollectionEvaluator } from "../recordCollections";
import { createPublicationContext } from "../../emit/publicationContext";
import type { Concept } from "../../ast/types";
import type { EmittedResource } from "../../cel/emitter/types";
import type { LocalConceptMember } from "../../cel/localMembership";

const fixture = path.join(__dirname, "fixtures/condition-status/cases.cel");

function definition(text: string) {
  const ast = parseInput(`library "Test". concept "Test": - shape is RecordSet. - type is Condition. - ${text}.`);
  return (ast.statements[0] as Concept).definition;
}

function project(check: (dir: string) => void) {
  const parent = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, "crl-condition-status-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-condition-status-")) throw new Error("Unexpected temporary path");
  try { fs.cpSync(path.dirname(fixture), dir, { recursive: true }); check(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function setup() {
  const graph = resolveCelImports(fixture);
  const ast = graph.coversTarget!.ast;
  const source = graph.coversTarget!.filePath;
  const nodes = ast.statements.filter((s): s is Concept => s.type === "Concept");
  const node = (name: string) => nodes.find(n => n.name === name)!;
  const emitted = emitCelToFhir(graph).emittedCases[0].resources;
  const condition = emitted.find(r => r.resourceType === "Condition")!;
  const patient = emitted.find(r => r.resourceType === "Patient")!;
  const evaluate = (resources: readonly EmittedResource[] = emitted, localMember?: LocalConceptMember) => {
    const context = createPublicationContext({ libraries: [{ sourceIdentity: source, ast,
      artifact: { canonicalBase: "http://example.org/condition-status" } }] });
    return createRecordCollectionEvaluator(context, resources, `Patient/${patient.id}`, () => localMember)(source, node("Verified Findings"));
  };
  return { graph, ast, node, nodes, emitted, condition, evaluate };
}

describe("CRE Condition status chains", () => {
  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("evaluates active and verified over the same CEL Condition that native execution receives", () => {
    const graph = resolveCelImports(fixture);
    const emitted = emitCelToFhir(graph);
    expect(emitted.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    const condition = emitted.emittedCases[0].resources.find(r => r.resourceType === "Condition")!.body;
    expect(condition.clinicalStatus).toMatchObject({ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] });
    expect(condition.verificationStatus).toMatchObject({ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }] });
    const result = runCel(graph);
    expect(result.errors).toEqual([]);
    expect(result.runs.filter(r => r.status === "error").map(r => r.diagnostics)).toEqual([]);
    expect(result.runs.map(r => ({ case: r.case, status: r.status, produced: r.produced.map(p => p.recommendation) }))).toEqual([
      { case: "Matching", status: "pass", produced: ["Eligible"] },
      { case: "Nonmatching", status: "pass", produced: ["Not Eligible"] },
      { case: "Empty", status: "pass", produced: ["Not Eligible"] },
    ]);
    const mv = renderScenario(graph);
    expect(mv.scenarios.map(s => ({ status: s.status, produced: s.produced.map(p => p.recommendation) }))).toEqual([
      { status: "pass", produced: ["Eligible"] },
      { status: "pass", produced: ["Not Eligible"] },
      { status: "pass", produced: ["Not Eligible"] },
    ]);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it.each([
    ["clinicalStatus", undefined],
    ["clinicalStatus", { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "inactive" }] }],
    ["clinicalStatus", { coding: [{ system: "http://wrong.example/status", code: "active" }] }],
    ["verificationStatus", undefined],
    ["verificationStatus", { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "refuted" }] }],
  ])("does not retain records with %s = %j", (field, value) => {
    const { condition, evaluate } = setup();
    condition.body[field as string] = value;
    expect(evaluate()).toEqual([]);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("requires both statuses on the same record", () => {
    const { condition, emitted, evaluate } = setup();
    const other = structuredClone(condition);
    other.id = "other"; other.body.id = "other";
    other.body.clinicalStatus = { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "inactive" }] };
    condition.body.verificationStatus = { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "refuted" }] };
    expect(evaluate([...emitted, other])).toEqual([]);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("matches exact system/code among multiple codings and excludes other patients", () => {
    const { condition, evaluate } = setup();
    condition.body.code = { coding: [{ system: "wrong", code: "finding" }, { system: "http://example.org/findings", code: "finding" }] };
    expect(evaluate()).toEqual([condition]);
    condition.body.subject = { reference: "Patient/someone-else" };
    expect(evaluate()).toEqual([]);
    condition.body.subject = { reference: (setup().condition.body.subject as { reference: string }).reference };
    condition.body.code = { coding: [{ system: "wrong", code: "finding" }] };
    expect(evaluate()).toEqual([]);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("refuses cycles and unresolved operands instead of publishing false", () => {
    const { node, evaluate } = setup();
    node("Active Findings").definition = structuredClone(node("Verified Findings").definition);
    expect(() => evaluate()).toThrow(/Cycle/);
    node("Active Findings").name = "Unreachable";
    expect(() => evaluate()).toThrow(/Cannot resolve/);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("refuses locally coded narrative filters that the emitter cannot lower", () => {
    const { node, evaluate } = setup();
    node("Active Findings").code = "active";
    expect(() => evaluate()).toThrow(/local code and a definition/);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("retains local and unprojected source records in one collection", () => {
    const { node, condition, emitted, evaluate } = setup();
    const donor = parseInput(`library "Sources". concept "Sources":
- shape is RecordSet.
- type is Condition.
- code is \`local\`.
- source representation:
  - type is Condition.
  - coded from "Finding Codes".`).statements[0] as Concept;
    node("Findings").definition = undefined;
    node("Findings").code = donor.code;
    node("Findings").representations = donor.representations;
    const local = structuredClone(condition);
    local.id = "local"; local.body.id = "local";
    local.body.code = { coding: [{ system: "http://example.org/local", code: "local" }] };
    expect(evaluate([...emitted, local], { fhirType: "Condition", system: "http://example.org/local", code: "local" })).toEqual([condition, local]);
    node("Findings").representations[0].conceptType = "Observation";
    expect(() => evaluate(emitted, { fhirType: "Condition", system: "http://example.org/local", code: "local" })).toThrow(/unprojected source records/);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("resolves imported operands and their terminology in the declaring scope", () => {
    const { condition, emitted } = setup();
    const source = parseInput(`library "Source".
terminology "Codes": - system is \`http://example.org/findings\`. - code is \`finding\`.
concept "Records": - shape is RecordSet. - type is Condition. - coded from "Codes".`);
    const owner = parseInput(`library "Owner".
terminology "Codes": - system is \`http://wrong.example\`. - code is \`finding\`.
concept "Records": - shape is RecordSet. - type is Condition. - definition is "Source"."Records" active.`);
    const context = createPublicationContext({ libraries: [owner, source].map(ast => ({ sourceIdentity: ast.library.name, ast, artifact: { canonicalBase: "http://example.org/status" } })),
      resolveLibrary: (_from, name) => name === "Source" ? { kind: "resolved", sourceIdentity: "Source" } : { kind: "missing" } });
    const evaluate = createRecordCollectionEvaluator(context, emitted, (condition.body.subject as { reference: string }).reference, () => undefined);
    expect(evaluate("Owner", owner.statements.find(s => s.type === "Concept") as Concept)).toEqual([condition]);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it.each(["source", "local", "scalar shadow"])("refuses ambiguous package/local collection owners (%s membership)", membership => project(dir => {
    const policyPath = path.join(dir, "policy.crl");
    fs.writeFileSync(policyPath, fs.readFileSync(policyPath, "utf8")
      .replace('library "Condition Status".', 'library "Condition Status".\ninclude "Sources".')
      .replace('definition is "Findings" active', 'definition is "Sources"."Records" active'));
    const library = (code: string) => `library "Sources".
terminology "Codes": - system is \`http://example.org/findings\`. - code is \`${code}\`.
concept "Records": - shape is RecordSet. - type is Condition.
- ${membership !== "local" ? 'coded from "Codes"' : `code is \`${code}\``}.`;
    fs.writeFileSync(path.join(dir, "sources.crl"), membership === "scalar shadow" ? library("other").replace('shape is RecordSet', 'shape is Scalar') : library("other"));
    const installed = path.join(dir, "node_modules/records"); fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, "package.json"), JSON.stringify({ name: "records", version: "1.0.0", crl: { libraries: ["sources.crl"] } }));
    fs.writeFileSync(path.join(installed, "sources.crl"), library("finding"));
    const graph = resolveCelImports(path.join(dir, "cases.cel"));
    const runs = runCel(graph).runs;
    expect(runs).toHaveLength(3);
    expect(runs.every(r => r.status === "error" && r.produced.length === 0)).toBe(true);
    expect(runs[0].diagnostics.join(" ")).toContain("Ambiguous collection owner");
  }));

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it.each([1, 2])("aligns %s-source union admission with FHIR/CQL emission", count => project(dir => {
    const policyPath = path.join(dir, "policy.crl");
    const representation = `- source representation:\n  - type is Observation.\n  - value type is boolean.\n  - coded from "Finding Codes".`;
    const policy = fs.readFileSync(policyPath, "utf8")
      .replaceAll('type is Condition.', 'type is Observation.')
      .replace('concept "Findings":', 'concept "Findings":\n- value type is boolean.')
      .replace('- coded from "Finding Codes".', '- code is `own`.\n' + Array(count).fill(representation).join('\n'))
      .replace('"Findings" active', '"Findings" verified');
    const celPath = path.join(dir, "cases.cel");
    fs.writeFileSync(celPath, fs.readFileSync(celPath, "utf8").replaceAll('defined by "Condition".', 'defined by "Observation".\n- value is false.'));
    // Emit the union declaration itself; the decision-free source needs no local
    // case-feature root. Then evaluate its use in the full decision through CRE.
    fs.writeFileSync(policyPath, policy.slice(0, policy.indexOf('concept "Active Findings"')));
    const emitted = emitCrlTwoLane(policyPath);
    fs.writeFileSync(policyPath, policy);
    const runs = runCel(resolveCelImports(celPath)).runs;
    expect(emitted.success, JSON.stringify(emitted.hardErrors)).toBe(count === 1);
    expect(runs.map(r => r.status)).toEqual(Array(3).fill(count === 1 ? "pass" : "error"));
    if (count === 2) expect(runs[0].diagnostics.join(" ")).toContain("multiple source representations");
  }));

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it.each([
    'definition is "Findings" active during "Encounter"',
    'definition is most recent "Findings" active',
    'definition is "Findings" performed',
  ])("reports reached unsupported operations: %s", text => {
    const { node, graph } = setup();
    node("Verified Findings").definition = definition(text);
    const result = runCel(graph);
    expect(result.runs.every(r => r.status === "error" && r.produced.length === 0)).toBe(true);
    expect(result.runs[0].diagnostics.join(" ")).toContain("unsupported record operation");
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("does not turn an off-path unsupported collection into a case error", () => {
    const { node, graph } = setup();
    node("Active Findings").definition = definition('definition is "Findings" active during "Encounter"');
    node("Finding Exists").definition = definition('defined as exists ( "Findings" )');
    const result = runCel(graph);
    expect(result.runs.map(r => r.status)).toEqual(["pass", "pass", "pass"]);
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it("keeps false-valued Observation existence distinct from Boolean answer consumption", () => {
    const { graph, node, nodes } = setup();
    nodes.filter(n => n.shape === "RecordSet").forEach(n => { n.conceptType = "Observation"; n.valueTypes = []; });
    node("Findings").valueTypes = ["boolean"];
    node("Verified Findings").definition = definition('definition is "Findings" verified');
    graph.cel = buildCEL(fs.readFileSync(fixture, "utf8").replaceAll('defined by "Condition".', 'defined by "Observation".\n- value is false.')).result!;
    expect(runCel(graph).runs.map(r => r.status)).toEqual(["pass", "pass", "pass"]);
    node("Finding Exists").definition = definition('definition is exists "Verified Findings"');
    expect(runCel(graph).runs.map(r => r.status)).toEqual(["pass", "pass", "pass"]);
    node("Verified Findings").valueTypes = ["boolean"];
    expect(runCel(graph).runs.every(r => r.status === "error" && r.diagnostics.some(d => d.includes("does not lower as records")))).toBe(true);
    node("Finding Exists").definition = definition('defined as "Verified Findings"');
    const values = runCel(graph);
    expect(values.runs.every(r => r.status === "error" && r.produced.length === 0)).toBe(true);
    expect(values.runs[0].diagnostics.join(" ")).toContain("not a selected Boolean answer");
  });

  // @kit verify-loop:record-status-preview
  // @kit verify-loop:record-status-boundaries
  it.each(["final", "amended", "corrected", "preliminary", undefined])("applies Observation verification to %s without reading its false value", status => {
    const { node, nodes, condition, evaluate } = setup();
    nodes.filter(n => n.shape === "RecordSet").forEach(n => { n.conceptType = "Observation"; n.valueTypes = []; });
    // Read the source directly for this verification-only chain.
    const definition = node("Verified Findings").definition!;
    if (definition.type !== "DefinitionIsDefinition") throw new Error("Fixture changed");
    const ref = definition.body.elements[0];
    if (ref.type !== "NConceptRef") throw new Error("Fixture changed");
    ref.value = "Findings";
    condition.resourceType = "Observation"; condition.body.resourceType = "Observation";
    condition.body.status = status; condition.body.valueBoolean = false;
    expect(evaluate()).toEqual(["final", "amended", "corrected"].includes(status!) ? [condition] : []);
  });
});
