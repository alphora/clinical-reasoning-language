import { isFhirDefError } from "../types";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { BranchCondition, Concept, Decision, ReferenceName } from "../../ast/types";
import { prepareSingleLibraryPublication, publicationBooleanRead } from "../../emit/publicationProgram";
import { emitCQLImports } from "../../imports/emit";
import { resolveCaseFeatureRecord } from "../caseFeatureRecord";
import { emitFhirDefFromPath } from "../closureOrchestrator";
import { emitDecisionPlanDefinition, emitDecisionPlanDefinitionsForLibrary } from "../decision";
import { CPG_FEATURE_EXPRESSION_EXT, type CpgMetadata } from "../types";

// REFACTOR:grounded (#320, review 560): a coded selected Record supplies both its answer slot and
// nullable Boolean value. These assertions cover emitted structure; native execution remains separate.
const base = `library "Selected Boolean".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
`;
const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };
const metadata: CpgMetadata = {
  name: "selected-publication", version: "1.0.0", title: "Selected publication", description: "Test",
  publisher: "Test", contact: [], canonicalBase: "http://example.org/selected-publication",
  status: "draft", experimental: true, jurisdiction: [], useContext: [],
};
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function ast(source = base) {
  const result = buildCRL(source);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.result!;
}
function fixture(source: string, name = metadata.name): string {
  const dir = mkdtempSync(join(tmpdir(), "crl-selected-publication-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", crl: { canonicalBase: metadata.canonicalBase, date: "2026-09-06" } }));
  const path = join(dir, "main.crl");
  writeFileSync(path, source);
  return path;
}
const ref = (name: ReferenceName = "Answer"): BranchCondition => ({ type: "BranchConditionRef", ref: name, location: LOC });
const negate = (operand: BranchCondition): BranchCondition => ({ type: "BranchConditionNot", operand, location: LOC });
const projection = publicationBooleanRead('"SelectedBooleanInterface"."Answer"');
function render(conditions: BranchCondition[], actionGuard?: "unless" | "only-when") {
  const parsed = ast();
  const program = prepareSingleLibraryPublication(parsed, { canonicalBase: metadata.canonicalBase, policyId: metadata.name });
  const leaf = { type: "ActionStatement" as const, action: { type: "RecommendActivity" as const, activityName: "Approve", location: LOC }, location: LOC };
  const decision: Decision = {
    type: "Decision", name: "Policy", location: LOC,
    body: { type: "DecisionBody", qualifier: "first", location: LOC, statements: [
      ...conditions.map((condition) => ({ type: "WhenBlock" as const, condition, location: LOC, body: actionGuard ? {
        type: "BlockBody" as const, qualifier: "all" as const, location: LOC, statements: [{ ...leaf, guard: { type: "ActionGuard" as const, polarity: actionGuard, conceptName: "Answer", location: LOC } }],
      } : leaf })),
      { type: "OtherwiseBlock", location: LOC, body: leaf },
    ] },
  };
  const result = emitDecisionPlanDefinition(decision, parsed.library.name, metadata,
    (r) => typeof r === "string" ? r : r.name, () => "http://example.org/ActivityDefinition/approve", () => null,
    true, { clock: () => new Date("2026-09-06T00:00:00Z") }, "SelectedBooleanInterface", undefined, undefined,
    "SelectedBooleanInterface", (r) => program.lookup(parsed.library.name, r).kind === "publication");
  if (actionGuard) expect(result.errors).toContainEqual(expect.objectContaining({ kind: "publication-action-guard-unsupported" }));
  else expect(result.errors.filter(isFhirDefError)).toEqual([]);
  expect(result.unmatched).toEqual([]);
  return result.resource!.resource;
}
function expressions(resource: unknown): Array<{ language: string; expression: string }> {
  if (!resource || typeof resource !== "object") return [];
  const node = resource as Record<string, unknown>;
  const own = node.kind === "applicability" ? [node.expression as { language: string; expression: string }] : [];
  return [...own, ...Object.values(node).flatMap((value) => Array.isArray(value) ? value.flatMap(expressions) : expressions(value))];
}

