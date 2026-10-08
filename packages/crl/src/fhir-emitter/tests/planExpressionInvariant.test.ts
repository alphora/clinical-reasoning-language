import { describe, it, expect } from "vitest";
import { applyPlanExpressionInvariant } from "../planExpressionInvariant";
import type { EmittedResource } from "../types";
import type { PerLibraryEmit } from "../../imports/emit";
import { generatedRetentionExpression } from "../generatedRetentionExpression";

const resource = (resourceType: string, body: Record<string, unknown>): EmittedResource =>
  ({ resourceType, relativePath: resourceType + "/test.json", resource: { resourceType, ...body } }) as EmittedResource;
const lib = (name: string) => resource("Library", { name, url: "https://test/Library/" + name });
const manifest = (name: string, names: string[]): PerLibraryEmit => ({
  libraryName: name, cql: names.map(n => 'define "' + n + '": true').join("\n"),
}) as PerLibraryEmit;
const pd = (language: string, expression: string, reference?: string) => resource("PlanDefinition", {
  library: ["https://test/Library/Owner"],
  action: [{ action: [{ condition: [{ expression: { language, expression, ...(reference ? { reference } : {}) } }] }] }],
});

describe("PlanDefinition expression ownership", () => {
  it("checks generated transport predicates against their registered text, owner and condition names", () => {
    const expr = generatedRetentionExpression('if "Gate" then true else false', "Owner", ["Gate"]);
    const helper = resource("PlanDefinition", { library: ["https://test/Library/Owner"], action: [{ condition: [{ expression: expr }] }] });
    expect(applyPlanExpressionInvariant([lib("Owner"),helper],[manifest("Owner",["Gate"])])).toEqual([]);
    expect(applyPlanExpressionInvariant([lib("Owner"),helper],[manifest("Owner",[])])[0].kind).toBe("dangling-plan-expression-define");
    helper.resource.library = ["https://test/Library/Other"];
    expect(applyPlanExpressionInvariant([lib("Other"),helper],[manifest("Other",["Gate"])])[0].kind).toBe("dangling-plan-expression-define");
    expr.expression = "true";
    expect(applyPlanExpressionInvariant([lib("Other"),helper],[])[0].kind).toBe("plan-expression-not-identifier");
    expect(applyPlanExpressionInvariant([pd("text/cql", "true")],[])[0].kind).toBe("plan-expression-not-identifier");
  });
  it("accepts named conditions in the bound owner", () => {
    expect(applyPlanExpressionInvariant([lib("Owner"), pd("text/cql-identifier", "Allowed")],
      [manifest("Owner", ["Allowed"])])).toEqual([]);
  });
  it("rejects a same-named definition in an unrelated owner", () => {
    const errors = applyPlanExpressionInvariant([lib("Owner"), lib("Other"), pd("text/cql-identifier", "Allowed")],
      [manifest("Owner", []), manifest("Other", ["Allowed"])]);
    expect(errors.map(e => e.kind)).toEqual(["dangling-plan-expression-define"]);
  });
  it("honors an explicit expression library reference", () => {
    expect(applyPlanExpressionInvariant([lib("Owner"), lib("Other"),
      pd("text/cql-identifier", "Allowed", "https://test/Library/Other|1.0")],
      [manifest("Owner", []), manifest("Other", ["Allowed"])])).toEqual([]);
  });
  it.each(["text/cql-expression", "text/fhirpath"])("rejects %s anywhere inside a PlanDefinition", language => {
    expect(applyPlanExpressionInvariant([pd(language, "true")], []).map(e => e.kind))
      .toEqual(["plan-expression-not-identifier"]);
  });
  it("leaves StructureDefinition expressions alone", () => {
    expect(applyPlanExpressionInvariant([resource("StructureDefinition", {
      extension: [{ valueExpression: { language: "text/fhirpath", expression: "true" } }],
    })], [])).toEqual([]);
  });
});