describe("selected Boolean Record FHIR publication", () => {
  it("uses the exact prepared descriptor and actual public target without legacy classification", () => {
    const parsed = ast();
    const concept = parsed.statements.find((s): s is Concept => s.type === "Concept")!;
    const program = prepareSingleLibraryPublication(parsed, { canonicalBase: metadata.canonicalBase, policyId: metadata.name });
    const descriptor = program.descriptors[0]!;
    const target = { librarySuffix: "SelectedBooleanInferences", define: "Answer", resultKind: "record" as const };
    const resolution = resolveCaseFeatureRecord(concept, { libraryName: parsed.library.name, canonicalBase: metadata.canonicalBase }, { descriptor, target });
    expect(resolution.kind).toBe("record");
    if (resolution.kind !== "record") throw new Error("Missing record");
    expect(resolution.descriptor).toBe(descriptor);
    expect(resolution.publicationTarget).toBe(target);
    expect(resolveCaseFeatureRecord(concept, { libraryName: parsed.library.name, canonicalBase: metadata.canonicalBase })).toMatchObject({ kind: "not-a-record", derivationKind: "publication-binding-missing" });
  });

  it.each([
    ["direct", ref()],
    ["self-qualified", ref({ type: "QualifiedReference", libraryName: "Selected Boolean", name: "Answer", location: LOC })],
    ["negative", negate(ref())],
    ["compound", { type: "BranchConditionAnd", operands: [ref(), negate(ref())], location: LOC } as BranchCondition],
    ["ordered or", { type: "BranchConditionOr", operands: [ref(), ref()], location: LOC } as BranchCondition],
  ])("projects every %s guard and its otherwise exclusion", (_name, condition) => {
    const resource = render([condition]);
    const rendered = expressions(resource);
    expect(rendered.some((expression) => expression.expression.includes(projection))).toBe(true);
    expect(rendered.every((expression) => expression.language === "text/cql-expression")).toBe(true);
    expect(rendered.some((expression) => expression.expression.includes("Coalesce"))).toBe(false);
    expect((resource as { library: string[] }).library).toHaveLength(1);
  });

  it.each(["only-when", "unless"] as const)("rejects action %s until menu-wide pause is implemented", (guard) => {
    render([ref()], guard);
  });

  it("rejects the unprepared per-library convenience entry", () => {
    const parsed = ast();
    const concepts = parsed.statements.filter((s): s is Concept => s.type === "Concept");
    const result = emitDecisionPlanDefinitionsForLibrary([], [], concepts, parsed.library.name, metadata);
    expect(result.resources).toEqual([]);
    expect(result.errors).toMatchObject([{ kind: "publication-missing-preparation" }]);
  });

  it("emits one optional Boolean answer bound to the actual Inferences Record", () => {
    const path = fixture(`${base}\ndecision "Policy":\nfirst:\n- when "Answer" then recommend activity "Approve".\n- when not "Answer" then recommend activity "Deny".\n`);
    const result = emitFhirDefFromPath(path);
    expect(result.errors.filter(isFhirDefError), JSON.stringify(result.errors)).toEqual([]);
    expect(result.success).toBe(true);
    const cql = emitCQLImports(path);
    expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
    const actualTarget = [...cql.publicationTargets!.values()][0]!;
    const profile = result.resources.find((r) => r.resourceType === "StructureDefinition")!.resource as Record<string, any>;
    expect(profile).toMatchObject({ baseDefinition: "http://hl7.org/fhir/StructureDefinition/Observation", fhirVersion: "4.0.1" });
    const featureExpression = profile.extension.find((e: any) => e.url === CPG_FEATURE_EXPRESSION_EXT).valueExpression;
    expect(featureExpression).toMatchObject({ expression: actualTarget.define, reference: `${metadata.canonicalBase}/Library/${actualTarget.libraryName}` });
    const elements = profile.differential.element as Array<Record<string, any>>;
    expect(elements.map((e) => e.path)).toEqual(["Observation", "Observation.status", "Observation.category", "Observation.category", "Observation.code", "Observation.subject", "Observation.effective[x]", "Observation.value[x]"]);
    expect(elements.find((e) => e.path === "Observation.value[x]")).toMatchObject({ min: 0, type: [{ code: "boolean" }] });
    expect(elements.find((e) => e.path === "Observation.effective[x]")).toMatchObject({ min: 0 });
    expect(elements.find((e) => e.path === "Observation.code")).toMatchObject({ min: 1, patternCodeableConcept: { coding: [{ system: `${metadata.canonicalBase}/CodeSystem/selected-publication-local`, code: "answer" }] } });
    expect(result.resources.some((r) => r.resourceType === "Library" && r.sourceName === "FHIRHelpers")).toBe(false);
    const decision = result.resources.find((r) => r.sourceKind === "Decision")!.resource as { library: string[] };
    const interfaceName = decision.library[0]!.split("/").pop();
    const actualProjection = publicationBooleanRead(`"${interfaceName}"."Answer"`);
    expect(expressions(decision).every((e) => e.expression.includes(actualProjection))).toBe(true);
  });
});
